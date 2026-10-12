# RAGnosis

A Retrieval-Augmented Generation platform for AI-powered medical report analysis
and integrated hospital management — built to a production bar.

**Design rule:** numeric extraction is deterministic and auditable; generative
models are used only for explanation and conversation. The system never acts as
a diagnostic authority — every AI surface carries a visible educational-use
disclaimer.

## What it does

- **Report intelligence:** upload a lab report (PDF/photo) → deterministic
  extraction of 30+ clinical metrics → 13-category classification → BioBERT NER
  → plain-language summary → 0–100 health score → critical-value alerts +
  specialist referrals → grounded RAG chat over the report.
- **Hospital module:** JWT-secured, role-based portals for patients, doctors
  and receptionists — appointments, structured prescriptions, medicine
  reminders, doctor directory. All roles share the same AI pipeline.

## Tech stack

| Layer | Choice |
|---|---|
| API | Flask 3.0, PyJWT, bcrypt (cost 12), Flask-Limiter, gunicorn + nginx |
| AI | pdfplumber / OpenCV+Tesseract, BioBERT, BART, MiniLM + FAISS, Groq LLaMA-3.3-70B |
| Data | MongoDB Atlas, local FAISS index |
| Frontend | React 18 + Vite, React Router, zero UI-kit deps |
| Serving | Docker Compose (api + nginx), single VM 2vCPU/4GB minimum |

## Quickstart

```bash
# 1. Configure
cp backend/.env.example backend/.env   # set SECRET_KEY, MONGO_URI, GROQ_API_KEY

# 2. Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
pip install -r backend/requirements-ai.txt   # AI pipeline deps
cd backend && python -m app.db.seed          # demo data (needs MONGO_URI)
gunicorn -c gunicorn.conf.py wsgi:app        # serves :8000
# dev alternative (from backend/): flask run --port 8000   (vite proxies /api → :8000)

# 3. Frontend
cd frontend && npm install && npm run dev    # vite, proxies /api → :8000
```

Production (single VM):

```bash
cd docker && docker compose --env-file ../backend/.env up -d --build
curl localhost/api/health
```

## Layout

```
backend/
  app/
    __init__.py      # app factory: config, logging, security headers, CORS, rate limits
    config.py        # env-based config (development/production/testing)
    errors.py        # standard {"error":{"code","message"}} handlers
    extensions.py    # shared limiter
    jsonutil.py      # ObjectId/datetime-safe serialization + safe_str
    auth/            # register, login, JWT issue/verify, RBAC decorators
    ai/              # 9-stage report pipeline (extract→metrics→classify→ner→
                     #   summarize→rag→alerts→score→pipeline)
    db/              # PyMongo access, index bootstrap, seed script
    hospital/        # appointments, prescriptions, patient views
    reports/         # upload (dedup, magic-byte sniff), retrieval
    chat/            # RAG chat sessions
    doctors/         # specialist directory (demo-flagged)
    reminders/       # medicine reminders + adherence
  wsgi.py  gunicorn.conf.py  requirements.txt  requirements-ai.txt
frontend/src/
  api/ auth/ components/ pages/   # landing, patient, doctor, receptionist portals
docker/          # backend image, nginx, compose
```

## API

Base `/api`, JSON everywhere except multipart upload. Auth: `Authorization: Bearer
<access_token>` (short-lived) + rotating refresh tokens. Standard error body:
`{"error": {"code": "<MACHINE_CODE>", "message": "<human message>"}}`.
Full contract: `docs/` (see planning docs) and `ARCHITECTURE.md`.

## Docs

| File | Contents |
|---|---|
| `ARCHITECTURE.md` | Modules, request flows, key decisions |
| `SYSTEM-DESIGN.md` | Requirements, scaling, trade-offs, failure modes |
| `DATABASE.md` | Collections, schemas, indexes, Atlas setup |
| `SKILLS.md` | Agent skills used by this project and when |
| `AGENTS.md` / `CLAUDE.md` | Instructions for AI agents working on this repo |

## Testing

- Backend: Flask test-client suites per blueprint (auth 12, blueprints 89 checks)
- AI: 40-check stdlib suite incl. adversarial extraction cases (`metrics`,
  `classify`, `score`, `alerts` need no models)
- Frontend: `npm run build` must pass; integration needs a live API
- Security: Cloudflare security-audit skill, run-1 report at
  `~/security-audit-skill/ragnosis/run-1/REPORT.md` (6 findings, all fixed)

## License

Academic project. Third-party skills retain their own licenses (see `SKILLS.md`).
