# Production WSGI server config. Single VM minimum: 2 vCPU / 4 GB RAM (CPU inference).
import multiprocessing
import os

bind = "0.0.0.0:8000"
workers = min(multiprocessing.cpu_count() * 2 + 1, 8)
worker_class = "sync"
timeout = 120            # AI pipeline stages can take a while on CPU
graceful_timeout = 30
keepalive = 5
max_requests = 1000      # recycle workers to contain memory growth (transformers)
max_requests_jitter = 100
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info").lower()
preload_app = False      # macOS fork+ObjC incompatibility; True if Linux
