# MindSpace AI

MindSpace AI adalah aplikasi dukungan kesehatan mental non-diagnostik yang menggabungkan:

- React + Vite untuk frontend;
- Firebase Authentication untuk login user;
- Express.js untuk backend;
- Gemini API untuk respons AI;
- MongoDB Atlas untuk penyimpanan riwayat;
- FastAPI + TensorFlow/Keras untuk classifier mood;
- Streamlit untuk dashboard admin.

> MindSpace AI bukan alat diagnosis medis. Dalam kondisi darurat, pengguna tetap perlu menghubungi orang terdekat, tenaga profesional, atau layanan darurat setempat.

---

## 1. Prasyarat

Gunakan:

- Git;
- Node.js `20.19+` atau `22.12+`;
- npm;
- Python `3.12`;
- akun MongoDB Atlas;
- Gemini API key;
- Firebase Web App dengan Email/Password Authentication aktif.

---

## 2. Struktur project

```text
MindSpace-AI/
├─ src/                         # React + Vite frontend
├─ server/                      # Express + Gemini + MongoDB
├─ ml_api/                      # FastAPI classifier Keras
│  └─ models/
│     ├─ mood_classifier.keras
│     └─ label_encoder.pkl
├─ ds_dashboard/                # Streamlit admin dashboard
├─ data/                        # Dataset mentah dan hasil pemrosesan
├─ data_science/                # EDA dan A/B testing
├─ scripts/                     # Diagnostic helpers
├─ .env.example                 # Template konfigurasi
├─ requirements.txt             # Seluruh dependency Python
├─ package.json                 # Dependency JavaScript
└─ package-lock.json            # Lockfile dependency JavaScript
```

---

## 3. Clone repository

```powershell
git clone https://github.com/USERNAME/NAMA_REPOSITORY.git
cd NAMA_REPOSITORY
```

Jika menerima ZIP, ekstrak ZIP lalu buka PowerShell pada root project.

Pastikan root project memiliki:

```text
package.json
package-lock.json
.env.example
requirements.txt
```

---

## 4. Buat `.env`

Salin template:

```powershell
Copy-Item .env.example .env
```

Buka:

```powershell
notepad .env
```

Isi `.env` memakai kredensial milikmu sendiri.

Bagian minimum yang wajib diisi:

```env
GEMINI_API_KEY=ISI_API_KEY_GEMINI_KAMU

MONGODB_URI=ISI_URI_MONGODB_ATLAS_KAMU
MONGODB_DB_NAME=mindspace_ai

ADMIN_USERNAME=admin
ADMIN_PASSWORD=GANTI_DENGAN_PASSWORD_ADMIN_YANG_KUAT

VITE_FIREBASE_API_KEY=ISI_API_KEY_FIREBASE_WEB
VITE_FIREBASE_AUTH_DOMAIN=PROJECT_ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=PROJECT_ID.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=ISI_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=ISI_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=ISI_MEASUREMENT_ID_JIKA_ADA
```

Jangan commit file `.env`.

Untuk MongoDB Atlas:

1. Buat database user.
2. Tambahkan IP perangkat pada menu Network Access.
3. Ambil URI melalui menu Connect.
4. Gunakan database:

```text
mindspace_ai
```

---

## 5. Install dependency JavaScript

```powershell
npm ci --no-audit --no-fund
```

Jangan menyalin folder `node_modules` dari laptop lain.

---

## 6. Buat Python virtual environment

### Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
```

Jika PowerShell menolak aktivasi script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### macOS atau Linux

```bash
python3.12 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
```

---

## 7. Tes MongoDB

```powershell
npm run test:mongo
```

Hasil yang benar memuat:

```json
{
  "configured": true,
  "connected": true,
  "dbName": "mindspace_ai"
}
```

---

## 8. Jalankan project secara lokal

Gunakan empat terminal berbeda dari root project.

### Terminal 1 — classifier FastAPI

Aktifkan `.venv`:

```powershell
.\.venv\Scripts\Activate.ps1
```

Jalankan:

```powershell
npm run dev:classifier
```

Health check:

```text
http://127.0.0.1:8002/health
```

### Terminal 2 — backend Express

```powershell
npm run dev:server
```

Health check:

```text
http://127.0.0.1:3000/health
http://127.0.0.1:3000/health/mongo
```

### Terminal 3 — frontend React + Vite

```powershell
npm run dev
```

Buka:

```text
http://127.0.0.1:5173/login
```

### Terminal 4 — Streamlit dashboard

Aktifkan `.venv`:

```powershell
.\.venv\Scripts\Activate.ps1
```

Jalankan:

```powershell
npm run dashboard:streamlit
```

Buka:

```text
http://localhost:8501
```

Login memakai:

```text
ADMIN_USERNAME
ADMIN_PASSWORD
```

dari `.env`.

---

## 9. Urutan pengujian integrasi

1. Jalankan `npm run test:mongo`.
2. Pastikan MongoDB mengembalikan `connected: true`.
3. Jalankan classifier FastAPI.
4. Jalankan backend Express.
5. Jalankan frontend React.
6. Login atau daftar akun Firebase.
7. Isi kuesioner.
8. Kirim chat.
9. Pastikan MongoDB Atlas memiliki:
   - `mood_assessments`;
   - `chat_messages`.
10. Jalankan Streamlit.
11. Login memakai kredensial admin.
12. Pastikan data MongoDB tampil.

---

## 10. Troubleshooting

### Port `5173` sudah dipakai

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Hentikan hanya PID Vite lama:

```powershell
Stop-Process -Id PID_YANG_MUNCUL -Force
```

### Port `8002` sudah dipakai

```powershell
Get-NetTCPConnection -LocalPort 8002 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Hentikan PID classifier lama jika memang tidak diperlukan:

```powershell
Stop-Process -Id PID_YANG_MUNCUL -Force
```

### MongoDB gagal terhubung

```powershell
npm run test:mongo
```

Periksa:

- `MONGODB_URI`;
- username dan password Atlas;
- Network Access pada Atlas;
- URL encoding password;
- DNS perangkat.

### Gemini mengembalikan `503 Service Unavailable`

Backend sudah memakai:

```env
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-2.5-flash
```

Jika model utama sibuk, backend mencoba retry dan fallback model. Jika seluruh model tidak tersedia, aplikasi tetap memberikan respons lokal sementara.

### Streamlit menampilkan `ModuleNotFoundError`

Aktifkan `.venv`, lalu install ulang:

```powershell
python -m pip install -r requirements.txt
```

---

## 11. Deploy Streamlit Community Cloud

1. Push repository ke GitHub.
2. Masuk ke Streamlit Community Cloud.
3. Klik `Create app`.
4. Pilih repository GitHub.
5. Pilih branch:

```text
main
```

6. Isi main file path:

```text
ds_dashboard/streamlit_app.py
```

7. Buka `Advanced settings`.
8. Pilih Python `3.12`.
9. Isi Secrets:

```toml
MONGODB_URI = "ISI_URI_MONGODB_ATLAS"
MONGODB_DB_NAME = "mindspace_ai"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "PASSWORD_ADMIN_YANG_KUAT"
```

10. Klik `Deploy`.
11. Setelah memperoleh URL Streamlit Cloud, masukkan URL tersebut pada environment frontend:

```env
VITE_STREAMLIT_URL=https://NAMA-APP.streamlit.app
```

Dashboard Streamlit hanya membutuhkan MongoDB dan kredensial admin. Backend Express, Gemini, Firebase, dan classifier tidak perlu berjalan di Streamlit Community Cloud.

---

## Dashboard Streamlit Cloud

Dashboard analitik dapat diakses melalui:

https://mindspace-ai-analytics.streamlit.app

## 12. File yang tidak boleh di-push

```text
.env
.venv/
node_modules/
dist/
__pycache__/
*.pyc
.streamlit/secrets.toml
```

File yang tetap perlu di-push:

```text
.env.example
package.json
package-lock.json
requirements.txt
README.md
ml_api/models/mood_classifier.keras
ml_api/models/label_encoder.pkl
```

---

## 13. Catatan keamanan

Sebelum digunakan sebagai layanan publik:

- jangan expose `GEMINI_API_KEY`, `MONGODB_URI`, atau `ADMIN_PASSWORD`;
- verifikasi Firebase ID Token pada backend sebelum memberikan histori user;
- gunakan MongoDB user dengan hak akses minimum;
- aktifkan Firebase Security Rules dan App Check;
- batasi origin CORS untuk domain production.
