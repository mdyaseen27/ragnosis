"""Standard error body: {"error": {"code": "<MACHINE_CODE>", "message": "<human>"}}."""


def api_error(code, message, status):
    from flask import jsonify

    return jsonify({"error": {"code": code, "message": message}}), status


def register_error_handlers(app):
    from .db import DBUnavailable

    @app.errorhandler(DBUnavailable)
    def db_unavailable(e):
        app.logger.warning("DB unavailable: %s", e)
        return api_error("SERVICE_UNAVAILABLE", "Database unavailable. Please retry shortly.", 503)

    @app.errorhandler(400)
    def bad_request(e):
        return api_error("VALIDATION_ERROR", "Invalid request.", 400)

    @app.errorhandler(401)
    def unauthorized(e):
        return api_error("UNAUTHORIZED", "Authentication required.", 401)

    @app.errorhandler(403)
    def forbidden(e):
        return api_error("FORBIDDEN", "You do not have access to this resource.", 403)

    @app.errorhandler(404)
    def not_found(e):
        return api_error("NOT_FOUND", "Resource not found.", 404)

    @app.errorhandler(405)
    def method_not_allowed(e):
        return api_error("METHOD_NOT_ALLOWED", "Method not allowed.", 405)

    @app.errorhandler(413)
    def too_large(e):
        return api_error("FILE_TOO_LARGE", "Uploaded file exceeds the size limit.", 413)

    @app.errorhandler(415)
    def unsupported_media(e):
        return api_error("UNSUPPORTED_MEDIA_TYPE", "File type not supported.", 415)

    @app.errorhandler(429)
    def rate_limited(e):
        return api_error("RATE_LIMITED", "Too many requests. Please retry shortly.", 429)

    @app.errorhandler(500)
    def internal(e):
        app.logger.exception("Unhandled exception")
        return api_error("INTERNAL_ERROR", "Something went wrong.", 500)
