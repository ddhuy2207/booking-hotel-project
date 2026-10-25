import os

from flask import current_app

UPLOAD_URL_PREFIX = "/static/uploads/"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # matches MAX_SIZE_MB in the frontend (RoomTypeImageManager)


def file_size(file):
    """Size of the uploaded file (bytes), without reading its content into memory."""
    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    return size


def upload_folder():
    return os.path.join(current_app.root_path, "static", "uploads")


def image_filename(value):
    """URL or file name -> just the file name (strips any directories, including '../')."""
    if not isinstance(value, str):
        return ""
    return os.path.basename(value.strip().replace("\\", "/"))


def image_urls(images):
    """List of file names in the DB -> list of URLs for the client. Does not modify the original list."""
    return [UPLOAD_URL_PREFIX + name for name in map(image_filename, images or []) if name]


def delete_image_file(filename):
    """Delete an image file in static/uploads. Can never delete files outside this folder."""
    folder = os.path.realpath(upload_folder())
    path = os.path.realpath(os.path.join(folder, image_filename(filename)))
    if os.path.dirname(path) != folder or not os.path.isfile(path):
        return
    try:
        os.remove(path)
    except OSError:
        current_app.logger.warning("Could not delete image file %s", path)
