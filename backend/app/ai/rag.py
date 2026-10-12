"""Stage 6 — report-grounded question answering.

The patient is asking about THEIR report, so the extracted values are the
primary context — not an afterthought. Answer order:

  0. guardrails (empty question / diagnosis request)
  1. Groq LLaMA-3.3-70B with the structured report context (extracted
     values, summary, health score) + any retrieved KB passages
  2. deterministic answers built directly from the extracted metrics —
     no external dependency, works with zero optional packages installed
  3. curated educational lookup keyed by parameter name
  4. safe educational redirect

The raw OCR/PDF text is only ever a tail excerpt for the LLM: for photo
reports it is a garbled column-wise dump, while the metrics are the
audited source of truth. Diagnosis and prescription requests are
intercepted before any answerer runs — the assistant explains the
patient's own values, it never interprets them into a condition.
"""
import os
import re

EMBED_MODEL = "all-MiniLM-L6-v2"
CHAT_MODEL = "llama-3.3-70b-versatile"
TOP_K = 5

DISCLAIMER = ("Educational information only — this is not medical advice and "
              "not a diagnosis. Please consult a qualified doctor.")

_DIAGNOSIS_RX = re.compile(
    r"\bdo i have\b|\bam i (suffering|diagnosed)\b|\bdiagnose me\b|"
    r"\bwhat('s| is) wrong with me\b|\bwhat disease\b|\bdo you think i have\b",
    re.IGNORECASE)

# Hand-curated educational passages keyed by parameter token.
CURATED_QA = {
    "ldl": ("LDL cholesterol is often called 'bad' cholesterol because high levels "
            "are linked with plaque build-up in arteries. It is lowered through diet, "
            "exercise, and — when a doctor advises — medication."),
    "hdl": ("HDL cholesterol is often called 'good' cholesterol because it helps carry "
            "cholesterol away from the arteries. Higher values are generally better."),
    "cholesterol": ("Cholesterol is a waxy substance in blood. Total cholesterol combines "
                    "HDL, LDL, and part of triglycerides; doctors interpret it alongside "
                    "the individual fractions."),
    "triglyceride": ("Triglycerides are fats in blood that rise after eating. Persistently "
                     "high values are linked with cardiovascular risk and are usually managed "
                     "with diet, exercise, and weight control."),
    "haemoglobin": ("Haemoglobin is the protein in red blood cells that carries oxygen. "
                    "Low values can indicate anaemia; high values can reflect dehydration or "
                    "other conditions a doctor should evaluate."),
    "hemoglobin": ("Haemoglobin is the protein in red blood cells that carries oxygen. "
                   "Low values can indicate anaemia; high values can reflect dehydration or "
                   "other conditions a doctor should evaluate."),
    "glucose": ("Blood glucose is the sugar circulating in blood. Fasting values are "
                "normally 70–100 mg/dL. Repeated high readings need a doctor's evaluation "
                "for diabetes."),
    "hba1c": ("HbA1c reflects average blood sugar over ~3 months. Below 5.7% is normal; "
              "5.7–6.4% suggests prediabetes; 6.5% and above suggests diabetes — a doctor "
              "confirms with repeat testing."),
    "tsh": ("TSH (thyroid-stimulating hormone) controls the thyroid gland. High TSH with "
            "low T3/T4 can indicate hypothyroidism; low TSH can indicate hyperthyroidism. "
            "A doctor interprets the full panel."),
    "creatinine": ("Creatinine is a waste product filtered by the kidneys. High values can "
                   "signal reduced kidney function and always need a doctor's review."),
    "platelet": ("Platelets help blood clot. Very low counts raise bleeding risk; very high "
                 "counts can raise clotting risk. Either extreme needs medical attention."),
    "wbc": ("WBC (white blood cells) fight infection. High counts often mean infection or "
            "inflammation; low counts can mean bone-marrow or immune issues."),
}

