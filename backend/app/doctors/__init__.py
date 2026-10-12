"""Doctor directory — per API contract §5.5. GET /suggested (demo directory, flagged)."""
from flask import Blueprint, request

from app import db  # module-attribute access so tests can monkeypatch app.db.get_db
from ..auth.decorators import require_roles
from ..errors import api_error
from ..jsonutil import to_json

bp = Blueprint("doctors", __name__)


@bp.get("/suggested")
@require_roles("patient", "doctor")
def suggested():
    d = db.get_db()
    specialization = request.args.get("specialization")
    city = request.args.get("city")
    query = {}
    if specialization:
        known = {c["specialization"] for c in d.suggested_doctors.find({})}
        if specialization not in known:
            return api_error("VALIDATION_ERROR", "Unknown specialization.", 400)
        query["specialization"] = specialization
    if city:
        query["city"] = city
    doctors = [to_json(c) for c in d.suggested_doctors.find(query)]
    return {"doctors": doctors, "is_demo": True}, 200
