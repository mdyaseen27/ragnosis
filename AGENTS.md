# AGENTS.md — instructions for AI agents on this repo

You are working on **RAGnosis**, a production-grade medical report analysis +
hospital management platform. Patients' medical data is involved: be careful,
be precise, never fabricate.

## Mandatory reading order
1. `SKILLS.md` — which skills exist here and when each fires.
2. The skill files themselves (`~/workspace/skills/<name>/SKILL.md`).
3. `ARCHITECTURE.md`, then `DATABASE.md` for the area you're touching.

## Operating rules
- **ponytail + karpathy-guidelines are always on.** Smallest complete change,
  no speculative abstractions, verify with a test or a run. Every changed line
  must trace to the request.
- **Never weaken a trust boundary.** Auth, RBAC, ownership checks, upload
  validation, and rate limits are load-bearing. If a change touches them, say
  so explicitly and re-verify with the relevant checks.
- **Deterministic core.** `app/ai/metrics.py`, `classify.py`, `alerts.py`,
  `score.py` are pure functions — same input, same output. No ML in the
  numeric path, ever.
- **Graceful degradation.** Any new external dependency (model, API, binary)
  must be lazily imported with a working fallback. The app must boot and serve
  with zero optional deps installed.
- **No secrets in code.** Everything from the environment (`.env`, never git).
- **No diagnostic authority.** No output may state or imply a diagnosis.
  Educational tone + disclaimer, always.

## Boundaries
- Don't restructure the factory, config, or error-handling without asking.
- Don't add dependencies for a few lines of code.
- Don't "improve" unrelated code you happen to read (karpathy surgical rule).
- Frontend: no new UI-kit dependencies; design tokens in `src/styles.css` only.

## After each phase
Rebuild the knowledge graph and read from it (see `CLAUDE.md` workflow).
Then summarize: files changed, tests run, what you skipped, risks.
