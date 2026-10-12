"""Shared extension instances, initialized in the app factory."""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Default limits come from app.config["RATELIMIT_DEFAULT"] via init_app.
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
