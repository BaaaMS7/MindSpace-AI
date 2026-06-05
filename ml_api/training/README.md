# Training Pipeline Keras

Folder ini berisi source code proses pelatihan model agar repository tidak hanya memuat model jadi.

File utama:
- `train_mood_classifier.py`: training TensorFlow Functional API, Custom Layer, Custom Callback, TensorBoard, export `.keras`, export `.pkl`, dan custom evaluation loop.
- `training_metrics.json`: dibuat setelah script training dijalankan.
- `tensorboard_logs/`: output TensorBoard setelah training.

Jalankan:
```bash
python data_science/01_data_wrangling_eda_feature_engineering.py
python ml_api/training/train_mood_classifier.py
```

Buka TensorBoard:
```bash
tensorboard --logdir ml_api/training/tensorboard_logs
```
