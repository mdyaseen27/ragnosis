"""Medicine reminders — per API contract §5.6. Patient only.

POST / · GET / · PATCH /:id · DELETE /:id
"""
import re
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, g, request

from app import db  # module-attribute access so tests can monkeypatch app.db.get_db
from ..auth.decorators import _audit, require_roles
from ..errors import api_error
from ..jsonutil import to_json

bp = Blueprint("reminders", __name__)

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _adherence(log):
    taken = sum(1 for e in log if e.get("status") == "taken")
    skipped = sum(1 for e in log if e.get("status") == "skipped")
    total = taken + skipped
    return round(100.0 * taken / total, 1) if total else None


def _card(rem):
    doc = to_json(rem)
    doc["id"] = doc.pop("_id")
    doc["adherence_pct"] = _adherence(rem.get("taken_log", []))
    return doc


def _check_times(times):
    return (
        isinstance(times, list)
        and 1 <= len(times) <= 6
        and all(isinstance(t, str) and TIME_RE.match(t) for t in times)
    )


def _check_dates(start, end):
    try:
        s = datetime.strptime(start or "", "%Y-%m-%d").date()
        e = datetime.strptime(end or "", "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None, api_error("VALIDATION_ERROR", "start_date/end_date must be YYYY-MM-DD.", 400)
    if e < s:
        return None, api_error("VALIDATION_ERROR", "end_date must not be before start_date.", 400)
    return (start, end), None


def _fetch(user, reminder_id):
    if not ObjectId.is_valid(reminder_id or ""):
        return None, api_error("NOT_FOUND", "Reminder not found.", 404)
    rem = db.get_db().reminders.find_one({"_id": ObjectId(reminder_id)})
    if not rem:
        return None, api_error("NOT_FOUND", "Reminder not found.", 404)
    if rem["patient_id"] != user["_id"]:
        _audit("auth.forbidden", user["_id"], {"route": request.path, "reminder_id": reminder_id})
        return None, api_error("FORBIDDEN", "You do not have access to this reminder.", 403)
    return rem, None


@bp.post("/", strict_slashes=False)
@require_roles("patient")
def create_reminder():
    data = request.get_json(force=True, silent=True) or {}
    medicine = (data.get("medicine_name") or "").strip()
    if not medicine:
        return api_error("VALIDATION_ERROR", "medicine_name is required.", 400)
    times = data.get("times_utc")
    if not _check_times(times):
        return api_error("VALIDATION_ERROR", "times_utc must be 1–6 daily times in HH:MM (UTC).", 400)
    dates, err = _check_dates(data.get("start_date"), data.get("end_date"))
    if err:
        return err
    prescription_id = data.get("prescription_id")
    doc = {
        "patient_id": g.user["_id"],
        "medicine_name": medicine,
        "times_utc": times,
        "start_date": dates[0],
        "end_date": dates[1],
        "active": True,
        "prescription_id": ObjectId(prescription_id)
        if prescription_id and ObjectId.is_valid(prescription_id)
        else None,
        "taken_log": [],
        "created_at": datetime.now(timezone.utc),
    }
    doc["_id"] = db.get_db().reminders.insert_one(doc).inserted_id
    return {"reminder": _card(doc)}, 201


@bp.get("/", strict_slashes=False)
@require_roles("patient")
def list_reminders():
    query = {"patient_id": g.user["_id"]}
    active = request.args.get("active")
    if active is not None:
        query["active"] = active.lower() in ("true", "1", "yes")
    reminders = db.get_db().reminders.find(query)
    return {"reminders": [_card(r) for r in reminders]}, 200


@bp.patch("/<reminder_id>")
@require_roles("patient")
def update_reminder(reminder_id):
    rem, err = _fetch(g.user, reminder_id)
    if err:
        return err
    data = request.get_json(force=True, silent=True) or {}
    d = db.get_db()
    update = {}
    if "medicine_name" in data:
        if not (data["medicine_name"] or "").strip():
            return api_error("VALIDATION_ERROR", "medicine_name cannot be empty.", 400)
        update["medicine_name"] = data["medicine_name"].strip()
    if "times_utc" in data:
        if not _check_times(data["times_utc"]):
            return api_error("VALIDATION_ERROR", "times_utc must be 1–6 daily times in HH:MM (UTC).", 400)
        update["times_utc"] = data["times_utc"]
    if "active" in data:
        update["active"] = bool(data["active"])
    for field in ("start_date", "end_date"):
        if field in data:
            update[field] = data[field]
    if "start_date" in update or "end_date" in update:
        dates, err = _check_dates(update.get("start_date", rem["start_date"]), update.get("end_date", rem["end_date"]))
        if err:
            return err
    taken = data.get("taken")
    if taken is not None:
        if (
            not isinstance(taken, dict)
            or taken.get("status") not in ("taken", "skipped")
            or not taken.get("date")
            or not taken.get("time")
        ):
            return api_error("VALIDATION_ERROR", "taken needs {date, time, status: taken|skipped}.", 400)
        d.reminders.update_one(
            {"_id": rem["_id"]},
            {"$push": {"taken_log": {"date": taken["date"], "time": taken["time"], "status": taken["status"]}}},
        )
    if update:
        d.reminders.update_one({"_id": rem["_id"]}, {"$set": update})
    rem = d.reminders.find_one({"_id": rem["_id"]})
    return {"reminder": _card(rem)}, 200


@bp.delete("/<reminder_id>")
@require_roles("patient")
def delete_reminder(reminder_id):
    rem, err = _fetch(g.user, reminder_id)
    if err:
        return err
    db.get_db().reminders.delete_one({"_id": rem["_id"]})
    return {"ok": True}, 200
