# System Design — RAGnosis

## 1. Requirements

**Functional:** register/login (3 roles); report upload (PDF/JPG/PNG) with full
AI analysis; metric dashboard + health score; RAG chat with history;
appointment booking; structured prescriptions; medicine reminders + adherence;
specialist referrals; doctor directory.

**Non-functional:** p95 report pipeline < 60 s on CPU; login throttled;
uploads ≤ 15 MB; audit log retained 180 days; every AI output non-diagnostic
with disclaimer; works (degraded) with models offline; runs on 2vCPU/4GB.

## 2. API design
REST under `/api`, JSON everywhere except multipart upload. Standard error
envelope `{"error": {"code": "<MACHINE>", "message": "<human>"}}`. Pagination
`?page&limit` (max 100) with `total`. Idempotency: upload dedup by SHA-256,
booking by unique index; chat intentionally non-idempotent. Versioned at
`/api` (= v1); breaking changes get `/api/v2`.

## 3. Data design
Document store (MongoDB): lab reports have no fixed schema across labs.
10 collections — see `DATABASE.md`. Money in integer paise. Dates UTC;
appointment slots as `YYYY-MM-DD` + `HH:MM` strings to dodge TZ pain.
No cascading deletes — soft-delete only (medical history integrity).

## 4. AI pipeline design
Single orchestrator, 8 pure stages. Deterministic stages (extract, metrics,
classify, alerts, score) are total functions of the report text. Neural stages
(BioBERT NER, BART summary, RAG chat) are fenced: lazy imports, per-sentence
numeric verification on summaries, system-prompt + disclaimer guardrails on
chat, curated-table fallbacks. FAISS flat index, cosine, top-k 5.

## 5. Scaling notes
- **Current:** single VM, sync gunicorn workers, `max_requests` recycling for
  transformer memory growth, `preload_app` to share model weights.
- **Next bottleneck:** CPU pipeline under concurrent uploads → per-user
  throttles (20/day) already in place; then a task queue (RQ/Celery) with the
  existing 202-accepted shape on reprocess as the pattern.
- **Read scaling:** compound indexes on hot paths (patient timelines,
  doctor-day schedules); Atlas M0 → M2/M5 when corpus outgrows 512 MB.

## 6. Failure modes (all handled)
| Failure | Behavior |
|---|---|
| Models missing/OOM | Extractive summary, curated-table chat, empty NER — pipeline continues |
| OCR fails | Clear re-upload prompt; 422, never 500 |
| Groq down | Retrieved context returned verbatim + disclaimer |
| DB down | 503 with actionable message; `/ready` reflects it |
| Duplicate upload race | `DuplicateKeyError` → deduped 200 |
| Double booking race | Unique index → 409 + free-slot alternatives |

## 7. Security design
Bcrypt-12, short access tokens + rotating refresh, RBAC decorators + ownership
checks + 403 audit log, CORS allowlist, security headers, per-IP and per-user
rate limits, `ProxyFix` behind the single nginx hop, magic-byte upload sniff,
`MAX_CONTENT_LENGTH` at parse time, parameterized-only queries, hash-keyed
storage paths. Audit: `~/security-audit-skill/ragnosis/run-1/REPORT.md`.

## 8. Trade-offs
- **MongoDB over Postgres:** schema-less reports beat rigid tables; joins are
  application-level and few.
- **Flask over FastAPI:** team familiarity; async buys little for CPU-bound
  pipeline stages.
- **Keyword classification over trained models:** zero labeled data needed;
  new report types = longer keyword lists.
- **Sync workers over async:** transformer inference is CPU-bound; async adds
  complexity without throughput.
