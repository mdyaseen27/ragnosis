"""Hospital module — per API contract §5.4.

Doctors directory · slots · appointments · prescriptions · patient views.
"""
import re
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, g, request
from pymongo.errors import DuplicateKeyError

from app import db  # module-attribute access so tests can monkeypatch app.db.get_db
from ..auth.decorators import _audit, jwt_required, require_roles
from ..errors import api_error
from ..jsonutil import to_json

bp = Blueprint("hospital", __name__)

DEFAULT_HOURS = {"morning": ["09:00", "13:00"], "evening": ["17:00", "21:00"]}
SLOT_MINUTES = 15
DIAGNOSIS_DENYLIST = ("you have", "you are suffering", "diagnosed with", "suffering from")


def _slots_between(start, end):
    out = []
    cur = int(start[:2]) * 60 + int(start[3:])
    stop = int(end[:2]) * 60 + int(end[3:])
    while cur + SLOT_MINUTES <= stop:
        out.append(f"{cur // 60:02d}:{cur % 60:02d}")
        cur += SLOT_MINUTES
    return out


def _day_slots(working_hours):
    wh = working_hours or DEFAULT_HOURS
    slots = []
    for part in ("morning", "evening"):
        if part in wh and len(wh[part]) == 2:
            slots += _slots_between(wh[part][0], wh[part][1])
    return slots


def _parse_day(date):
    try:
        return datetime.strptime(date or "", "%Y-%m-%d").date(), None
    except (TypeError, ValueError):
        return None, api_error("VALIDATION_ERROR", "date must be YYYY-MM-DD.", 400)


def _free_slots(doctor, date):
    booked = {
        a["slot"]
        for a in db.get_db().appointments.find(
            {"doctor_id": doctor["_id"], "date": date, "status": "scheduled"}
        )
    }
    return [s for s in _day_slots(doctor.get("working_hours")) if s not in booked]


def _conflict(doctor, date, slot):
    return {
        "error": {
            "code": "CONFLICT",
            "message": "Slot already booked.",
            "free_slots": _free_slots(doctor, date),
        }
    }, 409


def _doctor_patient_ids(doctor_id):
    return [a["patient_id"] for a in db.get_db().appointments.find({"doctor_id": doctor_id})]


def _names_for(appts):
    """Batch-resolve patient/doctor display names for appointment rows —
    the portals render names, and raw ids alone left every row labelled
    just 'Patient'."""
    ids = set()
    for a in appts:
        ids.add(a["patient_id"])
        ids.add(a["doctor_id"])
    if not ids:
        return {}
    users = db.get_db().users.find({"_id": {"$in": list(ids)}}, {"name": 1})
    return {u["_id"]: u["name"] for u in users}


def _appt_card(a, names=None):
    d = to_json(a)
    d["id"] = d.pop("_id")
    if names is None:
        names = _names_for([a])
    d["patient_name"] = names.get(a["patient_id"])
    d["doctor_name"] = names.get(a["doctor_id"])
    return d


@bp.get("/doctors")
@require_roles("receptionist", "patient")
def list_doctors():
    d = db.get_db()
    specialization = request.args.get("specialization")
    query = {"role": "doctor"}
    if specialization:
        query["specialization"] = specialization
    out = [
        {
            "id": str(u["_id"]),
            "name": u["name"],
            "specialization": u.get("specialization"),
            "hospital": u.get("hospital"),
            "fee_paise": u.get("consultation_fee_paise"),
            "working_hours": u.get("working_hours"),
            "is_demo": False,
        }
        for u in d.users.find(query)
    ]
    demo_query = {"is_demo": True}
    if specialization:
        demo_query["specialization"] = specialization
    city = request.args.get("city")
    if city:
        demo_query["city"] = city
    out += [
        {
            "id": str(x["_id"]),
            "name": x["name"],
            "specialization": x.get("specialization"),
            "hospital": x.get("hospital"),
            "city": x.get("city"),
            "fee_paise": x.get("fee_paise"),
            "is_demo": True,
        }
        for x in d.suggested_doctors.find(demo_query)
    ]
    return {"doctors": out}, 200


