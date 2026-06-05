# Perbaikan Optimasi MindSpace AI

Versi ini sudah diperbaiki agar integrasi React, Node/Gemini, FastAPI Keras, MongoDB opsional, dan Streamlit lebih stabil.

## Perbaikan utama

1. `server/index.js`
   - Memperbaiki error Gemini: `First content should be with role 'user', got model`.
   - Menambahkan sanitasi riwayat chat agar selalu diawali role `user`.
   - Menambahkan retry otomatis untuk error Gemini sementara seperti `503 high demand` dan `429 rate limit`.
   - Menambahkan fallback model `gemini-2.5-flash-lite` jika `gemini-2.5-flash` sedang sibuk.
   - Memperbaiki bug `model is not defined` pada endpoint `/api/chat`.
   - Menambahkan timeout untuk request ke classifier Python.
   - Menyimpan mood/chat ke MongoDB secara opsional tanpa membuat aplikasi crash jika MongoDB mati.

2. `ml_api/app.py`
   - Memperbaiki syntax error pada validasi panjang input.
   - Memastikan TensorFlow env diset sebelum import TensorFlow.
   - Model `.keras` dan `label_encoder.pkl` hanya di-load sekali saat startup.
   - Prediksi memakai `_model(x, training=False).numpy()` agar lebih cepat daripada `model.predict()`.
   - Menambahkan warm-up model saat startup.

3. `src/Dashboard.jsx`
   - Menambahkan tombol `Dashboard Streamlit` pada sidebar.
   - Pesan error chat sekarang menampilkan penyebab dari backend agar debugging lebih mudah.

4. `src/api/client.js`
   - Timeout API dinaikkan menjadi 90 detik karena Gemini kadang membutuhkan retry.

5. `.env.example`
   - Menambahkan `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, dan `VITE_STREAMLIT_URL`.

## Cara menjalankan

Buat file `.env` dari `.env.example`, lalu isi API key Gemini asli.

Terminal 1 — classifier Keras:

```powershell
python -m uvicorn ml_api.app:app --host 127.0.0.1 --port 8000
```

Terminal 2 — backend Node/Gemini:

```powershell
npm run dev:server
```

Terminal 3 — frontend React:

```powershell
npm run dev
```

Terminal 4 — dashboard Streamlit, opsional:

```powershell
npm run dashboard:streamlit
```

## Cek server

```text
Frontend React       http://localhost:5173
Backend Node         http://localhost:3000/health
Classifier FastAPI   http://127.0.0.1:8000/health
Streamlit Dashboard  http://localhost:8501
```

## Catatan keamanan GitHub

Jangan upload:

```text
.env
node_modules/
.venv/
__pycache__/
dist/
build/
```

File `.env.example` boleh diupload karena hanya template.
