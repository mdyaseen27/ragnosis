"""Deterministic clinical metric extraction — regex only, no neural nets.

Design rule: numbers are extracted by auditable rules. A neural model must
never touch a numeric value. Same input -> same output, every time.

Two-tier matching per parameter:
  1. primary:  <synonym> <separator (: - =)> <number> [unit]
  2. fallback: per-line loose scan, <synonym> ... <number> (dense tables)

Known failure modes, fixed by design (see project failure analysis):
  - "Fasting" must not match SGOT/AST: every synonym <= 4 chars uses \b word
    boundaries on both sides.
  - "HbA1c (Glycated Hemoglobin) 7.8" must not yield Hb=7.8: the Haemoglobin
    matcher skips any hit whose context mentions "glycated" or "hba1c".

Reference ranges are standard adult ranges (single range, not sex/age
stratified) — shortcut: coarse but auditable; stratify only if a clinician
validates it.
"""
import re

_NUMBER = r"([<>]?)\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
_UNIT = r"\s*([A-Za-z\u00b5\u03bc/%^0-9.\-]{0,14})"

# canonical param, synonyms, canonical unit, (low, high) or None, conversions, guards
PARAMS = [
    {"param": "Haemoglobin", "synonyms": ["haemoglobin", "hemoglobin", "hb", "hgb"],
     "unit": "g/dL", "range": (12.0, 16.0), "conv": {"g/l": 0.1},
     "skip_if": r"glycated|hba1c"},
    {"param": "WBC", "synonyms": ["wbc", "tlc", "total leucocyte count", "total leukocyte count"],
     "unit": "x10^3/\u00b5L", "range": (4.0, 11.0), "conv": {}, "raw_count": True},
    {"param": "RBC", "synonyms": ["rbc", "r.b.c", "total erythrocyte count"],
     "unit": "x10^6/\u00b5L", "range": (3.9, 5.5), "conv": {}},
    {"param": "Haematocrit", "synonyms": ["haematocrit", "hematocrit", "pcv"],
     "unit": "%", "range": (36.0, 47.0), "conv": {}},
    {"param": "Neutrophils %", "synonyms": ["neutrophils", "neutrophil"],
     "unit": "%", "range": (50.0, 70.0), "conv": {}, "skip_if": r"#"},
    {"param": "Lymphocytes %", "synonyms": ["lymphocytes", "lymphocyte"],
     "unit": "%", "range": (20.0, 40.0), "conv": {}, "skip_if": r"#"},
    {"param": "Neutrophils Abs", "synonyms": ["neutrophils#", "neutrophil#"],
     "unit": "x10^3/\u00b5L", "range": (2.0, 7.8), "conv": {}, "raw_count": True},
    {"param": "Lymphocytes Abs", "synonyms": ["lymphocytes#", "lymphocyte#"],
     "unit": "x10^3/\u00b5L", "range": (0.6, 4.1), "conv": {}, "raw_count": True},
    {"param": "Platelets", "synonyms": ["platelets", "platelet", "plt"],
     "unit": "x10^3/\u00b5L", "range": (150.0, 410.0), "conv": {}, "raw_count": True},
    {"param": "MCV", "synonyms": ["mcv"], "unit": "fL", "range": (83.0, 101.0), "conv": {}},
    {"param": "MCH", "synonyms": ["mch"], "unit": "pg", "range": (27.0, 32.0), "conv": {}},
    {"param": "MCHC", "synonyms": ["mchc"], "unit": "g/dL", "range": (31.5, 34.5), "conv": {}},
    {"param": "ESR", "synonyms": ["esr"], "unit": "mm/hr", "range": (0.0, 20.0), "conv": {}},
    {"param": "Glucose", "synonyms": ["glucose", "fasting blood sugar", "random blood sugar", "fbs", "rbs", "blood sugar"],
     "unit": "mg/dL", "range": (70.0, 140.0), "conv": {"mmol/l": 18.0, "mmol": 18.0}},
    {"param": "HbA1c", "synonyms": ["hba1c", "glycated hemoglobin", "glycated haemoglobin", "a1c"],
     "unit": "%", "range": (4.0, 5.6), "conv": {}},
    {"param": "Total Cholesterol", "synonyms": ["total cholesterol", "cholesterol"],
     "unit": "mg/dL", "range": (0.0, 200.0), "conv": {"mmol/l": 38.67},
     "skip_if": r"\bhdl\b|\bldl\b|\bvldl\b|non[\s-]?hdl"},
    {"param": "HDL Cholesterol", "synonyms": ["hdl"],
     "unit": "mg/dL", "range": (40.0, 100.0), "conv": {"mmol/l": 38.67}},
    {"param": "LDL Cholesterol", "synonyms": ["ldl"],
     "unit": "mg/dL", "range": (0.0, 100.0), "conv": {"mmol/l": 38.67}},
    {"param": "Triglycerides", "synonyms": ["triglycerides", "triglyceride", "tg"],
     "unit": "mg/dL", "range": (0.0, 150.0), "conv": {"mmol/l": 88.57}},
    {"param": "VLDL", "synonyms": ["vldl"], "unit": "mg/dL", "range": (2.0, 30.0), "conv": {}},
    {"param": "Creatinine", "synonyms": ["creatinine"],
     "unit": "mg/dL", "range": (0.6, 1.3), "conv": {"umol/l": 1 / 88.4}},
    {"param": "Urea", "synonyms": ["urea"], "unit": "mg/dL", "range": (17.0, 43.0), "conv": {}},
    {"param": "BUN", "synonyms": ["bun", "blood urea nitrogen"],
     "unit": "mg/dL", "range": (7.0, 20.0), "conv": {}},
    {"param": "Sodium", "synonyms": ["sodium", "na+"],
     "unit": "mmol/L", "range": (136.0, 145.0), "conv": {}},
    {"param": "Potassium", "synonyms": ["potassium", "k+"],
     "unit": "mmol/L", "range": (3.5, 5.1), "conv": {}},
    {"param": "Total Bilirubin", "synonyms": ["total bilirubin", "bilirubin total", "bilirubin"],
     "unit": "mg/dL", "range": (0.3, 1.2), "conv": {"umol/l": 1 / 17.1},
     "skip_if": r"direct|indirect"},
    {"param": "SGOT", "synonyms": ["sgot", "ast"], "unit": "U/L", "range": (10.0, 40.0), "conv": {}},
    {"param": "SGPT", "synonyms": ["sgpt", "alt"], "unit": "U/L", "range": (7.0, 56.0), "conv": {}},
    {"param": "ALP", "synonyms": ["alp", "alkaline phosphatase"],
     "unit": "U/L", "range": (44.0, 147.0), "conv": {}},
    {"param": "TSH", "synonyms": ["tsh"], "unit": "\u00b5IU/mL", "range": (0.4, 4.0), "conv": {}},
    {"param": "T3", "synonyms": ["t3", "triiodothyronine"],
     "unit": "ng/dL", "range": (80.0, 200.0), "conv": {}},
    {"param": "T4", "synonyms": ["t4", "thyroxine"],
     "unit": "\u00b5g/dL", "range": (5.1, 14.1), "conv": {}},
    {"param": "CRP", "synonyms": ["crp", "c-reactive protein", "c reactive protein"],
     "unit": "mg/L", "range": (0.0, 3.0), "conv": {}},
    {"param": "Vitamin D", "synonyms": ["vitamin d", "25-oh vitamin d", "25 hydroxyvitamin d"],
     "unit": "ng/mL", "range": (30.0, 100.0), "conv": {}},
    {"param": "Vitamin B12", "synonyms": ["vitamin b12", "b12", "cobalamin"],
     "unit": "pg/mL", "range": (200.0, 900.0), "conv": {}},
]

