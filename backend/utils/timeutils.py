from datetime import date, datetime, timedelta, timezone
 

HOTEL_TZ = timezone(timedelta(hours=7))
 
 
def utcnow() -> datetime:
    """Current time in UTC(with tzinfo). Used as a default for DateTime."""
    return datetime.now(timezone.utc)
 
 
def hotel_today() -> date:
    """Current date according to the hotel's timezone, independent of the server timezone."""
    return datetime.now(HOTEL_TZ).date()
 