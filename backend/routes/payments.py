from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
 
from errors import AppError
from extensions import db, limiter
from models import Booking, Payment
from utils.booking_rules import effective_status, new_payment_deadline
from utils.statuses import BookingStatus, PaymentStatus
from utils.decorators import is_admin, role_required
 
payments_bp = Blueprint("payments", __name__)
 
ALLOWED_PAYMENT_METHODS = ["cash", "bank_transfer", "credit_card", "momo", "vnpay"]
 
# Payment lifecycle:
#   pending -> success -> refunded
#   pending -> failed
#   pending -> cancelled   (cancelled by the guest, or the booking was cancelled)
 
 
# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _serialize_payment(payment):
    return {
        "id": payment.id,
        "booking_id": payment.booking_id,
        "booking_code": payment.booking.booking_code,
        "amount": float(payment.amount),
        "payment_method": payment.payment_method,
        "status": payment.status,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
    }
 
 
def _lock_booking_and_payment(payment_id):
    """
    Lock the booking FIRST, then the payment. Always keep this order to
    avoid deadlocks with other requests (creating payments, cancelling bookings...).
    Returns (payment, booking) or (None, None) if it doesn't exist.
    """
    payment = db.session.get(Payment, payment_id)
    if not payment:
        return None, None
    booking = Booking.query.filter_by(id=payment.booking_id).with_for_update().first()
    payment = Payment.query.filter_by(id=payment_id).with_for_update().first()
    return payment, booking
 
 
# --------------------------------------------------------------------------
# Customer: create a payment for a booking
# --------------------------------------------------------------------------
@payments_bp.route("", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute")
def create_payment():
    """
    Body JSON:
    {
        "booking_id": 12,
        "payment_method": "momo"
    }
    The amount is NOT taken from the client; it always comes from booking.total_price.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data.get("booking_id"), int) or not data.get("payment_method"):
        raise AppError("booking_id and payment_method are required!")
 
    method = str(data["payment_method"]).strip().lower()
    if method not in ALLOWED_PAYMENT_METHODS:
        raise AppError(f"payment_method must be one of: {', '.join(ALLOWED_PAYMENT_METHODS)}")
 
    # Lock the booking so two concurrent payment requests cannot both create a payment
    booking = Booking.query.filter_by(id=data["booking_id"]).with_for_update().first()
 
    if not booking or (booking.user_id != int(get_jwt_identity()) and not is_admin()):
        raise AppError("Booking not found!", 404)
 
    # The booking is locked above, so checking the deadline here is reliable; no need to wait for the periodic job
    status = effective_status(booking)
    if status != BookingStatus.PENDING:
        raise AppError(f"Booking with status '{status}' cannot be paid!", 409)
 
    active = [p for p in booking.payments if p.status in PaymentStatus.ACTIVE]
    if active:
        raise AppError("This booking already has a pending or successful payment!", 409)
 
    payment = Payment(
        booking_id=booking.id,
        amount=booking.total_price,
        payment_method=method,
        status=PaymentStatus.PENDING,
    )
    db.session.add(payment)
    booking.payment_deadline = None  # a payment request is awaiting admin confirmation: no longer expires automatically
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Payment created, waiting for confirmation!",
        "payment": _serialize_payment(payment),
    }), 201
 
 
# --------------------------------------------------------------------------
# Customer: view / cancel a pending payment
# --------------------------------------------------------------------------
@payments_bp.route("/booking/<int:booking_id>", methods=["GET"])
@jwt_required()
def get_booking_payments(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking or (booking.user_id != int(get_jwt_identity()) and not is_admin()):
        raise AppError("Booking not found!", 404)
 
    payments = sorted(booking.payments, key=lambda p: p.created_at or 0, reverse=True)
    return jsonify({
        "success": True,
        "data": [_serialize_payment(p) for p in payments],
    }), 200
 
 
@payments_bp.route("/<int:payment_id>/cancel", methods=["PUT"])
@jwt_required()
def cancel_payment(payment_id):
    """The guest cancels a pending payment (e.g. to switch to another method)."""
    payment, booking = _lock_booking_and_payment(payment_id)
 
    if not payment or (booking.user_id != int(get_jwt_identity()) and not is_admin()):
        raise AppError("Payment not found!", 404)
 
    if payment.status != PaymentStatus.PENDING:
        raise AppError(f"Payment with status '{payment.status}' cannot be cancelled!", 409)
 
    payment.status = PaymentStatus.CANCELLED
    if booking.status == BookingStatus.PENDING:
        booking.payment_deadline = new_payment_deadline()  # the guest gets more time to choose another method
    db.session.commit()
    return jsonify({"success": True, "message": "Payment cancelled successfully!"}), 200
 
 
# --------------------------------------------------------------------------
# Admin: confirm / reject / refund
# (with a real payment gateway, confirmation would be called by the gateway's webhook,
#  after you have verified the callback's signature)
# --------------------------------------------------------------------------
@payments_bp.route("/<int:payment_id>/confirm", methods=["PUT"])
@role_required("admin")
def confirm_payment(payment_id):
    payment, booking = _lock_booking_and_payment(payment_id)
    if not payment:
        raise AppError("Payment not found!", 404)
 
    if payment.status != PaymentStatus.PENDING:
        raise AppError(f"Payment with status '{payment.status}' cannot be confirmed!", 409)
 
    if booking.status != BookingStatus.PENDING:
        raise AppError(f"Booking is '{booking.status}', it can no longer be confirmed!", 409)
 
    payment.status = PaymentStatus.SUCCESS
    booking.status = BookingStatus.CONFIRMED
    booking.payment_deadline = None
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Payment confirmed, booking is now confirmed!",
        "payment": _serialize_payment(payment),
    }), 200
 
 
@payments_bp.route("/<int:payment_id>/fail", methods=["PUT"])
@role_required("admin")
def fail_payment(payment_id):
    payment, booking = _lock_booking_and_payment(payment_id)
    if not payment:
        raise AppError("Payment not found!", 404)
 
    if payment.status != PaymentStatus.PENDING:
        raise AppError(f"Payment with status '{payment.status}' cannot be marked as failed!", 409)
 
    payment.status = PaymentStatus.FAILED
    if booking.status == BookingStatus.PENDING:
        booking.payment_deadline = new_payment_deadline()  # restart the clock so the guest can pay again
    db.session.commit()
    return jsonify({"success": True, "message": "Payment marked as failed!"}), 200
 
 
@payments_bp.route("/<int:payment_id>/refund", methods=["PUT"])
@role_required("admin")
def refund_payment(payment_id):
    payment, booking = _lock_booking_and_payment(payment_id)
    if not payment:
        raise AppError("Payment not found!", 404)
 
    if payment.status != PaymentStatus.SUCCESS:
        raise AppError(f"Only successful payments can be refunded (current: '{payment.status}')!", 409)
 
    if booking.status in (BookingStatus.CHECKED_IN, BookingStatus.COMPLETED):
        raise AppError("Cannot refund a booking that has already been checked in or completed!", 409)
 
    payment.status = PaymentStatus.REFUNDED
    booking.status = BookingStatus.CANCELLED  # free the rooms
    booking.payment_deadline = None
    db.session.commit()
 
    return jsonify({
        "success": True,
        "message": "Payment refunded and booking cancelled!",
        "payment": _serialize_payment(payment),
    }), 200