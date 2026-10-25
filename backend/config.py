import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

MIN_JWT_SECRET_LENGTH = 32


def _load_required_env():
    values = {name: os.getenv(name, "").strip() for name in ("DATABASE_URL", "JWT_SECRET_KEY")}

    problems = [f"{name} is missing" for name, value in values.items() if not value]
    if values["JWT_SECRET_KEY"] and len(values["JWT_SECRET_KEY"]) < MIN_JWT_SECRET_LENGTH:
        problems.append(f"JWT_SECRET_KEY must be at least {MIN_JWT_SECRET_LENGTH} characters")

    if problems:
        raise RuntimeError(
            "Invalid environment configuration:\n  - "
            + "\n  - ".join(problems)
            + "\nSet them in backend/.env, e.g.:\n"
            "  DATABASE_URL=postgresql://user:password@localhost:5432/hotel_db\n"
            '  JWT_SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">'
        )
    return values


_env = _load_required_env()


class Config:
    SQLALCHEMY_DATABASE_URI = _env["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = _env["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=30)
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = False
    JWT_ACCESS_COOKIE_PATH = "/"
    JWT_COOKIE_CSRF_PROTECT = True
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024
