from argon2.exceptions import VerifyMismatchError
from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    set_access_cookies,
    get_jwt_identity,
    jwt_required,
    unset_jwt_cookies,
)
from sqlalchemy.exc import IntegrityError
 
from errors import AppError
from extensions import db, limiter, ph
from models import User
from utils.validators import (
    ValidationError,
    check_password,
    clean_email,
    clean_full_name,
    clean_phone,
)
 
auth_bp = Blueprint("auth", __name__)
 
# Publicly registered accounts are ALWAYS customers. Admin/staff accounts are only created with
# the `flask create-admin` command (see cli.py); never accept a role from the client.
DEFAULT_ROLE = "customer"
 
 
def _validation_failed(errors):
    return AppError("Invalid input data!", code="VALIDATION_ERROR", details=errors)
 
 
def _clean(errors, field, func, *args):
    """Run a cleaning function; on error, collect it into the errors dict instead of stopping right away."""
    try:
        return func(*args)
    except ValidationError as e:
        errors[field] = e.messages
        return None
 
 
@auth_bp.route("/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise AppError("Request body must be a JSON object!")
 
    missing = [f for f in ("email", "password", "confirm_password", "full_name") if not data.get(f)]
    if missing:
        raise AppError(f"{', '.join(missing)} is required!")
 
    errors = {}
    email = _clean(errors, "email", clean_email, data["email"])
    full_name = _clean(errors, "full_name", clean_full_name, data["full_name"])
    phone = _clean(errors, "phone", clean_phone, data.get("phone"))
 
    password = data["password"]
    password_problems = check_password(password, email, full_name)
    if password_problems:
        errors["password"] = password_problems
    elif password != data["confirm_password"]:
        errors["confirm_password"] = ["Password do not match!"]
 
    if errors:
        raise _validation_failed(errors)
 
    if User.query.filter_by(email=email).first():
        raise AppError("Email already registered!", 409)
 
    new_user = User(
        email=email,
        hashed_password=ph.hash(password),
        full_name=full_name,
        role=DEFAULT_ROLE,   # ignore any "role" sent by the client
        phone=phone,
    )
    db.session.add(new_user)
    try:
        db.session.commit()
    except IntegrityError:
        # Two sign-up requests with the same email running in parallel: the DB unique constraint blocks the later one
        raise AppError("Email already registered!", 409)

    return jsonify({
        "success": True,
        "message": "Registered successfully!",
        "user": {"id": new_user.id, "email": new_user.email, "full_name": new_user.full_name},
    }), 201
 
 
@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    data = request.get_json(silent=True)
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("email"), str)
        or not isinstance(data.get("password"), str)
    ):
        raise AppError("Email and password are required!")
 
    user = User.query.filter_by(email=data["email"].strip().lower()).first()
 
    if not user or not user.is_active:
        raise AppError("Email or password is not correct!", 401, code="INVALID_CREDENTIALS")
    try:
        ph.verify(user.hashed_password, data["password"])
    except VerifyMismatchError:
        raise AppError("Email or password is not correct!", 401, code="INVALID_CREDENTIALS")
 
    token = create_access_token(
        identity=str(user.id),
        additional_claims={"email": user.email, "role": user.role}
    )
    response = jsonify({
        "success": True,
        "message": "Login successfully!",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name
        }
    })
 
    set_access_cookies(response, token)

    return response, 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    response = jsonify({"success": True, "message": "Logged out successfully!"})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
 
    if not user or not user.is_active:
        raise AppError("Not found user!", 404)
 
    return jsonify({
        "success": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "role": user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        }}), 200
 
 
@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
@limiter.limit("10 per minute")
def update_profile():
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
 
    if not user or not user.is_active:
        raise AppError("Not found user!", 404)
 
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not ({"full_name", "phone", "password"} & data.keys()):
        raise AppError("Required profile fields are missing.")
 
    errors = {}
    new_full_name = None
    if "full_name" in data:
        new_full_name = _clean(errors, "full_name", clean_full_name, data["full_name"])
 
    new_phone, phone_given = None, "phone" in data
    if phone_given:
        new_phone = _clean(errors, "phone", clean_phone, data["phone"])
 
    new_password = None
    if "password" in data:
        new_password = data["password"]
 
        # Changing the password requires re-entering the current one: if the login cookie leaks,
        # an attacker still cannot fully take over the account.
        current = data.get("current_password")
        if not isinstance(current, str) or not current:
            errors["current_password"] = ["current_password is required to change password!"]
        else:
            try:
                ph.verify(user.hashed_password, current)
            except VerifyMismatchError:
                errors["current_password"] = ["Current password is incorrect!"]
 
        problems = check_password(new_password, user.email, new_full_name or user.full_name)
        if problems:
            errors["password"] = problems
 
    if errors:
        raise _validation_failed(errors)
 
    if new_full_name is not None:
        user.full_name = new_full_name
    if phone_given:
        user.phone = new_phone       # None means remove the phone number
    if new_password is not None:
        user.hashed_password = ph.hash(new_password)
 
    db.session.commit()
    return jsonify({"success": True, "message": "Profile updated successfully!"}), 200
 
 
@auth_bp.route("/profile", methods=["DELETE"])
@jwt_required()
def soft_delete_account():
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
 
    if not user or not user.is_active:
        raise AppError("Not found user!", 404)
 
    user.is_active = False
    db.session.commit()
 
    return jsonify({"success": True, "message": "Account has been successfully deactivated!"}), 200