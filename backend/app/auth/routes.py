"""POST /api/auth/register|login|refresh|logout, GET /api/auth/me — per API contract §5.1."""
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from flask import Blueprint, current_app, g, request
from pymongo.errors import DuplicateKeyError

from ..db import get_db
from ..extensions import limiter
from ..jsonutil import safe_str
from ..errors import api_error
from .decorators import _audit, jwt_required
from .jwt_auth import create_access_token, create_refresh_token, decode_token, hash_password, verify_password

bp = Blueprint("auth", __name__)

ROLES = ("patient", "doctor", "receptionist")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def _public_user(user):
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "mobile": user.get("mobile"),
        "role": user["role"],
        "specialization": user.get("specialization"),
        "hospital": user.get("hospital"),
        "doctor_id_public": user.get("doctor_id_public"),
        "linked_doctor_id": str(user["linked_doctor_id"]) if user.get("linked_doctor_id") else None,
    }


def _tokens(user):
    refresh, jti = create_refresh_token()
    get_db().users.update_one({"_id": user["_id"]}, {"$set": {"refresh_jti": jti}})
    return {
        "access": create_access_token(str(user["_id"]), user["role"], user["email"]),
        "refresh": refresh,
    }


@bp.post("/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    name = safe_str(data.get("name")).strip()
    email = safe_str(data.get("email")).strip().lower()
    mobile = safe_str(data.get("mobile")).strip() or None
    password = safe_str(data.get("password"))
    role = data.get("role")

    if not name or not EMAIL_RE.match(email):
        return api_error("VALIDATION_ERROR", "Name and a valid email are required.", 400)
    if len(password) < 8:
        return api_error("VALIDATION_ERROR", "Password must be at least 8 characters.", 400)
    if role not in ROLES:
        return api_error("VALIDATION_ERROR", "Role must be patient, doctor, or receptionist.", 400)
    if mobile and not MOBILE_RE.match(mobile):
        return api_error("VALIDATION_ERROR", "Mobile must be a 10-digit Indian number.", 400)

    db = get_db()
    or_clauses = [{"email": email}]
    if mobile:
        or_clauses.append({"mobile": mobile})
    if db.users.find_one({"$or": or_clauses}):
        return api_error("CONFLICT", "Email or mobile already registered.", 409)

    doc = {
        "name": name,
        "email": email,
        "password_hash": hash_password(password),
        "role": role,
        "created_at": datetime.now(timezone.utc),
    }
    if mobile:
        # Only stored when provided: an explicit null would collide in
        # the unique mobile index for every no-mobile user after the first.
        doc["mobile"] = mobile
    if role == "doctor":
        if not (data.get("specialization") or "").strip():
            return api_error("VALIDATION_ERROR", "Doctors must provide a specialization.", 400)
        doc.update(
            specialization=data["specialization"].strip(),
            hospital=(data.get("hospital") or "").strip() or None,
            doctor_id_public="DR-" + __import__("uuid").uuid4().hex[:6].upper(),
        )
    if role == "receptionist":
        # A doctor code is OPTIONAL: it only sets a default doctor for the
        # desk. Receptionists are a hospital front desk and can book with
        # any doctor, linked or not.
        code = (data.get("doctor_id_public") or "").strip()
        if code:
            doctor = db.users.find_one(
                {"doctor_id_public": code, "role": "doctor"}
            )
            if not doctor:
                return api_error("VALIDATION_ERROR", "Invalid doctor ID for receptionist registration.", 400)
            doc["linked_doctor_id"] = doctor["_id"]

    try:
        result = db.users.insert_one(doc)
    except DuplicateKeyError:
        # Lost a race against the pre-check above (or a unique field the
        # check doesn't cover) — that's a conflict, never a 500.
        return api_error("CONFLICT", "Email or mobile already registered.", 409)
    user = db.users.find_one({"_id": result.inserted_id})
    _audit("auth.register", user["_id"], {"role": role})
    return {"user": _public_user(user), "tokens": _tokens(user)}, 201


@bp.post("/login")
@limiter.limit("5 per 15 minutes")
def login():
    data = request.get_json(force=True, silent=True) or {}
    identifier = safe_str(data.get("identifier")).strip().lower()
    password = safe_str(data.get("password"))
    # Generic message on purpose: no user enumeration.
    invalid = api_error("UNAUTHORIZED", "Invalid credentials.", 401)

    query = {"mobile": identifier} if MOBILE_RE.match(identifier) else {"email": identifier}
    user = get_db().users.find_one(query)
    if not user or user.get("deleted_at") or not verify_password(password, user["password_hash"]):
        _audit("auth.login_failed", user["_id"] if user else None, {"identifier": identifier[:3] + "***"})
        return invalid

    get_db().users.update_one(
        {"_id": user["_id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}}
    )
    _audit("auth.login_success", user["_id"], {})
    return {"user": _public_user(user), "tokens": _tokens(user)}, 200


@bp.post("/refresh")
def refresh():
    data = request.get_json(force=True, silent=True) or {}
    try:
        claims = decode_token(data.get("refresh_token") or "")
        if claims.get("sub") != "refresh":
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        return api_error("UNAUTHORIZED", "Invalid refresh token.", 401)
    except jwt.ExpiredSignatureError:
        return api_error("UNAUTHORIZED", "Session expired. Please log in again.", 401)

    db = get_db()
    user = db.users.find_one({"refresh_jti": claims["jti"]})
    if not user:
        # Reuse detected: a rotated-out token came back. The jti is already dead,
        # so there is nothing left to revoke — force a fresh login.
        return api_error("UNAUTHORIZED", "Session invalid. Please log in again.", 401)
    return {"tokens": _tokens(user)}, 200


@bp.post("/logout")
@jwt_required
def logout():
    get_db().users.update_one({"_id": g.user["_id"]}, {"$unset": {"refresh_jti": ""}})
    return {"ok": True}, 200


@bp.post("/forgot-password")
@limiter.limit("3 per hour")
def forgot_password():
    """Issue a single-use reset token (30 min). The response is identical
    whether or not the email exists — no account enumeration. Only the
    token's SHA-256 hash is stored. Delivery: no mail provider is wired up
    yet, so the link is written to the server log; in development it is
    also returned in the response so the flow can be used and tested."""
    data = request.get_json(force=True, silent=True) or {}
    email = safe_str(data.get("email")).strip().lower()
    resp = {"ok": True,
            "message": "If that email is registered, a password reset link is on its way."}
    user = get_db().users.find_one({"email": email}) if EMAIL_RE.match(email) else None
    if user and not user.get("deleted_at"):
        token = secrets.token_urlsafe(32)
        get_db().users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "reset_hash": hashlib.sha256(token.encode()).hexdigest(),
                "reset_expires": datetime.now(timezone.utc) + timedelta(minutes=30),
            }},
        )
        link = f"http://localhost:5173/reset-password?token={token}"
        logging.getLogger("ragnosis.auth").warning(
            "Password reset link for %s: %s", email, link)
        _audit("auth.password_reset_requested", user["_id"], {})
        if current_app.config.get("ENV_NAME") != "production":
            resp["reset_url"] = link
    return resp, 200


@bp.post("/reset-password")
@limiter.limit("10 per hour")
def reset_password():
    data = request.get_json(force=True, silent=True) or {}
    token = safe_str(data.get("token"))
    password = safe_str(data.get("password"))
    if len(password) < 8:
        return api_error("VALIDATION_ERROR", "Password must be at least 8 characters.", 400)
    if not token:
        return api_error("VALIDATION_ERROR", "Reset token is required.", 400)
    db = get_db()
    user = db.users.find_one(
        {"reset_hash": hashlib.sha256(token.encode()).hexdigest()})
    expires = user.get("reset_expires") if user else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)  # Mongo round-trip may drop tz
    if not user or not expires or expires < datetime.now(timezone.utc):
        return api_error("UNAUTHORIZED", "This reset link is invalid or has expired.", 401)
    db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(password)},
         "$unset": {"reset_hash": "", "reset_expires": "", "refresh_jti": ""}},
    )
    _audit("auth.password_reset", user["_id"], {})
    return {"ok": True, "message": "Password updated. Please sign in."}, 200


@bp.get("/me")
@jwt_required
def me():
    return {"user": _public_user(g.user)}, 200
