"""Stage 5 — summarization. BART abstractive summary GROUNDED on the extracted
metrics, with numeric verification: every number in the generated summary
must match an extracted metric value, or the sentence is dropped. If the
model is unavailable (or verification strips everything), fall back to an
extractive summary scored by metric-keyword density.

Returns (summary, method) with method in {"bart", "extractive"}.
"""
import re

MODEL_ID = "facebook/bart-large-cnn"


def _sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]


def _numbers(sentence):
    return [float(n.replace(",", "")) for n in re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", sentence)]


def _grounded_input(metrics):
    parts = [f"{m['param']} {m['value']} {m['unit']} ({m['status']})" for m in metrics]
    return "Lab report findings. " + ". ".join(parts) + "."


def _verify_numbers(summary, metrics):
    """Keep only sentences whose every number matches an extracted value."""
    values = {float(m["value"]) for m in metrics}
    kept = []
    for sent in _sentences(summary):
        if all(n in values for n in _numbers(sent)):
            kept.append(sent)
    return " ".join(kept)


def _extractive(metrics, text):
    if metrics:
        # Compose from the verified metrics — always available, always
        # specific to this report (never a raw text dump).
        total = len(metrics)
        normal = [m for m in metrics if m["status"] == "Normal"]
        flagged = [m for m in metrics if m["status"] != "Normal"]
        parts = [
            f"This report has {total} measured value{'s' if total != 1 else ''}; "
            f"{len(normal)} within the reference range, {len(flagged)} outside it."
        ]
        for m in flagged:
            parts.append(
                f"{m['param']} is {m['value']} {m['unit']}, which is {m['status'].lower()}."
            )
        if normal:
            listed = ", ".join(f"{m['param']} {m['value']} {m['unit']}" for m in normal)
            parts.append(f"Within range: {listed}.")
        return " ".join(parts)
    from .metrics import PARAMS  # local, stdlib-only

    synonyms = {s.lower() for p in PARAMS for s in p["synonyms"]}
    scored = []
    for sent in _sentences(text):
        low = sent.lower()
        density = sum(1 for s in synonyms if s in low)
        if density:
            scored.append((density, sent))
    if not scored:
        return "No readable clinical findings in this report."
    scored.sort(key=lambda t: -t[0])
    top = sorted(scored[:4], key=lambda t: text.index(t[1]))  # document order
    return " ".join(s for _, s in top)


def summarize(metrics, text):
    """Returns (summary, method). Never raises for missing models."""
    metrics = metrics or []
    try:
        from transformers import pipeline  # lazy

        gen = pipeline("summarization", model=MODEL_ID)
    except Exception:
        return _extractive(metrics, text), "extractive"
    try:
        out = gen(_grounded_input(metrics) + " " + (text or "")[:2000],
                  max_length=150, min_length=40, do_sample=False)[0]["summary_text"]
    except Exception:
        return _extractive(metrics, text), "extractive"
    verified = _verify_numbers(out, metrics)
    if not verified.strip():
        return _extractive(metrics, text), "extractive"
    return verified, "bart"
