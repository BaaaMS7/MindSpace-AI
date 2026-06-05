import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  saveMoodAssessment,
  saveChatMessage,
  getRecentMoodStats,
  getMongoStatus,
  getUserHistory,
} from "./mongo.js";

const app = express();

const PORT = Number(process.env.PORT || 3000);

const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173";

const CLASSIFIER_API_URL =
  process.env.CLASSIFIER_API_URL || "http://127.0.0.1:8002";

const CLASSIFIER_TIMEOUT_MS = Number(
  process.env.CLASSIFIER_TIMEOUT_MS || 15000
);

const AI_ADVICE_TIMEOUT_MS = Number(
  process.env.AI_ADVICE_TIMEOUT_MS || 18000
);

const CHAT_AI_TIMEOUT_MS = Number(
  process.env.CHAT_AI_TIMEOUT_MS || 22000
);

/*
 * Flash-Lite dipakai sebagai model utama agar respons lebih ringan.
 * Jika gagal, backend mencoba model fallback.
 */
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

/*
 * Nama environment variable lama tetap didukung agar konfigurasi lama
 * tidak langsung rusak.
 */
const GEMINI_MAX_RETRIES_PER_MODEL = Number(
  process.env.GEMINI_MAX_RETRIES_PER_MODEL ||
    process.env.GEMINI_MAX_RETRIES ||
    2
);

const GEMINI_RETRY_BASE_MS = Number(
  process.env.GEMINI_RETRY_BASE_MS ||
    process.env.GEMINI_RETRY_DELAY_MS ||
    900
);

const allowedOrigins = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`Origin tidak diizinkan oleh CORS: ${origin}`)
      );
    },
  })
);

