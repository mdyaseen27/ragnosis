"""Report upload + retrieval — per API contract §5.2.

POST /upload · GET / · GET /:id · GET /:id/summary · POST /:id/reprocess · DELETE /:id
"""
import hashlib
import os
import re
import time
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, current_app, g, request

from pymongo.errors import DuplicateKeyError

from app import db  # module-attribute access so tests can monkeypatch app.db.get_db
from ..auth.decorators import _audit, jwt_required, require_roles
from ..errors import api_error
from ..extensions import limiter
from ..jsonutil import to_json

bp = Blueprint("reports", __name__)

ALLOWED_EXTS = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
# Magic bytes per claimed type — the filename extension is client-controlled.
MAGIC_BYTES = {
    "application/pdf": b"%PDF",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG",
}
NOT_DELETED = {"deleted_at": None}


def _display_name(patient_name, when, category, ext):
    """Canonical report name: PatientName_YYYY-MM-DD_Type.ext —
    e.g. MohammadYaseen_2026-10-12_CBC.pdf. The original client filename
    is kept separately in original_name for audit."""
    name = re.sub(r"[^A-Za-z0-9]+", "", patient_name or "") or "Patient"
    kind = re.sub(r"[^A-Za-z0-9]+", "", category or "") or "Report"
    return f"{name}_{when:%Y-%m-%d}_{kind}.{ext}"


def _stub_result():
    # Same dict shape the real app.ai.pipeline.process_report returns; used until it lands.
    return {
        "raw_text": "",
        "extraction_method": "stub",
        "metrics": [],
        "category": "General Medical Report",
        "category_scores": {},
        "labels": [],
        "entities": [],
        "summary": "Report stored. AI analysis is not available yet.",
        "summary_method": "stub",
        "health_score": 0,
        "health_band": "Needs Improvement",
        "critical_flags": [],
        "referrals": [],
        "pipeline_version": "0-stub",
    }


def _run_pipeline(data, mime, patient_id):
    try:
        from app.ai.pipeline import process_report
    except ImportError:
        process_report = None
    if not process_report:
        return _stub_result()
    try:
        return process_report(data, mime, patient_id)
    except ValueError:
        raise
    except Exception as e:
        # pdfplumber/pdfminer raise PDFSyntaxError (not ValueError) on corrupt
        # bytes. pdfplumber is an optional lazy dep, so match by class name.
        if e.__class__.__name__ in ("PDFSyntaxError", "PdfReadError"):
            raise ValueError(f"Could not parse file: {e}") from e
        # Any other pipeline failure must still reach the user as a readable
        # 422 — never a bare 500 page that looks like "nothing happened".
        raise ValueError(f"Could not process this file: {e}") from e


def _summary_card(report, deduped):
    return {
        "report": {
            "id": str(report["_id"]),
            "category": report.get("category") or "General Medical Report",
            "labels": report.get("labels", []),
            "health_score": report.get("health_score", 0),
            "health_band": report.get("health_band") or "Needs Improvement",
            "metrics_count": len(report.get("metrics") or []),
            "critical_flags": to_json(report.get("critical_flags") or []),
            "summary": report.get("summary", ""),
            "processing_ms": report.get("processing_ms", 0),
        },
        "deduped": deduped,
    }


def _list_card(report):
    # .get() throughout: one legacy report doc missing a field (or with
    # created_at stored as a string) must never 500 the whole list.
    created = report.get("created_at")
    return {
        "id": str(report["_id"]),
        "file_name": report.get("file_name") or "Report",
        "category": report.get("category") or "General Medical Report",
        "labels": report.get("labels", []),
        "health_score": report.get("health_score", 0),
        "health_band": report.get("health_band") or "Needs Improvement",
        "critical_count": len(report.get("critical_flags") or []),
        "created_at": created.isoformat() if hasattr(created, "isoformat") else created,
    }


def _can_access(user, report):
    if user["role"] == "patient":
        return report["patient_id"] == user["_id"]
    doctor_id = user["_id"] if user["role"] == "doctor" else user.get("linked_doctor_id")
    if not doctor_id:
        return False
    return (
        db.get_db().appointments.find_one(
            {"doctor_id": doctor_id, "patient_id": report["patient_id"], "status": {"$ne": "cancelled"}}
        )
        is not None
    )


