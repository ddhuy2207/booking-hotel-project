import secrets
import string
from decimal import Decimal
 
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
 
from errors import AppError
from extensions import db, limiter
from models import Booking, BookingItem, Room
from utils.booking_rules import (
    UNAVAILABLE_ROOM_STATUSES,
    active_overlap,
    booking_details,
    effective_status,
    new_payment_deadline,
    parse_stay_dates,
)
from utils.statuses import BookingStatus, PaymentStatus
from utils.timeutils import hotel_today
 
bookings_bp = Blueprint("bookings", __name__)
 

CANCELLABLE_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED]
MAX_ROOMS_PER_BOOKING = 10
 
 
# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _generate_booking_code():
    """Code in the form BK + 10 characters (12 in total; the column allows up to 15)."""
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        code = "BK" + "".join(secrets.choice(alphabet) for _ in range(10))
        if not Booking.query.filter_by(booking_code=code).first():
            return code
    raise AppError("Could not generate booking code, please try again!", 500)
 
 
def _serialize_booking(booking):
    nights = (booking.check_out_date - booking.check_in_date).days
    return {
        "id": booking.id,
        "booking_code": booking.booking_code,
        "status": effective_status(booking),
        "check_in_date": booking.check_in_date.isoformat(),
        "check_out_date": booking.check_out_date.isoformat(),
        "nights": nights,
        "total_price": float(booking.total_price),
        "payment_deadline": booking.payment_deadline.isoformat() if booking.payment_deadline else None,
        "created_at": booking.created_at.isoformat() if booking.created_at else None,
        "items": [
            {
                "room_id": item.room_id,
                "room_number": item.room.room_number,
                "room_type_id": item.room_type_id,
                "room_type_name": item.room_type.name,
                "price_per_night": float(item.price_at_booking),
                "subtotal": float(item.price_at_booking * nights),
            }
            for item in booking.items
        ],
    }
 
 
def _validate_payload(data):
    """Validate the input, return (check_in, check_out, room_ids, guests)."""
    if not data:
        raise AppError("Request body is required!")
 
    check_in, check_out = parse_stay_dates(data.get("check_in"), data.get("check_out"))
 
    room_ids = data.get("room_ids")
    if (
        not isinstance(room_ids, list)
        or not room_ids
        or not all(isinstance(r, int) and not isinstance(r, bool) for r in room_ids)
    ):
        raise AppError("room_ids must be a non-empty list of room ids!")
    if len(set(room_ids)) != len(room_ids):
        raise AppError("room_ids contains duplicates!")
    if len(room_ids) > MAX_ROOMS_PER_BOOKING:
        raise AppError(f"You can book at most {MAX_ROOMS_PER_BOOKING} rooms at once!")
 
    guests = data.get("guests")
    if guests is not None:
        if not isinstance(guests, int) or isinstance(guests, bool) or guests < 1:
            raise AppError("guests must be a positive integer!")
 
    return check_in, check_out, room_ids, guests
 
 
