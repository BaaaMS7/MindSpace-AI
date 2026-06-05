# Integrasi Classifier Kuesioner

Project ini sudah diintegrasikan dengan model classifier dari file:

- `mood_classifier.keras.zip`
- `label_encoder.pkl`

Agar tidak perlu install TensorFlow di laptop, bobot model Keras sudah dikonversi menjadi:

```text
src/ml/classifierWeights.json
```

Logika inference frontend ada di:

```text
src/utils/moodClassifier.js
```

Logika inference backend/testing endpoint ada di:

```text
server/classifier.js
```

## Input model

Classifier menerima 6 jawaban kuesioner skala 1 sampai 5 dengan urutan:

```text
[mood, tidur, aktivitas, energi, stres, sosial]
```

## Output model

Output classifier adalah salah satu label berikut:

```text
DISTRESSED
LOW
NEUTRAL
GOOD
GREAT
```

Label asli dari `label_encoder.pkl` adalah:

```text
Distressed, Good, Great, Low, Neutral
```

## Alur integrasi

1. User mengisi 6 pertanyaan kuesioner.
2. `Dashboard.jsx` memanggil `classifyQuestionnaire(kuesionerAnswers)`.
3. Classifier menghasilkan label mood, confidence, dan probabilitas tiap kelas.
4. Label classifier dipakai untuk menampilkan hasil cepat di modal.
5. Label + confidence dikirim ke backend `/api/kuesioner`.
6. Backend mengirim konteks tersembunyi ke Gemini agar rekomendasi AI sesuai hasil kuesioner.
7. Backend juga menyediakan endpoint test classifier: `POST /api/classifier`.

## File yang diubah

```text
src/Dashboard.jsx
src/utils/moodClassifier.js
src/ml/classifierWeights.json
server/index.js
server/classifier.js
.env.example
.gitignore
```

## Cara menjalankan

Install dependency:

```bash
npm install --registry=https://registry.npmjs.org/
```

Buat file `.env` dari `.env.example`, lalu isi API key Gemini.

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev
```

## Catatan penting

Jangan upload `.env` dan `node_modules/` ke GitHub.


## Test endpoint classifier

Setelah backend berjalan, kamu bisa test dengan Thunder Client/Postman:

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

Contoh output:

```json
{
  "label": "GREAT",
  "rawLabel": "Great",
  "confidencePercent": 100
}
```