def _fetch(user, report_id):
    """Returns (report, None) or (None, error_response)."""
    if not ObjectId.is_valid(report_id or ""):
        return None, api_error("NOT_FOUND", "Report not found.", 404)
    report = db.get_db().reports.find_one({"_id": ObjectId(report_id), **NOT_DELETED})
    if not report:
        return None, api_error("NOT_FOUND", "Report not found.", 404)
    if not _can_access(user, report):
        _audit("auth.forbidden", user["_id"], {"route": request.path, "report_id": report_id})
        return None, api_error("FORBIDDEN", "You do not have access to this report.", 403)
    return report, None


def _scope(user):
    if user["role"] == "patient":
        return {"patient_id": user["_id"]}
    doctor_id = user["_id"] if user["role"] == "doctor" else user.get("linked_doctor_id")
    patient_ids = (
        [
            a["patient_id"]
            for a in db.get_db().appointments.find(
                {"doctor_id": doctor_id, "status": {"$ne": "cancelled"}}
            )
        ]
        if doctor_id
        else []
    )
    return {"patient_id": {"$in": patient_ids}}


@bp.post("/upload")
@require_roles("patient", "receptionist")
@limiter.limit("20 per day", key_func=lambda: f"upload:{g.user['_id']}")
def upload():
    user = g.user
    if "file" not in request.files:
        return api_error("VALIDATION_ERROR", "No file part in the request.", 400)
    f = request.files["file"]
    if not f.filename:
        return api_error("VALIDATION_ERROR", "No file selected.", 400)
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
    mime = ALLOWED_EXTS.get(ext)
    if not mime:
        return api_error("UNSUPPORTED_MEDIA_TYPE", "Only PDF, JPG and PNG files are supported.", 415)
    head = f.read(len(max(MAGIC_BYTES.values(), key=len)))
    f.seek(0)
    if not head.startswith(MAGIC_BYTES[mime]):
        return api_error("UNSUPPORTED_MEDIA_TYPE", "File content does not match its extension.", 415)
    data = f.read()
    if len(data) > current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024:
        return api_error("FILE_TOO_LARGE", "File exceeds the size limit.", 413)
    if not data:
        return api_error("UNPROCESSABLE", "File is empty or unreadable.", 422)

    d = db.get_db()
    if user["role"] == "patient":
        patient_id = user["_id"]
        patient_name = user.get("name")
    else:
        pid = (request.form.get("patient_id") or "").strip()
        if not ObjectId.is_valid(pid):
            return api_error("VALIDATION_ERROR", "patient_id is required.", 400)
        patient_id = ObjectId(pid)
        patient_doc = d.users.find_one({"_id": patient_id, "role": "patient"})
        if not patient_doc:
            return api_error("NOT_FOUND", "Patient not found.", 404)
        patient_name = patient_doc.get("name")
        # Front desk: a receptionist may upload for any registered
        # patient — the desk is not tied to one doctor.

    file_hash = hashlib.sha256(data).hexdigest()
    existing = d.reports.find_one({"patient_id": patient_id, "file_hash": file_hash, **NOT_DELETED})
    if existing:
        return _summary_card(existing, deduped=True), 200

    # Stored under the content hash (not the client filename): no traversal risk, dedups bytes.
    upload_dir = current_app.config["UPLOAD_DIR"]
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{file_hash}.{ext}")
    if not os.path.exists(file_path):
        with open(file_path, "wb") as fh:
            fh.write(data)

    t0 = time.perf_counter()
    try:
        result = _run_pipeline(data, mime, patient_id)
    except ValueError as e:
        # Pipeline is present but this file is genuinely unprocessable here.
        return api_error("UNPROCESSABLE", str(e), 422)
    processing_ms = int((time.perf_counter() - t0) * 1000)

    now = datetime.now(timezone.utc)
    doc = {
        "patient_id": patient_id,
        "uploaded_by": user["_id"],
        "file_hash": file_hash,
        "file_name": _display_name(patient_name, now, result.get("category"), ext),
        "original_name": f.filename,
        "file_path": file_path,
        "mime_type": mime,
        "raw_text": result.get("raw_text", ""),
        "extraction_method": result.get("extraction_method", "stub"),
        "metrics": result.get("metrics", []),
        "category": result.get("category", "General Medical Report"),
        "category_scores": result.get("category_scores", {}),
        "labels": result.get("labels", []),
        "entities": result.get("entities", []),
        "summary": result.get("summary", ""),
        "summary_method": result.get("summary_method", "stub"),
        "health_score": result.get("health_score", 0),
        "health_band": result.get("health_band", "Needs Improvement"),
        "critical_flags": result.get("critical_flags", []),
        "referrals": result.get("referrals", []),
        "pipeline_version": result.get("pipeline_version", "0-stub"),
        "processing_ms": processing_ms,
        "created_at": now,
    }
    try:
        doc["_id"] = d.reports.insert_one(doc).inserted_id
    except DuplicateKeyError:
        # Concurrent duplicate upload won the race: return the winner as deduped.
        existing = d.reports.find_one(
            {"patient_id": patient_id, "file_hash": file_hash, **NOT_DELETED}
        )
        return _summary_card(existing, deduped=True), 200
    return _summary_card(doc, deduped=False), 201


