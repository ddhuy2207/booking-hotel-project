import re
import unicodedata
 
 
class ValidationError(Exception):
    def __init__(self, messages):
        self.messages = [messages] if isinstance(messages, str) else list(messages)
        super().__init__("; ".join(self.messages))
 
 
_EMAIL_RE = re.compile(
    r"[a-z0-9._%+\-]+"
    r"@"
    r"[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?)+"
)
 
# --------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------
def clean_email(value):
    if not isinstance(value, str):
        raise ValidationError("email must be a string!")
 
    email = value.strip().lower()
    if not email:
        raise ValidationError("email is required!")
    if len(email) > 254:
        raise ValidationError("email is too long (max 254 characters)!")
 
    local, _, domain = email.rpartition("@")
    if (
        not _EMAIL_RE.fullmatch(email)
        or len(local) > 64
        or ".." in email
        or local.startswith(".")
        or local.endswith(".")
        or not domain.rsplit(".", 1)[-1].isalpha()
        or len(domain.rsplit(".", 1)[-1]) < 2
    ):
        raise ValidationError("email is not a valid email address!")
 
    return email
 
 
# --------------------------------------------------------------------------
# Fullname
# --------------------------------------------------------------------------
_NAME_PUNCTUATION = set(" '’.-")
 
 
def clean_full_name(value):
    if not isinstance(value, str):
        raise ValidationError("full_name must be a string!")
 
    name = unicodedata.normalize("NFC", value)
    name = " ".join(name.split())
 
    if len(name) < 2 or len(name) > 100:
        raise ValidationError("full_name must be between 2 and 100 characters!")
 
    if not name[0].isalpha():
        raise ValidationError("full_name must start with a letter!")
 
    for ch in name:
        if ch.isalpha() or ch in _NAME_PUNCTUATION or unicodedata.category(ch).startswith("M"):
            continue
        raise ValidationError(
            "full_name may only contain letters, spaces, apostrophes, dots and hyphens!"
        )
 
    return name
 
 
# --------------------------------------------------------------------------
# Phone
# --------------------------------------------------------------------------
def clean_phone(value):
    """Option. Accept 0912 345 678, 0912-345-678, +84912345678..."""
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValidationError("phone must be a string!")
 
    phone = re.sub(r"[ .\-()]", "", value.strip())
    if not re.fullmatch(r"\+?[0-9]{8,15}", phone):
        raise ValidationError("phone must contain 8-15 digits (optionally starting with +)!")
    return phone
 
 
# --------------------------------------------------------------------------
# Password
# --------------------------------------------------------------------------
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
 


def check_password(password, email=None, full_name=None):
    """Return list errors"""
    if not isinstance(password, str):
        return ["password must be a string!"]
 
    problems = []
 
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long!")
    if len(password) > MAX_PASSWORD_LENGTH:
        problems.append(f"Password must be at most {MAX_PASSWORD_LENGTH} characters long!")
    if not any(c.islower() for c in password):
        problems.append("Password must contain a lowercase letter!")
    if not any(c.isupper() for c in password):
        problems.append("Password must contain an uppercase letter!")
    if not any(c.isdigit() for c in password):
        problems.append("Password must contain a digit!")
    if not any(not c.isalnum() and not c.isspace() for c in password):
        problems.append("Password must contain a special character (e.g. ! @ # $ %)!")
    if any(ord(c) < 32 or ord(c) == 127 for c in password):
        problems.append("Password must not contain control characters!")
 
    lowered = password.lower()
 
    if email and isinstance(email, str):
        local = email.rpartition("@")[0].lower()
        if len(local) >= 4 and local in lowered:
            problems.append("Password must not contain your email name!")
 
    if full_name and isinstance(full_name, str):
        for part in full_name.lower().split():
            if len(part) >= 4 and part in lowered:
                problems.append("Password must not contain your name!")
                break
 
    return problems