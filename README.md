# RAGnosis

AI-powered medical report analysis and hospital management platform.

- **Report intelligence** — upload lab reports (PDF/photo), get deterministic metric extraction (30+ clinical metrics), 13-category classification, BioBERT NER, plain-language summary, 0–100 health score, critical-value alerts + specialist referrals, and grounded RAG chat
- **Hospital module** — JWT-secured portals for patients, doctors, receptionists: appointments, prescriptions, medicine reminders, doctor directory

---

## Tech stack

| Layer | Choice |
|---|---|
| API | Flask 3.0, PyJWT, bcrypt (cost 12), Flask-Limiter, gunicorn + nginx |
| AI | pdfplumber / OpenCV+Tesseract OCR, BioBERT NER, BART summarization, MiniLM + FAISS retrieval, Groq LLaMA-3.3-70B chat |
| Data | MongoDB Atlas (external), local FAISS index |
| Frontend | React 18 + Vite, React Router, zero UI-kit deps |
| Mobile | React Native (Expo) + on-device ONNX int8 MiniLM embedder |
| Deploy | Docker Compose (api + nginx), single VM 2vCPU/4GB minimum |

---

## Project layout

```
backend/
  app/
    __init__.py      # app factory (config, auth, security headers, CORS, rate limits)
    config.py        # env-based config (development / production / testing)
    errors.py        # standard {"error":{"code","message"}} handlers
    extensions.py    # shared limiter
    jsonutil.py      # ObjectId/datetime-safe serialization
    auth/            # register, login, JWT issue/verify, RBAC decorators
    ai/              # 9-stage report pipeline (9 files, each one stage)
    db/              # PyMongo access, index bootstrap, seed script
    hospital/        # appointments, prescriptions, patient views
    reports/         # upload (dedup, magic-byte sniff), retrieval
    chat/            # RAG chat sessions
    doctors/         # specialist directory
    reminders/       # medicine reminders + adherence
  wsgi.py            # gunicorn entry point
  gunicorn.conf.py
  requirements.txt
  requirements-ai.txt
frontend/src/        # landing, patient, doctor, receptionist portals
mobile/src/          # React Native screens + on-device inference service
ml/                  # ONNX export + artifacts for mobile on-device inference
docker/              # backend image (Dockerfile.backend), nginx config, docker-compose.yml
```

---

## Setup & run (backend)

### Prerequisites

- Python 3.11+
- MongoDB Atlas connection string (free M0 cluster is fine)
- Tesseract OCR system binary: `brew install tesseract` (macOS) or `apt install tesseract-ocr` (Linux)
- Groq API key for LLM chat features (optional — pipeline degrades gracefully without it)

### 1. Clone & configure

```bash
git clone https://github.com/mdyaseen27/ragnosis.git
cd ragnosis

cp backend/.env.example backend/.env
# Edit backend/.env — set at minimum:
#   SECRET_KEY=your-32-char-random-string
#   MONGO_URI=mongodb+srv://user:pass@cluster/
#   GROQ_API_KEY=gsk_...          (optional)
```

### 2. Backend environment

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate

# Install API tier (lightweight)
pip install -r requirements.txt

# Install AI pipeline tier (heavier — transformers, sentence-transformers, FAISS)
# Install PyTorch CPU-only first to avoid the ~2GB CUDA wheel:
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ai.txt
```

### 3. Seed demo data

```bash
cd backend
python -m app.db.seed
```

Creates: 8 specialty demo doctors, 1 general demo doctor, 3 demo patients, 2 demo receptionists, 8 KB chunks. All passwords: `demo1234`.

### 4. Run the API server

```bash
cd backend

# Production-like (gunicorn):
gunicorn -c gunicorn.conf.py wsgi:app

# Dev (hot reload):
flask run --port 8000
```

The API serves at `http://localhost:8000`. Health check: `curl localhost:8000/api/health`.

---

## Setup & run (frontend)

```bash
cd frontend
npm install
npm run dev
```

Serves at `http://localhost:5173`. Vite proxies `/api` → `localhost:8000`.

