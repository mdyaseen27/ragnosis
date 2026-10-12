"""Critical-value detection with FIXED, auditable thresholds — no ML.

A threshold is readable and a model is not, so critical values never go
through a learned component. Severity in {"critical", "warning"}.
"""
# (param, operator, threshold, severity) — thresholds in canonical units
CRITICAL_RULES = [
    ("Haemoglobin", "lt", 7.0, "critical"),
    ("Glucose", "gt", 400.0, "critical"),
    ("Platelets", "lt", 20.0, "critical"),
    ("Sodium", "lt", 120.0, "critical"),
    ("Sodium", "gt", 160.0, "critical"),
    ("Potassium", "lt", 2.5, "critical"),
    ("Potassium", "gt", 6.5, "critical"),
    ("Creatinine", "gt", 5.0, "critical"),
    ("Total Bilirubin", "gt", 12.0, "warning"),
    ("HbA1c", "gt", 10.0, "warning"),
    ("LDL Cholesterol", "gt", 190.0, "warning"),
    ("Triglycerides", "gt", 500.0, "warning"),
    ("TSH", "gt", 10.0, "warning"),
]

SPECIALIST_MAP = {
    "Diabetes Panel": ["Endocrinologist", "Diabetologist", "General Physician"],
    "Thyroid Panel": ["Endocrinologist", "General Physician"],
    "Lipid Profile": ["Cardiologist", "General Physician"],
    "Kidney Function": ["Nephrologist", "General Physician"],
    "Liver Function": ["Gastroenterologist", "General Physician"],
    "CBC": ["Hematologist", "General Physician"],
    "Cardiac Markers": ["Cardiologist", "General Physician"],
    "Hormones": ["Endocrinologist", "General Physician"],
    "Electrolytes": ["General Physician", "Nephrologist"],
}


def critical_flags(metrics):
    """Returns [{param, value, threshold, severity}]."""
    flags = []
    for m in metrics or []:
        for param, op, threshold, severity in CRITICAL_RULES:
            if m.get("param") != param:
                continue
            hit = m["value"] < threshold if op == "lt" else m["value"] > threshold
            if hit:
                flags.append({
                    "param": param,
                    "value": m["value"],
                    "threshold": f"{'<' if op == 'lt' else '>'} {threshold} {m.get('unit', '')}".strip(),
                    "severity": severity,
                })
    return flags


def suggest_specialists(category):
    """Maps a report category to relevant specializations. Shape matches the
    reports collection: [{specialization, doctors}] — doctors are filled from
    the directory by the API layer."""
    specs = SPECIALIST_MAP.get(category, ["General Physician"])
    return [{"specialization": s, "doctors": []} for s in specs]
