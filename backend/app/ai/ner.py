"""Stage 4 — BioBERT NER over free-text notes.

Tags conditions, drugs, and values. Advisory only: NER output never feeds
numeric extraction. Model missing or unloadable -> [] (never crashes).
"""
MODEL_ID = "dmis-lab/biobert-base-cased-v1.1"
_MAX_CHARS = 4000


def extract_entities(text):
    """Returns [{text, label, start, end}]."""
    if not text or not text.strip():
        return []
    try:
        from transformers import pipeline  # lazy

        ner = pipeline("ner", model=MODEL_ID, aggregation_strategy="simple")
    except Exception:
        return []  # transformers missing, model not cached, OOM, ...
    try:
        raw = ner(text[:_MAX_CHARS])
    except Exception:
        return []
    return [
        {"text": e.get("word", ""), "label": e.get("entity_group", ""),
         "start": e.get("start", 0), "end": e.get("end", 0)}
        for e in raw
    ]
