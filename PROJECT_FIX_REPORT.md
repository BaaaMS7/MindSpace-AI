# Project Fix Report — Vite, MongoDB, dan Streamlit

## 1. Akar masalah MongoDB utama

Pada versi lama, `server/index.js` meng-import `server/mongo.js` sebelum menjalankan `dotenv.config()`. Karena ECMAScript module dievaluasi saat proses import, baris berikut pada versi lama menangkap nilai terlalu awal:

```js
const MONGODB_URI = process.env.MONGODB_URI;
```

Nilainya dapat menjadi `undefined` sepanjang umur proses backend. Akibatnya fungsi simpan melewati MongoDB walaupun `.env` sebenarnya berisi URI.

### Perbaikan

- `server/mongo.js` memuat `.env` sendiri.
- URI dibaca ketika koneksi diperlukan, bukan hanya sekali ketika modul di-import.
- Koneksi memakai connection promise dan pool yang direuse.
- Backend menjalankan `ping` dan memastikan index.
- Endpoint diagnostic ditambahkan:

```text
GET /health/mongo
```

- Script diagnostic ditambahkan:

```powershell
npm run test:mongo
```

## 2. Penyebab Streamlit kosong

Streamlit sudah membaca MongoDB, tetapi collection kosong karena backend sebelumnya tidak benar-benar memasukkan dokumen. Selain itu, template `.env` lama memakai URI MongoDB lokal:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
```

URI tersebut tidak menunjuk ke Cluster0 Atlas.

### Perbaikan

- Template `.env.example` diarahkan ke placeholder Atlas.
- Streamlit me-reuse `MongoClient` memakai `st.cache_resource`.
- Query data memakai cache singkat 15 detik.
- Tombol `Reconnect MongoDB` ditambahkan.
- Target MongoDB ditampilkan tanpa membocorkan username/password.

## 3. Penyebab Vite putih dan socket terputus

Console menunjukkan file dasar Vite gagal dimuat:

```text
index.css                 ERR_EMPTY_RESPONSE
react_jsx-dev-runtime.js  ERR_EMPTY_RESPONSE
App.jsx                   ERR_EMPTY_RESPONSE
client                    ERR_SOCKET_NOT_CONNECTED
```

Ini menunjukkan koneksi ke dev server/HMR terputus, bukan error logika React biasa. ZIP lama juga menyertakan `node_modules`, padahal dependency native Vite/Rolldown harus diinstall ulang sesuai OS komputer tujuan.

### Perbaikan

- Folder `node_modules` dikeluarkan dari ZIP fixed.
- Gunakan `npm ci` setelah ekstraksi.
- Vite dikunci ke `127.0.0.1:5173` dengan `strictPort`.
- HMR WebSocket diarahkan eksplisit ke `127.0.0.1:5173`.
- Warmup dan dependency pre-bundling ditambahkan.
- Script cleanup ditambahkan:

```powershell
npm run dev:clean
```

- Helper reset Windows ditambahkan:

```powershell
powershell -ExecutionPolicy Bypass -File .\RESET_FRONTEND_WINDOWS.ps1
```
