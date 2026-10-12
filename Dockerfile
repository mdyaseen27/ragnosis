# RAGnosis — single-container deployment (Hugging Face Space, Docker SDK).
# Stage 1 builds the React app; stage 2 runs the Flask API and serves the
# built SPA from the same origin (FRONTEND_DIST mode in app/__init__.py).
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/index.html frontend/vite.config.js ./
COPY frontend/src ./src
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# tesseract-ocr powers photo/scan OCR; libglib2.0-0 is opencv's runtime dep.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend_dist
ENV FRONTEND_DIST=/app/frontend_dist UPLOAD_DIR=/tmp/uploads APP_ENV=production
EXPOSE 7860
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT:-7860} -w ${GUNICORN_WORKERS:-2} --timeout 180 --preload wsgi:app"]
