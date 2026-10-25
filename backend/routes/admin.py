import os
import re
import uuid
from datetime import timedelta
from decimal import Decimal, InvalidOperation
 
from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename
 
from errors import AppError
from extensions import db
from models import Booking, BookingItem, Room, RoomType, User
from routes.bookings import _serialize_booking
from utils.booking_rules import LIVE_BOOKING_EXCLUDED, booking_details, parse_date, status_filter
from utils.decorators import role_required
from utils.images import (
    ALLOWED_IMAGE_EXTENSIONS,
    MAX_IMAGE_SIZE,
    delete_image_file,
    file_size,
    image_filename,
    image_urls,
    upload_folder,
)
from utils.pagination import pagination_json, parse_pagination
from utils.statuses import BookingStatus, PaymentStatus, RoomStatus
from utils.timeutils import hotel_today

admin_bp = Blueprint("admin", __name__)

MAX_IMAGES_PER_ROOM_TYPE = 20
 
 
# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _serialize_room_type(rt, total_rooms=None):
    return {
        "id": rt.id,
        "name": rt.name,
        "description": rt.description,
        "price_per_night": float(rt.price_per_night),
        "max_guests": rt.max_guests,
        "images": image_urls(rt.images),
        "is_active": rt.is_active,
        "total_rooms": len(rt.rooms) if total_rooms is None else total_rooms,
        "created_at": rt.created_at.isoformat() if rt.created_at else None,
        "updated_at": rt.updated_at.isoformat() if rt.updated_at else None,
    }
 
 
def _serialize_room(room):
    return {
        "id": room.id,
        "room_number": room.room_number,
        "status": room.status,
        "room_type": {"id": room.room_type.id, "name": room.room_type.name},
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "updated_at": room.updated_at.isoformat() if room.updated_at else None,
    }
 
 
def _parse_room_type_fields(data, creating):
    """Validate and clean room type data. Raises AppError if invalid."""
    if creating:
        for field in ("name", "price_per_night", "max_guests"):
            if data.get(field) in (None, ""):
                raise AppError(f"{field} is required!")
 
    clean = {}
 
    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            raise AppError("name must be a non-empty string up to 100 characters!")
        clean["name"] = name.strip()
 
    if "description" in data:
        desc = data["description"]
        if desc is not None and not isinstance(desc, str):
            raise AppError("description must be a string!")
        clean["description"] = desc.strip() if desc else None
 
    if "price_per_night" in data:
        raw = data["price_per_night"]
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
            raise AppError("price_per_night must be a number!")
        try:
            price = Decimal(str(raw))
            if not price.is_finite():
                raise InvalidOperation
            price = price.quantize(Decimal("0.01"))
        except InvalidOperation:
            raise AppError("price_per_night must be a valid number!")
        # A Numeric(10, 2) column holds at most 99,999,999.99
        if price <= 0 or price >= Decimal("100000000"):
            raise AppError("price_per_night must be greater than 0 and below 100,000,000!")
        clean["price_per_night"] = price
 
    if "max_guests" in data:
        guests = data["max_guests"]
        if isinstance(guests, bool) or not isinstance(guests, int) or not 1 <= guests <= 50:
            raise AppError("max_guests must be an integer between 1 and 50!")
        clean["max_guests"] = guests
 
    if "images" in data:
        images = data["images"]
        if images is None:
            images = []
        if (
            not isinstance(images, list)
            or len(images) > 20
            or not all(isinstance(i, str) and i.strip() and len(i) <= 2048 for i in images)
        ):
            raise AppError("images must be a list of up to 20 non-empty strings!")
        clean["images"] = [i.strip() for i in images]
 
    if "is_active" in data and not creating:
        if not isinstance(data["is_active"], bool):
            raise AppError("is_active must be true or false!")
        clean["is_active"] = data["is_active"]
 
    return clean
 
 
def _upcoming_booking_codes(room_id):
    """Codes of active bookings (current or upcoming) holding this room."""
    rows = (
        db.session.query(Booking.booking_code)
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .filter(
            BookingItem.room_id == room_id,
            Booking.status.notin_(LIVE_BOOKING_EXCLUDED),
            Booking.check_out_date > hotel_today(),
        )
        .distinct()
        .order_by(Booking.booking_code)
        .all()
    )
    return [r.booking_code for r in rows]
 
 