app.use(express.json({ limit: "1mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("ISI_API_KEY")) {
  console.warn(
    "⚠️ GEMINI_API_KEY belum diisi. Backend akan memakai respons lokal saat Gemini tidak tersedia."
  );
}

const genAI =
  GEMINI_API_KEY && !GEMINI_API_KEY.includes("ISI_API_KEY")
    ? new GoogleGenerativeAI(GEMINI_API_KEY)
    : null;

const systemInstruction = `
Kamu adalah MindSpace AI, asisten dukungan kesehatan mental yang empatik,
aman, ramah, dan mudah dipahami oleh pengguna Indonesia.

Kategori hasil kuesioner:
- Great: kondisi mental sangat baik.
- Good: kondisi mental baik dan stabil.
- Netral: kondisi cukup stabil, tetapi masih ada ruang untuk refleksi.
- Low: kondisi mental sedang menurun atau rentan.
- Distressed: kondisi mental sedang sangat tertekan.

Aturan mutlak:
1. Fokus hanya pada kesehatan mental, kesejahteraan diri, emosi, stres,
   kecemasan, tidur, aktivitas sehat, relasi sosial, kebiasaan self-care,
   dan dukungan psikologis umum.
2. Jangan menjawab substansi permintaan yang berada di luar ruang lingkup
   kesehatan mental, misalnya membuat kode program, memperbaiki bug teknis,
   mengerjakan soal akademik, membahas investasi, politik, resep masakan,
   pertandingan olahraga, atau rekomendasi produk.
3. Jika pengguna menyebut emosi tetapi permintaan utamanya tetap berada di luar
   ruang lingkup, jangan menyelesaikan permintaan tersebut. Tawarkan dukungan
   untuk mengelola perasaan atau tekanan yang menyertainya.
4. Jangan memberikan diagnosis klinis.
5. Jangan menyatakan pengguna memiliki penyakit tertentu.
6. Jangan menggantikan peran psikolog, psikiater, atau tenaga medis.
7. Jika pengguna menyebut ingin menyakiti diri sendiri, bunuh diri,
   menyakiti orang lain, atau kondisi darurat, arahkan segera untuk
   menghubungi orang terdekat, tenaga profesional, atau layanan darurat setempat.
8. Berikan saran praktis yang aman dan dapat dilakukan sekarang.
9. Gunakan bahasa Indonesia yang natural.
10. Gunakan teks biasa yang rapi tanpa markdown tebal.
`;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getStatus(error) {
  return error?.status || error?.response?.status || error?.cause?.status;
}

function getSafeErrorMessage(error) {
  if (error?.name === "AbortError") {
    return "Permintaan membutuhkan waktu terlalu lama.";
  }

  return String(error?.message || "Terjadi kesalahan tidak diketahui.");
}

function isTemporaryGeminiError(error) {
  const status = getStatus(error);
  const message = getSafeErrorMessage(error).toLowerCase();

  return (
    [429, 500, 502, 503, 504].includes(status) ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("service unavailable") ||
    message.includes("temporarily unavailable") ||
    message.includes("resource_exhausted") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("waktu terlalu lama") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

function getGeminiRetryDelay(attemptIndex) {
  const exponentialDelay =
    GEMINI_RETRY_BASE_MS * Math.pow(2, attemptIndex);

  const jitter = Math.floor(Math.random() * 350);

  return Math.min(exponentialDelay + jitter, 6000);
}

function withTimeout(
  promise,
  timeoutMs,
  errorMessage = "Permintaan membutuhkan waktu terlalu lama."
) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function getModel(modelName = GEMINI_MODEL) {
  if (!genAI) {
    throw new Error("Gemini belum dikonfigurasi.");
  }

  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
  });
}

function cleanAiText(text = "") {
  return String(text).replace(/\*\*/g, "").trim();
}

async function callGeminiWithRetry({
  message,
  history = [],
  useChat = true,
}) {
  const modelsToTry = [
    ...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter(Boolean)),
  ];

  let lastError = new Error("Gemini belum memberikan respons.");

  for (const modelName of modelsToTry) {
    if (modelName !== GEMINI_MODEL) {
      console.warn(`ℹ️ Beralih ke fallback model Gemini: ${modelName}`);
    }

    for (
      let attempt = 1;
      attempt <= GEMINI_MAX_RETRIES_PER_MODEL;
      attempt += 1
    ) {
      try {
        const model = getModel(modelName);

        const result = useChat
          ? await model.startChat({ history }).sendMessage(message)
          : await model.generateContent(message);

        const text = cleanAiText(result?.response?.text?.());

        if (!text) {
          throw new Error(`Gemini ${modelName} tidak mengembalikan teks.`);
        }

        return {
          text,
          model: modelName,
          attempt,
          fallbackUsed: modelName !== GEMINI_MODEL,
        };
      } catch (error) {
        lastError = error;

        const canRetry =
          isTemporaryGeminiError(error) &&
          attempt < GEMINI_MAX_RETRIES_PER_MODEL;

        if (canRetry) {
          const delay = getGeminiRetryDelay(attempt - 1);

          console.warn(
            `⚠️ Gemini ${modelName} gagal sementara: ${getSafeErrorMessage(
              error
            )}. Percobaan ulang dalam ${delay} ms.`
          );

          await sleep(delay);
          continue;
        }

        console.warn(
          `⚠️ Gemini ${modelName} dilewati: ${getSafeErrorMessage(error)}`
        );

        break;
      }
    }
  }

  throw lastError;
}

async function fetchJsonWithTimeout(
  url,
  options = {},
  timeoutMs = 15000
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    return { response, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateQuestionnaireAnswers(answers) {
  const requiredKeys = [
    "mood",
    "tidur",
    "aktivitas",
    "energi",
    "stres",
    "sosial",
  ];

  if (!answers || typeof answers !== "object") {
    return false;
  }

  return requiredKeys.every((key) => {
    const value = Number(answers[key]);

    return Number.isFinite(value) && value >= 1 && value <= 5;
  });
}

async function classifyQuestionnaire(answers) {
  const { response, data } = await fetchJsonWithTimeout(
    `${CLASSIFIER_API_URL}/predict`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ answers }),
    },
    CLASSIFIER_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(
      data?.detail ||
        data?.error ||
        "Classifier tidak dapat memproses jawaban."
    );
  }

  return data;
}

function normalizeLabel(label = "") {
  const value = String(label).trim().toLowerCase();

  if (["great", "sangat baik", "senang"].includes(value)) {
    return "Great";
  }

  if (["good", "baik", "tenang"].includes(value)) {
    return "Good";
  }

  if (["neutral", "netral", "normal", "biasa"].includes(value)) {
    return "Netral";
  }

  if (["low", "rendah", "turun", "rentan", "cemas"].includes(value)) {
    return "Low";
  }

  if (
    ["distressed", "stress", "stres", "tertekan", "darurat"].includes(
      value
    )
  ) {
    return "Distressed";
  }

  return "Netral";
}

