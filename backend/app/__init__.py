"""RAGnosis API — application factory (production entry point)."""
import logging
import os
import sys
import uuid
from pathlib import Path

from flask import Flask, g, request

try:
    from dotenv import load_dotenv
except ImportError:  # optional dep: in production the orchestrator injects env
    def load_dotenv(*_a, **_k):
        return False

# backend/.env sits next to this package — load it explicitly so config is
# found no matter which directory the server starts from. A .env in the
# working directory is honored too. Exported variables always win (dotenv
# never overrides them).
_PKG_DIR = Path(__file__).resolve().parent
load_dotenv(_PKG_DIR.parent / ".env")
load_dotenv()

from .config import get_config
from .extensions import limiter
from .errors import api_error, register_error_handlers

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class _RequestIdFilter(logging.Filter):
    def filter(self, record):
        try:
            record.request_id = g.get("request_id", "-")
        except RuntimeError:  # outside request context
            record.request_id = "-"
        return True


def _setup_logging(app):
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            '{"ts":"%(asctime)s","level":"%(levelname)s","req":"%(request_id)s","msg":"%(message)s"}'
        )
    )
    handler.addFilter(_RequestIdFilter())
    app.logger.handlers = [handler]
    app.logger.setLevel(app.config["LOG_LEVEL"])
    app.logger.propagate = False


def create_app(config_class=None):
    app = Flask(__name__)
    app.config.from_object(config_class or get_config())

    if app.config["ENV_NAME"] == "production":
        key = app.config["SECRET_KEY"]
        if not key or len(key) < 32 or key.startswith("dev-only"):
            raise RuntimeError("SECRET_KEY must be a strong 32+ char value in production.")
        # Trust X-Forwarded-For from the single nginx hop so per-IP rate limits
        # see real client IPs. Production-only: in dev a client could spoof the
        # header to rotate rate-limit buckets.
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)

    # Reject oversize bodies at parse time (before any view buffers them).
    app.config["MAX_CONTENT_LENGTH"] = app.config["MAX_UPLOAD_MB"] * 1024 * 1024

    _setup_logging(app)
    register_error_handlers(app)

    # Hosted single-container mode (Hugging Face Space): when FRONTEND_DIST
    # points at a built frontend, this process also serves the SPA so the
    # whole product lives on one origin. Unset in local dev (Vite serves
    # the UI) and the API behaves exactly as before.
    _dist = os.environ.get("FRONTEND_DIST") or ""
    _spa = bool(_dist) and Path(_dist).is_dir()

    # Indexes are part of the app's contract (uniqueness, dedup, slot
    # races) — ensure them at boot, not only when the seed script runs.
    # Never block boot on it: /api/ready reports DB health separately.
    try:
        from .db import init_indexes

        with app.app_context():
            init_indexes()
    except Exception:
        app.logger.warning("index bootstrap skipped (DB unreachable at boot)")

    limiter.init_app(app)

    @app.before_request
    def _assign_request_id():
        g.request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
        if request.method == "OPTIONS":
            return ("", 204)

    @app.after_request
    def _harden_response(resp):
        for header, value in SECURITY_HEADERS.items():
            resp.headers.setdefault(header, value)
        if _spa and not request.path.startswith("/api"):
            resp.headers.pop("X-Frame-Options", None)
        origin = request.headers.get("Origin")
        if origin in app.config["CORS_ORIGINS"]:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type, X-Request-ID"
            )
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        resp.headers["X-Request-ID"] = g.get("request_id", "-")
        return resp

    @app.get("/api/health")
    def health():
        return {"ok": True, "service": "ragnosis-api"}

    @app.get("/")
    def index():
        if _spa:
            from flask import send_from_directory

            return send_from_directory(_dist, "index.html")
        # Dev convenience: visiting the API root in a browser explains where
        # the UI lives instead of returning a bare 404. In production nginx
        # serves the frontend at /, so this route is never hit there.
        return (
            "<!doctype html><html><head><title>RAGnosis API</title>"
            "<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;"
            "padding:0 24px;color:#0F2A3C;background:#F1F7F9;line-height:1.6}"
            "a{color:#0E7490;font-weight:700}</style></head><body>"
            "<h1>RAGnosis API is running</h1>"
            "<p>This server only speaks JSON. The app UI runs on the Vite dev server:</p>"
            '<p><a href="http://localhost:5173">Open the app at http://localhost:5173</a></p>'
            '<p>API health: <a href="/api/health">/api/health</a> · '
            'readiness: <a href="/api/ready">/api/ready</a></p>'
            "</body></html>"
        )

    @app.get("/api/ready")
    def ready():
        from .db import ping

        db_ok, detail = ping()
        status = 200 if db_ok else 503
        return {"ok": db_ok, "db": detail}, status

    # Blueprints (auth is live; the rest land in their milestones)
    from .auth import bp as auth_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    for name in ("reports", "chat", "hospital", "doctors", "reminders"):
        try:
            mod = __import__(f"app.{name}", fromlist=["bp"])
            bp = getattr(mod, "bp", None)
        except ImportError:
            bp = None
        if bp is None:
            app.logger.info("Blueprint '%s' not yet implemented; skipping.", name)
        else:
            app.register_blueprint(bp, url_prefix=f"/api/{name}")

    @app.route("/api/<path:_>", methods=["GET", "POST", "PATCH", "DELETE"])
    def _api_fallback(_):
        return api_error("NOT_FOUND", "Unknown API route.", 404)

    if _spa:
        from flask import send_from_directory

        @app.get("/<path:path>")
        def _spa_fallback(path):
            # API paths never reach here (the /api rules above win). Serve
            # real built files when they exist; everything else is a
            # client-side route and gets the SPA shell.
            if (Path(_dist) / path).is_file():
                return send_from_directory(_dist, path)
            return send_from_directory(_dist, "index.html")

    return app
