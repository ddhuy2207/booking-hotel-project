from datetime import datetime, timedelta

from sqlalchemy import and_, func, not_, or_
from sqlalchemy.orm import selectinload

from errors import AppError
from extensions import db
from models import Booking, BookingItem
from utils.statuses import BookingStatus, RoomStatus
from utils.timeutils import hotel_today, utcnow

# Bookings in these statuses no longer hold rooms
INACTIVE_BOOKING_STATUSES = [BookingStatus.CANCELLED, BookingStatus.EXPIRED]
# Active bookings (current or upcoming): also excludes "completed"
LIVE_BOOKING_EXCLUDED = INACTIVE_BOOKING_STATUSES + [BookingStatus.COMPLETED]
# Rooms in these statuses cannot be rented
UNAVAILABLE_ROOM_STATUSES = [RoomStatus.MAINTENANCE]

# A "pending" booking with no payment request holds its rooms only for this long.
# Booking.payment_deadline = when it expires; NULL while a payment awaits admin confirmation (never expires automatically).
PAYMENT_HOLD = timedelta(hours=5)


def booking_details(customer=False, payments=False):
    options = [
        selectinload(Booking.items).selectinload(BookingItem.room),
        selectinload(Booking.items).selectinload(BookingItem.room_type),
    ]
    if customer:
        options.append(selectinload(Booking.user))
    if payments:
        options.append(selectinload(Booking.payments))
    return options


def new_payment_deadline():
    return utcnow() + PAYMENT_HOLD


def is_past_deadline():
    """SQL condition: pending bookings past their payment deadline (even if the periodic job hasn't marked them "expired" yet)."""
    return and_(
        Booking.status == BookingStatus.PENDING,
        Booking.payment_deadline.isnot(None),
        Booking.payment_deadline <= func.now(),
    )


def effective_status(booking):
    """The real status of a booking: pending past its payment deadline counts as "expired" immediately, without waiting for the periodic job."""
    if booking.status == BookingStatus.PENDING and booking.payment_deadline and booking.payment_deadline <= utcnow():
        return BookingStatus.EXPIRED
    return booking.status


def status_filter(status):
    """SQL condition filtering by the real status (matches effective_status)."""
    if status == BookingStatus.PENDING:
        return and_(Booking.status == BookingStatus.PENDING, not_(is_past_deadline()))
    if status == BookingStatus.EXPIRED:
        return or_(Booking.status == BookingStatus.EXPIRED, is_past_deadline())
    return Booking.status == status


def expire_stale_bookings(batch_size=500):
    total = 0
    while True:
        ids = [
            row.id
            for row in db.session.query(Booking.id)
            .filter(is_past_deadline())
            .order_by(Booking.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        ]
        if not ids:
            break
        Booking.query.filter(Booking.id.in_(ids)).update(
            {Booking.status: BookingStatus.EXPIRED, Booking.payment_deadline: None}, synchronize_session=False
        )
        db.session.commit()
        total += len(ids)
        if len(ids) < batch_size:
            break
    return total


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def parse_stay_dates(raw_in, raw_out, missing_message="check_in and check_out are required (format YYYY-MM-DD)!"):
    check_in, check_out = parse_date(raw_in), parse_date(raw_out)
    if not check_in or not check_out:
        raise AppError(missing_message)
    if check_in < hotel_today():
        raise AppError("Check-in date cannot be in the past!")
    if check_out <= check_in:
        raise AppError("Check-out date must be after check-in date!")
    return check_in, check_out


def active_overlap(check_in, check_out):
    return and_(
        Booking.status.notin_(INACTIVE_BOOKING_STATUSES),
        not_(is_past_deadline()),
        Booking.check_in_date < check_out,
        Booking.check_out_date > check_in,
    )


def booked_room_ids(check_in, check_out):
    """Subquery of ids of rooms booked in this period, used with Room.id.notin_(...)."""
    return (
        db.session.query(BookingItem.room_id)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .filter(active_overlap(check_in, check_out))
    )