function inferLabelFromScore(score) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return "Netral";
  }

  if (numericScore >= 26) {
    return "Great";
  }

  if (numericScore >= 21) {
    return "Good";
  }

  if (numericScore >= 16) {
    return "Netral";
  }

  if (numericScore >= 11) {
    return "Low";
  }

  return "Distressed";
}

function createFallbackAdvice(label = "Netral") {
  const value = normalizeLabel(label);

  if (value === "Distressed") {
    return `Aku menangkap bahwa kondisimu sedang cukup berat. Hasil ini bukan diagnosis, tetapi dapat menjadi pengingat untuk memperlakukan dirimu dengan lebih lembut.

Coba lakukan grounding 5-4-3-2-1:
1. Sebutkan 5 hal yang kamu lihat.
2. Sebutkan 4 hal yang dapat kamu rasakan.
3. Sebutkan 3 suara yang kamu dengar.
4. Sebutkan 2 aroma yang kamu cium.
5. Sebutkan 1 hal kecil yang masih dapat kamu syukuri.

Jika kamu merasa tidak aman atau muncul dorongan untuk menyakiti diri, segera hubungi orang terdekat, tenaga profesional, atau layanan darurat setempat.`;
  }

  if (value === "Low") {
    return `Kondisimu terlihat sedang menurun, dan perasaan itu valid.

Coba mulai dari tiga langkah sederhana:
1. Minum air dan tarik napas perlahan.
2. Tuliskan satu hal yang paling membebani pikiranmu.
3. Pilih satu tindakan kecil yang realistis untuk dilakukan hari ini.

Kamu tidak harus menyelesaikan semuanya sekaligus.`;
  }

  if (value === "Good") {
    return `Kondisimu terlihat baik dan cukup stabil.

Pertahankan kebiasaan yang mendukung kesejahteraanmu:
1. Jaga waktu tidur yang cukup.
2. Luangkan waktu untuk bergerak atau berolahraga ringan.
3. Tetap terhubung dengan orang yang membuatmu merasa aman.

Coba perhatikan kebiasaan mana yang paling membantumu merasa lebih baik.`;
  }

  if (value === "Great") {
    return `Kondisimu terlihat sangat positif.

Pertahankan konsistensi dengan menjaga pola tidur, aktivitas fisik, relasi yang sehat, dan waktu untuk diri sendiri. Kamu juga dapat mencatat kebiasaan yang paling membantu agar dapat mengulanginya ketika menghadapi hari yang lebih berat.`;
  }

  return `Kondisimu terlihat cukup stabil, tetapi mungkin masih ada beberapa hal kecil yang mengganggu.

Coba periksa kebutuhan dasarmu:
1. Apakah kamu sudah cukup tidur?
2. Apakah kamu sudah makan dan minum dengan cukup?
3. Apakah ada sesuatu yang ingin kamu ceritakan kepada orang tepercaya?
4. Apakah kamu membutuhkan jeda sejenak dari aktivitasmu?

Kamu dapat mulai dari satu langkah kecil terlebih dahulu.`;
}

const EMERGENCY_KEYWORDS = [
  "bunuh diri",
  "suicide",
  "mau mati",
  "ingin mati",
  "pengen mati",
  "mati saja",
  "akhiri hidup",
  "mengakhiri hidup",
  "menyakiti diri",
  "nyakitin diri",
  "self harm",
  "self-harm",
  "melukai diri",
  "menyakiti orang",
  "membunuh orang",
  "melukai orang",
];

const MENTAL_HEALTH_KEYWORDS = [
  "mental",
  "kesehatan mental",
  "emosi",
  "perasaan",
  "mood",
  "suasana hati",
  "stres",
  "stress",
  "cemas",
  "kecemasan",
  "gelisah",
  "khawatir",
  "takut",
  "panik",
  "overthinking",
  "sedih",
  "menangis",
  "nangis",
  "marah",
  "kesal",
  "bete",
  "kecewa",
  "putus asa",
  "hampa",
  "kesepian",
  "sendirian",
  "capek",
  "lelah",
  "burnout",
  "tertekan",
  "tekanan",
  "beban pikiran",
  "pikiran",
  "susah tidur",
  "sulit tidur",
  "insomnia",
  "tidur",
  "mimpi buruk",
  "trauma",
  "percaya diri",
  "insecure",
  "harga diri",
  "self esteem",
  "self-esteem",
  "motivasi",
  "semangat",
  "tenang",
  "bahagia",
  "senang",
  "lega",
  "relasi",
  "hubungan",
  "teman",
  "keluarga",
  "pasangan",
  "toxic",
  "bullying",
  "perundungan",
  "grounding",
  "napas",
  "pernapasan",
  "self care",
  "self-care",
  "psikolog",
  "psikiater",
  "konseling",
  "terapi",
  "depresi",
  "anxiety",
];

