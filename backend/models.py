from sqlalchemy.dialects.postgresql import ARRAY
from extensions import db
from utils.statuses import BookingStatus, PaymentStatus, RoomStatus
from utils.timeutils import utcnow
 
 
class User(db.Model):
    __tablename__ = "users"
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    hashed_password = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20))
    role = db.Column(db.String(20), default="customer")
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    bookings = db.relationship("Booking", backref="user", lazy=True)
 
 
class RoomType(db.Model):
    __tablename__ = "room_types"
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    price_per_night = db.Column(db.Numeric(10, 2), nullable=False)
    max_guests = db.Column(db.Integer, nullable=False)
    images = db.Column(ARRAY(db.Text))
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    rooms = db.relationship("Room", backref="room_type", lazy=True)
    booking_items = db.relationship("BookingItem", backref="room_type", lazy=True)
 
 
class Room(db.Model):
    __tablename__ = "rooms"
    
    id = db.Column(db.Integer, primary_key=True)
    room_number = db.Column(db.String(20), unique=True, nullable=False)
    room_type_id = db.Column(db.Integer, db.ForeignKey("room_types.id"), nullable=False)
    status = db.Column(db.String(20), default=RoomStatus.AVAILABLE)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    
    # Relationships
    booking_items = db.relationship("BookingItem", backref="room", lazy=True)
 
 
class Booking(db.Model):
    __tablename__ = "bookings"
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    # Date (no time): a date on the hotel's calendar, compared with hotel_today()
    check_in_date = db.Column(db.Date, nullable=False)
    check_out_date = db.Column(db.Date, nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(30), default=BookingStatus.PENDING)
    booking_code = db.Column(db.String(15), unique=True, nullable=False)
    # Payment deadline of a pending booking with no payment yet; NULL = never expires automatically (see utils/booking_rules.py)
    payment_deadline = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    
    # Relationships
    items = db.relationship("BookingItem", backref="booking", lazy=True, cascade="all, delete-orphan")
    payments = db.relationship("Payment", backref="booking", lazy=True, cascade="all, delete-orphan")
 
 
class BookingItem(db.Model):
    __tablename__ = "booking_items"
    
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False)
    room_type_id = db.Column(db.Integer, db.ForeignKey("room_types.id"), nullable=False)
    price_at_booking = db.Column(db.Numeric(10, 2), nullable=False)
 
 
class Payment(db.Model):
    __tablename__ = "payments"
    
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_method = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), default=PaymentStatus.PENDING)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)