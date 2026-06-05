# Integrasi Classifier Kuesioner dengan `.keras` + `label_encoder.pkl`

Project ini memakai 3 server saat development:

1. **Python/FastAPI classifier** untuk menjalankan model asli `mood_classifier.keras` dan `label_encoder.pkl`.
2. **Node.js/Express backend** untuk Gemini dan sebagai jembatan ke classifier Python.
3. **React/Vite frontend** untuk tampilan website.

## Struktur file penting

```text
ml_api/
├─ app.py
├─ requirements.txt
└─ models/
   ├─ mood_classifier.keras
   └─ label_encoder.pkl

server/
└─ index.js
```

## Alur sistem

```text
Frontend React
  ↓ kirim jawaban kuesioner
Node.js /api/kuesioner
  ↓ teruskan ke Python
FastAPI /predict
  ↓ load model .keras + label_encoder.pkl
Node.js menerima label + confidence
  ↓ kirim konteks tersembunyi ke Gemini
Frontend menerima rekomendasi AI
```

## 1. Install package Node.js

```powershell
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
```

## 2. Buat virtual environment Python

Dari folder root project:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r ml_api/requirements.txt
```

Kalau command `python` tidak dikenal, coba:

```powershell
py -m venv .venv
.\.venv\Scripts\activate
py -m pip install --upgrade pip
pip install -r ml_api/requirements.txt
```

> Catatan: TensorFlow cukup besar, jadi proses install bisa agak lama.

## 3. Buat file `.env`

Copy `.env.example` menjadi `.env`, lalu isi API key Gemini:

```env
GEMINI_API_KEY=API_KEY_GEMINI_KAMU
PORT=3000
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3000
CLASSIFIER_API_URL=http://127.0.0.1:8000
```

## 4. Jalankan 3 terminal

### Terminal 1 — Python classifier

```powershell
.\.venv\Scripts\activate
npm run dev:classifier
```

Cek di browser:

```text
http://127.0.0.1:8000/health
```

### Terminal 2 — Node/Gemini backend

```powershell
npm run dev:server
```

Cek di browser:

```text
http://localhost:3000/health
```

### Terminal 3 — React frontend

```powershell
npm run dev
```

Buka URL Vite yang muncul, biasanya:

```text
http://localhost:5173
```

## 5. Test classifier manual

Bisa pakai Thunder Client/Postman:

```http
POST http://localhost:3000/api/classifier
Content-Type: application/json
```

Body:

```json
{
  "answers": {
    "mood": 5,
    "tidur": 5,
    "aktivitas": 5,
    "energi": 5,
    "stres": 1,
    "sosial": 5
  }
}
```

Output contoh:

```json
{
  "label": "GREAT",
  "rawLabel": "Great",
  "confidence": 0.98,
  "confidencePercent": 98,
  "probabilities": {
    "DISTRESSED": 0.001,
    "GOOD": 0.01,
    "GREAT": 0.98,
    "LOW": 0.002,
    "NEUTRAL": 0.007
  }
}
```

## Catatan keamanan GitHub

Jangan upload file berikut:

```text
.env
node_modules/
.venv/
```

File model boleh di-upload jika memang model buatan sendiri dan tidak mengandung data sensitif. Namun `label_encoder.pkl` hanya boleh dibuka dari sumber tepercaya karena format pickle dapat menjalankan kode saat dibaca.