const OUT_OF_SCOPE_TOPIC_KEYWORDS = [
  "coding",
  "kode program",
  "source code",
  "programming",
  "javascript",
  "typescript",
  "python",
  "java",
  "react",
  "vite",
  "node.js",
  "nodejs",
  "html",
  "css",
  "website",
  "web portfolio",
  "portofolio",
  "portfolio",
  "bug",
  "error console",
  "database",
  "mongodb",
  "firebase",
  "matematika",
  "integral",
  "fisika",
  "kimia",
  "sejarah",
  "politik",
  "presiden",
  "saham",
  "crypto",
  "bitcoin",
  "investasi",
  "trading",
  "cuaca",
  "resep",
  "masakan",
  "film",
  "game",
  "sepak bola",
  "laptop",
  "handphone",
  "smartphone",
  "produk",
  "belanja",
  "ppt",
  "powerpoint",
  "makalah",
];

const OUT_OF_SCOPE_REQUEST_KEYWORDS = [
  "buatkan",
  "bikinkan",
  "buat ",
  "tolong buat",
  "perbaiki",
  "debug",
  "kerjakan",
  "hitung",
  "carikan",
  "rekomendasikan",
  "jelaskan cara",
  "cara memperbaiki",
  "bagaimana cara membuat",
  "bisakah kamu membuat",
  "bisa kah kamu membuat",
  "tolong selesaikan",
];

const GREETING_PATTERNS = [
  /^hai[.!?\s]*$/i,
  /^halo[.!?\s]*$/i,
  /^hello[.!?\s]*$/i,
  /^hi[.!?\s]*$/i,
  /^selamat (pagi|siang|sore|malam)[.!?\s]*$/i,
  /^terima kasih[.!?\s]*$/i,
  /^makasih[.!?\s]*$/i,
  /^thanks[.!?\s]*$/i,
];

const CONTINUATION_PATTERNS = [
  /^(iya|ya|oke|ok|baik|boleh|lanjut|terus|gimana|bagaimana|kenapa|mengapa|tidak tahu|nggak tahu|ga tahu|aku bingung|coba jelaskan|tolong bantu)[.!?\s]*$/i,
  /^(apa yang harus aku lakukan|apa yang sebaiknya aku lakukan|bisa bantu aku|temani aku|aku mau cerita)[.!?\s]*$/i,
];

function containsAnyKeyword(text, keywords) {
  const normalizedText = String(text || "").toLowerCase();

  return keywords.some((keyword) => normalizedText.includes(keyword));
}

function isEmergencyMessage(message = "") {
  return containsAnyKeyword(message, EMERGENCY_KEYWORDS);
}

function isMentalHealthRelatedMessage(message = "") {
  return containsAnyKeyword(message, MENTAL_HEALTH_KEYWORDS);
}

function isClearlyOutOfScopeRequest(message = "") {
  const normalizedMessage = String(message || "").toLowerCase();

  const hasOutOfScopeTopic = containsAnyKeyword(
    normalizedMessage,
    OUT_OF_SCOPE_TOPIC_KEYWORDS
  );

  const hasRequestIntent = containsAnyKeyword(
    normalizedMessage,
    OUT_OF_SCOPE_REQUEST_KEYWORDS
  );

  return hasOutOfScopeTopic && hasRequestIntent;
}

function isGreetingMessage(message = "") {
  const trimmedMessage = String(message || "").trim();

  return GREETING_PATTERNS.some((pattern) => pattern.test(trimmedMessage));
}

function isShortContinuationMessage(message = "") {
  const trimmedMessage = String(message || "").trim();

  if (!trimmedMessage || trimmedMessage.length > 90) {
    return false;
  }

  return CONTINUATION_PATTERNS.some((pattern) => pattern.test(trimmedMessage));
}

function extractMessageText(message) {
  return String(
    message?.text ||
      message?.content ||
      message?.message ||
      message?.parts?.[0]?.text ||
      ""
  ).trim();
}