# Extra names patients actually type, keyed by canonical metric (lowercase).
_ALIASES = {
    "haemoglobin": ["hemoglobin", "hb"],
    "haematocrit": ["hematocrit", "pcv", "packed cell volume"],
    "platelets": ["platelet", "platelet count", "plt"],
    "wbc": ["white blood cell", "white cells", "total leucocyte", "tlc"],
    "rbc": ["red blood cell", "red cells"],
    "neutrophils %": ["neutrophil", "neutrophils"],
    "lymphocytes %": ["lymphocyte", "lymphocytes"],
    "neutrophils abs": ["absolute neutrophil", "anc"],
    "lymphocytes abs": ["absolute lymphocyte", "alc"],
    "hba1c": ["a1c", "glycated haemoglobin", "glycated hemoglobin"],
    "total cholesterol": ["cholesterol"],
    "triglycerides": ["triglyceride", "tg"],
}

SYSTEM_PROMPT = (
    "You are a medical-report explainer with access to the patient's own "
    "extracted report values. Rules:\n"
    "1. Answer the patient's question about THEIR report directly, using the "
    "extracted values provided — quote numbers exactly as given.\n"
    "2. Use retrieved passages only for general background education.\n"
    "3. NEVER diagnose, never say the patient has a disease, never prescribe "
    "or suggest a dosage. For out-of-range values, suggest discussing them "
    "with their doctor.\n"
    "4. Be specific and complete — list every value the question touches. "
    "Do not deflect to generic advice when the data is in front of you.\n"
    "5. End with: '" + DISCLAIMER + "'")


def _is_diagnosis_request(question):
    return bool(_DIAGNOSIS_RX.search(question))


# --------------------------------------------------------------------------
# Structured report context
# --------------------------------------------------------------------------

def _st(m):
    """The pipeline stores Title-case statuses ('Normal'/'Low'/'High')."""
    return (m.get("status") or "").lower()


def _fmt_range(m):
    lo, hi = m.get("low"), m.get("high")
    if lo is None or hi is None:
        # Stored metrics carry no range of their own — fall back to the
        # canonical reference range the pipeline classified against.
        rng = _canonical_range(m.get("param"))
        if rng:
            lo, hi = rng
    if lo is not None and hi is not None:
        return f"{lo:g}–{hi:g}"
    if hi is not None:
        return f"up to {hi:g}"
    if lo is not None:
        return f"from {lo:g}"
    return ""


_CANONICAL = None


def _canonical_range(param):
    global _CANONICAL
    if _CANONICAL is None:
        try:
            from .metrics import PARAMS

            _CANONICAL = {p["param"].lower(): p.get("range") for p in PARAMS}
        except Exception:
            _CANONICAL = {}
    return _CANONICAL.get((param or "").lower())


def _fmt_value(m):
    v = m.get("value")
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)


def _status_phrase(m):
    return {"normal": "within the reference range",
            "low": "below the reference range",
            "high": "above the reference range"}.get(_st(m), "")


def _report_block(report):
    """Clean, LLM-ready rendering of the extracted report data."""
    if not report:
        return ""
    lines = [f"Report: {report.get('file_name') or 'uploaded report'}"
             f" · Category: {report.get('category') or 'general'}"
             f" · Health score: {report.get('health_score', 0)}/100"]
    if report.get("summary"):
        lines.append(f"Summary: {report['summary']}")
    lines.append("Extracted values (the patient's own results):")
    for m in report.get("metrics") or []:
        rng = _fmt_range(m)
        lines.append(
            f"- {m.get('param')}: {_fmt_value(m)} {m.get('unit', '')}".rstrip()
            + (f" (reference {rng} {m.get('unit', '')})".replace("  ", " ") if rng else "")
            + f" — {_status_phrase(m)}")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Deterministic answers from the extracted metrics (no external deps)
# --------------------------------------------------------------------------

def _match_metrics(question, metrics):
    q = " " + question.lower() + " "
    hits = []
    for m in metrics or []:
        name = (m.get("param") or "").lower()
        if not name:
            continue
        keys = {name, name.replace(" %", ""), name.rstrip("s")}
        keys.update(_ALIASES.get(name, []))
        if any(re.search(r"\b" + re.escape(k) + r"\b", q) for k in keys if k):
            hits.append(m)
    return hits


def _curated_for(param, question):
    """Educational passage for a parameter, if one is curated."""
    hay = (param + " " + question).lower()
    for token, passage in CURATED_QA.items():
        if token in hay:
            return passage
    return None


