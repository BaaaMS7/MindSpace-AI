"""
Evaluasi A/B Testing sederhana untuk fitur rekomendasi AI.

Tujuan eksperimen:
- Grup A: rekomendasi standar.
- Grup B: rekomendasi dengan sapaan personal berdasarkan label classifier.

Metrik utama:
- completed_recommendation: apakah pengguna menyelesaikan rekomendasi awal.

Jalankan:
    python data_science/02_ab_testing_evaluation.py
"""

from pathlib import Path
from math import erf, sqrt
import json
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "processed" / "feature_engineered_mood_dataset.csv"
OUTPUT_PATH = ROOT / "data_science" / "ab_testing_result.json"


def normal_cdf(z: float) -> float:
    return 0.5 * (1 + erf(z / sqrt(2)))


def two_proportion_z_test(success_a: int, n_a: int, success_b: int, n_b: int) -> dict:
    p_a = success_a / n_a
    p_b = success_b / n_b
    pooled = (success_a + success_b) / (n_a + n_b)
    se = sqrt(pooled * (1 - pooled) * (1 / n_a + 1 / n_b))
    z = 0.0 if se == 0 else (p_b - p_a) / se
    p_value = 2 * (1 - normal_cdf(abs(z)))
    return {
        "conversion_a": round(p_a, 4),
        "conversion_b": round(p_b, 4),
        "uplift_absolute": round(p_b - p_a, 4),
        "uplift_relative_percent": round(((p_b - p_a) / p_a) * 100, 2) if p_a else None,
        "z_score": round(z, 4),
        "p_value": round(p_value, 6),
        "significant_at_0_05": p_value < 0.05,
    }


def main() -> None:
    df = pd.read_csv(DATA_PATH)
    required = {"ab_group", "completed_recommendation"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Kolom wajib tidak ada: {missing}")

    group_a = df[df["ab_group"] == "A"]
    group_b = df[df["ab_group"] == "B"]

    result = two_proportion_z_test(
        int(group_a["completed_recommendation"].sum()),
        len(group_a),
        int(group_b["completed_recommendation"].sum()),
        len(group_b),
    )
    result["n_a"] = int(len(group_a))
    result["n_b"] = int(len(group_b))
    result["interpretation"] = (
        "Variasi B layak dipertimbangkan karena conversion rate lebih baik."
        if result["uplift_absolute"] > 0
        else "Variasi B belum menunjukkan peningkatan dibanding kontrol."
    )

    OUTPUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
