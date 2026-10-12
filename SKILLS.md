# Skills used by RAGnosis

All skills live in `~/workspace/skills/`. Read the `SKILL.md` before using —
the summaries below are pointers, not substitutes.

| Skill | Source | License | Use on this project |
|---|---|---|---|
| `ponytail` | `DietrichGebert/ponytail` | MIT | **Every coding task.** Anti-over-engineering: stdlib/platform first, smallest complete diff. Levels: lite/full/ultra. |
| `karpathy-guidelines` | `multica-ai/andrej-karpathy-skills` | MIT | **Every coding task.** Think-before-coding, simplicity-first, surgical edits, goal-driven verification. |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` | — | **Any UI work.** Searchable design intelligence (styles, palettes, type, UX rules). Search via `scripts/search.py "<query>" --design-system`. |
| `taste/` (13 skills) | `Leonxlnx/taste-skill` | MIT | **Frontend builds/redesigns.** Anti-slop direction: `taste-skill` (default), `minimalist-skill`, `image-to-code-skill`, `redesign-skill`, `brandkit`, etc. |
| `graphify` | `safishamsi/graphify` | — | **After every phase.** Codebase knowledge graph. CLI: `~/workspace/venvs/graphify/bin/graphify` (`graphifyy` 0.9.85). Read `graphify-out/GRAPH_REPORT.md`, navigate from `graph.html`. |
| `cloudflare-security-audit` | `cloudflare/security-audit-skill` | — | **Security reviews.** Multi-phase audit: recon → hunt → validate → report. Run-1 report: `~/security-audit-skill/ragnosis/run-1/REPORT.md`. |

## Trigger phrases
- "ponytail" / "be lazy" / "simplest solution" → ponytail
- UI looks generic / needs design direction → ui-ux-pro-max, then taste
- "map the codebase" / "where is X" → graphify `query`/`path`/`explain`
- "security audit" / "find vulnerabilities" → cloudflare-security-audit

## Notes
- Skills are guidance, not autopilot: the skill's own pre-delivery checklists
  (e.g. ui-ux-pro-max rejecting neumorphism on accessibility grounds) outrank
  convenience.
- Fixes from the security audit live in the code; the *rationale* lives in the
  run report — read it before touching auth, upload, or rate limiting.