@bp.get("/doctors/<doctor_id>/slots")
@require_roles("receptionist", "patient")
def slots(doctor_id):
    day, err = _parse_day(request.args.get("date"))
    if err:
        return err
    if day < datetime.now().date():
        return api_error("VALIDATION_ERROR", "Date is in the past.", 400)
    if not ObjectId.is_valid(doctor_id or ""):
        return api_error("NOT_FOUND", "Doctor not found.", 404)
    doctor = db.get_db().users.find_one({"_id": ObjectId(doctor_id), "role": "doctor"})
    if not doctor:
        return api_error("NOT_FOUND", "Doctor not found.", 404)
    free = set(_free_slots(doctor, day.isoformat()))
    all_slots = _day_slots(doctor.get("working_hours"))
    return {
        "date": day.isoformat(),
        "slots": [{"time": s, "available": s in free} for s in all_slots],
    }, 200


@bp.post("/appointments")
@require_roles("receptionist", "patient")
def book_appointment():
    data = request.get_json(force=True, silent=True) or {}
    user = g.user
    doctor_id, patient_id = data.get("doctor_id"), data.get("patient_id")
    if not ObjectId.is_valid(doctor_id or "") or not ObjectId.is_valid(patient_id or ""):
        return api_error("VALIDATION_ERROR", "doctor_id and patient_id are required.", 400)
    if user["role"] == "patient":
        # Patients book only for themselves, with any doctor.
        if str(user["_id"]) != patient_id:
            _audit("auth.forbidden", user["_id"], {"route": request.path, "reason": "booking for another patient"})
            return api_error("FORBIDDEN", "You can only book appointments for yourself.", 403)
    # Receptionists are the hospital front desk: they may book with ANY
    # doctor. linked_doctor_id, when set, is only a UI default.
    d = db.get_db()
    doctor = d.users.find_one({"_id": ObjectId(doctor_id), "role": "doctor"})
    patient = d.users.find_one({"_id": ObjectId(patient_id), "role": "patient"})
    if not doctor or not patient:
        return api_error("NOT_FOUND", "Unknown patient or doctor.", 404)
    day, err = _parse_day(data.get("date"))
    if err:
        return err
    if day < datetime.now().date():
        return api_error("VALIDATION_ERROR", "Cannot book a past date.", 400)
    slot = data.get("slot")
    if slot not in _day_slots(doctor.get("working_hours")):
        return api_error("VALIDATION_ERROR", "Slot is outside working hours.", 400)
    date = day.isoformat()
    if d.appointments.find_one(
        {"doctor_id": doctor["_id"], "date": date, "slot": slot, "status": "scheduled"}
    ):
        return _conflict(doctor, date, slot)
    doc = {
        "doctor_id": doctor["_id"],
        "patient_id": patient["_id"],
        "booked_by": user["_id"],
        "date": date,
        "slot": slot,
        "status": "scheduled",
        "notes": (data.get("notes") or "").strip() or None,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        doc["_id"] = d.appointments.insert_one(doc).inserted_id
    except DuplicateKeyError:  # race: unique index (doctor_id, date, slot) won
        return _conflict(doctor, date, slot)
    return {"appointment": _appt_card(doc)}, 201


@bp.get("/appointments")
@jwt_required
def list_appointments():
    user = g.user
    d = db.get_db()
    query = {}
    if request.args.get("date"):
        query["date"] = request.args.get("date")
    if user["role"] == "doctor":
        query["doctor_id"] = user["_id"]
        query.setdefault("date", datetime.now().strftime("%Y-%m-%d"))  # default: today
    elif user["role"] == "patient":
        query["patient_id"] = user["_id"]
    elif user["role"] != "receptionist":
        return api_error("FORBIDDEN", "Your role cannot access this resource.", 403)
    # Receptionist: front desk — unscoped, sees every appointment.
    pid = request.args.get("patient_id")
    if pid:
        if not ObjectId.is_valid(pid):
            return api_error("VALIDATION_ERROR", "Invalid patient_id.", 400)
        pid_oid = ObjectId(pid)
        if user["role"] == "patient" and pid_oid != user["_id"]:
            return api_error("FORBIDDEN", "You can only view your own appointments.", 403)
        if user["role"] == "doctor" and not d.appointments.find_one(
            {"doctor_id": user["_id"], "patient_id": pid_oid}
        ):
            return api_error("FORBIDDEN", "Not your patient.", 403)
        # Receptionists (front desk) may look up any patient's appointments.
        query["patient_id"] = pid_oid
    appts = sorted(d.appointments.find(query), key=lambda a: (a["date"], a["slot"]))
    names = _names_for(appts)
    return {"appointments": [_appt_card(a, names) for a in appts]}, 200


@bp.patch("/appointments/<appointment_id>")
@jwt_required
def update_appointment(appointment_id):
    user = g.user
    if user["role"] not in ("receptionist", "doctor", "patient"):
        return api_error("FORBIDDEN", "Your role cannot access this resource.", 403)
    if not ObjectId.is_valid(appointment_id or ""):
        return api_error("NOT_FOUND", "Appointment not found.", 404)
    d = db.get_db()
    appt = d.appointments.find_one({"_id": ObjectId(appointment_id)})
    if not appt:
        return api_error("NOT_FOUND", "Appointment not found.", 404)
    if user["role"] == "patient":
        # Patients may only cancel their own appointments — nothing else.
        if appt["patient_id"] != user["_id"]:
            _audit("auth.forbidden", user["_id"], {"route": request.path})
            return api_error("FORBIDDEN", "Not your appointment.", 403)
        data = request.get_json(force=True, silent=True) or {}
        if data.get("status") != "cancelled" or len(data) != 1:
            return api_error("VALIDATION_ERROR", "Patients can only cancel an appointment.", 400)
        d.appointments.update_one({"_id": appt["_id"]}, {"$set": {"status": "cancelled"}})
        appt["status"] = "cancelled"
        return {"appointment": _appt_card(appt)}, 200
    # Receptionists (front desk) may manage any appointment — reschedule
    # or cancel — regardless of which desk booked it.
    if user["role"] == "doctor" and appt["doctor_id"] != user["_id"]:
        _audit("auth.forbidden", user["_id"], {"route": request.path})
        return api_error("FORBIDDEN", "Not your appointment.", 403)
    data = request.get_json(force=True, silent=True) or {}
    update = {}
    if "status" in data:
        if data["status"] not in ("cancelled", "completed", "no_show"):
            return api_error("VALIDATION_ERROR", "Invalid status.", 400)
        update["status"] = data["status"]
    if "date" in data or "slot" in data:  # reschedule
        doctor = d.users.find_one({"_id": appt["doctor_id"]})
        day, err = _parse_day(data.get("date", appt["date"]))
        if err:
            return err
        if day < datetime.now().date():
            return api_error("VALIDATION_ERROR", "Cannot reschedule to a past date.", 400)
        new_slot = data.get("slot", appt["slot"])
        if new_slot not in _day_slots(doctor.get("working_hours") if doctor else None):
            return api_error("VALIDATION_ERROR", "Slot is outside working hours.", 400)
        clash = d.appointments.find_one(
            {
                "doctor_id": appt["doctor_id"],
                "date": day.isoformat(),
                "slot": new_slot,
                "status": "scheduled",
                "_id": {"$ne": appt["_id"]},
            }
        )
        if clash:
            return _conflict(doctor, day.isoformat(), new_slot)
        update["date"] = day.isoformat()
        update["slot"] = new_slot
    if not update:
        return api_error("VALIDATION_ERROR", "Nothing to update.", 400)
    d.appointments.update_one({"_id": appt["_id"]}, {"$set": update})
    appt.update(update)
    return {"appointment": _appt_card(appt)}, 200


@bp.post("/prescriptions")
@require_roles("doctor")
def write_prescription():
    data = request.get_json(force=True, silent=True) or {}
    medicines = data.get("medicines")
    if not isinstance(medicines, list) or len(medicines) < 1:
        return api_error("VALIDATION_ERROR", "At least one medicine is required.", 400)
    for m in medicines:
        if not isinstance(m, dict) or not (m.get("name") or "").strip():
            return api_error("VALIDATION_ERROR", "Each medicine needs a name.", 400)
    note = data.get("diagnosis_note") or ""
    if any(phrase in note.lower() for phrase in DIAGNOSIS_DENYLIST):
        return api_error(
            "VALIDATION_ERROR",
            "Diagnosis note must not contain a definitive diagnosis claim.",
            400,
        )
    pid = data.get("patient_id")
    if not ObjectId.is_valid(pid or ""):
        return api_error("VALIDATION_ERROR", "patient_id is required.", 400)
    d = db.get_db()
    patient = d.users.find_one({"_id": ObjectId(pid), "role": "patient"})
    if not patient:
        return api_error("NOT_FOUND", "Patient not found.", 404)
    if not d.appointments.find_one(
        {"doctor_id": g.user["_id"], "patient_id": patient["_id"], "status": {"$ne": "cancelled"}}
    ):
        _audit("auth.forbidden", g.user["_id"], {"route": request.path, "patient_id": pid})
        return api_error("FORBIDDEN", "You can only prescribe for your own patients.", 403)
    appointment_id = data.get("appointment_id")
    if appointment_id and not ObjectId.is_valid(appointment_id):
        return api_error("VALIDATION_ERROR", "Invalid appointment_id.", 400)
    doc = {
        "doctor_id": g.user["_id"],
        "patient_id": patient["_id"],
        "appointment_id": ObjectId(appointment_id) if appointment_id else None,
        "medicines": [
            {
                "name": m["name"].strip(),
                "dosage": (m.get("dosage") or "").strip(),
                "frequency": (m.get("frequency") or "").strip(),
                "duration_days": m.get("duration_days"),
                "instructions": (m.get("instructions") or "").strip() or None,
            }
            for m in medicines
        ],
        "diagnosis_note": note.strip() or None,
        "created_at": datetime.now(timezone.utc),
    }
    doc["_id"] = d.prescriptions.insert_one(doc).inserted_id
    return {"prescription": to_json(doc)}, 201


@bp.get("/prescriptions")
@jwt_required
def list_prescriptions():
    user = g.user
    d = db.get_db()
    pid = request.args.get("patient_id")
    if user["role"] == "patient":
        query = {"patient_id": user["_id"]}
    elif user["role"] == "doctor":
        if pid:
            if not ObjectId.is_valid(pid):
                return api_error("VALIDATION_ERROR", "Invalid patient_id.", 400)
            if not d.appointments.find_one({"doctor_id": user["_id"], "patient_id": ObjectId(pid)}):
                return api_error("FORBIDDEN", "Not your patient.", 403)
            query = {"patient_id": ObjectId(pid)}
        else:
            query = {"patient_id": {"$in": _doctor_patient_ids(user["_id"])}}
    else:
        return api_error("FORBIDDEN", "Your role cannot access this resource.", 403)
    rx = sorted(d.prescriptions.find(query), key=lambda r: r["created_at"], reverse=True)
    return {"prescriptions": [to_json(r) for r in rx]}, 200


@bp.get("/patients")
@require_roles("doctor", "receptionist")
def list_patients():
    user = g.user
    if user["role"] == "receptionist":
        # Front desk: every registered patient is searchable.
        query = {"role": "patient"}
    else:
        patient_ids = {a["patient_id"] for a in db.get_db().appointments.find({"doctor_id": user["_id"]})}
        query = {"_id": {"$in": list(patient_ids)}, "role": "patient"}
    term = (request.args.get("q") or "").strip()
    if term:
        query["name"] = {"$regex": re.escape(term), "$options": "i"}
    patients = db.get_db().users.find(query)
    return {
        "patients": [
            {"id": str(p["_id"]), "name": p["name"], "email": p["email"], "mobile": p.get("mobile")}
            for p in patients
        ]
    }, 200


@bp.get("/patients/<patient_id>")
@require_roles("doctor")
def patient_detail(patient_id):
    user = g.user
    if not ObjectId.is_valid(patient_id or ""):
        return api_error("NOT_FOUND", "Patient not found.", 404)
    d = db.get_db()
    patient = d.users.find_one({"_id": ObjectId(patient_id), "role": "patient"})
    if not patient:
        return api_error("NOT_FOUND", "Patient not found.", 404)
    if not d.appointments.find_one({"doctor_id": user["_id"], "patient_id": patient["_id"]}):
        _audit("auth.forbidden", user["_id"], {"route": request.path})
        return api_error("FORBIDDEN", "Not your patient.", 403)
    reports = sorted(
        d.reports.find({"patient_id": patient["_id"], "deleted_at": None}),
        key=lambda r: r["created_at"],
        reverse=True,
    )
    prescriptions = sorted(
        d.prescriptions.find({"patient_id": patient["_id"]}),
        key=lambda r: r["created_at"],
        reverse=True,
    )
    appointments = sorted(
        d.appointments.find({"doctor_id": user["_id"], "patient_id": patient["_id"]}),
        key=lambda a: (a["date"], a["slot"]),
    )
    return {
        "patient": {
            "id": str(patient["_id"]),
            "name": patient["name"],
            "email": patient["email"],
            "mobile": patient.get("mobile"),
        },
        "reports": [to_json(r) for r in reports],
        "prescriptions": [to_json(r) for r in prescriptions],
        "appointments": [to_json(a) for a in appointments],
    }, 200


# ---------------------------------------------------------------------------
# Clinician correction: reports are visible to patients automatically —
# there is no approval step. A doctor who spots a wrong extracted value
# on their own patient's report can correct it here; the correction
# recomputes status, critical flags, health score and summary through the
# same deterministic functions the pipeline uses, is audit-logged, and is
# shown to the patient as a "corrected by" note.
# ---------------------------------------------------------------------------

@bp.post("/reports/<report_id>/validate")
@require_roles("doctor")
def validate_report(report_id):
    user = g.user
    if not ObjectId.is_valid(report_id or ""):
        return api_error("NOT_FOUND", "Report not found.", 404)
    d = db.get_db()
    report = d.reports.find_one({"_id": ObjectId(report_id), "deleted_at": None})
    if not report:
        return api_error("NOT_FOUND", "Report not found.", 404)
    if not d.appointments.find_one({"doctor_id": user["_id"], "patient_id": report["patient_id"]}):
        _audit("auth.forbidden", user["_id"], {"route": request.path})
        return api_error("FORBIDDEN", "Not your patient.", 403)

    data = request.get_json(force=True, silent=True) or {}
    corrections_in = data.get("corrections") or []
    if not isinstance(corrections_in, list):
        return api_error("VALIDATION_ERROR", "corrections must be a list.", 400)

    from ..ai.metrics import status_for
    from ..ai.score import health_score
    from ..ai.alerts import critical_flags
    from ..ai.summarize import summarize

    metrics = [dict(m) for m in report.get("metrics") or []]
    by_param = {m.get("param"): m for m in metrics}
    applied = []
    for c in corrections_in:
        if not isinstance(c, dict):
            return api_error("VALIDATION_ERROR", "Each correction needs a param and a value.", 400)
        param = c.get("param")
        value = c.get("value", c.get("new_value"))
        target = by_param.get(param)
        if target is None:
            return api_error("VALIDATION_ERROR", f"Unknown parameter: {param!r}.", 400)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return api_error("VALIDATION_ERROR", f"Value for {param} must be a number.", 400)
        if value != target.get("value"):
            applied.append({"param": param, "old_value": target.get("value"), "new_value": value})
            target["value"] = value
            target["status"] = status_for(param, value)

    update = {"metrics": metrics}
    if not applied:
        return api_error(
            "VALIDATION_ERROR",
            "No corrections supplied. Reports are already visible to the "
            "patient — use this only to correct extracted values.",
            400)
    score, band = health_score(metrics)
    update["health_score"] = score
    update["health_band"] = band
    update["critical_flags"] = critical_flags(metrics)
    try:
        summary, method = summarize(metrics, report.get("raw_text", ""))
        update["summary"] = summary
        update["summary_method"] = method
    except Exception:
        pass  # a failed re-summary never blocks a clinician's correction
    validation = {
        "status": "corrected",
        "by": user["_id"],
        "by_name": user["name"],
        "at": datetime.now(timezone.utc),
        "corrections": applied,
    }
    update["validation"] = validation
    d.reports.update_one({"_id": report["_id"]}, {"$set": update})
    report.update(update)
    _audit("report.validated", user["_id"], {
        "report_id": report_id,
        "status": validation["status"],
        "corrections": [c["param"] for c in applied],
    })
    card = to_json(report)
    card["id"] = card.pop("_id")
    return {"report": card}, 200