# ==========================================================================
# ROOM TYPE MANAGEMENT (admin only)
# ==========================================================================
@admin_bp.route("/room-types", methods=["GET"])
@role_required("admin")
def list_room_types():
    """List all room types, including soft-deleted ones. Filter: ?is_active=true|false"""
    page, per_page = parse_pagination()
 
    query = (
        db.session.query(RoomType, func.count(Room.id))
        .outerjoin(Room, Room.room_type_id == RoomType.id)
        .group_by(RoomType.id)
    )
 
    is_active = request.args.get("is_active")
    if is_active is not None:
        if is_active.lower() not in ("true", "false"):
            raise AppError("is_active must be true or false!")
        query = query.filter(RoomType.is_active.is_(is_active.lower() == "true"))
 
    pagination = query.order_by(RoomType.id).paginate(page=page, per_page=per_page, error_out=False)
 
    return jsonify({
        "success": True,
        "data": [_serialize_room_type(rt, total) for rt, total in pagination.items],
        "pagination": pagination_json(pagination),
    }), 200
 
 
@admin_bp.route("/room-types", methods=["POST"])
@role_required("admin")
def create_room_type():
    """
    Body JSON:
    {
        "name": "Deluxe Ocean View",
        "description": "...",
        "price_per_night": 1500000,
        "max_guests": 3,
        "images": ["https://..."]
    }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise AppError("Request body is required!")
 
    clean = _parse_room_type_fields(data, creating=True)
    room_type = RoomType(**clean)
    db.session.add(room_type)
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Room type created successfully!",
        "room_type": _serialize_room_type(room_type, total_rooms=0),
    }), 201
 
 
@admin_bp.route("/room-types/<int:room_type_id>", methods=["PUT"])
@role_required("admin")
def update_room_type(room_type_id):
    """
    Partial update: send only the fields to change. Send is_active=true to restore.
    A price change only affects NEW bookings; existing bookings keep their price_at_booking.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        raise AppError("Request body is required!")
 
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        raise AppError("Room type not found!", 404)
 
    clean = _parse_room_type_fields(data, creating=False)
    if not clean:
        raise AppError("No valid fields to update!")
 
    for field, value in clean.items():
        setattr(room_type, field, value)
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Room type updated successfully!",
        "room_type": _serialize_room_type(room_type),
    }), 200
 
 
@admin_bp.route("/room-types/<int:room_type_id>", methods=["DELETE"])
@role_required("admin")
def soft_delete_room_type(room_type_id):
    """
    Soft delete: is_active=False. The room type disappears from search and cannot be booked anymore,
    but existing bookings remain valid.
    """
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        raise AppError("Room type not found!", 404)
    if not room_type.is_active:
        raise AppError("Room type is already deactivated!", 409)
 
    live_bookings = (
        db.session.query(func.count(func.distinct(Booking.id)))
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .filter(
            BookingItem.room_type_id == room_type.id,
            Booking.status.notin_(LIVE_BOOKING_EXCLUDED),
            Booking.check_out_date > hotel_today(),
        )
        .scalar()
    )
 
    room_type.is_active = False
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Room type has been deactivated!",
        "existing_bookings_still_valid": live_bookings,
    }), 200
 
 
# ==========================================================================
# ROOM MANAGEMENT (admin only)
# ==========================================================================
@admin_bp.route("/rooms", methods=["GET"])
@role_required("admin", "staff")
def list_rooms():
    """Filter: ?room_type_id=&status=available|occupied|maintenance"""
    page, per_page = parse_pagination()
    query = Room.query.options(selectinload(Room.room_type))  # _serialize_room needs the room type name
 
    if request.args.get("room_type_id"):
        try:
            query = query.filter(Room.room_type_id == int(request.args["room_type_id"]))
        except ValueError:
            raise AppError("room_type_id must be an integer!")
 
    status = request.args.get("status")
    if status:
        if status not in RoomStatus.ALL:
            raise AppError("status must be one of: available, occupied, maintenance")
        query = query.filter(Room.status == status)
 
    pagination = query.order_by(Room.room_number).paginate(page=page, per_page=per_page, error_out=False)
 
    return jsonify({
        "success": True,
        "data": [_serialize_room(r) for r in pagination.items],
        "pagination": pagination_json(pagination),
    }), 200
 
 
