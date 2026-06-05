import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import feather from "feather-icons";
import { apiClient, getApiErrorMessage } from "./api/client";

const STREAMLIT_URL =
  import.meta.env.VITE_STREAMLIT_URL ||
  "https://mindspace-ai-analytics.streamlit.app";

const STREAMLIT_BASE_URL = STREAMLIT_URL.replace(/\/+$/, "");

const STREAMLIT_HEALTH_URL =
  `${STREAMLIT_BASE_URL}/_stcore/health`;

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

async function checkStreamlitHealth() {
  try {
    const response = await fetch(STREAMLIT_HEALTH_URL, {
      method: "GET",
      cache: "no-store",
    });

    return response.ok;
  } catch {
    try {
      await fetch(STREAMLIT_HEALTH_URL, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
      });

      return true;
    } catch {
      return false;
    }
  }
}

async function waitForStreamlitReady({
  timeoutMs = 20000,
  intervalMs = 500,
  requiredHealthyChecks = 2,
} = {}) {
  const startedAt = Date.now();

  let healthyChecks = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const isReady = await checkStreamlitHealth();

    if (isReady) {
      healthyChecks += 1;

      if (healthyChecks >= requiredHealthyChecks) {
        await wait(700);

        return true;
      }
    } else {
      healthyChecks = 0;
    }

    await wait(intervalMs);
  }

  return false;
}

const LOGS_PER_PAGE = 5;
const NEW_CHAT_DRAFT_KEY = "__new_chat__";

const MOOD_ORDER = ["GREAT", "GOOD", "NEUTRAL", "LOW", "DISTRESSED"];

const MOOD_META = {
  GREAT: {
    label: "Senang",
    short: "Great",
    color: "#93C5FD",
    textClass: "text-mood-senang",
    borderClass: "border-mood-senang/25",
    bgClass: "bg-mood-senang/10",
    icon: "smile",
  },

  GOOD: {
    label: "Tenang",
    short: "Good",
    color: "#6EE7B7",
    textClass: "text-mood-tenang",
    borderClass: "border-mood-tenang/25",
    bgClass: "bg-mood-tenang/10",
    icon: "smile",
  },

  NEUTRAL: {
    label: "Netral",
    short: "Neutral",
    color: "#A78BFA",
    textClass: "text-mood-sedih",
    borderClass: "border-mood-sedih/25",
    bgClass: "bg-mood-sedih/10",
    icon: "minus-circle",
  },

  LOW: {
    label: "Cemas",
    short: "Low",
    color: "#FCD34D",
    textClass: "text-mood-cemas",
    borderClass: "border-mood-cemas/25",
    bgClass: "bg-mood-cemas/10",
    icon: "cloud-rain",
  },

  DISTRESSED: {
    label: "Stres",
    short: "Distressed",
    color: "#FCA5A5",
    textClass: "text-mood-stres",
    borderClass: "border-mood-stres/25",
    bgClass: "bg-mood-stres/10",
    icon: "activity",
  },
};

const KUESIONER_QUESTIONS = [
  {
    id: "mood",
    text: "1. Bagaimana suasana hatimu secara keseluruhan minggu ini?",
    min: "Sangat Buruk",
    max: "Sangat Baik",
  },

  {
    id: "tidur",
    text: "2. Bagaimana kualitas tidurmu belakangan ini?",
    min: "Sangat Buruk",
    max: "Sangat Baik",
  },

  {
    id: "aktivitas",
    text: "3. Seberapa aktif kamu bergerak atau berolahraga?",
    min: "Sangat Pasif",
    max: "Sangat Aktif",
  },

  {
    id: "energi",
    text: "4. Seberapa besar energimu untuk menjalani hari?",
    min: "Sangat Lelah",
    max: "Sangat Bertenaga",
  },

  {
    id: "stres",
    text: "5. Seberapa tinggi tingkat stres yang kamu rasakan?",
    min: "Sangat Tenang",
    max: "Sangat Tertekan",
    reverse: true,
  },

  {
    id: "sosial",
    text: "6. Seberapa baik interaksi sosialmu dengan orang lain?",
    min: "Menarik Diri",
    max: "Sangat Aktif Sosial",
  },
];

const LIKERT_LABELS_BY_QUESTION = {
  mood: [
    { value: 1, text: "Sangat buruk" },
    { value: 2, text: "Buruk" },
    { value: 3, text: "Netral" },
    { value: 4, text: "Baik" },
    { value: 5, text: "Sangat baik" },
  ],

  tidur: [
    { value: 1, text: "Sangat buruk" },
    { value: 2, text: "Buruk" },
    { value: 3, text: "Netral" },
    { value: 4, text: "Baik" },
    { value: 5, text: "Sangat baik" },
  ],

  aktivitas: [
    { value: 1, text: "Sangat pasif" },
    { value: 2, text: "Pasif" },
    { value: 3, text: "Netral" },
    { value: 4, text: "Aktif" },
    { value: 5, text: "Sangat aktif" },
  ],

  energi: [
    { value: 1, text: "Sangat kecil" },
    { value: 2, text: "Kecil" },
    { value: 3, text: "Netral" },
    { value: 4, text: "Besar" },
    { value: 5, text: "Sangat besar" },
  ],

  stres: [
    { value: 1, text: "Sangat rendah" },
    { value: 2, text: "Rendah" },
    { value: 3, text: "Netral" },
    { value: 4, text: "Tinggi" },
    { value: 5, text: "Sangat tinggi" },
  ],

  sosial: [
    { value: 1, text: "Sangat buruk" },
    { value: 2, text: "Buruk" },
    { value: 3, text: "Netral" },
    { value: 4, text: "Baik" },
    { value: 5, text: "Sangat baik" },
  ],
};

function normalizeMoodKey(value = "") {
  const label = String(value || "")
    .trim()
    .toUpperCase();

  if (["GREAT", "SENANG", "SANGAT BAIK"].includes(label)) {
    return "GREAT";
  }

  if (["GOOD", "TENANG", "BAIK"].includes(label)) {
    return "GOOD";
  }

  if (["NEUTRAL", "NETRAL", "NORMAL", "BIASA"].includes(label)) {
    return "NEUTRAL";
  }

  if (["LOW", "CEMAS", "RENDAH", "TURUN", "RENTAN"].includes(label)) {
    return "LOW";
  }

  if (
    ["DISTRESSED", "STRES", "STRESS", "TERTEKAN", "DARURAT"].includes(label)
  ) {
    return "DISTRESSED";
  }

  if (label === "MEMPROSES") {
    return "MEMPROSES";
  }

  return "NEUTRAL";
}

function getMoodMeta(value) {
  return MOOD_META[normalizeMoodKey(value)] || MOOD_META.NEUTRAL;
}

