# Setup MongoDB Atlas untuk MindSpace AI

## Mengapa data sebelumnya tidak masuk

Versi lama membaca `process.env.MONGODB_URI` terlalu awal saat modul ESM `server/mongo.js` di-import. Pada saat itu `dotenv.config()` di `server/index.js` belum dijalankan, sehingga URI tersimpan sebagai `undefined` dan proses simpan MongoDB dilewati. Versi ini sudah memuat `.env` langsung dari `server/mongo.js` dan membaca URI saat koneksi dibutuhkan.

Selain itu, `.env.example` lama memakai MongoDB lokal `mongodb://127.0.0.1:27017`. URI tersebut tidak mengarah ke Cluster0 Atlas. Gunakan URI Atlas asli jika data ingin masuk ke Atlas dan dibaca Streamlit Cloud.

## Langkah Atlas

1. Masuk ke MongoDB Atlas.
2. Buka `Database Access`, lalu buat database user. Simpan username dan password database tersebut.
3. Buka `Network Access`, lalu tambahkan IP laptop yang dipakai untuk development. Untuk pengujian sementara saja, Anda dapat membuka akses lebih luas; setelah pengujian selesai, batasi kembali IP yang diizinkan.
4. Buka `Database > Connect > Drivers` pada Cluster0.
5. Copy connection string dan ganti placeholder username/password.
6. Copy `.env.example` menjadi `.env`.
7. Isi:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@HOST_CLUSTER/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB_NAME=mindspace_ai
```

Jika password memuat karakter spesial seperti `@`, `#`, `/`, `?`, `:`, `[`, atau `]`, encode password terlebih dahulu:

```powershell
node -e "console.log(encodeURIComponent('PASSWORD_ASLI'))"
```

Gunakan output tersebut sebagai password di URI.

## Tes koneksi sebelum menjalankan website

```powershell
npm run test:mongo
```

Hasil yang benar:

```json
{
  "configured": true,
  "connected": true,
  "dbName": "mindspace_ai",
  "collections": {
    "mood_assessments": 0,
    "chat_messages": 0
  }
}
```

Setelah backend aktif, cek juga:

```text
http://127.0.0.1:3000/health/mongo
```

## Menjalankan Streamlit lokal

```powershell
.\.venv\Scripts\activate
python -m streamlit run ds_dashboard/streamlit_app.py
```

Buka:

```text
http://localhost:8501
```

Klik `Reconnect MongoDB` apabila URI atau Network Access baru saja diubah.
