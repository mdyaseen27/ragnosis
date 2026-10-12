"""to_json: ObjectId/datetime-safe serialization for API responses."""
from datetime import datetime

from bson import ObjectId


def to_json(doc):
    if isinstance(doc, dict):
        return {k: to_json(v) for k, v in doc.items()}
    if isinstance(doc, (list, tuple)):
        return [to_json(v) for v in doc]
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc


def safe_str(value, default=""):
    """Coerce JSON input to str. Non-string input (e.g. {"$gt": ""}) becomes the
    default so malformed input fails validation with 400 instead of 500."""
    return value if isinstance(value, str) else default