REFERENCE_RANGES = {
    p["param"]: {"low": p["range"][0], "high": p["range"][1], "unit": p["unit"]}
    for p in PARAMS if p.get("range")
}


def _syn_pattern(synonyms):
    alt = "|".join(re.escape(s).replace(r"\ ", r"\s+") for s in synonyms)
    return r"\b(?:" + alt + r")\b"


def _parse_number(sign, raw):
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _normalize(pdef, value, unit_raw):
    """Convert to the canonical unit. Unrecognized units are assumed canonical
    (most Indian labs use standard units) — documented, auditable."""
    u = (unit_raw or "").lower().replace("\u00b5", "u").replace("\u03bc", "u").strip().rstrip(".")
    if "lakh" in u or u.startswith("lac"):
        return value * 100.0  # 2.5 lakhs -> 250 x10^3/uL
    factor = pdef.get("conv", {}).get(u)
    if factor:
        return value * factor
    if pdef.get("raw_count") and value >= 1000.0 and u in ("", "/ul", "/cumm", "/mm3"):
        return value / 1000.0
    return value


def _status(pdef, value):
    rng = pdef.get("range")
    if not rng:
        return "Unknown"
    low, high = rng
    if value < low:
        return "Low"
    if value > high:
        return "High"
    return "Normal"


