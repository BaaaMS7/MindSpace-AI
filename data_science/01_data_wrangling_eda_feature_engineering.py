"""
Data Wrangling, EDA, dan Feature Engineering untuk MindSpace.

Jalankan dari root project:
    python data_science/01_data_wrangling_eda_feature_engineering.py

Output:
    data/processed/feature_engineered_mood_dataset.csv
    data_science/eda_summary.json
"""

from pathlib import Path
import json
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = ROOT / "data" / "raw" / "sample_mood_dataset.csv"
PROCESSED_PATH = ROOT / "data" / "processed" / "feature_engineered_mood_dataset.csv"
SUMMARY_PATH = ROOT / "data_science" / "eda_summary.json"

QUESTION_COLUMNS = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"]


def load_data(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset tidak ditemukan: {path}")
    return pd.read_csv(path)


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    df = df.dropna(subset=["created_at", "label"])

    for col in QUESTION_COLUMNS + ["age", "session_seconds", "completed_recommendation"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=QUESTION_COLUMNS)
    for col in QUESTION_COLUMNS:
        df[col] = df[col].clip(1, 5).astype(int)

    df["age"] = df["age"].clip(10, 100).astype(int)
    df["completed_recommendation"] = df["completed_recommendation"].fillna(0).astype(int)
    return df


def feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["stress_reversed"] = 6 - df["stres"]
    df["wellbeing_score"] = df["mood"] + df["tidur"] + df["aktivitas"] + df["energi"] + df["stress_reversed"] + df["sosial"]
    df["sleep_energy_gap"] = (df["tidur"] - df["energi"]).abs()
    df["social_activity_score"] = df[["sosial", "aktivitas"]].mean(axis=1)
    df["risk_index"] = (6 - df["mood"]) + (6 - df["tidur"]) + (6 - df["energi"]) + df["stres"] + (6 - df["sosial"])
    df["week"] = df["created_at"].dt.isocalendar().week.astype(int)
    return df


def make_eda_summary(df: pd.DataFrame) -> dict:
    label_counts = df["label"].value_counts().to_dict()
    avg_by_label = df.groupby("label")[["wellbeing_score", "risk_index", "session_seconds"]].mean().round(2).to_dict()
    completion_by_group = df.groupby("ab_group")["completed_recommendation"].mean().round(4).to_dict()
    corr = df[QUESTION_COLUMNS + ["wellbeing_score", "risk_index"]].corr(numeric_only=True).round(3).to_dict()

    return {
        "rows": int(len(df)),
        "columns": list(df.columns),
        "missing_values": df.isna().sum().to_dict(),
        "label_counts": label_counts,
        "average_metrics_by_label": avg_by_label,
        "completion_rate_by_ab_group": completion_by_group,
        "correlation_matrix": corr,
    }


def main() -> None:
    df = load_data(RAW_PATH)
    df = clean_data(df)
    df = feature_engineering(df)

    PROCESSED_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_PATH, index=False)

    summary = make_eda_summary(df)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Processed dataset saved to: {PROCESSED_PATH}")
    print(f"EDA summary saved to: {SUMMARY_PATH}")
    print(json.dumps(summary["label_counts"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
