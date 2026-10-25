"""
Statuses stored in the DB. Use these constants instead of typing strings by hand ("pending", "occupied"...).
Values must match the frontend (src/utils/booking.js) and the existing data in the DB.
"""


class BookingStatus:
    # pending -> confirmed -> checked_in -> completed; or cancelled / expired
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    ALL = [PENDING, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, EXPIRED]


class PaymentStatus:
    # pending -> success -> refunded; pending -> failed / cancelled
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    # Awaiting confirmation or already paid: no new payment may be created for the booking
    ACTIVE = [PENDING, SUCCESS]


class RoomStatus:
    AVAILABLE = "available"
    OCCUPIED = "occupied"        # only set automatically on check-in
    MAINTENANCE = "maintenance"
    ALL = [AVAILABLE, OCCUPIED, MAINTENANCE]
    MANUAL = [AVAILABLE, MAINTENANCE]  # admins may set these manually
