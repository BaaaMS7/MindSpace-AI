# Laporan Teknis Data Science — MindSpace AI

## 1. Tujuan Bisnis
MindSpace AI bertujuan membantu pengguna mendapatkan refleksi awal kondisi emosional melalui kuesioner singkat. Output sistem bukan diagnosis, melainkan rekomendasi self-care awal yang dipersonalisasi dengan bantuan classifier dan Generative AI.

## 2. Dataset
Dataset contoh berada di `data/raw/sample_mood_dataset.csv`. Dataset ini sintetis untuk demonstrasi karena aplikasi kesehatan mental tidak boleh sembarang memakai data pengguna asli tanpa persetujuan dan perlindungan privasi.

Fitur utama:
- `mood`, `tidur`, `aktivitas`, `energi`, `stres`, `sosial` sebagai jawaban kuesioner 1–5.
- `wellbeing_score` sebagai fitur gabungan.
- `label` sebagai target klasifikasi.

Data dictionary tersedia di:
- `data_dictionary/README.md`
- `data_dictionary/data_dictionary.csv`

## 3. Data Wrangling
Script `data_science/01_data_wrangling_eda_feature_engineering.py` melakukan:
1. Membaca dataset mentah.
2. Membersihkan nilai kosong dan tipe data.
3. Membatasi skala jawaban pada rentang 1–5.
4. Membuat fitur turunan seperti `stress_reversed`, `risk_index`, dan `social_activity_score`.
5. Menyimpan dataset hasil ke `data/processed/feature_engineered_mood_dataset.csv`.

## 4. Exploratory Data Analysis
EDA menghasilkan ringkasan:
- distribusi label mood,
- rata-rata skor per label,
- korelasi fitur kuesioner,
- completion rate per grup A/B.

Output EDA disimpan ke `data_science/eda_summary.json` setelah script dijalankan.

## 5. Feature Engineering
Fitur turunan penting:
- `stress_reversed`: membalik skor stres agar arah interpretasi sama dengan fitur positif lain.
- `wellbeing_score`: ringkasan kesejahteraan umum.
- `risk_index`: estimasi risiko non-diagnostik berdasarkan kombinasi mood rendah, tidur rendah, energi rendah, stres tinggi, dan sosial rendah.

## 6. A/B Testing
Script `data_science/02_ab_testing_evaluation.py` mengevaluasi apakah rekomendasi AI personal meningkatkan penyelesaian rekomendasi awal dibanding rekomendasi standar.

Metrik utama:
- `completed_recommendation`

Metode:
- two-proportion z-test sederhana.

## 7. Dashboard Streamlit
Dashboard analitik tersedia di `ds_dashboard/streamlit_app.py` dan menampilkan:
- jumlah respons,
- distribusi label,
- rata-rata wellbeing score,
- completion rate A/B,
- tabel data.

Jalankan:
```bash
streamlit run ds_dashboard/streamlit_app.py
```

## 8. Keterbatasan
- Dataset contoh sintetis, bukan data klinis.
- Model tidak boleh digunakan untuk diagnosis psikologis.
- Sistem harus selalu menyertakan disclaimer dan rujukan bantuan profesional untuk kondisi berat.
