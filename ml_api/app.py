"""
FastAPI service untuk menjalankan classifier kuesioner dari file asli:
- mood_classifier.keras
- label_encoder.pkl

Jalankan dari root project:
    python -m uvicorn ml_api.app:app --host 127.0.0.1 --port 8001

Optimasi:
- TensorFlow di-load sekali saat startup.
- Prediksi memakai _model(x, training=False), bukan model.predict().
- Warm-up dilakukan saat startup agar request pertama tidak lambat.
- oneDNN dimatikan untuk mengurangi risiko crash di Windows tertentu.
"""

import os

# Harus sebelum import tensorflow.
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import pickle
import time
import warnings
from pathlib import Path
from typing import Dict, List, Union

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import tensorflow as tf
except Exception as exc:  # pragma: no cover
    raise RuntimeError(
        "TensorFlow belum terinstall. Jalankan: pip install -r ml_api/requirements.txt"
    ) from exc

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "mood_classifier.keras"
ENCODER_PATH = BASE_DIR / "models" / "label_encoder.pkl"
QUESTION_ORDER = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"]


@tf.keras.utils.register_keras_serializable(package="Custom")
class AttentionLayer(tf.keras.layers.Layer):
    """Custom layer yang dipakai oleh mood_classifier.keras."""

    def build(self, input_shape):
        self.attention_weights = self.add_weight(
            name="attention_weights",
            shape=(int(input_shape[-1]),),
            initializer="ones",
            trainable=True,
        )
        super().build(input_shape)

    def call(self, inputs):
        return inputs * self.attention_weights


class PredictRequest(BaseModel):
    answers: Union[Dict[str, float], List[float]] = Field(
        ...,
        description=(
            "Bisa berupa dict berisi mood, tidur, aktivitas, energi, stres, sosial "
            "atau list 6 angka skala 1-5."
        ),
    )


app = FastAPI(title="MindSpace Keras Classifier API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None
_label_encoder = None
_startup_error = None


def normalize_label(label: str) -> str:
    value = str(label).strip().lower()
    mapping = {
        "distressed": "DISTRESSED",
        "low": "LOW",
        "neutral": "NEUTRAL",
        "netral": "NEUTRAL",
        "good": "GOOD",
        "great": "GREAT",
    }
    return mapping.get(value, value.upper())


def load_assets() -> None:
    """Load model .keras dan label_encoder.pkl sekali saat server hidup."""
    global _model, _label_encoder

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model tidak ditemukan: {MODEL_PATH}")
    if not ENCODER_PATH.exists():
        raise FileNotFoundError(f"Label encoder tidak ditemukan: {ENCODER_PATH}")

    print("Loading model Keras...")
    print(f"Model path: {MODEL_PATH}")

    load_kwargs = {
        "custom_objects": {"AttentionLayer": AttentionLayer},
        "compile": False,
    }

    try:
        _model = tf.keras.models.load_model(MODEL_PATH, safe_mode=False, **load_kwargs)
    except TypeError:
        _model = tf.keras.models.load_model(MODEL_PATH, **load_kwargs)

    print("Loading label encoder...")
    print(f"Encoder path: {ENCODER_PATH}")

    # label_encoder.pkl harus berasal dari sumber tepercaya.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with open(ENCODER_PATH, "rb") as file:
            _label_encoder = pickle.load(file)

    print("Model dan label encoder berhasil dimuat.")


def warmup_model() -> None:
    """Warm-up agar prediksi pertama lebih cepat."""
    if _model is None:
        return

    dummy_input = np.array([[3, 3, 3, 3, 3, 3]], dtype=np.float32)
    _ = _model(dummy_input, training=False).numpy()
    print("Warm-up selesai. Classifier siap digunakan.")


@app.on_event("startup")
def startup_event() -> None:
    global _startup_error
    try:
        load_assets()
        warmup_model()
    except Exception as exc:
        _startup_error = str(exc)
        print(f"Classifier gagal startup: {_startup_error}")
        raise


def answers_to_array(answers: Union[Dict[str, float], List[float]]) -> np.ndarray:
    if isinstance(answers, list):
        values = answers
    else:
        missing = [key for key in QUESTION_ORDER if key not in answers]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Field jawaban kurang: {', '.join(missing)}",
            )
        values = [answers[key] for key in QUESTION_ORDER]

    if len(values) != 6:
        raise HTTPException(status_code=400, detail="Input harus berisi tepat 6 nilai.")

    try:
        numeric_values = [float(value) for value in values]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Semua jawaban harus berupa angka.")

    invalid_values = [value for value in numeric_values if value < 1 or value > 5]
    if invalid_values:
        raise HTTPException(status_code=400, detail="Semua jawaban harus berada pada skala 1 sampai 5.")

    return np.array([numeric_values], dtype=np.float32)


@app.get("/")
def root():
    return {
        "message": "MindSpace Keras Classifier API aktif.",
        "health": "/health",
        "predict": "/predict",
    }


@app.get("/health")
def health():
    classes = []
    if _label_encoder is not None and hasattr(_label_encoder, "classes_"):
        classes = [str(label) for label in _label_encoder.classes_]

    return {
        "status": "ok" if _model is not None and _label_encoder is not None else "not_ready",
        "service": "MindSpace Keras Classifier API",
        "model_loaded": _model is not None,
        "label_encoder_loaded": _label_encoder is not None,
        "startup_error": _startup_error,
        "classes": classes,
        "input_order": QUESTION_ORDER,
    }


@app.post("/predict")
def predict(payload: PredictRequest):
    if _model is None or _label_encoder is None:
        raise HTTPException(status_code=500, detail="Model atau label encoder belum berhasil dimuat.")

    start_time = time.perf_counter()
    x = answers_to_array(payload.answers)

    try:
        prediction = _model(x, training=False).numpy()[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal melakukan prediksi: {str(exc)}")

    predicted_index = int(np.argmax(prediction))
    raw_label = str(_label_encoder.inverse_transform([predicted_index])[0])
    normalized_label = normalize_label(raw_label)
    confidence = float(prediction[predicted_index])

    classes = [str(label) for label in _label_encoder.classes_]
    probabilities = {
        normalize_label(label): round(float(prob), 6)
        for label, prob in zip(classes, prediction)
    }

    processing_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "label": normalized_label,
        "rawLabel": raw_label,
        "confidence": round(confidence, 6),
        "confidencePercent": round(confidence * 100, 2),
        "probabilities": probabilities,
        "inputOrder": QUESTION_ORDER,
        "inputValues": x[0].tolist(),
        "processingTimeMs": processing_time_ms,
    }
