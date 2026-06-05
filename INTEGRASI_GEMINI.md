# Integrasi Kuesioner + Gemini AI

File yang ditambahkan/diubah:

1. `server/index.js`
   - Backend Express untuk Gemini.
   - Endpoint `POST /api/kuesioner` untuk menerima hasil kuesioner dan membuat invisible prompt.
   - Endpoint `POST /api/chat` untuk percakapan chatbot.
   - Endpoint `GET /health` untuk cek server.

2. `src/Dashboard.jsx`
   - Fungsi `submitKuesioner()` sekarang mengirim hasil kuesioner ke backend.
   - Setelah submit, website otomatis membuat chat baru berisi rekomendasi AI.
   - Fungsi `handleSendMessage()` sekarang memanggil backend Gemini, bukan balasan mockup.
   - Jika backend belum jalan, aplikasi tetap memberi fallback lokal.

3. `.env.example`
   - Contoh isi environment variable.

4. `package.json`
   - Menambahkan script `dev:server` dan `server`.
   - Menambahkan dependency backend: `express`, `cors`, `dotenv`, dan `@google/generative-ai`.

## Cara Menjalankan

### 1. Install dependency

```bash
npm install
```

### 2. Buat file `.env`

Copy dari `.env.example` menjadi `.env`, lalu isi API key Gemini kamu.

```env
GEMINI_API_KEY=isi_api_key_gemini_kamu_di_sini
PORT=3000
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3000
```

### 3. Jalankan backend Gemini

Buka terminal pertama:

```bash
npm run dev:server
```

Cek backend:

```bash
http://localhost:3000/health
```

Jika muncul status `ok`, backend sudah jalan.

### 4. Jalankan frontend React/Vite

Buka terminal kedua:

```bash
npm run dev
```

Biasanya website terbuka di:

```bash
http://localhost:5173
```

## Alur Kerja Setelah Integrasi

1. User login ke website.
2. User mengisi kuesioner.
3. React menghitung skor dan mood lokal: `GREAT`, `GOOD`, `NEUTRAL`, `LOW`, atau `DISTRESSED`.
4. React mengirim data ke `POST /api/kuesioner`.
5. Backend membuat invisible prompt untuk Gemini.
6. Gemini mengembalikan sapaan dan rekomendasi personal.
7. Hasil muncul di modal dan otomatis dibuat sebagai chat baru.
8. Saat user lanjut chat, React memanggil `POST /api/chat`.

## Catatan Keamanan

- Jangan taruh `GEMINI_API_KEY` di frontend React.
- API key hanya disimpan di `.env` backend.
- File `.env` jangan di-upload ke GitHub.
- Chatbot ini bukan pengganti psikolog/psikiater dan tidak boleh memberi diagnosis klinis.

## Jika `npm install` error ETIMEDOUT ke registry internal

Jalankan perintah berikut di folder project:

```powershell
npm config set registry https://registry.npmjs.org/
npm config delete proxy
npm config delete https-proxy
npm cache clean --force
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
```

Error seperti `packages.applied-caas-gateway...internal...` berarti npm mencoba memakai registry internal yang tidak bisa diakses dari laptop lokal. File `.npmrc` di project ini sudah diarahkan ke registry public npm.