function formatDate(timestamp = Date.now()) {
  const date = new Date(timestamp);

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return `${days[date.getDay()]} ${String(date.getDate()).padStart(
    2,
    "0"
  )}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function createLocalAdvice(detectedMood, age) {
  const mood = normalizeMoodKey(detectedMood);

  if (mood === "DISTRESSED") {
    return `Aku menangkap bahwa kondisimu sedang cukup berat. Di usia ${
      age || "-"
    } tahun, tekanan hidup, kuliah, pekerjaan, atau relasi bisa terasa sangat melelahkan. Coba berhenti sebentar, tarik napas perlahan, lalu sebutkan 5 hal yang kamu lihat, 4 hal yang kamu rasakan, 3 hal yang kamu dengar, 2 hal yang kamu cium, dan 1 hal yang kamu syukuri. Jika perasaan ini terasa tidak aman atau semakin berat, segera hubungi orang terdekat atau bantuan profesional.`;
  }

  if (mood === "LOW") {
    return "Kondisimu terlihat sedang menurun, dan itu valid. Coba mulai dari langkah kecil: minum air, atur napas 4-7-8, tulis satu hal yang paling membebani, lalu pilih satu tindakan kecil yang bisa dilakukan hari ini.";
  }

  if (mood === "NEUTRAL") {
    return "Kondisimu terlihat cukup stabil, tetapi mungkin ada beberapa hal kecil yang masih mengganggu. Coba cek kebutuhan dasar seperti tidur, makan, istirahat, dan ruang untuk bercerita.";
  }

  if (mood === "GOOD") {
    return "Kondisimu terlihat baik dan cukup stabil. Pertahankan rutinitas sehat seperti tidur cukup, aktivitas ringan, dan tetap terhubung dengan orang yang suportif.";
  }

  return "Luar biasa, kondisimu terlihat sangat positif. Pertahankan konsistensi dengan menjaga pola tidur, aktivitas fisik, dan waktu untuk diri sendiri.";
}

function normalizeQuestionnaireLabel(mood) {
  switch (normalizeMoodKey(mood)) {
    case "GREAT":
      return "great";

    case "GOOD":
      return "good";

    case "NEUTRAL":
      return "netral";

    case "LOW":
      return "low";

    case "DISTRESSED":
      return "distressed";

    default:
      return "netral";
  }
}

function toTimestamp(value, fallback = Date.now()) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : fallback;
}

function createHistoryTitle(text, fallback = "Percakapan MindSpace AI") {
  const normalized = String(text || "").trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.length > 48
    ? `${normalized.slice(0, 48)}...`
    : normalized;
}

function buildHistoryFromMongo({
  moodAssessments = [],
  chatMessages = [],
} = {}) {
  const groupedChats = new Map();

  const ensureChat = ({
    chatId,
    timestamp,
    title,
    mood = "NEUTRAL",
  }) => {
    const id = String(chatId || `chat-${Date.now()}-${Math.random()}`);

    if (!groupedChats.has(id)) {
      const parsedTimestamp = toTimestamp(timestamp);

      groupedChats.set(id, {
        id,
        title: title || "Percakapan MindSpace AI",
        mood: normalizeMoodKey(mood),
        timestamp: parsedTimestamp,
        messages: [],
      });
    }

    return groupedChats.get(id);
  };

  moodAssessments.forEach((assessment) => {
    const mood = normalizeMoodKey(
      assessment?.label ||
        assessment?.classifier?.label ||
        assessment?.classifier?.rawLabel
    );

    const id = String(assessment?.chatId || `assessment-${assessment?._id}`);

    const timestamp = toTimestamp(
      assessment?.createdAt || assessment?.updatedAt
    );

    const chat = ensureChat({
      chatId: id,
      timestamp,
      title: `Hasil kuesioner: ${getMoodMeta(mood).label}`,
      mood,
    });

    const advice = String(
      assessment?.aiAdvice || assessment?.advice || assessment?.balasan || ""
    ).trim();

    if (
      advice &&
      !chat.messages.some(
        (message) => message.sender === "ai" && message.text === advice
      )
    ) {
      chat.messages.push({
        sender: "ai",
        text: advice,
        timestamp,
      });
    }
  });

  chatMessages.forEach((message) => {
    const id = String(message?.chatId || `chat-${message?._id}`);

    const text = String(
      message?.text || message?.message || message?.content || ""
    ).trim();

    if (!text) {
      return;
    }

    const rawSender = String(message?.sender || message?.role || "").toLowerCase();

    const sender = ["ai", "assistant", "bot", "model"].includes(rawSender)
      ? "ai"
      : "user";

    const timestamp = toTimestamp(message?.createdAt);

    const chat = ensureChat({
      chatId: id,
      timestamp,
      mood: message?.mood || message?.label || "NEUTRAL",
    });

    chat.messages.push({
      sender,
      text,
      timestamp,
    });

    if (sender === "user" && chat.title === "Percakapan MindSpace AI") {
      chat.title = createHistoryTitle(text);
    }

    if (timestamp > chat.timestamp) {
      chat.timestamp = timestamp;
    }
  });

  return Array.from(groupedChats.values())
    .map((chat) => ({
      ...chat,

      messages: [...chat.messages].sort(
        (first, second) =>
          Number(first.timestamp || 0) - Number(second.timestamp || 0)
      ),
    }))
    .filter((chat) => chat.messages.length > 0)
    .sort(
      (first, second) =>
        Number(second.timestamp || 0) - Number(first.timestamp || 0)
    );
}

function detectMoodFromText(text) {
  const lower = text.toLowerCase();

  if (
    /(stres|stress|capek|pusing|deadline|berat|tertekan|burnout|panik)/i.test(
      lower
    )
  ) {
    return "DISTRESSED";
  }

  if (/(takut|cemas|gelisah|khawatir|nervous|overthinking)/i.test(lower)) {
    return "LOW";
  }

  if (/(lega|senang|bahagia|sukses|bangga|terima kasih|membaik)/i.test(lower)) {
    return "GREAT";
  }

  if (/(tenang|stabil|baik-baik|aman)/i.test(lower)) {
    return "GOOD";
  }

  return "NEUTRAL";
}

function buildQuestionnaireCounts(answers) {
  const counts = {
    GREAT: 0,
    GOOD: 0,
    NEUTRAL: 0,
    LOW: 0,
    DISTRESSED: 0,
  };

  KUESIONER_QUESTIONS.forEach((question) => {
    const raw = Number(answers?.[question.id]);

    if (!raw) {
      return;
    }

    const normalized = question.reverse ? 6 - raw : raw;

    if (normalized >= 5) {
      counts.GREAT += 1;
    } else if (normalized === 4) {
      counts.GOOD += 1;
    } else if (normalized === 3) {
      counts.NEUTRAL += 1;
    } else if (normalized === 2) {
      counts.LOW += 1;
    } else {
      counts.DISTRESSED += 1;
    }
  });

  return counts;
}

function NavButton({
  icon,
  label,
  active,
  collapsed,
  onClick,
  title,
}) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      className={`nav-btn w-full overflow-hidden flex items-center gap-4 px-3 py-3 rounded-full transition-colors ${
        active
          ? "bg-[#004A77] text-ms-primary font-medium"
          : "text-ms-textmuted hover:bg-ms-hover hover:text-white"
      }`}
    >
      <i data-feather={icon} className="w-5 h-5 shrink-0" />

      <span
        className={`sidebar-text text-sm truncate transition-opacity ${
          collapsed
            ? "md:opacity-0 md:pointer-events-none"
            : "opacity-100"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function MoodBadge({ mood }) {
  const meta = getMoodMeta(mood);

  return (
    <span
      className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase border shrink-0 tracking-widest ${meta.textClass} ${meta.borderClass} ${meta.bgClass}`}
    >
      {meta.label}
    </span>
  );
}

function SpeedometerChart({
  mood,
  processing,
  value = 0,
  maxValue = 6,
}) {
  const hasMood = mood && !processing;

  const meta = hasMood ? getMoodMeta(mood) : null;

  const numericRotation = -90 + (value / maxValue) * 180;

  const rotation = hasMood ? numericRotation : -90;

  return (
    <div className="relative w-44 h-44 mb-10 shrink-0 mx-auto">
      <svg
        viewBox="0 0 100 50"
        className="w-full h-auto overflow-visible absolute top-0"
      >
        <defs>
          <linearGradient
            id="gauge-grad-react"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="28%" stopColor="#6EE7B7" />
            <stop offset="52%" stopColor="#A78BFA" />
            <stop offset="74%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#FCA5A5" />
          </linearGradient>
        </defs>

        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="#282A2C"
          strokeWidth="12"
          strokeLinecap="round"
        />

        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="url(#gauge-grad-react)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        <g
          className="transition-transform duration-1000 ease-out"
          style={{
            transformOrigin: "50px 50px",
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {hasMood && (
            <polygon
              points="48,50 52,50 50,12"
              fill="#E3E3E3"
            />
          )}

          <circle
            cx="50"
            cy="50"
            r="6"
            fill="#131314"
            stroke="#E3E3E3"
            strokeWidth="2.5"
          />
        </g>
      </svg>

      <div className="absolute bottom-4 inset-x-0 flex flex-col items-center justify-center">
        <span
          className={`text-[12px] font-bold uppercase tracking-widest ${
            meta?.textClass || "text-ms-textmuted"
          } ${hasMood ? "" : "opacity-50"}`}
        >
          {processing ? "MEMPROSES" : meta?.label || "BELUM ADA"}
        </span>
      </div>
    </div>
  );
}

function DonutMoodChart({ counts, total }) {
  const segments = MOOD_ORDER.map((key) => ({
    key,

    percentage: total
      ? Math.round(((counts[key] || 0) / total) * 100)
      : 0,
  })).reduce(
    (accumulator, segment) => ({
      total: accumulator.total + segment.percentage,

      items:
        segment.percentage > 0
          ? [
              ...accumulator.items,

              {
                ...segment,
                offset: -accumulator.total,
              },
            ]
          : accumulator.items,
    }),

    {
      total: 0,
      items: [],
    }
  ).items;

  return (
    <div className="relative w-44 h-44 mb-10 shrink-0">
      <svg
        viewBox="0 0 36 36"
        className="w-full h-full -rotate-90"
      >
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#282A2C"
          strokeWidth="4"
        />

        {segments.map((segment) => {
          const meta = MOOD_META[segment.key];

          return (
            <circle
              key={segment.key}
              cx="18"
              cy="18"
              r="15.9155"
              className="chart-circle"
              stroke={meta.color}
              strokeDasharray={`${segment.percentage} ${
                100 - segment.percentage
              }`}
              strokeDashoffset={segment.offset}
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold font-mono">
          {total}
        </span>

        <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-1">
          Chat
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="max-w-3xl mx-auto mt-8 flex items-center gap-4 fade-in">
      <i
        data-feather="aperture"
        className="w-6 h-6 text-ms-primary animate-spin"
        style={{
          animationDuration: "3s",
        }}
      />

      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 bg-ms-primary/70 rounded-full typing-dot" />

        <div
          className="w-1.5 h-1.5 bg-ms-primary/70 rounded-full typing-dot"
          style={{
            animationDelay: "0.2s",
          }}
        />

        <div
          className="w-1.5 h-1.5 bg-ms-primary/70 rounded-full typing-dot"
          style={{
            animationDelay: "0.4s",
          }}
        />
      </div>
    </div>
  );
}

export default function Dashboard({ user }) {
  const [activeTab, setActiveTab] = useState("home");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [showReminder, setShowReminder] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [chatHistory, setChatHistory] = useState([]);

  const [currentChatId, setCurrentChatId] = useState(null);

  const [inputText, setInputText] = useState("");

  const [chatDrafts, setChatDrafts] = useState({});

  const [loadingChatId, setLoadingChatId] = useState(null);

  const [age, setAge] = useState("");

  const [answers, setAnswers] = useState({
    mood: null,
    tidur: null,
    aktivitas: null,
    energi: null,
    stres: null,
    sosial: null,
  });

  const [questionnaireResult, setQuestionnaireResult] = useState(null);

  const [questionnaireCounts, setQuestionnaireCounts] = useState({
    GREAT: 0,
    GOOD: 0,
    NEUTRAL: 0,
    LOW: 0,
    DISTRESSED: 0,
  });

  const [logPage, setLogPage] = useState(1);

  const [sortAsc, setSortAsc] = useState(false);

  const chatEndRef = useRef(null);

  const inputRef = useRef(null);

  const username =
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Pengguna";

  const initial = username.charAt(0).toUpperCase();

  useEffect(() => {
    feather.replace();
  }, [
    activeTab,
    chatHistory,
    showReminder,
    showSuccessModal,
    answers,
    questionnaireResult,
    sidebarCollapsed,
    sidebarOpen,
    currentChatId,
    loadingChatId,
    logPage,
    sortAsc,
  ]);

  useEffect(() => {
    checkStreamlitHealth().catch(() => {});
  }, []);

  useEffect(() => {
    setChatDrafts({});
    setInputText("");

    if (!user?.uid && !user?.email) {
      setChatHistory([]);
      setCurrentChatId(null);
      setQuestionnaireResult(null);

      return undefined;
    }

    let cancelled = false;

    const loadUserHistory = async () => {
      try {
        const { data } = await apiClient.get("/api/user/history", {
          params: {
            userId: user?.uid,
            userEmail: user?.email,
          },
        });

        if (cancelled) {
          return;
        }

        setChatHistory(
          buildHistoryFromMongo({
            moodAssessments: data?.moodAssessments || [],
            chatMessages: data?.chatMessages || [],
          })
        );

        setCurrentChatId(null);

        const latestAssessment = data?.moodAssessments?.[0];

        if (!latestAssessment) {
          setQuestionnaireResult(null);

          return;
        }

        const mood = normalizeMoodKey(
          latestAssessment?.label ||
            latestAssessment?.classifier?.label ||
            latestAssessment?.classifier?.rawLabel
        );

        setQuestionnaireResult({
          mood,

          advice:
            latestAssessment?.aiAdvice ||
            latestAssessment?.advice ||
            createLocalAdvice(mood, latestAssessment?.age),

          classifier:
            latestAssessment?.classifier ||
            null,
        });

        if (latestAssessment?.age) {
          setAge(String(latestAssessment.age));
        }

        const loadedAnswers =
          latestAssessment?.answers ||
          {};

        setAnswers({
          mood:
            Number(
              loadedAnswers?.mood ??
                latestAssessment?.mood
            ) || null,

          tidur:
            Number(
              loadedAnswers?.tidur ??
                latestAssessment?.tidur
            ) || null,

          aktivitas:
            Number(
              loadedAnswers?.aktivitas ??
                latestAssessment?.aktivitas
            ) || null,

          energi:
            Number(
              loadedAnswers?.energi ??
                latestAssessment?.energi
            ) || null,

          stres:
            Number(
              loadedAnswers?.stres ??
                latestAssessment?.stres
            ) || null,

          sosial:
            Number(
              loadedAnswers?.sosial ??
                latestAssessment?.sosial
            ) || null,
        });
      } catch (error) {
        console.error(
          "Gagal mengambil riwayat user:",
          getApiErrorMessage(error)
        );

        if (!cancelled) {
          setChatHistory([]);
          setCurrentChatId(null);
          setQuestionnaireResult(null);
        }
      }
    };

    loadUserHistory();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!questionnaireResult) {
        setShowReminder(true);
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [questionnaireResult]);

  useEffect(() => {
    if (activeTab === "chatbot" || activeTab === "newchat") {
      chatEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [
    chatHistory,
    loadingChatId,
    activeTab,
    currentChatId,
  ]);

  useEffect(() => {
    const counts =
      buildQuestionnaireCounts(answers);

    setQuestionnaireCounts(counts);
  }, [answers]);

  const chatCounts = useMemo(() => {
    return chatHistory.reduce(
      (accumulator, chat) => {
        const key =
          normalizeMoodKey(chat.mood);

        accumulator[key] =
          (accumulator[key] || 0) + 1;

        return accumulator;
      },

      {
        GREAT: 0,
        GOOD: 0,
        NEUTRAL: 0,
        LOW: 0,
        DISTRESSED: 0,
      }
    );
  }, [chatHistory]);

  const dominantMood = useMemo(() => {
    if (
      questionnaireResult?.mood &&
      questionnaireResult.mood !== "MEMPROSES"
    ) {
      return normalizeMoodKey(
        questionnaireResult.mood
      );
    }

    const [top] =
      Object.entries(chatCounts).sort(
        (first, second) =>
          second[1] - first[1]
      );

    return top?.[1] > 0
      ? top[0]
      : null;
  }, [
    questionnaireResult,
    chatCounts,
  ]);

  const currentChat = useMemo(
    () =>
      chatHistory.find(
        (chat) =>
          chat.id === currentChatId
      ),

    [
      chatHistory,
      currentChatId,
    ]
  );

  const sortedLogs = useMemo(() => {
    return [...chatHistory].sort(
      (first, second) =>
        sortAsc
          ? first.timestamp -
            second.timestamp
          : second.timestamp -
            first.timestamp
    );
  }, [
    chatHistory,
    sortAsc,
  ]);

  const totalPages =
    Math.max(
      1,

      Math.ceil(
        sortedLogs.length /
          LOGS_PER_PAGE
      )
    );

  const paginatedLogs =
    sortedLogs.slice(
      (logPage - 1) *
        LOGS_PER_PAGE,

      logPage *
        LOGS_PER_PAGE
    );

  const switchTab = (tab) => {
    setActiveTab(tab);

    if (tab !== "chatbot") {
      setCurrentChatId(null);
    }

    setSidebarOpen(false);

    if (
      tab === "kuesioner" &&
      questionnaireResult?.mood &&
      questionnaireResult.mood !==
        "MEMPROSES"
    ) {
      setShowSuccessModal(true);
    }
  };

  const getActiveDraftKey = () =>
    activeTab === "newchat" ||
    !currentChatId
      ? NEW_CHAT_DRAFT_KEY
      : String(currentChatId);

  const updateActiveDraft = (
    value
  ) => {
    const key =
      getActiveDraftKey();

    setInputText(value);

    setChatDrafts(
      (previousDrafts) => ({
        ...previousDrafts,

        [key]: value,
      })
    );
  };

  const startNewChat = () => {
    setCurrentChatId(null);

    setInputText("");

    setChatDrafts(
      (previousDrafts) => ({
        ...previousDrafts,

        [NEW_CHAT_DRAFT_KEY]:
          "",
      })
    );

    setActiveTab("newchat");

    setSidebarOpen(false);
  };

  const openChat = (id) => {
    const normalizedId =
      String(id);

    setCurrentChatId(
      normalizedId
    );

    setInputText(
      chatDrafts[
        normalizedId
      ] || ""
    );

    setActiveTab("chatbot");

    setSidebarOpen(false);
  };

  const openStreamlitDashboard = async () => {
    const streamlitTab = window.open("", "_blank");

    if (!streamlitTab) {
      alert(
        "Browser memblokir tab baru. Izinkan pop-up untuk membuka Dashboard Streamlit."
      );

      return;
    }

    streamlitTab.opener = null;

    streamlitTab.document.documentElement.innerHTML = `
      <!doctype html>
      <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />

          <title>Menyiapkan Dashboard Streamlit</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              min-height: 100vh;
              margin: 0;
              display: grid;
              place-items: center;
              background: #0e1117;
              color: #e3e3e3;
              font-family: Inter, Arial, sans-serif;
            }

            .loader-container {
              width: min(90vw, 460px);
              padding: 32px;
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 24px;
              background: #1e1f20;
              text-align: center;
              box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
            }

            .loader {
              width: 44px;
              height: 44px;
              margin: 0 auto 18px;
              border: 4px solid rgba(255, 255, 255, 0.14);
              border-top-color: #14b8a6;
              border-radius: 999px;
              animation: spin 0.8s linear infinite;
            }

            h1 {
              margin: 0;
              font-size: 19px;
              font-weight: 700;
            }

            p {
              margin: 10px 0 0;
              color: #a8adb7;
              font-size: 13px;
              line-height: 1.7;
            }

            code {
              color: #a8c7fa;
            }

            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          </style>
        </head>

        <body>
          <div class="loader-container">
            <div class="loader"></div>

            <h1>Menyiapkan Dashboard Streamlit...</h1>

            <p>
              Tunggu sebentar hingga server siap digunakan.
            </p>
          </div>
        </body>
      </html>
    `;

    const isReady = await waitForStreamlitReady({
      timeoutMs: 20000,
      intervalMs: 500,
      requiredHealthyChecks: 2,
    });

    if (streamlitTab.closed) {
      return;
    }

    if (isReady) {
      streamlitTab.location.replace(STREAMLIT_BASE_URL);

      return;
    }

    streamlitTab.document.body.innerHTML = `
      <div class="loader-container">
        <h1>Dashboard Streamlit belum aktif</h1>

        <p>
          Jalankan
          <code>npm run dashboard:streamlit</code>
          dari terminal project, lalu klik tombol Dashboard Streamlit kembali.
        </p>
      </div>
    `;
  };

  const handleSignOut = () =>
    signOut(auth);

  const handleAnswerChange = (
    id,
    value
  ) => {
    setAnswers(
      (previousAnswers) => ({
        ...previousAnswers,

        [id]: value,
      })
    );
  };

  const submitQuestionnaire = async (
    event
  ) => {
    event.preventDefault();

    const hasEmptyAnswer =
      KUESIONER_QUESTIONS.some(
        (question) =>
          !answers[question.id]
      );

    if (!age || hasEmptyAnswer) {
      alert(
        "Mohon isi umur dan jawab semua pertanyaan kuesioner."
      );

      return;
    }

    const counts =
      buildQuestionnaireCounts(
        answers
      );

    const score =
      Number(answers.mood) +
      Number(answers.tidur) +
      Number(answers.aktivitas) +
      Number(answers.energi) +
      (6 - Number(answers.stres)) +
      Number(answers.sosial);

    const questionnaireChatId =
      String(Date.now());

    setQuestionnaireCounts(
      counts
    );

    setQuestionnaireResult({
      mood: "MEMPROSES",

      advice:
        "AI sedang menganalisis jawabanmu. Saran personal akan segera ditampilkan...",

      classifier: null,
    });

    setShowSuccessModal(true);

    try {
      const { data } =
        await apiClient.post(
          "/api/kuesioner",

          {
            userId:
              user?.uid,

            userEmail:
              user?.email,

            chatId:
              questionnaireChatId,

            age,

            score,

            answers,
          }
        );

      const detectedMood =
        normalizeMoodKey(
          data?.classifier
            ?.label ||
            data?.label ||
            data?.classifier
              ?.rawLabel ||
            "NEUTRAL"
        );

      const aiAdvice =
        data?.balasan ||
        createLocalAdvice(
          detectedMood,
          age
        );

      const result = {
        mood:
          detectedMood,

        advice:
          aiAdvice,

        classifier:
          data?.classifier ||
          null,
      };

      setQuestionnaireResult(
        result
      );

      setCurrentChatId(
        questionnaireChatId
      );

      setInputText("");

      setChatDrafts(
        (previousDrafts) => ({
          ...previousDrafts,

          [questionnaireChatId]:
            "",
        })
      );

      setChatHistory(
        (previousHistory) => [
          {
            id:
              questionnaireChatId,

            title:
              `Hasil kuesioner: ${
                getMoodMeta(
                  detectedMood
                ).label
              }`,

            mood:
              detectedMood,

            timestamp:
              questionnaireChatId,

            messages: [
              {
                sender:
                  "ai",

                text:
                  aiAdvice,

                timestamp:
                  Date.now(),
              },
            ],
          },

          ...previousHistory,
        ]
      );
    } catch (error) {
      console.error(
        "Gagal menghubungi endpoint kuesioner:",

        getApiErrorMessage(
          error
        )
      );

      setQuestionnaireResult({
        mood:
          "NEUTRAL",

        advice:
          "Saran personal belum dapat ditampilkan karena koneksi ke server sedang bermasalah. Silakan coba kembali beberapa saat lagi.",

        classifier:
          null,
      });
    }
  };

  const sendMessage = async (
    textArgument
  ) => {
    const message =
      String(
        textArgument || ""
      ).trim();

    if (
      !message ||
      loadingChatId !== null
    ) {
      return;
    }

    const mood =
      detectMoodFromText(
        message
      );

    const chatId =
      String(
        currentChatId ||
          Date.now()
      );

    const previousMessages =
      currentChatId
        ? currentChat
            ?.messages ||
          []
        : [];

    const activeDraftKey =
      getActiveDraftKey();

    const timestamp =
      Date.now();

    setInputText("");

    setChatDrafts(
      (previousDrafts) => ({
        ...previousDrafts,

        [activeDraftKey]:
          "",

        [chatId]:
          "",
      })
    );

    if (inputRef.current) {
      inputRef.current.style.height =
        "auto";
    }

    if (
      !currentChatId ||
      activeTab === "newchat"
    ) {
      setCurrentChatId(chatId);

      setActiveTab("chatbot");

      setChatHistory(
        (previousHistory) => [
          {
            id: chatId,

            title:
              createHistoryTitle(
                message
              ),

            mood,

            timestamp,

            messages: [
              {
                sender:
                  "user",

                text:
                  message,

                timestamp,
              },
            ],
          },

          ...previousHistory,
        ]
      );
    } else {
      setChatHistory(
        (previousHistory) =>
          previousHistory.map(
            (chat) =>
              chat.id ===
              String(
                currentChatId
              )
                ? {
                    ...chat,

                    mood,

                    timestamp,

                    messages: [
                      ...chat.messages,

                      {
                        sender:
                          "user",

                        text:
                          message,

                        timestamp,
                      },
                    ],
                  }
                : chat
          )
      );
    }

    setLoadingChatId(
      chatId
    );

    try {
      const { data } =
        await apiClient.post(
          "/api/chat",

          {
            userId:
              user?.uid,

            userEmail:
              user?.email,

            chatId,

            message,

            history:
              previousMessages,

            questionnaireLabel:
              questionnaireResult
                ?.mood
                ? normalizeQuestionnaireLabel(
                    questionnaireResult
                      .mood
                  )
                : undefined,
          }
        );

      const aiReply =
        data?.balasan ||
        "Aku di sini untuk mendengarkan. Bisa ceritakan lebih detail apa yang kamu rasakan?";

      setChatHistory(
        (previousHistory) =>
          previousHistory.map(
            (chat) =>
              chat.id ===
              chatId
                ? {
                    ...chat,

                    timestamp:
                      Date.now(),

                    messages: [
                      ...chat.messages,

                      {
                        sender:
                          "ai",

                        text:
                          aiReply,

                        timestamp:
                          Date.now(),
                      },
                    ],
                  }
                : chat
          )
      );
    } catch (error) {
      console.error(
        "Gagal menghubungi endpoint chat:",

        getApiErrorMessage(
          error
        )
      );

      const fallbackReply =
        "Maaf, AI sedang belum bisa membalas. Namun, aku tetap bisa memberikan dukungan awal: coba tarik napas perlahan, beri nama emosi yang kamu rasakan, lalu ceritakan satu hal yang paling mengganggumu saat ini.";

      setChatHistory(
        (previousHistory) =>
          previousHistory.map(
            (chat) =>
              chat.id ===
              chatId
                ? {
                    ...chat,

                    timestamp:
                      Date.now(),

                    messages: [
                      ...chat.messages,

                      {
                        sender:
                          "ai",

                        text:
                          fallbackReply,

                        timestamp:
                          Date.now(),
                      },
                    ],
                  }
                : chat
          )
      );
    } finally {
      setLoadingChatId(
        null
      );
    }
  };

  const handleSendMessage = (
    event
  ) => {
    event.preventDefault();

    sendMessage(
      inputText
    );
  };

  const sendSuggestion = (
    text
  ) => {
    sendMessage(text);
  };

  const autoResize = (
    event
  ) => {
    const element =
      event.target;

    element.style.height =
      "auto";

    element.style.height =
      `${Math.min(
        element.scrollHeight,
        160
      )}px`;
  };

  const dashboardPercentages =
    MOOD_ORDER.reduce(
      (
        accumulator,
        key
      ) => {
        accumulator[key] =
          chatHistory.length
            ? Math.round(
                ((chatCounts[
                  key
                ] ||
                  0) /
                  chatHistory.length) *
                  100
              )
            : 0;

        return accumulator;
      },

      {}
    );

  const questionnaireProcessing =
    questionnaireResult?.mood ===
    "MEMPROSES";

  const questionnaireMood =
    (() => {
      if (
        questionnaireResult
          ?.mood
      ) {
        if (
          questionnaireProcessing
        ) {
          return null;
        }

        return normalizeMoodKey(
          questionnaireResult
            .mood
        );
      }

      const hasAnswers =
        Object.values(
          answers
        ).some(
          (value) =>
            value
        );

      if (!hasAnswers) {
        return null;
      }

      const [dominantEntry] =
        Object.entries(
          questionnaireCounts
        ).sort(
          (
            first,
            second
          ) =>
            second[1] -
            first[1]
        );

      if (
        dominantEntry &&
        dominantEntry[1] > 0
      ) {
        return dominantEntry[0];
      }

      return null;
    })();

  const resultMeta =
    questionnaireMood
      ? getMoodMeta(
          questionnaireMood
        )
      : MOOD_META.NEUTRAL;

  return (
    <div className="bg-ms-bg text-ms-text font-sans flex h-[100dvh] overflow-hidden antialiased">
      {showReminder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() =>
              setShowReminder(
                false
              )
            }
          />

          <div className="relative bg-ms-surface w-[90%] max-w-md p-8 rounded-[28px] border border-white/10 shadow-2xl fade-in">
            <button
              type="button"
              onClick={() =>
                setShowReminder(
                  false
                )
              }
              className="absolute top-4 right-4 p-2 text-ms-textmuted hover:text-white transition-colors"
            >
              <i
                data-feather="x"
                className="w-5 h-5"
              />
            </button>

            <div className="w-16 h-16 bg-[#004A77] rounded-2xl flex items-center justify-center mb-6">
              <i
                data-feather="activity"
                className="text-ms-primary w-8 h-8"
              />
            </div>

            <h3 className="text-xl font-semibold mb-2">
              Check-in Harian
            </h3>

            <p className="text-ms-textmuted text-sm leading-relaxed mb-8">
              Halo {username}! Luangkan waktu 1 menit untuk mengisi kuesioner
              harian agar MindSpace bisa memahami kondisimu hari ini lebih baik.
            </p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReminder(
                    false
                  );

                  switchTab(
                    "kuesioner"
                  );
                }}
                className="w-full py-3.5 bg-ms-text text-ms-bg font-bold rounded-full hover:bg-white transition-all"
              >
                Isi Kuesioner Sekarang
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowReminder(
                    false
                  )
                }
                className="w-full py-3.5 text-ms-textmuted text-sm font-medium hover:text-white transition-all"
              >
                Nanti Saja
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal &&
        questionnaireResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() =>
                setShowSuccessModal(
                  false
                )
              }
            />

            <div className="relative bg-ms-surface w-[90%] max-w-md p-8 rounded-[28px] border border-white/10 shadow-2xl fade-in flex flex-col items-center text-center">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 border-4 shadow-lg ${resultMeta.bgClass} ${resultMeta.borderClass}`}
              >
                <i
                  data-feather={
                    questionnaireProcessing
                      ? "loader"
                      : resultMeta.icon
                  }
                  className={`w-10 h-10 ${
                    questionnaireProcessing
                      ? "text-ms-primary animate-spin"
                      : resultMeta.textClass
                  }`}
                />
              </div>

              <h3 className="text-xl font-semibold mb-1">
                {questionnaireProcessing
                  ? "Sedang Memproses..."
                  : "Check-in Selesai!"}
              </h3>

              <p className="text-ms-textmuted text-sm mb-4">
                Mood dominan kamu hari ini adalah{" "}

                <strong
                  className={`uppercase tracking-widest ${resultMeta.textClass}`}
                >
                  {questionnaireProcessing
                    ? "MEMPROSES"
                    : resultMeta.label}
                </strong>
              </p>

              {questionnaireResult
                .classifier
                ?.confidencePercent !==
                undefined && (
                <p className="text-ms-textmuted text-xs mb-4">
                  Confidence classifier:{" "}

                  {
                    questionnaireResult
                      .classifier
                      .confidencePercent
                  }
                  %
                </p>
              )}

              <p className="w-full text-left text-sm leading-relaxed mb-6 bg-ms-hover p-4 rounded-2xl border border-white/5 whitespace-pre-line max-h-52 overflow-y-auto custom-scroll">
                {
                  questionnaireResult
                    .advice
                }
              </p>

              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSuccessModal(
                      false
                    );

                    setActiveTab(
                      currentChatId
                        ? "chatbot"
                        : "newchat"
                    );
                  }}
                  className="w-full py-3.5 bg-[#004A77] text-ms-primary font-bold rounded-full hover:brightness-125 transition-all"
                >
                  Lanjut Chat dengan AI
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowSuccessModal(
                      false
                    );

                    setActiveTab(
                      "dashboard"
                    );
                  }}
                  className="w-full py-3.5 text-ms-textmuted text-sm font-medium hover:text-white hover:bg-white/5 rounded-full transition-all"
                >
                  Lihat Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 transition-opacity md:hidden"
          onClick={() =>
            setSidebarOpen(
              false
            )
          }
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 bg-ms-bg flex flex-col transform ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        } md:translate-x-0 transition-all duration-300 ${
          sidebarCollapsed
            ? "md:w-[68px]"
            : "md:w-[280px]"
        } w-[280px]`}
      >
        <div className="h-16 flex items-center px-3 shrink-0">
          <button
            type="button"
            onClick={() =>
              setSidebarOpen(
                false
              )
            }
            className="p-2 rounded-full hover:bg-ms-hover text-ms-text md:hidden"
          >
            <i data-feather="menu" />
          </button>

          <button
            type="button"
            onClick={() =>
              setSidebarCollapsed(
                (value) =>
                  !value
              )
            }
            className="p-2 rounded-full hover:bg-ms-hover text-ms-text hidden md:block"
          >
            <i data-feather="menu" />
          </button>
        </div>

        <div className="px-3 mt-2 space-y-1 shrink-0 overflow-x-hidden">
          <NavButton
            icon="home"
            label="Beranda"
            active={
              activeTab ===
              "home"
            }
            collapsed={
              sidebarCollapsed
            }
            onClick={() =>
              switchTab(
                "home"
              )
            }
          />

          <NavButton
            icon="pie-chart"
            label="Dashboard Analitik"
            active={
              activeTab ===
              "dashboard"
            }
            collapsed={
              sidebarCollapsed
            }
            onClick={() =>
              switchTab(
                "dashboard"
              )
            }
          />

          <NavButton
            icon="edit-3"
            label="Kuesioner Harian"
            active={
              activeTab ===
              "kuesioner"
            }
            collapsed={
              sidebarCollapsed
            }
            onClick={() =>
              switchTab(
                "kuesioner"
              )
            }
          />

          <NavButton
            icon="plus"
            label="New chat"
            active={
              activeTab ===
              "newchat"
            }
            collapsed={
              sidebarCollapsed
            }
            onClick={
              startNewChat
            }
          />

          <NavButton
            icon="bar-chart-2"
            label="Dashboard Streamlit"
            active={false}
            collapsed={
              sidebarCollapsed
            }
            onClick={
              openStreamlitDashboard
            }
          />
        </div>

        <div
          className={`flex-1 overflow-y-auto overflow-x-hidden custom-scroll mt-6 px-3 pb-4 transition-opacity ${
            sidebarCollapsed
              ? "md:opacity-0 md:pointer-events-none"
              : "opacity-100"
          }`}
        >
          <h3 className="px-4 text-[13px] font-semibold text-ms-textmuted mb-2 uppercase tracking-tighter opacity-70">
            Chats
          </h3>

          <div className="space-y-0.5">
            {[...chatHistory]
              .sort(
                (
                  first,
                  second
                ) =>
                  second.timestamp -
                  first.timestamp
              )
              .map((chat) => (
                <div
                  key={chat.id}
                  onClick={() =>
                    openChat(
                      chat.id
                    )
                  }
                  className={`history-item group relative flex items-center px-3 py-2.5 rounded-full cursor-pointer transition-colors ${
                    currentChatId ===
                    chat.id
                      ? "bg-[#004A77] text-ms-primary font-medium"
                      : "text-ms-textmuted hover:bg-ms-hover hover:text-white"
                  }`}
                >
                  <span className="truncate text-[13px] block w-full select-none text-left">
                    {chat.title}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-ms-bg">
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 shrink-0 relative z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setSidebarOpen(
                  true
                )
              }
              className="p-2 -ml-2 rounded-full hover:bg-ms-hover text-ms-text md:hidden"
            >
              <i data-feather="menu" />
            </button>

            <span className="text-xl font-medium text-[#E3E3E3]">
              MindSpace AI
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden md:flex flex-col items-end">
              <p className="text-sm font-bold text-gray-200 leading-none mt-1">
                {username}
              </p>

              <button
                type="button"
                onClick={
                  handleSignOut
                }
                className="text-[10px] font-bold text-gray-500 hover:text-gray-200 transition-colors uppercase flex items-center gap-1 mt-1"
              >
                Sign Out{" "}

                <i
                  data-feather="log-out"
                  className="w-2.5 h-2.5"
                />
              </button>
            </div>

            <div className="w-9 h-9 rounded-full bg-[#14B8A6] text-white flex items-center justify-center font-bold shadow-sm uppercase">
              {initial}
            </div>
          </div>
        </header>

        {activeTab === "home" && (
          <div className="view-section flex-1 overflow-y-auto custom-scroll p-4 lg:p-8 pt-4 gap-6">
            <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 h-fit fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-[#115e59] to-[#0f766e] rounded-3xl p-6 lg:p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-center min-h-[180px]">
                  <h2 className="text-2xl lg:text-3xl font-semibold mb-2 truncate">
                    Halo, {username}
                  </h2>

                  <p className="opacity-80 text-sm mb-6">
                    Berikut adalah ringkasan kesehatan mentalmu.
                  </p>

                  <div className="flex gap-4">
                    <div className="bg-white/10 p-4 rounded-2xl border border-white/5 flex-1 text-center font-bold">
                      <p className="text-[10px] uppercase opacity-70 mb-1">
                        Total Chat
                      </p>

                      <p className="text-2xl font-mono">
                        {
                          chatHistory.length
                        }
                      </p>
                    </div>

                    <div className="bg-white/10 p-4 rounded-2xl border border-white/5 flex-1 text-center font-bold min-w-0">
                      <p className="text-[10px] uppercase opacity-70 mb-1">
                        Mood Dominan
                      </p>

                      <p
                        className={`text-lg truncate uppercase ${
                          dominantMood
                            ? getMoodMeta(
                                dominantMood
                              )
                                .textClass
                            : ""
                        }`}
                      >
                        {dominantMood
                          ? getMoodMeta(
                              dominantMood
                            )
                              .label
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-ms-surface rounded-3xl p-6 lg:p-8 border border-white/5 flex flex-col justify-between">
                  <h3 className="text-xs font-semibold text-ms-textmuted uppercase mb-4 tracking-widest">
                    Aksi Cepat
                  </h3>

                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <button
                      type="button"
                      onClick={
                        startNewChat
                      }
                      className="flex flex-col items-center justify-center gap-3 bg-ms-bg hover:bg-ms-hover rounded-2xl p-4 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-ms-surface flex items-center justify-center shadow-sm">
                        <i data-feather="message-circle" />
                      </div>

                      <span className="text-[11px] font-bold text-ms-textmuted uppercase">
                        Mulai Chat
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        switchTab(
                          "dashboard"
                        )
                      }
                      className="flex flex-col items-center justify-center gap-3 bg-ms-bg hover:bg-ms-hover rounded-2xl p-4 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-ms-surface flex items-center justify-center shadow-sm">
                        <i
                          data-feather="pie-chart"
                          className="text-ms-primary"
                        />
                      </div>

                      <span className="text-[11px] font-bold text-ms-textmuted uppercase">
                        Dashboard
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-ms-surface rounded-3xl p-6 lg:p-8 border border-white/5 flex flex-col h-fit">
                <h3 className="text-sm font-medium text-ms-textmuted mb-4 uppercase tracking-widest">
                  Interaksi Terakhir
                </h3>

                <div className="flex flex-col gap-3">
                  {[...chatHistory]
                    .sort(
                      (
                        first,
                        second
                      ) =>
                        second.timestamp -
                        first.timestamp
                    )
                    .slice(0, 5)
                    .map((chat) => (
                      <div
                        key={
                          chat.id
                        }
                        onClick={() =>
                          openChat(
                            chat.id
                          )
                        }
                        className="flex justify-between items-center p-4 bg-[#232527] rounded-2xl border border-white/5 hover:bg-ms-hover cursor-pointer transition-all"
                      >
                        <div className="min-w-0">
                          <span className="text-[10px] text-ms-textmuted mb-1 block uppercase font-mono tracking-tighter opacity-50 font-bold">
                            {
                              formatDate(
                                chat.timestamp
                              )
                            }
                          </span>

                          <p className="text-[14px] font-medium text-white truncate">
                            {
                              chat.title
                            }
                          </p>
                        </div>

                        <MoodBadge
                          mood={
                            chat.mood
                          }
                        />
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="h-20 md:hidden" />
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="view-section flex-1 overflow-y-auto custom-scroll p-4 lg:p-8">
            <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 fade-in">
              <h2 className="text-2xl font-semibold shrink-0">
                Dashboard Analitik
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-ms-surface rounded-[24px] p-6 lg:p-8 border border-white/5 flex flex-col items-center h-full min-h-[420px]">
                  <h3 className="text-[11px] font-bold text-ms-textmuted w-full text-center mb-10 uppercase tracking-widest">
                    Distribusi Emosi (Kuesioner)
                  </h3>

                  <SpeedometerChart
                    mood={
                      questionnaireMood
                    }
                    processing={
                      questionnaireProcessing
                    }
                    value={
                      questionnaireCounts[
                        questionnaireMood
                      ] || 0
                    }
                    maxValue={6}
                  />

                  <div className="w-full space-y-3 mt-auto">
                    {MOOD_ORDER.map(
                      (key) => {
                        const meta =
                          MOOD_META[
                            key
                          ];

                        return (
                          <div
                            key={key}
                            className="flex justify-between items-center text-[12px] px-4 bg-[#232527] py-3.5 rounded-xl border border-white/5"
                          >
                            <span
                              className={`font-bold uppercase tracking-tighter ${meta.textClass}`}
                            >
                              {
                                meta.label
                              }
                            </span>

                            <span className="font-bold text-white">
                              {
                                questionnaireCounts[
                                  key
                                ] ||
                                0
                              }
                              /6
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="bg-ms-surface rounded-[24px] p-6 lg:p-8 border border-white/5 flex flex-col items-center h-full min-h-[420px]">
                  <h3 className="text-[11px] font-bold text-ms-textmuted w-full text-center mb-10 uppercase tracking-widest">
                    Distribusi Emosi (Chat)
                  </h3>

                  <DonutMoodChart
                    counts={
                      chatCounts
                    }
                    total={
                      chatHistory.length
                    }
                  />

                  <div className="w-full space-y-3 mt-auto">
                    {MOOD_ORDER.map(
                      (key) => {
                        const meta =
                          MOOD_META[
                            key
                          ];

                        return (
                          <div
                            key={key}
                            className="flex justify-between items-center text-[12px] px-4 bg-[#232527] py-3.5 rounded-xl border border-white/5"
                          >
                            <span
                              className={`font-bold uppercase tracking-tighter ${meta.textClass}`}
                            >
                              {
                                meta.label
                              }
                            </span>

                            <span className="font-bold text-white">
                              {
                                dashboardPercentages[
                                  key
                                ] ||
                                0
                              }
                              %
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-ms-surface rounded-3xl border border-white/5 flex flex-col h-fit shadow-2xl">
                <div className="p-6 flex items-center justify-between border-b border-white/5 shrink-0">
                  <h3 className="text-[13px] font-bold text-ms-textmuted uppercase tracking-widest">
                    CHATS
                  </h3>

                  <button
                    type="button"
                    onClick={() => {
                      setSortAsc(
                        (value) =>
                          !value
                      );

                      setLogPage(1);
                    }}
                    className="px-3 py-1.5 hover:bg-ms-hover rounded-full transition-colors flex items-center text-[11px] font-bold text-ms-textmuted uppercase tracking-widest"
                  >
                    <span>
                      {sortAsc
                        ? "OLDEST"
                        : "NEWEST"}
                    </span>

                    <i
                      data-feather={
                        sortAsc
                          ? "arrow-up"
                          : "arrow-down"
                      }
                      className="w-3.5 h-3.5 ml-1.5"
                    />
                  </button>
                </div>

                <div className="p-6 flex flex-col gap-3.5 flex-1">
                  {paginatedLogs.map(
                    (chat) => (
                      <div
                        key={
                          chat.id
                        }
                        onClick={() =>
                          openChat(
                            chat.id
                          )
                        }
                        className="flex justify-between items-center p-4 bg-[#232527] rounded-2xl border border-white/5 hover:bg-ms-hover cursor-pointer transition-all"
                      >
                        <div className="min-w-0">
                          <span className="text-[10px] text-ms-textmuted mb-1 block uppercase font-mono tracking-tighter opacity-50 font-bold">
                            {
                              formatDate(
                                chat.timestamp
                              )
                            }
                          </span>

                          <p className="text-[14px] font-medium text-white truncate">
                            {
                              chat.title
                            }
                          </p>
                        </div>

                        <MoodBadge
                          mood={
                            chat.mood
                          }
                        />
                      </div>
                    )
                  )}
                </div>

                <div className="px-6 py-5 border-t border-white/5 flex justify-center shrink-0 h-[72px]">
                  <div className="flex gap-2">
                    {Array.from(
                      {
                        length:
                          totalPages,
                      },

                      (
                        _,
                        index
                      ) =>
                        index + 1
                    ).map(
                      (page) => (
                        <button
                          key={
                            page
                          }
                          type="button"
                          onClick={() =>
                            setLogPage(
                              page
                            )
                          }
                          className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold transition-colors shrink-0 ${
                            page ===
                            logPage
                              ? "bg-white text-ms-bg"
                              : "text-ms-textmuted hover:bg-ms-hover"
                          }`}
                        >
                          {
                            page
                          }
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="h-10" />
            </div>
          </div>
        )}

        {activeTab === "kuesioner" && (
          <div className="view-section flex-1 overflow-y-auto custom-scroll p-4 lg:p-8 pt-4">
            <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 h-fit fade-in">
              <form
                onSubmit={
                  submitQuestionnaire
                }
                className="space-y-10 pb-20"
              >
                <div className="space-y-4">
                  <h4 className="text-[15px] font-medium text-[#E3E3E3]">
                    Usia kamu saat ini
                  </h4>

                  <input
                    type="number"
                    value={age}
                    onChange={(
                      event
                    ) =>
                      setAge(
                        event.target
                          .value
                      )
                    }
                    min="10"
                    max="100"
                    placeholder="Contoh: 21"
                    className="w-full bg-ms-surface border border-white/5 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-ms-primary transition-colors"
                    required
                  />
                </div>

                {KUESIONER_QUESTIONS.map(
                  (question) => (
                    <div
                      key={
                        question.id
                      }
                      className="space-y-4"
                    >
                      <h4 className="text-[15px] font-medium text-[#E3E3E3] leading-relaxed">
                        {
                          question.text
                        }
                      </h4>

                      <div className="grid grid-cols-1 gap-2">
                        {LIKERT_LABELS_BY_QUESTION[
                          question.id
                        ].map(
                          (option) => (
                            <label
                              key={
                                option.value
                              }
                              className="likert-option block relative cursor-pointer group"
                            >
                              <input
                                type="radio"
                                name={
                                  question.id
                                }
                                value={
                                  option.value
                                }
                                checked={
                                  answers[
                                    question.id
                                  ] ===
                                  option.value
                                }
                                onChange={() =>
                                  handleAnswerChange(
                                    question.id,
                                    option.value
                                  )
                                }
                                className="sr-only"
                                required
                              />

                              <div
                                className={`px-5 py-3.5 bg-ms-surface border rounded-2xl group-hover:bg-ms-hover transition-all text-sm flex items-center justify-between gap-4 ${
                                  answers[
                                    question.id
                                  ] ===
                                  option.value
                                    ? "border-ms-primary text-ms-primary"
                                    : "border-white/5 text-ms-text"
                                }`}
                              >
                                <span>
                                  {
                                    option.text
                                  }
                                </span>
                              </div>
                            </label>
                          )
                        )}
                      </div>
                    </div>
                  )
                )}

                <button
                  type="submit"
                  className="w-full py-4 bg-[#14B8A6] text-white font-bold rounded-2xl hover:brightness-110 shadow-lg shadow-[#14B8A6]/20 transition-all"
                >
                  Simpan Jawaban
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === "newchat" && (
          <div className="view-section flex-1 h-[calc(100dvh-64px)] overflow-hidden">
            <div className="max-w-4xl mx-auto pt-16 md:pt-24 fade-in flex flex-col items-start px-6">
              <div className="mb-10 text-left w-full">
                <h1 className="text-4xl md:text-[56px] font-semibold tracking-tight mb-2 leading-tight">
                  <span className="gradient-text">
                    Halo, {username}
                  </span>
                </h1>

                <h2 className="text-3xl md:text-[44px] font-semibold text-[#444746] tracking-tight leading-tight">
                  Ada yang bisa dibantu hari ini?
                </h2>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    sendSuggestion(
                      "Aku merasa sangat stres dengan tugas kuliah belakangan ini."
                    )
                  }
                  className="px-5 py-3 bg-ms-surface hover:bg-ms-hover border border-white/5 rounded-2xl text-[13px] text-ms-text transition-colors flex items-center gap-2 shadow-sm"
                >
                  <i
                    data-feather="edit-3"
                    className="w-4 h-4 text-ms-primary"
                  />{" "}

                  Aku merasa stres
                </button>

                <button
                  type="button"
                  onClick={() =>
                    sendSuggestion(
                      "Bantu aku mengatasi kecemasan tentang hari esok."
                    )
                  }
                  className="px-5 py-3 bg-ms-surface hover:bg-ms-hover border border-white/5 rounded-2xl text-[13px] text-ms-text transition-colors flex items-center gap-2 shadow-sm"
                >
                  <i
                    data-feather="cloud-rain"
                    className="w-4 h-4 text-ms-primary"
                  />{" "}

                  Atasi cemas
                </button>

                <button
                  type="button"
                  onClick={() =>
                    switchTab(
                      "dashboard"
                    )
                  }
                  className="px-5 py-3 bg-ms-surface hover:bg-ms-hover border border-white/5 rounded-2xl text-[13px] text-ms-text transition-colors flex items-center gap-2 shadow-sm"
                >
                  <i
                    data-feather="pie-chart"
                    className="w-4 h-4 text-ms-primary"
                  />{" "}

                  Lihat analitik
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "chatbot" && (
          <div className="view-section flex-1 h-[calc(100dvh-64px)] overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-40 pt-4 scroll-smooth">
              <div className="max-w-3xl mx-auto space-y-8 pb-10">
                {(currentChat?.messages || []).map(
                  (
                    message,
                    index
                  ) => (
                    <div
                      key={`${currentChatId}-${message.sender}-${index}`}
                      style={{
                        animationDelay:
                          `${index * 0.05}s`,
                      }}
                      className={
                        message.sender ===
                        "user"
                          ? "flex flex-col items-end fade-in"
                          : "flex items-start gap-4 fade-in"
                      }
                    >
                      {message.sender !==
                        "user" && (
                        <i
                          data-feather="aperture"
                          className="w-6 h-6 text-ms-primary shrink-0 mt-1"
                        />
                      )}

                      <div
                        className={
                          message.sender ===
                          "user"
                            ? "bg-[#282A2C] text-white px-5 py-3.5 rounded-[24px] text-[15px] leading-relaxed max-w-[85%] break-words whitespace-pre-wrap"
                            : "flex-1 text-[15px] text-ms-text leading-relaxed pt-1 break-words whitespace-pre-wrap"
                        }
                      >
                        {
                          message.text
                        }
                      </div>
                    </div>
                  )
                )}

                {loadingChatId ===
                  currentChatId && (
                  <TypingIndicator />
                )}

                <div
                  ref={
                    chatEndRef
                  }
                />
              </div>
            </div>
          </div>
        )}

        {(activeTab === "newchat" ||
          activeTab === "chatbot") && (
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-ms-bg via-ms-bg to-transparent pointer-events-none z-20">
            <div className="max-w-3xl mx-auto pointer-events-auto">
              <form
                onSubmit={
                  handleSendMessage
                }
                className="relative flex items-end bg-ms-surface rounded-[24px] border border-white/10 focus-within:border-white/20 focus-within:bg-[#232527] transition-colors shadow-lg"
              >
                <textarea
                  ref={
                    inputRef
                  }
                  value={
                    inputText
                  }
                  rows="1"
                  className="w-full bg-transparent border-none focus:outline-none text-[15px] text-white py-4 pl-6 resize-none custom-scroll placeholder-ms-textmuted"
                  placeholder="Ketik pesan di sini..."
                  onInput={
                    autoResize
                  }
                  onChange={(
                    event
                  ) =>
                    updateActiveDraft(
                      event.target
                        .value
                    )
                  }
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                        "Enter" &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();

                      sendMessage(
                        inputText
                      );
                    }
                  }}
                />

                <div className="p-2 shrink-0 flex items-center gap-1 mb-1 pr-2">
                  <button
                    type="submit"
                    disabled={
                      !inputText.trim() ||
                      loadingChatId !==
                        null
                    }
                    className={`p-2 rounded-full flex items-center justify-center w-10 h-10 transition-transform shadow-xl ${
                      inputText.trim() &&
                      loadingChatId ===
                        null
                        ? "bg-ms-text hover:bg-white text-ms-bg active:scale-95"
                        : "bg-ms-hover text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    <i
                      data-feather="arrow-up"
                      className="w-5 h-5"
                    />
                  </button>
                </div>
              </form>

              <p className="text-center text-[10px] text-gray-500 mt-3 hidden md:block">
                MindSpace AI dapat membuat kesalahan. Jika kondisi terasa
                darurat, hubungi orang terdekat atau bantuan profesional.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}