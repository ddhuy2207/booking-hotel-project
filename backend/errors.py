import uuid
from http import HTTPStatus
 
from flask import current_app, jsonify, request
from sqlalchemy.exc import DataError, IntegrityError, OperationalError, SQLAlchemyError
from werkzeug.exceptions import HTTPException
 
from extensions import db
from utils.validators import ValidationError
 
 
# --------------------------------------------------------------------------
# Shared exceptions
# --------------------------------------------------------------------------
class AppError(Exception):
    def __init__(self, message, status=400, code=None, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details
 
 
# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _default_code(status):
    try:
        return HTTPStatus(status).phrase.upper().replace(" ", "_").replace("-", "_")
    except ValueError:
        return "ERROR"
 
 
def error_response(status, message, code=None, headers=None, **extra):
    body = {"success": False, "error": message, "code": code or _default_code(status)}
    body.update({k: v for k, v in extra.items() if v is not None})
    response = jsonify(body)
    response.status_code = status
    for key, value in (headers or {}).items():
        response.headers[key] = value
    return response
 
 
def _safe_rollback():
    try:
        db.session.rollback()
    except Exception:  # a failed rollback (e.g. lost connection) must not break returning the error
        current_app.logger.exception("Rollback failed while handling an error")
 
 
def _internal_error(exc, message="An internal server error occurred!"):
    """Log everything (with traceback) and return only an error_id to the client, without leaking details."""
    _safe_rollback()
    error_id = uuid.uuid4().hex[:12]
    current_app.logger.error(
        "Unhandled error [error_id=%s] %s %s",
        error_id, request.method, request.path, exc_info=exc,
    )
    return error_response(500, message, "INTERNAL_SERVER_ERROR", error_id=error_id)
 
 
# Friendly messages instead of werkzeug's default descriptions (verbose, in technical English)
_HTTP_MESSAGES = {
    400: "Bad request!",
    401: "Authentication required!",
    403: "You do not have permission to perform this action!",
    404: "The requested resource was not found!",
    405: "Method not allowed for this endpoint!",
    408: "The request timed out!",
    413: "Request body is too large!",
    415: "Unsupported media type, send JSON with 'Content-Type: application/json'!",
    429: "Too many requests, please try again later!",
}
 
 
# --------------------------------------------------------------------------
# Register all handlers
# --------------------------------------------------------------------------
def register_error_handlers(app, jwt=None):
    # ---- Errors your own code raises on purpose ----
    @app.errorhandler(AppError)
    def handle_app_error(e):
        _safe_rollback()
        return error_response(e.status, e.message, e.code, details=e.details)
 
    @app.errorhandler(ValidationError)
    def handle_validation_error(e):
        return error_response(400, "Invalid input data!", "VALIDATION_ERROR", details=e.messages)
 
    # ---- HTTP errors: 404, 405, 413, 415, 429... (including Flask-Limiter rate limits) ----
    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        status = e.code or 500
        if status >= 500:
            return _internal_error(e, _HTTP_MESSAGES.get(status, "A server error occurred!"))
 
        headers = {}
        if status == 405 and getattr(e, "valid_methods", None):
            headers["Allow"] = ", ".join(e.valid_methods)
 
        extra = {}
        if status == 429:
            extra["limit"] = e.description  # vd "5 per 1 minute"
 
        return error_response(
            status,
            _HTTP_MESSAGES.get(status, e.description or "Request failed!"),
            headers=headers,
            **extra,
        )
 
    # ---- Database errors ----
    @app.errorhandler(IntegrityError)
    def handle_integrity_error(e):
        _safe_rollback()
        current_app.logger.warning(
            "Integrity error on %s %s: %s", request.method, request.path, getattr(e, "orig", e)
        )
        return error_response(
            409, "The data conflicts with existing records (duplicate or invalid reference)!", "CONFLICT"
        )
 
    @app.errorhandler(DataError)
    def handle_data_error(e):
        _safe_rollback()
        current_app.logger.warning(
            "Data error on %s %s: %s", request.method, request.path, getattr(e, "orig", e)
        )
        return error_response(400, "Invalid data: a value is too long or has the wrong format!", "INVALID_DATA")
 
    @app.errorhandler(OperationalError)
    def handle_operational_error(e):
        _safe_rollback()
        pgcode = getattr(getattr(e, "orig", None), "pgcode", None)
 
        # 40P01 = deadlock, 40001 = serialization failure: two transactions collided, retrying works
        if pgcode in ("40P01", "40001"):
            current_app.logger.warning("Transaction conflict (%s) on %s %s", pgcode, request.method, request.path)
            return error_response(
                409, "The system is busy, please try your request again!", "RETRY", headers={"Retry-After": "1"}
            )
 
        current_app.logger.error("Database unavailable on %s %s", request.method, request.path, exc_info=e)
        return error_response(
            503, "The database is temporarily unavailable, please try again later!",
            "SERVICE_UNAVAILABLE", headers={"Retry-After": "5"},
        )
 
    @app.errorhandler(SQLAlchemyError)
    def handle_sqlalchemy_error(e):  # all remaining SQLAlchemy errors
        return _internal_error(e)
 
    # ---- Last line of defense: any other unexpected error ----
    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        return _internal_error(e)
 
    # ---- JWT authentication errors (flask-jwt-extended) ----
    if jwt is not None:
        _register_jwt_handlers(jwt)
 
 
def _register_jwt_handlers(jwt):
    # By default flask-jwt-extended returns {"msg": "..."} and sometimes 422, which does not match the common format.
 
    @jwt.unauthorized_loader  # no token (or missing CSRF token when using cookies)
    def _missing_token(reason):
        return error_response(401, "Authentication required!", "UNAUTHORIZED")
 
    @jwt.invalid_token_loader  # token with bad signature / corrupted
    def _invalid_token(reason):
        return error_response(401, "Invalid authentication token!", "INVALID_TOKEN")
 
    @jwt.expired_token_loader
    def _expired_token(jwt_header, jwt_data):
        return error_response(401, "Your session has expired, please log in again!", "TOKEN_EXPIRED")
 
    @jwt.revoked_token_loader
    def _revoked_token(jwt_header, jwt_data):
        return error_response(401, "This session has been revoked, please log in again!", "TOKEN_REVOKED")
 
    @jwt.needs_fresh_token_loader
    def _needs_fresh(jwt_header, jwt_data):
        return error_response(401, "Please log in again to perform this action!", "FRESH_TOKEN_REQUIRED")
 
    @jwt.token_verification_failed_loader
    def _verification_failed(jwt_header, jwt_data):
        return error_response(401, "Authentication token is not valid!", "INVALID_TOKEN")
 
    @jwt.user_lookup_error_loader
    def _user_lookup_error(jwt_header, jwt_data):
        return error_response(401, "Account no longer exists, please log in again!", "UNAUTHORIZED")