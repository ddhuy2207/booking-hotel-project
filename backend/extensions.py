from argon2 import PasswordHasher
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
jwt = JWTManager()
ph = PasswordHasher()
limiter = Limiter(key_func=get_remote_address, default_limits=["100 per minute"])