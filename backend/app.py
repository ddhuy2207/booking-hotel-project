from config import Config
from extensions import db, jwt, limiter
import click
from flask import Flask
from flask_cors import CORS
from errors import register_error_handlers
from routes.admin import admin_bp
from routes.auth import auth_bp
from routes.bookings import bookings_bp
from routes.payments import payments_bp
from routes.rooms import rooms_bp
from utils.booking_rules import expire_stale_bookings

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize extensions with the app
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    
    register_error_handlers(app, jwt)

    # Run periodically (every 15 minutes recommended): flask --app app expire-bookings
    @app.cli.command("expire-bookings")
    def expire_bookings_command():
        """Move bookings past their payment deadline to "expired"."""
        click.echo(f"Expired {expire_stale_bookings()} booking(s).")

    # Register the Blueprints (API groups)
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(bookings_bp, url_prefix="/api/bookings")
    app.register_blueprint(payments_bp, url_prefix="/api/payments")
    app.register_blueprint(rooms_bp, url_prefix="/api/rooms")
    

    return app


app = create_app()
CORS(app, supports_credentials=True, origins=["http://localhost:5173"])

if __name__ == "__main__":
    app.run(debug=True, port=5000)