---

## Setup & run (mobile)

```bash
cd mobile
npm install
npx expo start
```

The mobile app bundles a quantized MiniLM ONNX model for on-device report embedding. Falls back to server mode if the native ONNX runtime is unavailable (e.g. Expo Go).

---

## Model training & export

RAGnosis uses pre-trained models (no custom training pipeline). The only export step is ONNX quantization of the retrieval embedder for on-device mobile inference:

```bash
cd ml
pip install torch sentence-transformers onnx onnxruntime
python export_onnx.py
```

**What it does:**
1. Loads `all-MiniLM-L6-v2` (384-dim sentence embeddings)
2. Exports to ONNX fp32 (`ml/artifacts/minilm-fp32.onnx`, ~90 MB)
3. Quantizes to dynamic int8 with per-channel weight scales (`ml/artifacts/minilm-int8.onnx`, ~23 MB)
4. Saves tokenizer files to `ml/artifacts/tokenizer/`
5. Runs parity gates — fp32 cosine > 0.999, int8 cosine ≥ 0.98, retrieval top-1 agreement = 1.0
6. Writes metadata to `ml/artifacts/model.json`

The int8 artifact (used by the mobile app) achieves ~4 ms/embedding on CPU vs ~22 ms for PyTorch — a **75% size reduction, 5× speedup**, with negligible accuracy loss.

---

## Testing

```bash
# Backend API — Flask test client (pytest)
cd backend && python -m pytest tests/ -v

# AI pipeline — metrics, classify, score, alerts (40+ stdlib checks, no models)
cd backend && python -m pytest app/ai/tests/ -v

# Frontend
cd frontend && npm run build

# ONNX export parity gates
cd ml && python export_onnx.py
```

---

## Docker deployment

```bash
cd docker
docker compose --env-file ../backend/.env up -d --build
```

Two services:
- `api` — Flask + Gunicorn (port 8000, internal)
- `nginx` — reverse proxy (port 80, public)

MongoDB Atlas is external (not containerized). See `docker-compose.yml` and `Dockerfile.backend` for details.

---

## API overview

Base URL: `/api`  
Auth: `Authorization: Bearer <access_token>`  
JSON everywhere except multipart upload.

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | API health check |
| `/api/ready` | GET | DB readiness check |
| `/api/auth/register` | POST | User registration |
| `/api/auth/login` | POST | Login → access + refresh tokens |
| `/api/reports/upload` | POST | Upload lab report (PDF/image) |
| `/api/reports/<id>` | GET | Get report + pipeline results |
| `/api/chat/session` | POST | Start RAG chat session |
| `/api/chat/message` | POST | Send message to chat |
| `/api/hospital/appointments` | GET/POST | Appointments CRUD |
| `/api/hospital/prescriptions` | GET/POST | Prescriptions CRUD |
| `/api/doctors` | GET | Specialist directory |
| `/api/reminders` | GET/POST | Medicine reminders |

Error format: `{"error": {"code": "MACHINE_CODE", "message": "human message"}}`

---

## Documentation

| File | Contents |
|---|---|
| `ARCHITECTURE.md` | Modules, request flows, key decisions |
| `SYSTEM-DESIGN.md` | Requirements, scaling, trade-offs, failure modes |
| `DATABASE.md` | Collections, schemas, indexes, Atlas setup |
| `SKILLS.md` | Agent skills used by this project and when |
| `AGENTS.md` / `CLAUDE.md` | Instructions for AI agents working on this repo |

---

## License

Academic project. Third-party skills retain their own licenses (see `SKILLS.md`).

---

## Design principles

- **Deterministic core** — numeric extraction, classification, scoring, and alerts are pure functions (same input → same output). No ML in the numeric path.
- **Graceful degradation** — every AI stage has a working fallback. The app boots and serves with zero optional deps installed.
- **No diagnostic authority** — no output states or implies a diagnosis. Educational tone + disclaimer on every AI surface.
- **On-device privacy** — the mobile app can embed report text locally via quantized ONNX, so sensitive data never leaves the device for retrieval.