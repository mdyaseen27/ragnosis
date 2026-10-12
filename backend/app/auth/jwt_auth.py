"""Password hashing, JWT issue/verify. Bcrypt cost 12; access 15-60 min; refresh 7 days."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import current_app


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode(), bcrypt.gensalt(rounds=current_app.config["BCRYPT_ROUNDS"])
    ).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def _now():
    return datetime.now(timezone.utc)


def create_access_token(user_id: str, role: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "email": email,
        "iat": _now(),
        "exp": _now() + timedelta(minutes=current_app.config["JWT_ACCESS_MINUTES"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def create_refresh_token() -> tuple[str, str]:
    """Returns (token, jti). The jti is stored on the user doc for rotation checks."""
    jti = uuid.uuid4().hex
    payload = {
        "sub": "refresh",
        "jti": jti,
        "iat": _now(),
        "exp": _now() + timedelta(days=current_app.config["JWT_REFRESH_DAYS"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256"), jti


def decode_token(token: str) -> dict:
    return jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
