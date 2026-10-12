# CLAUDE.md — working on RAGnosis

## First: read these
1. `SKILLS.md` — the agent skills installed for this project and when to use them.
2. `~/workspace/skills/ponytail/SKILL.md` and `~/workspace/skills/karpathy-guidelines/SKILL.md` — follow both on every coding task. Lean, surgical, verified.
3. `ARCHITECTURE.md` — where things live.

## Environment
- Backend venv: `~/workspace/venvs/ragnosis` (`bin/python`, `bin/pip`).
- Graphify venv: `~/workspace/venvs/graphify` (`bin/graphify`).
- Never `pip install` into system python (PEP 668). AI deps: `backend/requirements-ai.txt`.
- `APP_ENV=testing` + any 32+ char `SECRET_KEY` for tests. No `MONGO_URI` here — DB-backed paths return 503 by design; that's the fail-fast contract, not a bug.

## Build / test
```bash
cd backend
~/workspace/venvs/ragnosis/bin/python -c "
import os; os.environ['APP_ENV']='testing'; os.environ['SECRET_KEY']='x'*32
from app import create_app; create_app()"   # must boot with no exceptions
cd ../frontend && npm run build              # must exit 0
```

## Conventions (non-negotiable)
- **Blueprints auto-register:** a package `app/<name>/` exposing `bp` is mounted at `/api/<name>` for `reports, chat, hospital, doctors, reminders`. Don't touch the factory loop.
- **Errors:** always `api_error("MACHINE_CODE", "human message", status)`. Never leak tracebacks.
- **DB:** access only via `app.db.get_db()` (module-attribute access so tests can monkeypatch). Never trust the client: ownership checks server-side, 403s audit-logged via `_audit`.
- **Auth:** `jwt_required` / `require_roles(...)` from `app/auth/decorators.py`. Passwords via `jwt_auth.hash_password` (bcrypt-12). Rate limits: `@limiter.limit(..., key_func=lambda: f"<scope>:{g.user['_id']}")` placed *below* `@require_roles` so `g.user` exists.
- **Uploads:** stored as `uploads/<sha256>.<ext>` — client filename never touches the filesystem. Magic-byte sniff before parsing.
- **AI pipeline (`app/ai/`):** pure functions, lazy imports, graceful fallbacks. NUMBERS ARE DETERMINISTIC — regex only. Generative models explain/converse. Every new stage records its method (`summary_method`, etc.).
- **No diagnostic claims anywhere** — educational tone + disclaimer on all AI surfaces.
- **Frontend:** same-origin `/api` only, tokens via `api/client.js`, no `dangerouslySetInnerHTML` ever (security-sensitive).

## Workflow
After each phase: `cd ~/workspace/ragnosis && ~/workspace/venvs/graphify/bin/graphify . --code-only && ~/workspace/venvs/graphify/bin/graphify cluster-only .`, then read `graphify-out/GRAPH_REPORT.md` and navigate from the graph. `graphify-out/` is gitignored.
