# Data Dictionary — MindSpace Mood Questionnaire

Dokumen ini menjelaskan dataset yang digunakan untuk proses **Data Wrangling**, **EDA**, **Feature Engineering**, training model classifier, dan dashboard analitik.

| Kolom | Tipe | Deskripsi |
|---|---|---|
| `user_id` | string | ID anonim pengguna sintetis. Tidak menyimpan nama asli. |
| `created_at` | date | Tanggal pengisian kuesioner. |
| `age` | integer | Usia pengguna. Input aplikasi dibatasi 10–100 tahun. |
| `mood` | integer 1–5 | Suasana hati. Nilai makin tinggi berarti makin baik. |
| `tidur` | integer 1–5 | Kualitas tidur. Nilai makin tinggi berarti makin baik. |
| `aktivitas` | integer 1–5 | Aktivitas fisik. Nilai makin tinggi berarti makin aktif. |
| `energi` | integer 1–5 | Energi harian. Nilai makin tinggi berarti makin bertenaga. |
| `stres` | integer 1–5 | Tingkat stres. Nilai makin tinggi berarti makin tertekan. Untuk skor kesejahteraan fitur ini dibalik menjadi `6 - stres`. |
| `sosial` | integer 1–5 | Kualitas interaksi sosial. Nilai makin tinggi berarti makin baik. |
| `wellbeing_score` | integer | Fitur gabungan: `mood + tidur + aktivitas + energi + (6 - stres) + sosial`. |
| `label` | categorical | Target klasifikasi: `Great`, `Good`, `Neutral`, `Low`, `Distressed`. |
| `ab_group` | categorical | Grup A/B testing: `A` sebagai kontrol, `B` sebagai variasi rekomendasi. |
| `completed_recommendation` | binary | 1 jika pengguna menyelesaikan rekomendasi awal, 0 jika tidak. |
| `session_seconds` | integer | Durasi sesi pengguna dalam detik. |

> Catatan etika: dataset contoh ini bersifat sintetis untuk demonstrasi teknis, bukan data klinis. Sistem tidak digunakan untuk diagnosis medis.
