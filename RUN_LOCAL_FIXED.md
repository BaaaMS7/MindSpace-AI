# Menjalankan MindSpace AI Lokal Setelah Fix

## A. Setup pertama kali

Dari root project:

```powershell
Copy-Item .env.example .env
notepad .env
```

Isi URI Atlas asli, API key Gemini, dan kredensial admin Streamlit. Lalu jalankan:

```powershell
npm ci --no-audit --no-fund
py -3.12 -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip setuptools wheel
pip install -r ml_api/requirements.txt
pip install -r ds_dashboard/requirements.txt
```

## B. Tes MongoDB sebelum membuka website

```powershell
npm run test:mongo
```

Jika gagal, buka `MONGODB_ATLAS_SETUP.md` dan periksa URI, database user, password encoding, serta Network Access Atlas.

## C. Jalankan empat terminal

### Terminal 1 — backend

```powershell
npm run dev:server
```

Cek:

```text
http://127.0.0.1:3000/health/mongo
```

### Terminal 2 — frontend

```powershell
npm run dev
```

Buka:

```text
http://127.0.0.1:5173
```

Apabila browser pernah menampilkan `ERR_EMPTY_RESPONSE` atau `ERR_SOCKET_NOT_CONNECTED`, hentikan Vite dengan `Ctrl + C`, lalu jalankan:

```powershell
npm run dev:clean
```

Jika masih gagal karena dependency lama dari ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\RESET_FRONTEND_WINDOWS.ps1
```

### Terminal 3 — classifier

```powershell
.\.venv\Scripts\activate
npm run dev:classifier
```

Cek:

```text
http://127.0.0.1:8001/health
```

### Terminal 4 — Streamlit admin

```powershell
.\.venv\Scripts\activate
npm run dashboard:streamlit
```

Buka:

```text
http://localhost:8501
```

Gunakan tombol `Reconnect MongoDB` setelah mengubah `.env` atau Network Access Atlas.
