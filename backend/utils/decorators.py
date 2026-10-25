from functools import wraps

from flask_jwt_extended import get_jwt, jwt_required

from errors import AppError


def role_required(*roles):
    """Require login and one of the allowed roles, otherwise return 403."""
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            if get_jwt().get("role") not in roles:
                raise AppError("Permission denied!", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def is_admin():
    return get_jwt().get("role") == "admin"