function hasMentalHealthContext(history = [], questionnaireLabel) {
  if (questionnaireLabel) {
    return true;
  }

  if (!Array.isArray(history)) {
    return false;
  }

  return history.slice(-8).some((item) => {
    const text = extractMessageText(item);

    return isEmergencyMessage(text) || isMentalHealthRelatedMessage(text);
  });
}

function evaluateChatScope({
  message = "",
  history = [],
  questionnaireLabel,
} = {}) {
  const trimmedMessage = String(message || "").trim();

  if (isEmergencyMessage(trimmedMessage)) {
    return {
      allowed: true,
      localOnly: true,
      reason: "emergency",
    };
  }

  const hasMentalTopic = isMentalHealthRelatedMessage(trimmedMessage);
  const hasOutOfScopeRequest = isClearlyOutOfScopeRequest(trimmedMessage);

  /*
   * Contoh yang akan ditolak:
   * "Aku sedang senang, tolong buatkan website portfolio."
   *
   * Contoh yang tetap boleh dibahas:
   * "Aku stres karena website error dan sulit tidur."
   */
  if (hasOutOfScopeRequest) {
    return {
      allowed: false,
      localOnly: true,
      reason: hasMentalTopic
        ? "mixed-but-main-request-out-of-scope"
        : "out-of-scope",
    };
  }

  if (hasMentalTopic) {
    return {
      allowed: true,
      localOnly: false,
      reason: "mental-health-topic",
    };
  }

  if (isGreetingMessage(trimmedMessage)) {
    return {
      allowed: true,
      localOnly: true,
      reason: "greeting",
    };
  }

  if (
    hasMentalHealthContext(history, questionnaireLabel) &&
    isShortContinuationMessage(trimmedMessage)
  ) {
    return {
      allowed: true,
      localOnly: false,
      reason: "contextual-follow-up",
    };
  }

  return {
    allowed: false,
    localOnly: true,
    reason: "topic-not-detected",
  };
}

function createScopeRedirectReply() {
  return `Aku adalah MindSpace AI yang difokuskan untuk dukungan kesehatan mental dan kesejahteraan diri.

Aku belum dapat membantu menjawab topik di luar ruang lingkup tersebut, seperti membuat kode program, memperbaiki masalah teknis, mengerjakan tugas akademik, atau memberikan rekomendasi di bidang lain.

Jika ada tekanan, rasa cemas, kelelahan, atau emosi tertentu yang muncul karena situasi tersebut, kamu boleh menceritakannya. Aku akan membantumu menyusun langkah kecil yang aman dan realistis.`;
}

function createGreetingReply() {
  return `Halo! Aku adalah MindSpace AI. Aku siap mendengarkan cerita yang berkaitan dengan perasaan, stres, kecemasan, tidur, relasi sosial, atau kesejahteraan dirimu.

Apa yang sedang kamu rasakan hari ini?`;
}

function createEmergencyReply() {
  return `Aku turut prihatin kamu sedang menghadapi keadaan yang sangat berat. Keselamatanmu adalah prioritas utama.

Segera hubungi orang terdekat yang dapat menemanimu secara langsung, tenaga profesional, atau layanan darurat setempat. Jika memungkinkan, jangan berada sendirian dan jauhkan benda yang dapat membahayakan dirimu atau orang lain.

Aku dapat menemanimu menyusun satu kalimat singkat untuk meminta bantuan kepada seseorang yang kamu percaya.`;
}

function createChatFallbackReply(message = "") {
  if (isEmergencyMessage(message)) {
    return createEmergencyReply();
  }

  return `Aku tetap di sini untuk mendengarkanmu. Saat ini respons personal membutuhkan waktu sedikit lebih lama.

Sambil menunggu, coba tarik napas perlahan, beri nama emosi yang kamu rasakan, lalu ceritakan satu hal yang paling mengganggumu saat ini.`;
}

function normalizeUserIdentity({ userId, userEmail } = {}) {
  const normalizedUserId =
    String(userId || "anonymous").trim() || "anonymous";

  const normalizedUserEmail =
    String(userEmail || "anonymous").trim().toLowerCase() || "anonymous";

  return {
    userId: normalizedUserId,
    userEmail: normalizedUserEmail,
  };
}

async function captureMongoWrite(label, writePromise) {
  try {
    const result = await writePromise;

    return {
      ok: true,
      ...result,
    };
  } catch (error) {
    console.warn(
      `⚠️ MongoDB write gagal (${label}): ${getSafeErrorMessage(error)}`
    );

    return {
      ok: false,
      error: getSafeErrorMessage(error),
    };
  }
}