ROOM_NUMBER_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-]{0,19}")
 
 
@admin_bp.route("/rooms", methods=["POST"])
@role_required("admin")
def create_room():
    """
    Add a new room.
    Body JSON:
    {
        "room_number": "301",
        "room_type_id": 5,
        "status": "available"      # optional: available (default) | maintenance
    }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise AppError("Request body is required!")
 
    room_number = data.get("room_number")
    if not isinstance(room_number, str) or not ROOM_NUMBER_RE.fullmatch(room_number.strip()):
        raise AppError("room_number must be 1-20 characters: letters, digits and hyphens only!")
    room_number = room_number.strip().upper()
 
    type_id = data.get("room_type_id")
    if isinstance(type_id, bool) or not isinstance(type_id, int):
        raise AppError("room_type_id must be an integer!")
    room_type = db.session.get(RoomType, type_id)
    if not room_type:
        raise AppError("Room type not found!", 404)
    if not room_type.is_active:
        raise AppError("Cannot add a room to a deactivated room type!", 409)
 
    status = data.get("status", RoomStatus.AVAILABLE)
    if status not in RoomStatus.MANUAL:
        raise AppError("status must be 'available' or 'maintenance'!")
 
    if Room.query.filter_by(room_number=room_number).first():
        raise AppError(f"Room number {room_number} already exists!", 409)
 
    room = Room(room_number=room_number, room_type_id=room_type.id, status=status)
    db.session.add(room)
    try:
        db.session.commit()
    except IntegrityError:
        # Two admins adding the same room number at once: the DB unique constraint blocks the later one
        db.session.rollback()
        raise AppError(f"Room number {room_number} already exists!", 409)
 
    return jsonify({
        "success": True,
        "message": "Room created successfully!",
        "room": _serialize_room(room),
    }), 201
 
 
@admin_bp.route("/rooms/<int:room_id>", methods=["PUT"])
@role_required("admin")
def update_room(room_id):
    """
    JSON body (only the fields sent are changed):
    {
        "status": "maintenance",     # available | maintenance
        "room_type_id": 4
    }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not ({"status", "room_type_id"} & data.keys()):
        raise AppError("Provide status and/or room_type_id!")
 
    # Lock the room: bookings also lock rooms when created, so the two operations cannot interleave
    room = Room.query.filter_by(id=room_id).with_for_update().first()
    if not room:
        raise AppError("Room not found!", 404)
 
    if room.status == RoomStatus.OCCUPIED:
        raise AppError("Room is occupied. Check out the guest before changing this room!", 409)
 
    new_status = data.get("status", room.status)
    if new_status not in RoomStatus.MANUAL:
        raise AppError(
            "status must be 'available' or 'maintenance' ('occupied' is set automatically by check-in)!"
        )
 
    new_type_id = room.room_type_id
    if "room_type_id" in data:
        raw = data["room_type_id"]
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise AppError("room_type_id must be an integer!")
        new_type = db.session.get(RoomType, raw)
        if not new_type:
            raise AppError("Room type not found!", 404)
        if not new_type.is_active:
            raise AppError("Cannot move a room to a deactivated room type!", 409)
        new_type_id = new_type.id
 
    type_changed = new_type_id != room.room_type_id
    going_to_maintenance = new_status == RoomStatus.MAINTENANCE and room.status != RoomStatus.MAINTENANCE
 
    # Don't change the type / put under maintenance while guests still have bookings for this room
    if type_changed or going_to_maintenance:
        codes = _upcoming_booking_codes(room.id)
        if codes:
            raise AppError(
                "Room has upcoming or ongoing bookings: "
                f"{', '.join(codes)}. Cancel or reassign them first!",
                409,
            )
 
    room.status = new_status
    room.room_type_id = new_type_id
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Room updated successfully!",
        "room": _serialize_room(room),
    }), 200
 
 
# ==========================================================================
# CHECK-IN / CHECK-OUT (admin and front desk staff)
# ==========================================================================
def _serialize_customer(user):
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "phone": user.phone}


