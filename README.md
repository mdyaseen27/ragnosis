# RAGnosis

AI-powered medical report analysis and hospital management platform.

- **Report intelligence** — upload lab reports (PDF/photo), get deterministic metric extraction, classification, health scoring, critical alerts, and grounded RAG chat
- **Hospital module** — JWT-secured portals for patients, doctors, and receptionists: appointments, prescriptions, reminders, doctor directory

## Quickstart

```bash
cp backend/.env.example backend/.env   # set SECRET_KEY, MONGO_URI, GROQ_API_KEY
cd backend && pip install -r requirements.txt && pip install -r requirements-ai.txt
python -m app.db.seed && flask run --port 8000
# in another terminal:
cd frontend && npm install && npm run dev
```

## Stack

- **API** Flask 3.0 + PyJWT + gunicorn/nginx
- **AI** pdfplumber/OCR, BioBERT, BART, MiniLM+FAISS, Groq LLaMA-3.3-70B
- **Data** MongoDB Atlas, local FAISS index
- **Frontend** React 18 + Vite
- **Mobile** React Native Expo
- **Deploy** Docker Compose (api + nginx), single VM

## Layout

```
backend/app/       → factory, config, auth, ai pipeline, db, blueprints
frontend/src/      → landing, patient, doctor, receptionist portals
mobile/src/        → React Native screens + on-device inference
docker/            → backend image, nginx, compose
```

See `ARCHITECTURE.md`, `SYSTEM-DESIGN.md`, `DATABASE.md` for full docs.

## License

Academic project.