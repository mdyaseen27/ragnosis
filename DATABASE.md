# Database — RAGnosis (MongoDB Atlas, db `ragnosis`)

All `_id`s are ObjectIds. Dates are BSON UTC datetimes. Money (fees) is
integer paise. Implemented indexes live in `backend/app/db/__init__.py::
init_indexes()` — run it at deploy (currently invoked from `seed.py`).

## Collections

**users** — one doc per human. Role fixed at registration.
`name, email (unique), mobile (sparse unique), password_hash (bcrypt-12, never
returned), role (patient|doctor|receptionist), specialization/hospital/
doctor_id_public (doctors), linked_doctor_id (receptionists), working_hours,
consultation_fee_paise, created_at, last_login_at, refresh_jti, deleted_at`

**reports** — one per uploaded report; stores raw material + every derived
artifact for reproducibility.
`patient_id, uploaded_by, file_hash (dedup key), file_name, file_path (never
exposed), mime_type, raw_text, extraction_method, metrics[{param,value,unit,
status}], category, category_scores, entities[], summary, summary_method,
health_score, health_band, critical_flags[], referrals[], pipeline_version,
processing_ms, created_at, deleted_at`
Indexes: `(patient_id, created_at desc)`, unique `(patient_id, file_hash)`,
`category`.

**appointments** — `doctor_id, patient_id, booked_by, date (YYYY-MM-DD),
slot (HH:MM), status (scheduled|completed|cancelled|no_show), notes, created_at`
Unique index `(doctor_id, date, slot)` = the double-booking guard (race-safe).

**prescriptions** — `doctor_id, patient_id, appointment_id?,
medicines[{name, dosage, frequency, duration_days, instructions}],
diagnosis_note (denylist-checked), created_at`

**chat_sessions** — `patient_id, report_id?, title (first question, 60 chars),
created_at, updated_at`
**chat_messages** — `session_id, role (user|assistant), content,
citations[{chunk_id, topic}], model, latency_ms, created_at`

**reminders** — `patient_id, prescription_id?, medicine_name,
times_utc["08:00"], start_date, end_date, active, taken_log[{date,time,
status}], created_at`

**suggested_doctors** — seeded demo directory (`is_demo: true`, surfaced to UI):
`name, specialization, hospital, city, fee_paise`

**kb_chunks** — curated RAG corpus: `chunk_id (unique), topic, text
(150–300 words, educational), source, kb_version, embedding (384-d, optional
— FAISS-side is cheaper)`

**audit_logs** — append-only: `actor_id?, event (login.success,
auth.forbidden, report.critical_flag…), detail (IDs only, no PII), ip,
created_at` — **TTL 180 days**.

## Relationships
users 1—N reports/appointments/prescriptions/chat_sessions/reminders ·
doctors 1—N receptionists (`linked_doctor_id`) · reports 1—N chat_sessions ·
appointments 1—N prescriptions · prescriptions 1—N reminders. All joins are
application-level with ownership checks — no DB cascades; deletes are
soft (`deleted_at`).

## Atlas setup
- **Tier:** M0 free for dev/demo; M2/M5 when the corpus outgrows 512 MB.
- **Network:** IP allowlist (dev IPs + VM IP). Never `0.0.0.0/0`.
- **Users:** least privilege — app user `readWrite` on `ragnosis` only;
  separate read-only user for analytics.
- **Backups:** cloud backup / `mongodump` before every evaluation run.
- **Connection:** `retryWrites=true`, 5 s server-selection timeout, fail-fast
  startup message when `MONGO_URI` is unset.
- **Seed:** `python -m app.db.seed` — idempotent upserts (demo doctors, KB
  chunks, demo accounts). Seeds are clearly demo-flagged.
