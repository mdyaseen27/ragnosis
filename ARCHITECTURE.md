# Architecture — RAGnosis

## Three tiers

```
Clients (React 18 + Vite SPA)
        │  HTTPS/JSON, JWT Bearer
        ▼
API + AI (Python 3.11, Flask 3.0, gunicorn + nginx)
  /auth /reports /chat /hospital /doctors /reminders
  JWT auth · RBAC decorators · AI pipeline (per report)
        │
        ▼
Data & Models
  MongoDB Atlas (users, reports, appointments, prescriptions,
                 chat history, reminders, doctors, kb_chunks, audit_logs)
  FAISS index (local file — curated medical KB, 384-d MiniLM vectors)
  Groq API (LLaMA-3.3-70B — chat generation only)
  Hugging Face cache (BioBERT 109M, BART 406M, MiniLM 22M)
```

One pipeline serves every upload path (patient, receptionist, reprocess) —
`app/ai/pipeline.py::process_report()`. No duplicate code paths.

## Backend modules (`backend/app/`)

| Module | Files | Responsibility |
|---|---|---|
| Factory | `__init__.py`, `config.py`, `errors.py`, `extensions.py` | App creation, env config, JSON logging + request IDs, security headers, CORS allowlist, rate limiting, `/health` + `/ready`, blueprint auto-discovery |
| Auth & RBAC | `auth/` | Register/login, JWT issue/verify (access 30m, refresh 7d rotation), `require_roles`, 403 audit logging |
| AI pipeline | `ai/` | `extract_text` → `metrics` → `classify` → `ner` → `summarize` → `rag` → `alerts` → `score`, orchestrated by `pipeline.py` |
| Data | `db/` | PyMongo access (lazy, fail-fast), `init_indexes()`, `seed.py` (idempotent demo data) |
| Hospital | `hospital/` | Appointments (15-min slots, double-book guard), prescriptions (denylist-checked notes), patient views |
| Reports | `reports/` | Upload validation (magic-byte sniff, 15 MB, SHA-256 dedup), retrieval, reprocess, soft delete |
| Chat | `chat/` | RAG Q&A sessions, 30/hr/user, mandatory disclaimer |
| Doctors | `doctors/` | Specialist directory (`is_demo` flagged) |
| Reminders | `reminders/` | Medicine reminders + adherence tracking |
| Shared | `jsonutil.py` | ObjectId/datetime serialization, `safe_str` input coercion |

## Key request flows

**Upload → results** (`POST /api/reports/upload`): auth + role → magic-byte +
size validation → SHA-256 → dedup check → persist bytes as
`uploads/<hash>.<ext>` → `process_report()` (pure, timed) → Mongo doc →
summary card. Parse failures → 422, never 500.

**Chat** (`POST /api/chat/ask`): patient-only → question + report slice →
MiniLM embed → FAISS top-5 → Groq answer (non-diagnostic system prompt) →
citations + disclaimer. Fallbacks: curated table → safe redirect.

**Auth** (`POST /api/auth/*`): bcrypt-12 verify → access + refresh JWT →
refresh rotates `refresh_jti` in DB (reuse → 401). Login throttled 5/15min/IP
(`ProxyFix` in production so nginx doesn't collapse identities).

**Booking** (`POST /api/hospital/appointments`): receptionist, doctor must be
their linked doctor → slot within working hours → unique index
`(doctor_id, date, slot)` → 409 with `free_slots` on conflict.

## Frontend (`frontend/src/`)

`api/client.js` (token attach, single-flight 401→refresh, `ApiError`) →
`auth/` (context, role-gated routes) → `pages/`: public (landing, how-it-works,
login), `patient/` (reports, report detail, chat, prescriptions, reminders),
`doctor/` (today, patients, prescription writer), `receptionist/` (book, upload).
Design tokens in `styles.css` only; no UI-kit deps.

## Key decisions
- **Deterministic numeric core** — regex + reference tables; models only explain.
- **Fail fast, fail clear** — missing `MONGO_URI`/keys → 503 with actionable
  message, never a stack trace.
- **Server-side scoping** — every ownership check in handlers; the UI is not a
  security boundary.
- **Graceful degradation** — each AI stage has a non-AI fallback; the app boots
  with zero optional deps.
