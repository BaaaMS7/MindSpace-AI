# Streamlit Admin/Internal Dashboard Setup

Streamlit tidak ditampilkan pada UI website user. Frontend tetap dipakai untuk login Firebase, kuesioner, dan chat. Streamlit hanya dipakai admin/internal untuk membaca MongoDB.

## Sumber data

Streamlit membaca langsung:

```text
mindspace_ai.mood_assessments
mindspace_ai.chat_messages
```

CSV simulasi tidak dipakai ketika MongoDB kosong atau gagal terhubung. Ini mencegah data lama tampak seolah-olah berasal dari database.

## Environment variable wajib

Lokal melalui `.env` atau deployment melalui Streamlit Secrets:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@HOST_CLUSTER/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB_NAME=mindspace_ai
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password_admin_yang_kuat
```

## Menjalankan lokal

```powershell
.\.venv\Scripts\activate
pip install -r ds_dashboard/requirements.txt
python -m streamlit run ds_dashboard/streamlit_app.py
```

Buka:

```text
http://localhost:8501
```

## Fitur dashboard

- Login admin sebelum data ditampilkan.
- `Global Analytics`: total user, kuesioner, chat, distribusi mood, tren skor, dan tabel gabungan.
- `User Detail`: filter email, profil ringkas, riwayat kuesioner, classifier, dan chat berdasarkan `chatId`.
- Tombol `Refresh data` untuk membaca ulang dokumen.
- Tombol `Reconnect MongoDB` untuk membuat connection pool baru setelah URI atau Network Access berubah.

## Deploy Streamlit Cloud

1. Push repository ke GitHub tanpa `.env`.
2. Buat app baru di Streamlit Cloud.
3. Main file path:

```text
ds_dashboard/streamlit_app.py
```

4. Isi Secrets sesuai environment variable wajib di atas.
5. Pastikan Network Access Atlas mengizinkan koneksi dari deployment.
6. Deploy.
