"""PyMongo access: lazy client, fail-fast health check, index bootstrap.

Spec §4.12: retryWrites=true, 5s server selection timeout, startup health check
that fails fast with a clear message. Least-privilege app user (readWrite on
ragnosis only); network allowlist lives in Atlas, never 0.0.0.0/0.
"""
from flask import current_app
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError

_client = None


class DBUnavailable(RuntimeError):
    """Raised when the database is not configured or unreachable."""


def get_client():
    global _client
    if _client is None:
        uri = current_app.config["MONGO_URI"]
        if not uri:
            raise DBUnavailable(
                "MONGO_URI is not set. Copy backend/.env.example to .env and "
                "add your MongoDB Atlas connection string."
            )
        _client = MongoClient(uri, retryWrites=True, serverSelectionTimeoutMS=5000)
    return _client


def get_db():
    return get_client()[current_app.config["MONGO_DB"]]


def ping():
    """Returns (ok: bool, detail: str). Used by /api/ready."""
    try:
        get_client().admin.command("ping")
        return True, "reachable"
    except DBUnavailable as e:
        return False, str(e)
    except PyMongoError as e:
        return False, f"unreachable: {e}"


def _unique_partial(collection, field):
    """Unique only among documents where the field is a real string.

    A plain/sparse unique index still indexes explicit nulls, so every
    user registered without a mobile (stored as null) collided with the
    next one — the second no-mobile signup failed with a 500. The
    partial filter excludes null/missing values entirely. Migrates the
    old sparse index in place when one is found."""
    name = f"{field}_1"
    existing = collection.index_information().get(name)
    if existing and "partialFilterExpression" not in existing:
        collection.drop_index(name)
    collection.create_index(
        field, unique=True, partialFilterExpression={field: {"$type": "string"}}
    )


def _unique_scheduled_slot(db):
    """(doctor, date, slot) unique among SCHEDULED appointments only.

    A plain unique index made a slot unbookable forever once any
    appointment — including a cancelled or completed one — had used it.
    The partial filter keeps the double-booking race protection where
    it matters (active bookings) and frees the slot otherwise."""
    name = "doctor_id_1_date_1_slot_1"
    existing = db.appointments.index_information().get(name)
    if existing and "partialFilterExpression" not in existing:
        db.appointments.drop_index(name)
    db.appointments.create_index(
        [("doctor_id", ASCENDING), ("date", ASCENDING), ("slot", ASCENDING)],
        unique=True, partialFilterExpression={"status": "scheduled"},
    )


def init_indexes():
    """Idempotent index bootstrap — run once at deploy/first start."""
    db = get_db()
    db.users.create_index("email", unique=True)
    _unique_partial(db.users, "mobile")
    _unique_partial(db.users, "doctor_id_public")
    db.users.create_index("role")
    db.reports.create_index([("patient_id", ASCENDING), ("created_at", DESCENDING)])
    db.reports.create_index([("patient_id", ASCENDING), ("file_hash", ASCENDING)], unique=True)
    db.reports.create_index("category")
    _unique_scheduled_slot(db)
    db.appointments.create_index([("doctor_id", ASCENDING), ("date", ASCENDING), ("status", ASCENDING)])
    db.appointments.create_index([("patient_id", ASCENDING), ("date", ASCENDING)])
    db.prescriptions.create_index([("patient_id", ASCENDING), ("created_at", DESCENDING)])
    db.prescriptions.create_index([("doctor_id", ASCENDING), ("created_at", DESCENDING)])
    db.chat_sessions.create_index([("patient_id", ASCENDING), ("updated_at", DESCENDING)])
    db.chat_messages.create_index("session_id")
    db.reminders.create_index([("patient_id", ASCENDING), ("active", ASCENDING)])
    db.reminders.create_index([("active", ASCENDING), ("end_date", ASCENDING)])
    db.suggested_doctors.create_index([("specialization", ASCENDING), ("city", ASCENDING)])
    db.kb_chunks.create_index("chunk_id", unique=True)
    db.kb_chunks.create_index("topic")
    db.audit_logs.create_index([("event", ASCENDING), ("created_at", DESCENDING)])
    db.audit_logs.create_index("created_at", expireAfterSeconds=180 * 24 * 3600)  # 180-day TTL