function normalizeGeminiHistory(messages = []) {
  const rawMessages = Array.isArray(messages) ? messages : [];

  const normalized = rawMessages
    .slice(-16)
    .map((message) => {
      const text = extractMessageText(message);

      if (!text) {
        return null;
      }

      const sender = String(message?.sender || message?.role || "")
        .trim()
        .toLowerCase();

      const role = ["ai", "assistant", "bot", "model"].includes(sender)
        ? "model"
        : "user";

      return {
        role,
        parts: [{ text }],
      };
    })
    .filter(Boolean);

  while (normalized.length > 0 && normalized[0].role !== "user") {
    normalized.shift();
  }

  while (
    normalized.length > 0 &&
    normalized[normalized.length - 1].role !== "model"
  ) {
    normalized.pop();
  }

  const compacted = [];

  for (const item of normalized) {
    const previous = compacted[compacted.length - 1];

    if (previous && previous.role === item.role) {
      previous.parts[0].text += `\n${item.parts[0].text}`;
    } else {
      compacted.push(item);
    }
  }

  return compacted.slice(-10);
}

app.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    service: "MindSpace AI Backend",
    port: PORT,
    classifierApiUrl: CLASSIFIER_API_URL,
    geminiConfigured: Boolean(genAI),
    geminiModel: GEMINI_MODEL,
    geminiFallbackModel: GEMINI_FALLBACK_MODEL,
    geminiMaxRetriesPerModel: GEMINI_MAX_RETRIES_PER_MODEL,
    geminiRetryBaseMs: GEMINI_RETRY_BASE_MS,
    mongoConfigured: Boolean(process.env.MONGODB_URI),
    mongoHealthUrl: "/health/mongo",
    chatScopeGuard: true,
  });
});

app.get("/health/mongo", async (req, res) => {
  const status = await getMongoStatus();

  res.status(status.connected ? 200 : 503).json(status);
});

