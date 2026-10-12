"""RAG chat — per API contract §5.3. Patient only.

POST /ask · GET /sessions · GET /sessions/:id · DELETE /sessions/:id
"""
import time
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, g, request

from app import db  # module-attribute access so tests can monkeypatch app.db.get_db
from ..auth.decorators import _audit, require_roles
from ..errors import api_error
from ..extensions import limiter
from ..jsonutil import to_json

bp = Blueprint("chat", __name__)

DISCLAIMER = (
    "Educational information only — not medical advice, diagnosis, or treatment. "
    "Please consult a qualified doctor."
)


def _answer(question, report):
    try:
        from app.ai.rag import answer
    except ImportError:
        answer = None
    if answer is None:
        return {
            "answer": "The AI chat service is not available yet. Your question has been saved.",
            "citations": [],
            "model": "unavailable",
        }
    structured = None
    if report:
        structured = {
            "file_name": report.get("file_name"),
            "category": report.get("category"),
            "health_score": report.get("health_score"),
            "summary": report.get("summary"),
            "metrics": report.get("metrics") or [],
        }
    # The extracted metrics are the primary context; raw_text is only a
    # tail excerpt for the LLM (photo OCR text is a garbled column dump).
    text, citations, model = answer(
        question, report["raw_text"] if report else "", report=structured)
    return {"answer": text, "citations": citations, "model": model}


def _session_card(s):
    return {
        "id": str(s["_id"]),
        "title": s["title"],
        "report_id": str(s["report_id"]) if s.get("report_id") else None,
        "updated_at": s["updated_at"].isoformat(),
    }


def _fetch_session(user, session_id):
    if not ObjectId.is_valid(session_id or ""):
        return None, api_error("NOT_FOUND", "Chat session not found.", 404)
    session = db.get_db().chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        return None, api_error("NOT_FOUND", "Chat session not found.", 404)
    if session["patient_id"] != user["_id"]:
        _audit("auth.forbidden", user["_id"], {"route": request.path, "session_id": session_id})
        return None, api_error("FORBIDDEN", "You do not have access to this chat session.", 403)
    return session, None


@bp.post("/ask")
@require_roles("patient")
@limiter.limit("30 per hour", key_func=lambda: f"chat:{g.user['_id']}")
def ask():
    data = request.get_json(force=True, silent=True) or {}
    question = (data.get("question") or "").strip()
    if not 3 <= len(question) <= 500:
        return api_error("VALIDATION_ERROR", "Question must be 3–500 characters.", 400)
    user = g.user
    d = db.get_db()

    report = None
    report_id = data.get("report_id")
    if report_id:
        if not ObjectId.is_valid(report_id):
            return api_error("NOT_FOUND", "Report not found.", 404)
        report = d.reports.find_one({"_id": ObjectId(report_id), "deleted_at": None})
        if not report or report["patient_id"] != user["_id"]:
            _audit("auth.forbidden", user["_id"], {"route": request.path, "report_id": report_id})
            return api_error("FORBIDDEN", "Report not found or not yours.", 403)

    session = None
    if data.get("session_id"):
        session, err = _fetch_session(user, data["session_id"])
        if err:
            return err

    # Continuing a report chat without re-sending report_id (e.g. reopened
    # from the general chat list) must keep that report's context.
    if report is None and session is not None and session.get("report_id"):
        candidate = d.reports.find_one({"_id": session["report_id"], "deleted_at": None})
        if candidate and candidate["patient_id"] == user["_id"]:
            report = candidate

    t0 = time.perf_counter()
    result = _answer(question, report)
    latency_ms = int((time.perf_counter() - t0) * 1000)

    now = datetime.now(timezone.utc)
    if session is None:
        session = {
            "patient_id": user["_id"],
            "report_id": report["_id"] if report else None,
            "title": question[:60],
            "created_at": now,
            "updated_at": now,
        }
        session["_id"] = d.chat_sessions.insert_one(session).inserted_id
    else:
        d.chat_sessions.update_one({"_id": session["_id"]}, {"$set": {"updated_at": now}})

    d.chat_messages.insert_one(
        {"session_id": session["_id"], "role": "user", "content": question, "created_at": now}
    )
    d.chat_messages.insert_one(
        {
            "session_id": session["_id"],
            "role": "assistant",
            "content": result.get("answer", ""),
            "citations": result.get("citations", []),
            "model": result.get("model", ""),
            "latency_ms": latency_ms,
            "created_at": now,
        }
    )
    return {
        "answer": result.get("answer", ""),
        "citations": result.get("citations", []),
        "model": result.get("model", ""),
        "latency_ms": latency_ms,
        "session_id": str(session["_id"]),
        "disclaimer": DISCLAIMER,
    }, 200


@bp.get("/sessions")
@require_roles("patient")
def list_sessions():
    query = {"patient_id": g.user["_id"]}
    report_id = request.args.get("report_id")
    if report_id:
        if not ObjectId.is_valid(report_id):
            return api_error("NOT_FOUND", "Report not found.", 404)
        query["report_id"] = ObjectId(report_id)
    sessions = db.get_db().chat_sessions.find(query).sort("updated_at", -1)
    return {"sessions": [_session_card(s) for s in sessions]}, 200


@bp.get("/sessions/<session_id>")
@require_roles("patient")
def get_session(session_id):
    session, err = _fetch_session(g.user, session_id)
    if err:
        return err
    messages = sorted(
        db.get_db().chat_messages.find({"session_id": session["_id"]}),
        key=lambda m: m["created_at"],
    )
    return {"session": _session_card(session), "messages": [to_json(m) for m in messages]}, 200


@bp.delete("/sessions/<session_id>")
@require_roles("patient")
def delete_session(session_id):
    session, err = _fetch_session(g.user, session_id)
    if err:
        return err
    d = db.get_db()
    d.chat_messages.delete_many({"session_id": session["_id"]})
    d.chat_sessions.delete_one({"_id": session["_id"]})
    return {"ok": True}, 200