def _flagged(metrics):
    return [m for m in metrics or [] if _st(m) in ("low", "high")]


def _value_line(m):
    rng = _fmt_range(m)
    line = (f"{m.get('param')}: {_fmt_value(m)} {m.get('unit', '')}".rstrip()
            + f" — {_status_phrase(m)}"
            + (f" (reference {rng} {m.get('unit', '')})".replace("  ", " ") if rng else "")
            + ".")
    return line


def _report_answer(question, report):
    """Answer from the patient's own extracted data. Returns
    (text, citations, model) or None when the question isn't about the data."""
    if not report or not report.get("metrics"):
        return None
    metrics = report["metrics"]
    q = question.lower()
    cite = [{"chunk_id": "report", "topic": "Your report"}]

    # Whole-report intents first — they mention no single parameter.
    if re.search(r"\b(score|overall|how (am i|is my health)|doing)\b", q):
        flagged = _flagged(metrics)
        ok = len(metrics) - len(flagged)
        text = (f"Your health score for this report is {report.get('health_score', 0)}/100 — "
                f"{ok} of {len(metrics)} values are within their reference range.")
        if flagged:
            text += " The values outside range are: " + "; ".join(
                f"{m.get('param')} {_fmt_value(m)} {m.get('unit', '')}".rstrip()
                + f" ({m.get('status')})" for m in flagged) + "."
        return text, cite, "report-data"

    if re.search(r"\b(abnormal|out of range|flag|attention|worried|concern|problem|wrong|bad|high or low|not normal)\b", q):
        flagged = _flagged(metrics)
        if not flagged:
            return (f"Good news on this one: all {len(metrics)} extracted values are within "
                    f"their reference ranges (health score {report.get('health_score', 0)}/100). "
                    "That doesn't rule out anything a blood test can't see — keep up routine "
                    "check-ups with your doctor.", cite, "report-data")
        lines = [f"{len(flagged)} of {len(metrics)} values are outside their reference range:"]
        for m in flagged:
            lines.append("• " + _value_line(m))
        lines.append("Worth raising these with your doctor at your next visit — a single "
                     "out-of-range value is information, not a diagnosis.")
        return "\n".join(lines), cite, "report-data"

    if re.search(r"\b(summar|explain|about|say|mean|interpret|understand|overview)\b", q) and \
            re.search(r"\b(report|result|test|blood)\b", q):
        parts = []
        if report.get("summary"):
            parts.append(report["summary"])
        flagged = _flagged(metrics)
        if flagged:
            parts.append("Values outside range: " + "; ".join(
                f"{m.get('param')} {_fmt_value(m)} {m.get('unit', '')}".rstrip()
                + f" ({m.get('status')}, reference {_fmt_range(m)})" for m in flagged) + ".")
        else:
            parts.append(f"All {len(metrics)} extracted values are within range.")
        parts.append(f"Health score: {report.get('health_score', 0)}/100. Ask me about any "
                     "specific value — for example, “what is my "
                     f"{metrics[0].get('param')}?”")
        return " ".join(parts), cite, "report-data"

    # Parameter-specific questions — the core case.
    hits = _match_metrics(question, metrics)
    if hits:
        out = []
        for m in hits:
            line = _value_line(m)
            passage = _curated_for(m.get("param", ""), question)
            if passage:
                line += " " + passage
            if _st(m) in ("low", "high"):
                line += " Worth discussing with your doctor."
            out.append(line)
        return "\n".join(out), cite, "report-data"

    # Comparison / listing questions.
    if re.search(r"\b(all|list|show|what are|values|results|parameters)\b", q):
        lines = [f"Here is everything extracted from this report "
                 f"(health score {report.get('health_score', 0)}/100):"]
        for m in metrics:
            lines.append("• " + _value_line(m))
        return "\n".join(lines), cite, "report-data"

    return None