@bp.get("/", strict_slashes=False)
@jwt_required
def list_reports():
    try:
        page = max(int(request.args.get("page", 1)), 1)
        limit = min(max(int(request.args.get("limit", 20)), 1), 100)
    except (TypeError, ValueError):
        return api_error("VALIDATION_ERROR", "Invalid pagination parameters.", 400)
    d = db.get_db()
    query = {**_scope(g.user), **NOT_DELETED}
    total = d.reports.count_documents(query)
    items = d.reports.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    return {
        "reports": [_list_card(r) for r in items],
        "page": page,
        "limit": limit,
        "total": total,
    }, 200


@bp.get("/<report_id>")
@jwt_required
def get_report(report_id):
    report, err = _fetch(g.user, report_id)
    if err:
        return err
    doc = to_json(report)
    doc.pop("file_path", None)  # never expose the server path
    doc["id"] = doc.pop("_id")
    return {"report": doc}, 200


@bp.get("/<report_id>/summary")
@jwt_required
def get_summary(report_id):
    report, err = _fetch(g.user, report_id)
    if err:
        return err
    return {
        "summary": report["summary"],
        "summary_method": report["summary_method"],
        "entities": to_json(report["entities"]),
    }, 200


@bp.post("/<report_id>/reprocess")
@require_roles("patient")
def reprocess(report_id):
    report, err = _fetch(g.user, report_id)  # patients can only fetch their own
    if err:
        return err
    try:
        with open(report["file_path"], "rb") as fh:
            data = fh.read()
    except OSError:
        return api_error("NOT_FOUND", "Original file is no longer available.", 404)
    t0 = time.perf_counter()
    try:
        result = _run_pipeline(data, report["mime_type"], report["patient_id"])
    except ValueError as e:
        return api_error("UNPROCESSABLE", str(e), 422)
    processing_ms = int((time.perf_counter() - t0) * 1000)
    update = {
        "raw_text": result.get("raw_text", ""),
        "extraction_method": result.get("extraction_method", "stub"),
        "metrics": result.get("metrics", []),
        "category": result.get("category", "General Medical Report"),
        "category_scores": result.get("category_scores", {}),
        "labels": result.get("labels", []),
        # Fresh extraction supersedes any clinician corrections of the
        # old values — they no longer apply to the new numbers.
        "validation": None,
        "entities": result.get("entities", []),
        "summary": result.get("summary", ""),
        "summary_method": result.get("summary_method", "stub"),
        "health_score": result.get("health_score", 0),
        "health_band": result.get("health_band", "Needs Improvement"),
        "critical_flags": result.get("critical_flags", []),
        "referrals": result.get("referrals", []),
        "pipeline_version": result.get("pipeline_version", "0-stub"),
        "processing_ms": processing_ms,
    }
    # Keep the canonical name in step if re-analysis changed the category.
    patient = db.get_db().users.find_one({"_id": report["patient_id"]})
    ext = report["file_path"].rsplit(".", 1)[-1] if "." in report.get("file_path", "") else "pdf"
    update["file_name"] = _display_name(
        patient.get("name") if patient else None,
        report["created_at"], update["category"], ext)
    db.get_db().reports.update_one({"_id": report["_id"]}, {"$set": update})
    report.update(update)
    return _summary_card(report, deduped=False), 200


@bp.delete("/<report_id>")
@require_roles("patient")
def delete_report(report_id):
    report, err = _fetch(g.user, report_id)  # patients can only fetch their own
    if err:
        return err
    db.get_db().reports.update_one(
        {"_id": report["_id"]}, {"$set": {"deleted_at": datetime.now(timezone.utc)}}
    )
    try:
        os.remove(report["file_path"])  # contract §5.2: file bytes removed
    except OSError:
        pass  # already gone — the DB row is the source of truth
    return {"ok": True}, 200
