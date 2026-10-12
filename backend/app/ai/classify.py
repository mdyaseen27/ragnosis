"""Zero-shot report classification: keyword scoring over 13 categories.

No labeled training data needed — a new report type means a longer keyword
list, not a retrained model. Tie or no match -> "General Medical Report".
Extracted metrics add a +3 boost per metric via PARAM_CATEGORY so a clean
table classifies correctly even with terse text.
"""
import re

CATEGORIES = {
    "CBC": ["complete blood count", "cbc", "haemoglobin", "hemoglobin", "wbc", "tlc",
            "rbc", "platelet", "mcv", "mch", "mchc", "esr", "pcv", "dlc",
            "neutrophil", "lymphocyte", "haematocrit"],
    "Lipid Profile": ["lipid", "cholesterol", "hdl", "ldl", "triglyceride", "vldl"],
    "Kidney Function": ["kidney", "creatinine", "urea", "bun", "egfr", "kft"],
    "Liver Function": ["liver", "bilirubin", "sgot", "sgpt", "alp", "albumin", "lft"],
    "Thyroid Panel": ["thyroid", "tsh", "t3", "t4", "ft3", "ft4"],
    "Diabetes Panel": ["diabetes", "glucose", "hba1c", "fasting", "fbs", "ppbs",
                       "rbs", "insulin", "glycated"],
    "Urine Analysis": ["urine", "pus cells", "ketone", "urobilinogen", "proteinuria"],
    "Radiology": ["x-ray", "xray", "ultrasound", "usg", "ct scan", "mri",
                  "radiology", "radiograph"],
    "Cardiac Markers": ["troponin", "ck-mb", "ckmb", "bnp", "cardiac", "myoglobin"],
    "Electrolytes": ["electrolyte", "sodium", "potassium", "chloride", "calcium",
                     "magnesium", "phosphorus"],
    "Vitamins": ["vitamin", "25-oh", "b12", "folate", "folic acid"],
    "Hormones": ["hormone", "testosterone", "estrogen", "progesterone",
                 "prolactin", "cortisol", "fsh"],
    "General Medical Report": [],
}

PARAM_CATEGORY = {
    "Haemoglobin": "CBC", "WBC": "CBC", "RBC": "CBC", "Platelets": "CBC",
    "MCV": "CBC", "MCH": "CBC", "MCHC": "CBC", "ESR": "CBC",
    "Total Cholesterol": "Lipid Profile", "HDL Cholesterol": "Lipid Profile",
    "LDL Cholesterol": "Lipid Profile", "Triglycerides": "Lipid Profile",
    "VLDL": "Lipid Profile",
    "Creatinine": "Kidney Function", "Urea": "Kidney Function", "BUN": "Kidney Function",
    "Total Bilirubin": "Liver Function", "SGOT": "Liver Function",
    "SGPT": "Liver Function", "ALP": "Liver Function",
    "TSH": "Thyroid Panel", "T3": "Thyroid Panel", "T4": "Thyroid Panel",
    "Glucose": "Diabetes Panel", "HbA1c": "Diabetes Panel",
    "Sodium": "Electrolytes", "Potassium": "Electrolytes",
    "Vitamin D": "Vitamins", "Vitamin B12": "Vitamins",
}

METRIC_BOOST = 3


def _hits(keyword, text):
    # Word boundaries everywhere: "ast" must not match "Fasting", "t3" not "ft3".
    return len(re.findall(r"\b" + re.escape(keyword) + r"\b", text, re.IGNORECASE))


def classify(text, metrics):
    """Returns (label, scores) with all 13 category scores."""
    text = text or ""
    scores = {cat: 0 for cat in CATEGORIES}
    for cat, keywords in CATEGORIES.items():
        scores[cat] = sum(_hits(kw, text) for kw in keywords)
    for m in metrics or []:
        cat = PARAM_CATEGORY.get(m.get("param"))
        scores[cat if cat else "General Medical Report"] += METRIC_BOOST
    best = max(scores.values())
    winners = [c for c, s in scores.items() if s == best and c != "General Medical Report"]
    label = winners[0] if best > 0 and len(winners) == 1 else "General Medical Report"
    return label, scores


LABEL_MIN_SCORE = 9      # combined-evidence floor for a metric-backed panel
LABEL_TEXT_MIN_HITS = 5  # keyword-only floor (panels with no extractable metrics)


def _evidence(text, metrics):
    """Per-category evidence: keyword hits and distinct extracted params."""
    kw = {cat: sum(_hits(k, text or "") for k in kws) for cat, kws in CATEGORIES.items()}
    params = {cat: set() for cat in CATEGORIES}
    for m in metrics or []:
        cat = PARAM_CATEGORY.get(m.get("param"))
        if cat:
            params[cat].add(m.get("param"))
    return kw, params


def classify_labels(text, metrics):
    """Multi-label classification: every panel whose evidence stands alone.

    Real reports bundle panels (one PDF, a CBC + lipid + thyroid), so a
    single winner mislabels them. A category earns a label when:
      * at least 2 distinct extracted parameters belong to the panel, or
      * its combined score >= 9 with at least 1 extracted parameter, or
      * keyword hits >= 5 with no metrics (text-declared panels such as
        Radiology, which yield no extractable values).
    Confidence is an evidence-strength score, score / (score + 6) — not a
    probability. Ordering is deterministic: score, then parameter count,
    then name. classify() above is unchanged and still yields the
    report's primary category.
    """
    kw, params = _evidence(text, metrics)
    labels = []
    for cat in CATEGORIES:
        if cat == "General Medical Report":
            continue
        n_params = len(params[cat])
        score = kw[cat] + METRIC_BOOST * n_params
        if (n_params >= 2
                or (score >= LABEL_MIN_SCORE and n_params >= 1)
                or (n_params == 0 and kw[cat] >= LABEL_TEXT_MIN_HITS)):
            labels.append({
                "category": cat,
                "score": score,
                "confidence": round(score / (score + 6), 2),
                "metrics": sorted(params[cat]),
                "keyword_hits": kw[cat],
            })
    labels.sort(key=lambda l: (-l["score"], -len(l["metrics"]), l["category"]))
    return labels


def ensure_primary(labels, category, scores, metrics):
    """Guarantee the primary category appears in the label list — it can
    win the single-label vote on evidence too thin for a standalone label
    (e.g. one parameter plus a few keywords)."""
    if category == "General Medical Report" or any(
            l["category"] == category for l in labels):
        return labels
    score = (scores or {}).get(category, 0)
    params = sorted({m.get("param") for m in metrics or []
                     if PARAM_CATEGORY.get(m.get("param")) == category})
    labels = labels + [{
        "category": category,
        "score": score,
        "confidence": round(score / (score + 6), 2) if score else 0.0,
        "metrics": params,
        "keyword_hits": 0,
    }]
    labels.sort(key=lambda l: (-l["score"], -len(l["metrics"]), l["category"]))
    return labels