@admin_bp.route("/bookings", methods=["GET"])
@role_required("admin", "staff")
def list_bookings():
    """
    Booking list for the front desk, latest check-in date first.
    Filters (optional):
        check_in   YYYY-MM-DD   exact check-in date
        status     one of BookingStatus.ALL
        q          part of the booking code, or the guest's name, email or phone (case-insensitive)
        page, per_page
    """
    page, per_page = parse_pagination()
    query = Booking.query.join(User, User.id == Booking.user_id)

    raw_check_in = request.args.get("check_in")
    if raw_check_in:
        check_in = parse_date(raw_check_in)
        if not check_in:
            raise AppError("check_in must be a date in format YYYY-MM-DD!")
        query = query.filter(Booking.check_in_date == check_in)

    status = request.args.get("status")
    if status:
        if status not in BookingStatus.ALL:
            raise AppError(f"status must be one of: {', '.join(BookingStatus.ALL)}")
        query = query.filter(status_filter(status))

    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(or_(
            Booking.booking_code.icontains(q, autoescape=True),
            User.full_name.icontains(q, autoescape=True),
            User.email.icontains(q, autoescape=True),
            User.phone.icontains(q, autoescape=True),
        ))

    pagination = (
        query.options(*booking_details(customer=True))
        .order_by(Booking.check_in_date.desc(), Booking.created_at.desc(), Booking.id.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    return jsonify({
        "success": True,
        "data": [
            {**_serialize_booking(b), "customer": _serialize_customer(b.user)}
            for b in pagination.items
        ],
        "pagination": pagination_json(pagination),
    }), 200


@admin_bp.route("/bookings/lookup", methods=["GET"])
@role_required("admin", "staff")
def lookup_booking():
    """Front desk looks up a booking by the code the guest provides: GET /api/admin/bookings/lookup?code=BKXXXXXXXXXX"""
    code = request.args.get("code", "").strip().upper()
    if not code:
        raise AppError("code is required!")
 
    booking = (
        Booking.query.filter_by(booking_code=code)
        .options(*booking_details(customer=True, payments=True))
        .first()
    )
    if not booking:
        raise AppError("Booking not found!", 404)

    result = _serialize_booking(booking)
    result["customer"] = _serialize_customer(booking.user)
    result["paid"] = any(p.status == PaymentStatus.SUCCESS for p in booking.payments)
    return jsonify({"success": True, "booking": result}), 200
 
 
@admin_bp.route("/bookings/<int:booking_id>/check-in", methods=["PUT"])
@role_required("admin", "staff")
def check_in_booking(booking_id):
    # Lock the booking first, then its rooms (in ascending id order)
    booking = Booking.query.filter_by(id=booking_id).with_for_update().first()
    if not booking:
        raise AppError("Booking not found!", 404)
 
    if booking.status != BookingStatus.CONFIRMED:
        messages = {
            BookingStatus.PENDING: "Booking has not been paid/confirmed yet!",
            BookingStatus.CHECKED_IN: "Booking is already checked in!",
        }
        raise AppError(
            messages.get(booking.status, f"Booking with status '{booking.status}' cannot be checked in!"),
            409,
        )
 
    today = hotel_today()
    if today < booking.check_in_date:
        raise AppError(f"Too early: check-in date is {booking.check_in_date.isoformat()}!", 409)
    if today >= booking.check_out_date:
        raise AppError("The stay period of this booking has already ended!", 409)
 
    room_ids = sorted(item.room_id for item in booking.items)
    rooms = Room.query.filter(Room.id.in_(room_ids)).order_by(Room.id).with_for_update().all()
 
    not_ready = [f"{r.room_number} ({r.status})" for r in rooms if r.status != RoomStatus.AVAILABLE]
    if not_ready:
        raise AppError(f"Room(s) not ready for check-in: {', '.join(not_ready)}", 409)
 
    for room in rooms:
        room.status = RoomStatus.OCCUPIED
    booking.status = BookingStatus.CHECKED_IN
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Checked in successfully!",
        "booking": _serialize_booking(booking),
    }), 200
 
 
@admin_bp.route("/bookings/<int:booking_id>/check-out", methods=["PUT"])
@role_required("admin", "staff")
def check_out_booking(booking_id):
    booking = Booking.query.filter_by(id=booking_id).with_for_update().first()
    if not booking:
        raise AppError("Booking not found!", 404)
 
    if booking.status != BookingStatus.CHECKED_IN:
        raise AppError(
            f"Only checked-in bookings can be checked out (current: '{booking.status}')!", 409
        )
 
    room_ids = sorted(item.room_id for item in booking.items)
    rooms = Room.query.filter(Room.id.in_(room_ids)).order_by(Room.id).with_for_update().all()
    for room in rooms:
        if room.status == RoomStatus.OCCUPIED:
            room.status = RoomStatus.AVAILABLE
 
    # Early check-out: shorten check_out_date so the remaining nights can be sold again.
    # total_price stays the same (no automatic refund). Always keep at least 1 night.
    today = hotel_today()
    new_check_out = max(today, booking.check_in_date + timedelta(days=1))
    checked_out_early = new_check_out < booking.check_out_date
    if checked_out_early:
        booking.check_out_date = new_check_out
 
    booking.status = BookingStatus.COMPLETED
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Checked out successfully!",
        "checked_out_early": checked_out_early,
        "booking": _serialize_booking(booking),
    }), 200


# ==========================================================================
# ROOM TYPE IMAGES (admin only)
# The DB stores only file names; responses always return URLs via image_urls() (see utils/images.py)
# ==========================================================================
def _image_extension(filename):
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


@admin_bp.route("/room-types/<int:room_type_id>/images", methods=["POST"])
@role_required("admin")
def upload_room_type_images(room_type_id):
    """multipart/form-data, field "images" (multiple files). Returns the full image list after adding."""
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        raise AppError("Room type not found!", 404)

    files = [f for f in request.files.getlist("images") if f and f.filename]
    if not files:
        raise AppError("No image files provided (field name: images)!")

    bad = [f.filename for f in files if _image_extension(f.filename) not in ALLOWED_IMAGE_EXTENSIONS]
    if bad:
        raise AppError(f"Unsupported file type: {', '.join(bad)} (allowed: png, jpg, jpeg, webp)!")

    too_big = [f.filename for f in files if file_size(f) > MAX_IMAGE_SIZE]
    if too_big:
        raise AppError(f"Images larger than {MAX_IMAGE_SIZE // (1024 * 1024)}MB: {', '.join(too_big)}!", 413)

    current_images = list(room_type.images or [])
    if len(current_images) + len(files) > MAX_IMAGES_PER_ROOM_TYPE:
        raise AppError(f"A room type can have at most {MAX_IMAGES_PER_ROOM_TYPE} images!")

    folder = upload_folder()
    os.makedirs(folder, exist_ok=True)

    new_names = []
    for file in files:
        safe_name = secure_filename(file.filename)
        if not safe_name or "." not in safe_name:
            safe_name = f"image.{_image_extension(file.filename)}"
        name = f"{uuid.uuid4()}_{safe_name}"
        file.save(os.path.join(folder, name))
        new_names.append(name)

    room_type.images = current_images + new_names
    try:
        db.session.commit()
    except Exception:
        for name in new_names:
            delete_image_file(name)
        raise

    return jsonify({
        "success": True,
        "message": "Images uploaded successfully!",
        "room_type_id": room_type.id,
        "images": image_urls(room_type.images),
    }), 200


@admin_bp.route("/room-types/<int:room_type_id>/images", methods=["DELETE"])
@role_required("admin")
def delete_room_type_images(room_type_id):
    """JSON body: { "image_urls": [...] } — accepts URLs returned by the API or file names."""
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type:
        raise AppError("Room type not found!", 404)

    data = request.get_json(silent=True)
    requested = data.get("image_urls") if isinstance(data, dict) else None
    if not isinstance(requested, list) or not requested:
        raise AppError("image_urls must be a non-empty list!")

    to_delete = {image_filename(value) for value in requested} - {""}
    current_images = list(room_type.images or [])

    # Only delete images that really belong to this room type; any other value is ignored
    removed = [img for img in current_images if image_filename(img) in to_delete]
    if not removed:
        raise AppError("None of the given images belong to this room type!", 404)

    room_type.images = [img for img in current_images if img not in removed]
    db.session.commit()

    # Delete files after commit: if the commit fails, the DB still points to intact files
    for img in removed:
        delete_image_file(img)

    return jsonify({
        "success": True,
        "message": "Images deleted successfully!",
        "room_type_id": room_type.id,
        "images": image_urls(room_type.images),
    }), 200
