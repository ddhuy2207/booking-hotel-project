from flask import request

from errors import AppError


def parse_pagination(default_per_page=20, max_per_page=100):
    """Read ?page=&per_page= from the query string. Returns (page, per_page); raises AppError 400 if invalid."""
    try:
        page = int(request.args.get("page") or 1)
        per_page = int(request.args.get("per_page") or default_per_page)
    except ValueError:
        raise AppError("Invalid pagination value!")
    if page < 1 or per_page < 1:
        raise AppError("Invalid pagination value!")
    return page, min(per_page, max_per_page)


def pagination_json(pagination):
    """The shared "pagination" section of every list API."""
    return {
        "page": pagination.page,
        "per_page": pagination.per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }
