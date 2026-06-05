import dotenv from "dotenv";
import { MongoClient } from "mongodb";

// mongo.js juga memuat .env sendiri agar konfigurasi sudah tersedia ketika
// modul ini di-import lebih awal oleh server/index.js pada mode ESM.
dotenv.config();

const DEFAULT_DB_NAME = "mindspace_ai";

let client = null;
let db = null;
let connectionPromise = null;
let indexesReady = false;
let lastConnectionError = null;

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getMongoConfig() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME).trim() || DEFAULT_DB_NAME;
  const family = Number(process.env.MONGODB_FAMILY);

  return {
    uri,
    dbName,
    options: {
      appName: "mindspace-ai-backend",
      serverSelectionTimeoutMS: readPositiveNumber("MONGODB_SERVER_SELECTION_TIMEOUT_MS", 8000),
      connectTimeoutMS: readPositiveNumber("MONGODB_CONNECT_TIMEOUT_MS", 8000),
      socketTimeoutMS: readPositiveNumber("MONGODB_SOCKET_TIMEOUT_MS", 15000),
      maxPoolSize: readPositiveNumber("MONGODB_MAX_POOL_SIZE", 10),
      minPoolSize: 0,
      retryWrites: true,
      ...(family === 4 || family === 6 ? { family } : {}),
    },
  };
}

function createConfigError() {
  const error = new Error(
    "MONGODB_URI belum diisi. Copy .env.example menjadi .env lalu isi URI MongoDB Atlas atau MongoDB lokal."
  );
  error.code = "MONGODB_URI_MISSING";
  return error;
}

function getSafeMongoTarget(uri, dbName) {
  if (!uri) return "belum dikonfigurasi";

  try {
    const withoutProtocol = uri.replace(/^mongodb(?:\+srv)?:\/\//i, "");
    const hostAndPath = withoutProtocol.includes("@")
      ? withoutProtocol.split("@").slice(-1)[0]
      : withoutProtocol;
    const host = hostAndPath.split("/")[0];
    return `${host}/${dbName}`;
  } catch {
    return dbName;
  }
}

async function ensureIndexes(database) {
  if (indexesReady) return;

  const moodAssessments = database.collection("mood_assessments");
  const chatMessages = database.collection("chat_messages");

  await Promise.all([
    moodAssessments.createIndex({ userEmail: 1 }),
    moodAssessments.createIndex({ userId: 1 }),
    moodAssessments.createIndex({ createdAt: -1 }),
    moodAssessments.createIndex({ chatId: 1 }),
    chatMessages.createIndex({ userEmail: 1 }),
    chatMessages.createIndex({ userId: 1 }),
    chatMessages.createIndex({ createdAt: -1 }),
    chatMessages.createIndex({ chatId: 1 }),
  ]);

  indexesReady = true;
}

async function resetConnectionState() {
  const previousClient = client;

  client = null;
  db = null;
  connectionPromise = null;
  indexesReady = false;

  if (previousClient) {
    await previousClient.close().catch(() => undefined);
  }
}

export async function getDb() {
  if (db) return db;
  if (connectionPromise) return connectionPromise;

  const { uri, dbName, options } = getMongoConfig();
  if (!uri) throw createConfigError();

  connectionPromise = (async () => {
    const nextClient = new MongoClient(uri, options);

    try {
      await nextClient.connect();
      await nextClient.db("admin").command({ ping: 1 });

      client = nextClient;
      db = client.db(dbName);
      await ensureIndexes(db);

      lastConnectionError = null;
      console.log(`✅ MongoDB connected: ${getSafeMongoTarget(uri, dbName)}`);
      return db;
    } catch (error) {
      lastConnectionError = error;
      await nextClient.close().catch(() => undefined);
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

export async function closeMongoConnection() {
  await resetConnectionState();
}

export async function getMongoStatus() {
  const { uri, dbName } = getMongoConfig();

  if (!uri) {
    return {
      configured: false,
      connected: false,
      dbName,
      target: "belum dikonfigurasi",
      error: createConfigError().message,
    };
  }

  try {
    const database = await getDb();
    await database.command({ ping: 1 });

    const [assessmentCount, chatCount] = await Promise.all([
      database.collection("mood_assessments").countDocuments({}),
      database.collection("chat_messages").countDocuments({}),
    ]);

    return {
      configured: true,
      connected: true,
      dbName,
      target: getSafeMongoTarget(uri, dbName),
      collections: {
        mood_assessments: assessmentCount,
        chat_messages: chatCount,
      },
    };
  } catch (error) {
    lastConnectionError = error;
    await resetConnectionState();

    return {
      configured: true,
      connected: false,
      dbName,
      target: getSafeMongoTarget(uri, dbName),
      error: error.message,
    };
  }
}

export async function saveMoodAssessment(payload) {
  const database = await getDb();
  const now = new Date();

  const doc = {
    ...payload,
    userId: String(payload.userId || "anonymous").trim() || "anonymous",
    userEmail: String(payload.userEmail || "anonymous").trim().toLowerCase() || "anonymous",
    createdAt: now,
    updatedAt: now,
  };

  const result = await database.collection("mood_assessments").insertOne(doc);
  return { ok: true, insertedId: result.insertedId };
}

export async function saveChatMessage(payload) {
  const database = await getDb();

  const doc = {
    ...payload,
    userId: String(payload.userId || "anonymous").trim() || "anonymous",
    userEmail: String(payload.userEmail || "anonymous").trim().toLowerCase() || "anonymous",
    createdAt: new Date(),
  };

  const result = await database.collection("chat_messages").insertOne(doc);
  return { ok: true, insertedId: result.insertedId };
}

export async function getRecentMoodStats(limit = 100) {
  const database = await getDb();

  const assessments = await database
    .collection("mood_assessments")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  const labelCounts = assessments.reduce((acc, item) => {
    const label = item.label || item.classifier?.label || "UNKNOWN";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return {
    total: assessments.length,
    labelCounts,
    latest: assessments.slice(0, 10),
  };
}

export function getLastMongoError() {
  return lastConnectionError?.message || null;
}

export async function getUserHistory({
  userId,
  userEmail,
  limit = 300,
} = {}) {
  const database = await getDb();

  const normalizedUserId = String(userId || "").trim();
  const normalizedUserEmail = String(userEmail || "")
    .trim()
    .toLowerCase();

  /*
   * Jika identitas user tidak tersedia, jangan mengambil data apa pun.
   * Hal ini mencegah riwayat akun lain tampil secara tidak sengaja.
   */
  if (!normalizedUserId && !normalizedUserEmail) {
    return {
      moodAssessments: [],
      chatMessages: [],
    };
  }

  const identityFilters = [];

  if (normalizedUserId) {
    identityFilters.push({ userId: normalizedUserId });
  }

  if (normalizedUserEmail) {
    identityFilters.push({ userEmail: normalizedUserEmail });
  }

  const filter =
    identityFilters.length === 1
      ? identityFilters[0]
      : { $or: identityFilters };

  const [moodAssessments, chatMessages] = await Promise.all([
    database
      .collection("mood_assessments")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),

    database
      .collection("chat_messages")
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray(),
  ]);

  return {
    moodAssessments,
    chatMessages,
  };
}