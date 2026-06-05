"""
Training pipeline Keras untuk classifier kuesioner MindSpace.

Checklist AI Engineer yang dipenuhi:
- TensorFlow Functional API.
- Custom Layer: AttentionLayer.
- Custom Callback: StopAtMetric.
- TensorBoard callback.
- Export model ke .keras.
- Export LabelEncoder ke .pkl.
- Custom evaluation loop sederhana.

Jalankan dari root project:
    python ml_api/training/train_mood_classifier.py

Output:
    ml_api/models/mood_classifier.keras
    ml_api/models/label_encoder.pkl
    ml_api/training/training_metrics.json
    ml_api/training/tensorboard_logs/
"""

from pathlib import Path
import json
import pickle
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "data" / "processed" / "feature_engineered_mood_dataset.csv"
RAW_PATH = ROOT / "data" / "raw" / "sample_mood_dataset.csv"
MODEL_DIR = ROOT / "ml_api" / "models"
METRICS_PATH = ROOT / "ml_api" / "training" / "training_metrics.json"
TENSORBOARD_DIR = ROOT / "ml_api" / "training" / "tensorboard_logs"

FEATURES = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"]
TARGET = "label"


@tf.keras.utils.register_keras_serializable(package="Custom")
class AttentionLayer(tf.keras.layers.Layer):
    """Custom layer untuk memberi bobot pada tiap fitur kuesioner."""

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


class StopAtMetric(tf.keras.callbacks.Callback):
    """Custom callback untuk menghentikan training saat akurasi validasi memenuhi target."""

    def __init__(self, monitor="val_accuracy", target=0.85):
        super().__init__()
        self.monitor = monitor
        self.target = target

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        value = logs.get(self.monitor)
        if value is not None and value >= self.target:
            print(f"\nTarget {self.monitor}={self.target} tercapai pada epoch {epoch + 1}.")
            self.model.stop_training = True


def load_dataset() -> pd.DataFrame:
    path = DATA_PATH if DATA_PATH.exists() else RAW_PATH
    if not path.exists():
        raise FileNotFoundError("Dataset tidak ditemukan. Jalankan script data wrangling terlebih dahulu.")
    return pd.read_csv(path)


def build_model(num_features: int, num_classes: int) -> tf.keras.Model:
    inputs = tf.keras.Input(shape=(num_features,), name="questionnaire_input")
    x = AttentionLayer(name="feature_attention")(inputs)
    x = tf.keras.layers.Dense(32, activation="relu", name="dense_1")(x)
    x = tf.keras.layers.Dropout(0.15, name="dropout_1")(x)
    x = tf.keras.layers.Dense(16, activation="relu", name="dense_2")(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax", name="mood_output")(x)
    return tf.keras.Model(inputs=inputs, outputs=outputs, name="mindspace_mood_classifier")


def make_dataset(x, y, batch_size=16, shuffle=False):
    ds = tf.data.Dataset.from_tensor_slices((x, y))
    if shuffle:
        ds = ds.shuffle(buffer_size=len(x), seed=42)
    return ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)


def custom_evaluation_loop(model: tf.keras.Model, dataset: tf.data.Dataset) -> dict:
    """Custom evaluation loop untuk menghitung accuracy dan MAE indeks kelas."""
    total = 0
    correct = 0
    abs_error = 0.0

    for x_batch, y_batch in dataset:
        probs = model(x_batch, training=False)
        pred = tf.argmax(probs, axis=1, output_type=tf.int32)
        true = tf.cast(y_batch, tf.int32)
        correct += int(tf.reduce_sum(tf.cast(pred == true, tf.int32)).numpy())
        abs_error += float(tf.reduce_sum(tf.abs(tf.cast(pred - true, tf.float32))).numpy())
        total += int(x_batch.shape[0])

    return {
        "custom_loop_accuracy": round(correct / total, 4) if total else 0.0,
        "custom_loop_mae_class_index": round(abs_error / total, 4) if total else 0.0,
    }


def main():
    tf.keras.utils.set_random_seed(42)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    TENSORBOARD_DIR.mkdir(parents=True, exist_ok=True)

    df = load_dataset().dropna(subset=FEATURES + [TARGET])
    x = df[FEATURES].astype("float32").values

    encoder = LabelEncoder()
    y = encoder.fit_transform(df[TARGET].astype(str))

    x_train, x_temp, y_train, y_temp = train_test_split(
        x, y, test_size=0.3, random_state=42, stratify=y
    )
    x_val, x_test, y_val, y_test = train_test_split(
        x_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp
    )

    train_ds = make_dataset(x_train, y_train, shuffle=True)
    val_ds = make_dataset(x_val, y_val)
    test_ds = make_dataset(x_test, y_test)

    model = build_model(num_features=len(FEATURES), num_classes=len(encoder.classes_))
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.01),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    callbacks = [
        StopAtMetric(monitor="val_accuracy", target=0.85),
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True),
        tf.keras.callbacks.TensorBoard(log_dir=str(TENSORBOARD_DIR), histogram_freq=1),
    ]

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=100,
        callbacks=callbacks,
        verbose=1,
    )

    test_loss, test_accuracy = model.evaluate(test_ds, verbose=0)
    custom_metrics = custom_evaluation_loop(model, test_ds)

    model.save(MODEL_DIR / "mood_classifier.keras")
    with open(MODEL_DIR / "label_encoder.pkl", "wb") as f:
        pickle.dump(encoder, f)

    metrics = {
        "features": FEATURES,
        "classes": encoder.classes_.tolist(),
        "test_loss": round(float(test_loss), 6),
        "test_accuracy": round(float(test_accuracy), 6),
        **custom_metrics,
        "history_last_epoch": {k: round(float(v[-1]), 6) for k, v in history.history.items()},
        "note": "Regenerate metrics by running this script on the final dataset.",
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
