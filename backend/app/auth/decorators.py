"""jwt_required attaches g.user; require_roles enforces RBAC. All 403s are audit-logged."""
from functools import wraps

import jwt
from bson import ObjectId
from flask import g, request

from ..db import get_db
from ..errors import api_error
from .jwt_auth import decode_token


def _audit(event, actor_id, detail):
    try:
        get_db().audit_logs.insert_one(
            {
                "actor_id": actor_id,
                "event": event,
                "detail": detail,
                "ip": request.remote_addr,
            }
        )
    except Exception:
        pass  # auditing must never break the request


def jwt_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return api_error("UNAUTHORIZED", "Missing or invalid token.", 401)
        try:
            claims = decode_token(auth[7:])
        except jwt.ExpiredSignatureError:
            return api_error("UNAUTHORIZED", "Token expired. Please log in again.", 401)
        except jwt.InvalidTokenError:
            return api_error("UNAUTHORIZED", "Invalid token.", 401)
        user = get_db().users.find_one({"_id": ObjectId(claims["sub"])})
        if not user or user.get("deleted_at"):
            return api_error("UNAUTHORIZED", "Account no longer active.", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def require_roles(*roles):
    def decorator(fn):
        @wraps(fn)
        @jwt_required
        def wrapper(*args, **kwargs):
            if g.user["role"] not in roles:
                _audit(
                    "auth.forbidden",
                    g.user["_id"],
                    {"route": request.path, "role": g.user["role"]},
                )
                return api_error("FORBIDDEN", "Your role cannot access this resource.", 403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator
