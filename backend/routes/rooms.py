from decimal import Decimal, InvalidOperation
 
from flask import Blueprint, jsonify, request
from sqlalchemy import func
 
from errors import AppError
from extensions import db
from models import Room, RoomType
from utils.booking_rules import UNAVAILABLE_ROOM_STATUSES, booked_room_ids, parse_stay_dates
from utils.images import image_urls
from utils.pagination import pagination_json, parse_pagination
 
rooms_bp = Blueprint("rooms", __name__)
 

SORT_OPTIONS = {
    "price_asc": RoomType.price_per_night.asc(),
    "price_desc": RoomType.price_per_night.desc(),
    "capacity_asc": RoomType.max_guests.asc(),
    "capacity_desc": RoomType.max_guests.desc(),
}
 
 
def _parse_decimal(value):
    if value is None or value == "":
        return None
    try:
        result = Decimal(value)
    except InvalidOperation:
        raise ValueError
    if result < 0:
        raise ValueError
    return result
 
 
def _parse_guests(value):
    if value is None or value == "":
        return None
    result = int(value)  # ValueError is handled by the caller
    if result < 1:
        raise ValueError
    return result
 
 
@rooms_bp.route("/search", methods=["GET"])
def search_available_rooms():
    """
    Find room types with free rooms for the dates the guest picked.
 
    Query params:
        check_in       (required)  YYYY-MM-DD
        check_out      (required)  YYYY-MM-DD
        guests         (optional)  number of guests -> filters max_guests >= guests
        min_price      (optional)  minimum price per night
        max_price      (optional)  maximum price per night
        sort           (optional)  price_asc | price_desc | capacity_asc | capacity_desc
        page, per_page (optional)  pagination (default 1 / 10, max 50)
    """
    args = request.args
 
    # ---------- 1. Validate dates ----------
    check_in, check_out = parse_stay_dates(args.get("check_in"), args.get("check_out"))
    nights = (check_out - check_in).days
 
    # ---------- 2. Validate filters ----------
    try:
        guests = _parse_guests(args.get("guests"))
        min_price = _parse_decimal(args.get("min_price"))
        max_price = _parse_decimal(args.get("max_price"))
    except ValueError:
        raise AppError("Invalid filter value!")
    page, per_page = parse_pagination(default_per_page=10, max_per_page=50)
 
    if min_price is not None and max_price is not None and min_price > max_price:
        raise AppError("min_price cannot be greater than max_price!")
 
    sort_key = args.get("sort", "price_asc")
    if sort_key not in SORT_OPTIONS:
        raise AppError(f"sort must be one of: {', '.join(SORT_OPTIONS)}")
 
    # ---------- 3. Group free rooms (no overlapping bookings) by room type ----------
    query = (
        db.session.query(
            RoomType,
            func.count(Room.id).label("available_rooms"),
        )
        .join(Room, Room.room_type_id == RoomType.id)
        .filter(
            RoomType.is_active.is_(True),
            Room.status.notin_(UNAVAILABLE_ROOM_STATUSES),
            Room.id.notin_(booked_room_ids(check_in, check_out)),
        )
        .group_by(RoomType.id)
    )
 
    # ---------- 4. Filter by price, capacity ----------
    if guests is not None:
        query = query.filter(RoomType.max_guests >= guests)
    if min_price is not None:
        query = query.filter(RoomType.price_per_night >= min_price)
    if max_price is not None:
        query = query.filter(RoomType.price_per_night <= max_price)
 
    # ---------- 5. Sort + paginate ----------
    query = query.order_by(SORT_OPTIONS[sort_key], RoomType.id.asc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
 
    results = []
    for room_type, available_rooms in pagination.items:
        price = room_type.price_per_night
        results.append({
            "room_type_id": room_type.id,
            "name": room_type.name,
            "description": room_type.description,
            "images": image_urls(room_type.images),
            "max_guests": room_type.max_guests,
            "price_per_night": float(price),
            "total_price": float(price * nights),
            "available_rooms": available_rooms,
        })
 
    return jsonify({
        "success": True,
        "search": {
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "nights": nights,
        },
        "data": results,
        "pagination": pagination_json(pagination),
    }), 200
 
 
@rooms_bp.route("/<int:room_type_id>", methods=["GET"])
def get_room_type_detail(room_type_id):
    """
    Get the details of a room type.
 
    Query params (optional, must be sent together):
        check_in, check_out  YYYY-MM-DD
 
    If dates are given, the response includes an "availability" section: the total price for the stay
    and the list of specific free rooms (use these room_ids to call the booking API).
    """
    room_type = db.session.get(RoomType, room_type_id)
    if not room_type or not room_type.is_active:
        raise AppError("Room type not found!", 404)
 
    rentable_rooms = Room.query.filter(
        Room.room_type_id == room_type.id,
        Room.status.notin_(UNAVAILABLE_ROOM_STATUSES),
    )
 
    data = {
        "id": room_type.id,
        "name": room_type.name,
        "description": room_type.description,
        "price_per_night": float(room_type.price_per_night),
        "max_guests": room_type.max_guests,
        "images": image_urls(room_type.images),
        "total_rooms": rentable_rooms.count(),
        "created_at": room_type.created_at.isoformat() if room_type.created_at else None,
        "updated_at": room_type.updated_at.isoformat() if room_type.updated_at else None,
    }
 
    # ---------- Availability section (only when the guest sends dates) ----------
    raw_in, raw_out = request.args.get("check_in"), request.args.get("check_out")
    if raw_in or raw_out:
        check_in, check_out = parse_stay_dates(
            raw_in, raw_out, "check_in and check_out must be provided together (format YYYY-MM-DD)!"
        )
        nights = (check_out - check_in).days
 
        free_rooms = (
            rentable_rooms.filter(Room.id.notin_(booked_room_ids(check_in, check_out)))
            .order_by(Room.room_number)
            .all()
        )
 
        data["availability"] = {
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "nights": nights,
            "total_price": float(room_type.price_per_night * nights),
            "is_available": len(free_rooms) > 0,
            "available_rooms": [
                {"room_id": r.id, "room_number": r.room_number} for r in free_rooms
            ],
        }
 
    return jsonify({"success": True, "room_type": data}), 200