_PARAM_MAP = {p["param"]: p for p in PARAMS}


def status_for(param, value):
    """Canonical status for one value — used when a clinician corrects a
    value and its status must be recomputed exactly as extraction did."""
    pdef = _PARAM_MAP.get(param)
    return _status(pdef, value) if pdef else "Unknown"


def _try_match(pdef, text, primary):
    syn = _syn_pattern(pdef["synonyms"])
    if primary:
        rx = re.compile(syn + r"\s*[:\-=\u2013]\s*" + _NUMBER + _UNIT, re.IGNORECASE)
        haystacks = [text]
    else:
        rx = re.compile(syn + r"[^\d\n]{0,30}?" + _NUMBER + _UNIT, re.IGNORECASE)
        haystacks = text.splitlines()
    skip = pdef.get("skip_if")
    for hay in haystacks:
        for m in rx.finditer(hay):
            if skip:
                ctx = hay[max(0, m.start() - 60):m.end() + 60]
                if re.search(skip, ctx, re.IGNORECASE):
                    continue
            value = _parse_number(m.group(1), m.group(2))
            if value is None:
                continue
            return _normalize(pdef, value, m.group(3)), pdef["unit"]
    return None


def extract_metrics(text):
    """Extract clinical metrics. Returns [{param, value, unit, status}]."""
    if not text or not text.strip():
        return []
    out = []
    for pdef in PARAMS:
        hit = _try_match(pdef, text, primary=True) or _try_match(pdef, text, primary=False)
        if hit is None:
            continue
        value, unit = hit
        out.append({
            "param": pdef["param"],
            "value": value,
            "unit": unit,
            "status": _status(pdef, value),
        })
    if len(out) < 3:
        # Dense-table fallback (planner §8.2 "line-scan for dense tables"):
        # OCR of photographed reports often dumps a table column-wise — every
        # parameter name first, then every value. Per-line matching finds
        # nothing there, so pair names and values by their order instead.
        found = {m["param"] for m in out}
        out.extend(_sequence_pass(text, found))
    return out


# Row labels that appear in dense lab tables but are not displayed metrics.
# They keep name<->value positions aligned during sequence pairing (e.g. a
# "Mixed %" row sits between Lymphocytes % and Neutrophils # in 3-part CBCs).
_ANCHOR_LABELS = [
    "mixed", "eosinophils", "monocytes", "basophils",
    "rdw-sd", "rdw-cv", "rdw", "mpv", "pdw", "pdw-cv", "pct", "p-lcr", "p-lcc",
]
_DIFF_STEMS = ("neutrophils", "lymphocytes", "mixed", "eosinophils",
               "monocytes", "basophils")
_RANGE_RX = re.compile(r"(\d+(?:\.\d+)?)\s*[-\u2013]\s*(\d+(?:\.\d+)?)")
_NUM_RX = re.compile(r"\d+(?:\.\d+)?")
_UNIT_HINT = re.compile(
    r"(g/dl|mg/dl|ng/ml|pg/ml|miu/ml|iu/ml|u/l|mm/hr|mmol/l|fl|pg|%"
    r"|10\s*[\^*]?\s*[36]\s*/\s*(?:\u00b5|u)l|/\s*(?:\u00b5|u)l|x10)",
    re.IGNORECASE,
)
# Spans that are unit expressions, not results ("10*3/uL" holds two numbers
# that must never be read as values).
_UNIT_SPAN = re.compile(
    r"(?:x\s*)?10\s*(?:\^|\*)?\s*[36]\s*/\s*(?:\u00b5|\u03bc|u)l"
    r"|g/dl|mg/dl|ng/ml|pg/ml|miu/ml|iu/ml|mmol/l|umol/l|u/l|mm/hr",
    re.IGNORECASE,
)
_BY_PARAM = {p["param"]: p for p in PARAMS}