def _curated_answer(question, report=None):
    q = question.lower()
    for token, passage in CURATED_QA.items():
        if token in q:
            prefix = ""
            if report:
                for m in _match_metrics(question, report.get("metrics")):
                    prefix = _value_line(m) + " "
                    break
            return (prefix + passage,
                    [{"chunk_id": f"curated-{token}", "topic": token}],
                    "curated-fallback")
    if report and report.get("metrics"):
        names = ", ".join(m.get("param", "") for m in report["metrics"][:6])
        return (f"I can answer questions about this report's values — try asking about a "
                f"specific one (it includes {names}), or ask “which of my values are out "
                "of range?” or “explain my report”. For anything beyond your report, a "
                "doctor is the right person to ask.", [], "report-data")
    return ("I can answer questions about your report's values and general lab "
            "education. Try asking what a specific value (e.g. LDL, HbA1c) means. "
            + DISCLAIMER, [], "curated-fallback")


# --------------------------------------------------------------------------
# Retrieval + LLM (enhancements — the answer never depends on them)
# --------------------------------------------------------------------------

def _retrieve(question, report_text, kb_chunks):
    """Returns (contexts, citations). Raises on missing deps."""
    from sentence_transformers import SentenceTransformer  # lazy
    import faiss  # lazy
    import numpy as np  # lazy

    chunks = kb_chunks or []
    if not chunks:
        raise ValueError("no KB chunks")
    model = SentenceTransformer(EMBED_MODEL)
    emb = model.encode([c["text"] for c in chunks], normalize_embeddings=True)
    index = faiss.IndexFlatIP(emb.shape[1])
    index.add(np.asarray(emb, dtype="float32"))
    qv = model.encode([question + " " + (report_text or "")[:500]],
                      normalize_embeddings=True).astype("float32")
    _, idx = index.search(qv, min(TOP_K, len(chunks)))
    picked = [chunks[i] for i in idx[0] if 0 <= i < len(chunks)]
    contexts = [c["text"] for c in picked]
    citations = [{"chunk_id": c.get("chunk_id", ""), "topic": c.get("topic", "")}
                 for c in picked]
    return contexts, citations


def _groq_answer(question, report, report_text, contexts):
    from groq import Groq  # lazy

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")
    client = Groq(api_key=api_key)
    parts = []
    block = _report_block(report)
    if block:
        parts.append(block)
    elif report_text:
        parts.append(f"Report excerpt:\n{report_text[:1200]}")
    if contexts:
        parts.append("Retrieved background:\n" + "\n---\n".join(contexts))
    parts.append(f"Question: {question}")
    resp = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT},
                  {"role": "user", "content": "\n\n".join(parts)}],
        temperature=0.2, max_tokens=600)
    return resp.choices[0].message.content.strip()


def answer(question, report_text="", kb_chunks=None, report=None):
    """Returns (text, citations, model). Never raises, never fabricates."""
    q = (question or "").strip()
    if not q:
        return "Please ask a question about your report.", [], "guardrail"
    if _is_diagnosis_request(q):
        pivot = ""
        if report and report.get("metrics"):
            flagged = _flagged(report["metrics"])
            if flagged:
                pivot = (" The values in your report that sit outside their reference "
                         "range are: " + "; ".join(
                             f"{m.get('param')} {_fmt_value(m)} {m.get('unit', '')}".rstrip()
                             + f" ({m.get('status')})" for m in flagged)
                         + " — I can explain what each of them measures.")
            else:
                pivot = (" All values extracted from your report are within their "
                         "reference ranges, and I can explain any of them.")
        return ("I can't diagnose conditions — only a doctor who examines you can do "
                "that. What I can do is explain your report's values in plain "
                "language." + pivot, [], "guardrail")

    # 1) LLM with the structured report context, when a key is configured.
    if os.environ.get("GROQ_API_KEY"):
        contexts, citations = [], []
        try:
            contexts, citations = _retrieve(q, report_text, kb_chunks)
        except Exception:
            pass  # retrieval is an enhancement; the report context is primary
        try:
            return _groq_answer(q, report, report_text, contexts), citations, CHAT_MODEL
        except Exception:
            pass  # fall through to the deterministic answerer

    # 2) Deterministic answers from the patient's own extracted values.
    hit = _report_answer(q, report)
    if hit:
        return hit

    # 3) Curated education, personalised with their value when possible.
    return _curated_answer(q, report)