app.get("/api/user/history", async (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim();

    const userEmail = String(req.query.userEmail || "")
      .trim()
      .toLowerCase();

    if (!userId && !userEmail) {
      return res.status(400).json({
        error: "userId atau userEmail wajib dikirim.",
      });
    }

    const history = await getUserHistory({
      userId,
      userEmail,
      limit: Number(req.query.limit || 300),
    });

    return res.json({
      success: true,
      ...history,
    });
  } catch (error) {
    console.error("Error /api/user/history:", error);

    return res.status(500).json({
      success: false,
      error: "Gagal mengambil riwayat user.",
      detail:
        process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

app.post("/api/classifier", async (req, res) => {
  try {
    const { answers } = req.body;

    if (!validateQuestionnaireAnswers(answers)) {
      return res.status(400).json({
        error:
          "Seluruh jawaban kuesioner wajib diisi menggunakan nilai 1 sampai 5.",
      });
    }

    const result = await classifyQuestionnaire(answers);

    return res.json(result);
  } catch (error) {
    console.error("Error /api/classifier:", getSafeErrorMessage(error));

    return res.status(503).json({
      error: "Classifier belum dapat dihubungi. Silakan coba kembali.",
      detail:
        process.env.NODE_ENV === "production"
          ? undefined
          : getSafeErrorMessage(error),
    });
  }
});

app.post("/api/kuesioner", async (req, res) => {
  const { label, age, answers, score, userId, userEmail, chatId } = req.body;

  const userIdentity = normalizeUserIdentity({ userId, userEmail });

  if (!validateQuestionnaireAnswers(answers)) {
    return res.status(400).json({
      error:
        "Seluruh jawaban kuesioner wajib diisi menggunakan nilai 1 sampai 5.",
    });
  }

  let normalizedLabel = normalizeLabel(label || inferLabelFromScore(score));

  let classifierResult = null;
  let classifierError = null;

  try {
    classifierResult = await classifyQuestionnaire(answers);

    normalizedLabel = normalizeLabel(
      classifierResult?.label ||
        classifierResult?.rawLabel ||
        label ||
        inferLabelFromScore(score)
    );
  } catch (error) {
    classifierError = getSafeErrorMessage(error);

    console.warn(
      `⚠️ Classifier tidak tersedia. Menggunakan estimasi skor sementara: ${classifierError}`
    );
  }

  const classifierInfo = classifierResult
    ? `
Hasil classifier:
- Label prediksi: ${
        classifierResult.rawLabel || classifierResult.label || normalizedLabel
      }
- Confidence: ${
        classifierResult.confidencePercent ??
        Math.round(Number(classifierResult.confidence || 0) * 100)
      }%
- Probabilitas: ${JSON.stringify(classifierResult.probabilities || {})}`
    : `
Classifier sedang tidak tersedia.
Gunakan kategori estimasi berdasarkan skor: ${normalizedLabel}.`;

  const hiddenPrompt = `
Konteks tersembunyi dari website:
Pengguna baru saja mengisi kuesioner kesejahteraan mental.

Kategori hasil: ${normalizedLabel}
Usia pengguna: ${age || "tidak disebutkan"}
Skor ringkas: ${score ?? "tidak tersedia"}
Jawaban skala 1 sampai 5: ${JSON.stringify(answers)}
${classifierInfo}

Tugas:
1. Sapa pengguna dengan empatik.
2. Jelaskan hasil secara non-diagnostik.
3. Berikan 3 rekomendasi awal yang praktis.
4. Akhiri dengan pertanyaan ringan agar pengguna mau melanjutkan chat.
5. Jika kategori Low atau Distressed, tambahkan teknik grounding atau pernapasan singkat.
6. Gunakan bahasa Indonesia yang natural dan mudah dipahami.
7. Jangan menyebut detail implementasi teknis seperti file model atau API.
`;

  let aiAdvice = createFallbackAdvice(normalizedLabel);
  let geminiModel = null;
  let geminiFallbackUsed = false;
  let geminiError = null;

  try {
    const gemini = await withTimeout(
      callGeminiWithRetry({
        message: hiddenPrompt,
        useChat: false,
      }),
      AI_ADVICE_TIMEOUT_MS,
      "AI membutuhkan waktu terlalu lama untuk menyiapkan saran."
    );

    aiAdvice = gemini.text;
    geminiModel = gemini.model;
    geminiFallbackUsed = gemini.fallbackUsed;
  } catch (error) {
    geminiError = getSafeErrorMessage(error);

    console.warn(
      `⚠️ Gemini belum dapat memberikan saran. Menggunakan saran lokal: ${geminiError}`
    );
  }

  const storage = await captureMongoWrite(
    "mood_assessments",
    saveMoodAssessment({
      userId: userIdentity.userId,
      userEmail: userIdentity.userEmail,
      chatId: chatId || null,
      age: age || null,
      score: score ?? null,
      answers,
      label: normalizedLabel,
      classifier: classifierResult,
      classifierError,
      aiAdvice,
      source: classifierResult
        ? "questionnaire"
        : "questionnaire-score-fallback",
      geminiModel,
      geminiFallbackUsed,
      geminiError,
    })
  );

  return res.json({
    balasan: aiAdvice,
    label: normalizedLabel,
    classifier: classifierResult,
    classifierFallbackUsed: Boolean(classifierError),
    aiFallbackUsed: Boolean(geminiError),
    model: geminiModel,
    fallbackUsed: geminiFallbackUsed,
    storage,
  });
});

app.post("/api/chat", async (req, res) => {
  const {
    message,
    history = [],
    questionnaireLabel,
    userId,
    userEmail,
    chatId,
  } = req.body;

  const userIdentity = normalizeUserIdentity({ userId, userEmail });

  const trimmedMessage = String(message || "").trim();

  if (!trimmedMessage) {
    return res.status(400).json({
      error: "Pesan tidak boleh kosong.",
    });
  }

  const userStorage = await captureMongoWrite(
    "chat_messages user",
    saveChatMessage({
      userId: userIdentity.userId,
      userEmail: userIdentity.userEmail,
      chatId: chatId || null,
      sender: "user",
      text: trimmedMessage,
    })
  );

  const scopeAssessment = evaluateChatScope({
    message: trimmedMessage,
    history,
    questionnaireLabel,
  });

  /*
   * Pesan greeting, pesan darurat, dan pesan di luar scope diproses lokal.
   * Gemini tidak dipanggil sehingga respons lebih cepat dan lebih konsisten.
   */
  if (scopeAssessment.localOnly) {
    let scopedReply = createScopeRedirectReply();

    if (scopeAssessment.reason === "greeting") {
      scopedReply = createGreetingReply();
    }

    if (scopeAssessment.reason === "emergency") {
      scopedReply = createEmergencyReply();
    }

    const aiStorage = await captureMongoWrite(
      "chat_messages ai scope-guard",
      saveChatMessage({
        userId: userIdentity.userId,
        userEmail: userIdentity.userEmail,
        chatId: chatId || null,
        sender: "ai",
        text: scopedReply,
        geminiModel: "local-scope-guard",
        geminiFallbackUsed: true,
        topicScope: scopeAssessment.reason,
      })
    );

    return res.json({
      balasan: scopedReply,
      model: "local-scope-guard",
      fallbackUsed: true,
      aiFallbackUsed: false,
      scope: {
        allowed: scopeAssessment.allowed,
        reason: scopeAssessment.reason,
      },
      storage: {
        user: userStorage,
        ai: aiStorage,
      },
    });
  }

  const normalizedHistory = normalizeGeminiHistory(history);

  const labelContext = questionnaireLabel
    ? `Konteks kuesioner terbaru pengguna: ${normalizeLabel(
        questionnaireLabel
      )}. Gunakan konteks secara halus dan jangan mengulang hasil kecuali relevan.\n\n`
    : "";

  let aiReply = createChatFallbackReply(trimmedMessage);
  let geminiModel = null;
  let geminiFallbackUsed = false;
  let geminiError = null;

  try {
    const gemini = await withTimeout(
      callGeminiWithRetry({
        message: `${labelContext}${trimmedMessage}`,
        history: normalizedHistory,
        useChat: true,
      }),
      CHAT_AI_TIMEOUT_MS,
      "AI membutuhkan waktu terlalu lama untuk membalas."
    );

    aiReply = gemini.text;
    geminiModel = gemini.model;
    geminiFallbackUsed = gemini.fallbackUsed;
  } catch (error) {
    geminiError = getSafeErrorMessage(error);

    console.warn(
      `⚠️ Gemini belum dapat membalas chat. Menggunakan respons lokal: ${geminiError}`
    );
  }

  const aiStorage = await captureMongoWrite(
    "chat_messages ai",
    saveChatMessage({
      userId: userIdentity.userId,
      userEmail: userIdentity.userEmail,
      chatId: chatId || null,
      sender: "ai",
      text: aiReply,
      geminiModel,
      geminiFallbackUsed,
      geminiError,
      topicScope: scopeAssessment.reason,
    })
  );

  return res.json({
    balasan: aiReply,
    model: geminiModel,
    fallbackUsed: geminiFallbackUsed,
    aiFallbackUsed: Boolean(geminiError),
    scope: {
      allowed: true,
      reason: scopeAssessment.reason,
    },
    storage: {
      user: userStorage,
      ai: aiStorage,
    },
  });
});

app.get("/api/analytics/mood-summary", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);

    const stats = await getRecentMoodStats(limit);

    return res.json({
      mongoEnabled: true,
      ...stats,
    });
  } catch (error) {
    console.error(
      "Error /api/analytics/mood-summary:",
      getSafeErrorMessage(error)
    );

    return res.status(503).json({
      mongoEnabled: false,
      error: "Gagal mengambil analytics MongoDB.",
      detail:
        process.env.NODE_ENV === "production"
          ? undefined
          : getSafeErrorMessage(error),
    });
  }
});

app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  console.error("Unhandled backend error:", getSafeErrorMessage(error));

  return res.status(500).json({
    error: "Terjadi kesalahan pada server.",
    detail:
      process.env.NODE_ENV === "production"
        ? undefined
        : getSafeErrorMessage(error),
  });
});

app.listen(PORT, async () => {
  console.log(`✅ MindSpace backend berjalan di http://127.0.0.1:${PORT}`);
  console.log(`ℹ️ Classifier API: ${CLASSIFIER_API_URL}`);
  console.log(`ℹ️ Gemini utama: ${GEMINI_MODEL}`);
  console.log(`ℹ️ Gemini fallback: ${GEMINI_FALLBACK_MODEL}`);
  console.log(`ℹ️ Scope guard chat: aktif`);
  console.log(`ℹ️ Cek MongoDB: http://127.0.0.1:${PORT}/health/mongo`);

  const mongoStatus = await getMongoStatus();

  if (mongoStatus.connected) {
    console.log(`✅ MongoDB siap: ${mongoStatus.target}`);
  } else {
    console.warn(`⚠️ MongoDB belum siap: ${mongoStatus.error}`);
  }
});