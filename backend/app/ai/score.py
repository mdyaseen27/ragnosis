"""Explainable health score: (metrics in range / total metrics) x 100.

Fully disclosed formula — a patient can recompute it by hand. No black box.
"""


def health_score(metrics):
    """Returns (score 0-100, band). No metrics -> (0.0, 'Needs Improvement')."""
    metrics = metrics or []
    if not metrics:
        return 0.0, "Needs Improvement"
    in_range = sum(1 for m in metrics if m.get("status") == "Normal")
    score = round(in_range / len(metrics) * 100, 1)
    if score >= 85:
        band = "Excellent"
    elif score >= 70:
        band = "Good"
    elif score >= 50:
        band = "Fair"
    else:
        band = "Needs Improvement"
    return score, band