def _name_sequence(text):
    """Ordered (position, key, pdef|None) for known names in the text.

    Column dumps list each row once; first occurrence of a key wins so a
    section header ("WBC COUNT") and its row ("Total WBC Count") collapse
    to a single entry. Differential stems keep their % / # rows distinct:
    a bare "Neutrophils" followed by '#' is the absolute-count row.
    """
    occ = []
    scan = [(p["param"], p, p["synonyms"]) for p in PARAMS]
    scan += [(f"anchor:{a}", None, [a]) for a in _ANCHOR_LABELS]
    for key, pdef, synonyms in scan:
        rx = re.compile(_syn_pattern(synonyms), re.IGNORECASE)
        for m in rx.finditer(text):
            marker = text[m.end():m.end() + 2].lstrip()[:1]
            k = key
            if marker == "#" and key in ("Neutrophils %", "Lymphocytes %"):
                k = key.replace(" %", " Abs")
            elif marker in ("%", "#") and key.startswith("anchor:"):
                stem = key.split(":")[-1].split(" ")[0].lower()
                if stem in _DIFF_STEMS:
                    k = f"{key}{marker}"
            occ.append((m.start(), m.end(), k, _BY_PARAM.get(k)))
    # Longest match wins at a shared start ("RDW-SD" over "RDW"), then the
    # first occurrence of each key wins overall.
    occ.sort(key=lambda t: (t[0], -(t[1] - t[0])))
    seen_pos, seen_key, seq = set(), set(), []
    for pos, _end, key, pdef in occ:
        if pos in seen_pos or key in seen_key:
            continue
        seen_pos.add(pos)
        seen_key.add(key)
        seq.append((pos, key, pdef))
    seq.sort(key=lambda t: t[0])
    return seq


def _value_sequence(text, start):
    """Ordered standalone values at/after `start`.

    Numbers inside a printed reference range ("12.0 - 16.0") are not values.
    A candidate only counts if a unit or a range follows it closely — that
    filters letterhead numbers, dates and device model names ("C60").
    Each value carries the printed range that follows it, when present.
    """
    ranges = [(m.start(), m.end(), float(m.group(1)), float(m.group(2)))
              for m in _RANGE_RX.finditer(text)]
    unit_spans = [m.span() for m in _UNIT_SPAN.finditer(text)]

    def blocked(s, e):
        if any(s >= rs and e <= re_ for rs, re_, *_ in ranges):
            return True
        return any(s < ue and e > us for us, ue in unit_spans)

    values = []
    for m in _NUM_RX.finditer(text, start):
        s, e = m.span()
        if blocked(s, e):
            continue
        rng = next((r for r in ranges if 0 <= r[0] - e <= 30), None)
        unit_m = _UNIT_HINT.search(text[e:e + 16])
        if not unit_m and not rng:
            continue
        values.append({
            "value": float(m.group()),
            "printed": (rng[2], rng[3]) if rng else None,
            "unit_raw": unit_m.group() if unit_m else "",
        })
    return values


def _sequence_pass(text, found):
    """Pair the i-th known name with the i-th value (column-dump layout).

    A pair is emitted only when it validates: the printed range must overlap
    the canonical range and contain (roughly) the value, or, with no printed
    range, the value must sit in a plausible band around the canonical
    range. Failed pairs are dropped individually — positions never shift,
    so one bad row cannot corrupt the rest, and a wrong value is never
    presented as fact.
    """
    names = _name_sequence(text)
    if len(names) < 4:
        return []
    values = _value_sequence(text, names[0][0])
    out = []
    for (_, key, pdef), val in zip(names, values):
        if pdef is None or key in found:
            continue
        rng = pdef.get("range")
        v = _validated_value(pdef, val)
        if v is None:
            continue
        nv = _normalize(pdef, v, val["unit_raw"])
        out.append({
            "param": pdef["param"],
            "value": nv,
            "unit": pdef["unit"],
            "status": _status(pdef, nv),
        })
    return out


def _validated_value(pdef, val):
    """Return the (possibly rescaled) value if the pairing validates.

    Indian labs print counts two ways — 252 x10^3/uL or 2.52 lakh/uL with a
    1.50-4.10 range — so a pair may validate at scale 1 or 100. The printed
    range must overlap the canonical range at that scale and the value must
    sit plausibly inside the printed range; without a printed range the
    value must sit in a loose band around the canonical range.
    """
    rng = pdef.get("range")
    if not rng:
        return val["value"]
    v = val["value"]
    for f in (1.0, 100.0):
        if val["printed"]:
            plo, phi = val["printed"][0] * f, val["printed"][1] * f
            if plo <= rng[1] and phi >= rng[0] and plo * 0.3 <= v * f <= phi * 3.0:
                return v * f
        elif rng[0] * 0.4 <= v * f <= rng[1] * 2.5:
            return v * f
    return None

