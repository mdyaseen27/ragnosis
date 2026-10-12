"""Orchestrator — ONE code path for every upload.

Patient upload, receptionist upload, mobile upload: all run through
process_report(). No duplicate implementations, no sync middleware.
Each stage degrades gracefully; the pipeline never crashes on a missing
model or dependency — it records which method was actually used.
"""
import time

from .extract_text import extract_text
from .metrics import extract_metrics
from .classify import classify, classify_labels, ensure_primary
from .ner import extract_entities
from .summarize import summarize
from .alerts import critical_flags, suggest_specialists
from .score import health_score

PIPELINE_VERSION = "1.1.0"


def process_report(file_bytes, mime, patient_id):
    """Runs the full pipeline. Returns a dict matching the reports
    collection schema (the API layer adds _id/patient_id/uploaded_by)."""
    t0 = time.perf_counter()

    raw_text, extraction_method = extract_text(file_bytes, mime)
    metrics = extract_metrics(raw_text)
    category, category_scores = classify(raw_text, metrics)
    labels = ensure_primary(classify_labels(raw_text, metrics),
                            category, category_scores, metrics)
    try:
        entities = extract_entities(raw_text)
    except Exception:
        entities = []
    try:
        summary, summary_method = summarize(metrics, raw_text)
    except Exception:
        summary, summary_method = "Summary unavailable.", "extractive"
    score, band = health_score(metrics)

    # Referrals across every detected panel, primary first, deduped.
    referrals, seen_specs = [], set()
    for cat in [category] + [l["category"] for l in labels]:
        for ref in suggest_specialists(cat):
            if ref["specialization"] not in seen_specs:
                seen_specs.add(ref["specialization"])
                referrals.append(ref)

    return {
        "raw_text": raw_text,
        "extraction_method": extraction_method,
        "metrics": metrics,
        "category": category,
        "category_scores": category_scores,
        "labels": labels,
        "entities": entities,
        "summary": summary,
        "summary_method": summary_method,
        "health_score": score,
        "health_band": band,
        "critical_flags": critical_flags(metrics),
        "referrals": referrals,
        "pipeline_version": PIPELINE_VERSION,
        "processing_ms": int((time.perf_counter() - t0) * 1000),
    }
