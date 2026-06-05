# Perbaikan Berdasarkan Catatan Evaluasi

## 1. Full Stack Developer

### Sudah diperbaiki

- **MongoDB opsional ditambahkan**
  - File: `server/mongo.js`
  - Endpoint menyimpan assessment/chat jika `MONGODB_URI` diisi.
  - Endpoint analytics: `GET /api/analytics/mood-summary`.

- **Axios ditambahkan**
  - File: `src/api/client.js`
  - `Dashboard.jsx` memakai `apiClient.post()` untuk komunikasi ke backend.

- **Backend tetap Express**
  - File: `server/index.js`
  - Endpoint: `/api/classifier`, `/api/kuesioner`, `/api/chat`, `/api/analytics/mood-summary`.

### Catatan deployment

Project masih punya konfigurasi Firebase Hosting. Jika ingin mengikuti rencana Vercel/Netlify, cukup deploy front-end dari folder root dengan build command `npm run build` dan output `dist`.

## 2. AI Engineer

### Sudah diperbaiki

- **Source code training model ditambahkan**
  - File: `ml_api/training/train_mood_classifier.py`
  - Notebook: `notebooks/01_mindspace_training_pipeline.ipynb`

- **Menggunakan TensorFlow Functional API**
  - Ada di `build_model()` pada script training.

- **Custom Layer**
  - `AttentionLayer` pada `ml_api/training/train_mood_classifier.py` dan `ml_api/app.py`.

- **Custom Callback**
  - `StopAtMetric` pada training script.

- **TensorBoard**
  - Callback TensorBoard tersedia di training script.
  - Folder log: `ml_api/training/tensorboard_logs/`.

- **Inference sederhana**
  - FastAPI: `ml_api/app.py`
  - Endpoint: `POST /predict`.

## 3. Data Science

### Sudah diperbaiki

- **Data Wrangling, EDA, Feature Engineering**
  - File: `data_science/01_data_wrangling_eda_feature_engineering.py`

- **Data Dictionary**
  - Folder: `data_dictionary/`

- **Dashboard Streamlit**
  - File: `ds_dashboard/streamlit_app.py`

- **A/B Testing**
  - File: `data_science/02_ab_testing_evaluation.py`

- **Laporan teknis**
  - File: `data_science/technical_report.md`

## Urutan menjalankan validasi

```bash
npm install --registry=https://registry.npmjs.org/
pip install -r ml_api/requirements.txt
python data_science/01_data_wrangling_eda_feature_engineering.py
python data_science/02_ab_testing_evaluation.py
python ml_api/training/train_mood_classifier.py
```

Untuk aplikasi web:

```bash
npm run dev:classifier
npm run dev:server
npm run dev
```