# --------------------------------------------------------------------------
# Create booking
# --------------------------------------------------------------------------
@bookings_bp.route("", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute")
def create_booking():
    """
    Body JSON:
    {
        "check_in": "2026-11-01",
        "check_out": "2026-11-04",
        "room_ids": [3, 7],       # the specific rooms the guest picked
        "guests": 4               # optional, used to check capacity
    }
    """
    check_in, check_out, room_ids, guests = _validate_payload(request.get_json(silent=True))
    user_id = int(get_jwt_identity())
    nights = (check_out - check_in).days
 
    # 1. LOCK the selected room rows (SELECT ... FOR UPDATE).
    #    Sort by id so two transactions never lock each other crosswise (deadlock).
    #    A second request selecting the same rooms waits here until
    #    the first one commits, and only then runs the overlap check below.
    rooms = (
        Room.query.filter(Room.id.in_(room_ids))
        .order_by(Room.id)
        .with_for_update()
        .all()
    )
 
    found_ids = {r.id for r in rooms}
    missing = [rid for rid in room_ids if rid not in found_ids]
    if missing:
        raise AppError(f"Rooms not found: {missing}", 404)
 
    for room in rooms:
        if room.status in UNAVAILABLE_ROOM_STATUSES:
            raise AppError(f"Room {room.room_number} is not available for booking!", 409)
        if not room.room_type.is_active:
            raise AppError(f"Room {room.room_number} is not available for booking!", 409)
 
    # 2. Check capacity (if the guest gave a number of guests)
    if guests is not None:
        capacity = sum(r.room_type.max_guests for r in rooms)
        if guests > capacity:
            raise AppError(
                f"Selected rooms hold at most {capacity} guests, but {guests} requested!"
            )
 
    # 3. Check for overlapping bookings (safe because the rooms were locked in step 1)
    conflicts = (
        db.session.query(Room.room_number)
        .join(BookingItem, BookingItem.room_id == Room.id)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .filter(
            Room.id.in_(room_ids),
            active_overlap(check_in, check_out),
        )
        .distinct()
        .all()
    )
    if conflicts:
        numbers = ", ".join(c.room_number for c in conflicts)
        raise AppError(f"Room(s) already booked for these dates: {numbers}", 409)
 
    # 4. Compute the price: freeze the price at booking time into price_at_booking
    total_price = Decimal("0")
    booking = Booking(
        user_id=user_id,
        check_in_date=check_in,
        check_out_date=check_out,
        total_price=Decimal("0"),
        status=BookingStatus.PENDING,
        booking_code=_generate_booking_code(),
        payment_deadline=new_payment_deadline(),
    )
    for room in rooms:
        price = room.room_type.price_per_night
        total_price += price * nights
        booking.items.append(
            BookingItem(
                room_id=room.id,
                room_type_id=room.room_type_id,
                price_at_booking=price,
            )
        )
    booking.total_price = total_price
 
    db.session.add(booking)
    db.session.commit()  # locks are released only after commit
 
    return jsonify({
        "success": True,
        "message": "Booking created successfully!",
        "booking": _serialize_booking(booking),
    }), 201
 
 
# --------------------------------------------------------------------------
# My bookings
# --------------------------------------------------------------------------
@bookings_bp.route("/my", methods=["GET"])
@jwt_required()
def my_bookings():
    user_id = int(get_jwt_identity())
    bookings = (
        Booking.query.filter_by(user_id=user_id)
        .options(*booking_details())
        .order_by(Booking.created_at.desc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [_serialize_booking(b) for b in bookings],
    }), 200
 
 
@bookings_bp.route("/<int:booking_id>", methods=["GET"])
@jwt_required()
def get_booking(booking_id):
    booking = db.session.get(Booking, booking_id, options=booking_details())
    claims = get_jwt()
 
    # Return 404 instead of 403 so as not to reveal whether the booking exists
    if not booking or (booking.user_id != int(get_jwt_identity()) and claims.get("role") != "admin"):
        raise AppError("Booking not found!", 404)
 
    return jsonify({"success": True, "booking": _serialize_booking(booking)}), 200
 
 
# --------------------------------------------------------------------------
# Cancel booking
# --------------------------------------------------------------------------
@bookings_bp.route("/<int:booking_id>/cancel", methods=["PUT"])
@jwt_required()
def cancel_booking(booking_id):
    booking = (
        Booking.query.filter_by(id=booking_id).with_for_update().first()
    )
    claims = get_jwt()
 
    if not booking or (booking.user_id != int(get_jwt_identity()) and claims.get("role") != "admin"):
        raise AppError("Booking not found!", 404)
 
    status = effective_status(booking)
    if status not in CANCELLABLE_STATUSES:
        raise AppError(f"Booking with status '{status}' cannot be cancelled!", 409)
 
    if booking.check_in_date <= hotel_today():
        raise AppError("Cannot cancel a booking on or after its check-in date!", 409)
 
    booking.status = BookingStatus.CANCELLED  # the rooms are freed automatically because search/booking ignore this status
    booking.payment_deadline = None
 
    # Cancel pending payments right away; payments already collected need an admin refund
    refund_required = False
    for payment in booking.payments:
        if payment.status == PaymentStatus.PENDING:
            payment.status = PaymentStatus.CANCELLED
        elif payment.status == PaymentStatus.SUCCESS:
            refund_required = True
 
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Booking cancelled successfully!",
        "refund_required": refund_required,
    }), 200