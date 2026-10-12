# PLACEHOLDERS — fill every item before submission

Paper: `main.tex` (IEEEtran, conference). Nothing in this list is optional for a
camera-ready or review submission.

## Author block (in main.tex)

- [ ] `[First Author]`, `[Second Author]`, `[Third Author]` — real names, in
      contribution order
- [ ] `[Guide Name]` — project guide's name (and title, if the venue wants it)
- [ ] `[Institution Name]` — college/institution name
- [ ] `[Department Name]` — department (appears twice: authors + guide)
- [ ] `[City]` — institution city (appears twice)
- [ ] `[email1]`, `[email2]`, `[email3]`, `[guide-email]`, `[institution-domain]`
      — real email addresses

Team names / roll numbers / guide / college were never filled in the project
handoff — get them from the team before submitting anywhere.

## Venue decision — PENDING (Yaseen to pick)

No venue has been chosen. Candidates surfaced earlier from conference
aggregators (dates **unverified** — check each official CFP before relying on
them or paying anything):

- IMIP 2027 — aggregator showed 2026-11-10
- IATMSI 2027 — aggregator showed 2026-12-20
- CIBCB 2027 — aggregator showed 2027-04-02

Once picked: set page-limit/format details in `main.tex` if the venue deviates
from stock IEEEtran conference defaults, and add the venue's copyright /
header requirements.

## Results still pending (do NOT submit with these open)

- [x] On-device numbers — DONE (2026-10-12): Table (`tab:ondevice`) now
      carries the measured values from `~/workspace/ragnosis/ml/`:
      FP32 90.4 MB / 5.6 ms, INT8 23.0 MB / 4.0 ms, cosine parity 0.993,
      retrieval top-1 agreement 1.00.
- [ ] Evaluation corpus results — Section VIII is a **protocol only**, by
      design. The corpus (hundreds of de-identified Indian-lab reports, dual
      clinician annotation) is explicitly out of scope for this draft. Before
      claiming any accuracy: fill in extraction precision/recall per
      parameter, status agreement, label F1, Cohen's kappa, and the
      dialogue-grounding rate, exactly as the protocol defines them.
- [ ] Ethics clearance reference for the corpus, if the venue requires one.

## Housekeeping

- [ ] Recompile after filling placeholders (`pdflatex main && bibtex main &&
      pdflatex main && pdflatex main`) and check the page count against the
      venue limit.
- [ ] Confirm every reference in `references.bib` renders (IEEEtran style)
      and no citation is orphaned.
