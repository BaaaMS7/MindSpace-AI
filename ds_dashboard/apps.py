"""
Dashboard Streamlit admin/internal untuk MindSpace AI.

Sumber data tunggal:
- MongoDB: mood_assessments dan chat_messages.

CSV fallback sengaja dinonaktifkan agar dashboard tidak pernah
menampilkan data simulasi ketika MongoDB kosong atau gagal terhubung.

Jalankan dari root project:
    python -m streamlit run ds_dashboard/streamlit_app.py
"""

from __future__ import annotations

import hmac
import json
import os
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
import plotly.express as px
import streamlit as st
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]

QUESTION_COLUMNS = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"]
MOOD_COLLECTION = "mood_assessments"
CHAT_COLLECTION = "chat_messages"


def load_local_env() -> None:
    """Load .env root project untuk eksekusi lokal; Streamlit Cloud tetap memakai secrets."""
    load_dotenv(ROOT / ".env", override=False)


def get_config_value(key: str, default: str | None = None) -> str | None:
    """Ambil konfigurasi dari environment variable atau Streamlit secrets."""
    env_value = os.getenv(key)
    if env_value:
        return env_value

    try:
        secret_value = st.secrets.get(key, default)
        return str(secret_value) if secret_value is not None else default
    except Exception:
        return default


def require_admin_login() -> bool:
    """Blok seluruh dashboard sampai admin berhasil login."""
    admin_username = get_config_value("ADMIN_USERNAME")
    admin_password = get_config_value("ADMIN_PASSWORD")

    if not admin_username or not admin_password:
        st.error(
            "ADMIN_USERNAME dan ADMIN_PASSWORD belum dikonfigurasi. "
            "Isi di .env lokal atau Streamlit Cloud Secrets sebelum membuka dashboard."
        )
        return False

    if st.session_state.get("admin_authenticated") is True:
        with st.sidebar:
            st.success(f"Login admin: {admin_username}")
            if st.button("Logout admin"):
                st.session_state.pop("admin_authenticated", None)
                st.rerun()
        return True

    st.title("🔒 MindSpace Internal Analytics")
    st.caption("Dashboard ini hanya untuk admin/internal. User biasa tidak memiliki link dari website utama.")

    with st.form("admin_login_form"):
        username = st.text_input("Admin username")
        password = st.text_input("Admin password", type="password")
        submitted = st.form_submit_button("Masuk")

    if submitted:
        if hmac.compare_digest(username, admin_username) and hmac.compare_digest(password, admin_password):
            st.session_state["admin_authenticated"] = True
            st.rerun()
        else:
            st.error("Username atau password admin salah.")

    return False


def stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return str(value)


def safe_to_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def docs_to_dataframe(docs: Iterable[dict[str, Any]]) -> pd.DataFrame:
    docs = list(docs)
    if not docs:
        return pd.DataFrame()

    for doc in docs:
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])

    return pd.json_normalize(docs, sep=".")


def get_safe_mongo_target(mongodb_uri: str, db_name: str) -> str:
    """Tampilkan target MongoDB tanpa pernah membocorkan username/password."""
    if not mongodb_uri:
        return "belum dikonfigurasi"

    without_protocol = mongodb_uri.replace("mongodb+srv://", "").replace("mongodb://", "")
    host_and_path = without_protocol.split("@")[-1]
    host = host_and_path.split("/")[0]
    return f"{host}/{db_name}"


@st.cache_resource(show_spinner=False)
def get_mongo_client(mongodb_uri: str):
    """Reuse MongoClient agar Streamlit tidak membuka pool baru pada setiap rerun."""
    from pymongo import MongoClient

    return MongoClient(
        mongodb_uri,
        appname="mindspace-ai-streamlit",
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=15000,
        maxPoolSize=5,
        retryWrites=True,
    )


@st.cache_data(ttl=15, show_spinner=False)
def load_mongodb_data(mongodb_uri: str, db_name: str) -> tuple[pd.DataFrame, pd.DataFrame, str | None]:
    if not mongodb_uri:
        return pd.DataFrame(), pd.DataFrame(), "MONGODB_URI belum dikonfigurasi."

    try:
        client = get_mongo_client(mongodb_uri)
        client.admin.command("ping")
        db = client[db_name]

        mood_docs = list(db[MOOD_COLLECTION].find({}).sort("createdAt", -1))
        chat_docs = list(db[CHAT_COLLECTION].find({}).sort("createdAt", -1))

        return docs_to_dataframe(mood_docs), docs_to_dataframe(chat_docs), None
    except ImportError:
        return pd.DataFrame(), pd.DataFrame(), "Package pymongo belum terinstall. Jalankan: pip install -r ds_dashboard/requirements.txt"
    except Exception as exc:
        # Pool lama dibuang agar klik reconnect benar-benar membuat koneksi baru.
        get_mongo_client.clear()
        return pd.DataFrame(), pd.DataFrame(), f"Gagal membaca MongoDB: {exc}"



def normalize_assessments(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    result = df.copy()

    if "createdAt" in result.columns:
        result["created_at"] = safe_to_datetime(result["createdAt"])
    elif "created_at" in result.columns:
        result["created_at"] = safe_to_datetime(result["created_at"])
    else:
        result["created_at"] = pd.NaT

    result["created_date"] = safe_to_datetime(result["created_at"]).dt.date
    result["userEmail"] = result.get("userEmail", pd.Series(["anonymous"] * len(result))).fillna("anonymous").astype(str).str.lower()
    result["userId"] = result.get("userId", pd.Series(["anonymous"] * len(result))).fillna("anonymous").astype(str)

    for col in QUESTION_COLUMNS:
        nested_col = f"answers.{col}"
        if nested_col in result.columns and col not in result.columns:
            result[col] = result[nested_col]

    if "score" not in result.columns:
        if "wellbeing_score" in result.columns:
            result["score"] = result["wellbeing_score"]
        elif set(QUESTION_COLUMNS).issubset(result.columns):
            result["score"] = result["mood"] + result["tidur"] + result["aktivitas"] + result["energi"] + (6 - result["stres"]) + result["sosial"]

    if "wellbeing_score" not in result.columns and "score" in result.columns:
        result["wellbeing_score"] = result["score"]

    if "label" not in result.columns:
        result["label"] = result.get("classifier.label", pd.Series(["UNKNOWN"] * len(result)))

    if "classifier_label" not in result.columns:
        result["classifier_label"] = result.get("classifier.label", result.get("label", pd.Series([""] * len(result))))

    if "classifier_confidence" not in result.columns:
        if "classifier.confidencePercent" in result.columns:
            result["classifier_confidence"] = result["classifier.confidencePercent"]
        elif "classifier.confidence" in result.columns:
            result["classifier_confidence"] = pd.to_numeric(result["classifier.confidence"], errors="coerce") * 100
        else:
            result["classifier_confidence"] = None

    result["data_source"] = result.get("data_source", "MongoDB")
    return result


def normalize_chats(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    result = df.copy()
    if "createdAt" in result.columns:
        result["created_at"] = safe_to_datetime(result["createdAt"])
    elif "created_at" in result.columns:
        result["created_at"] = safe_to_datetime(result["created_at"])
    else:
        result["created_at"] = pd.NaT

    result["userEmail"] = result.get("userEmail", pd.Series(["anonymous"] * len(result))).fillna("anonymous").astype(str).str.lower()
    result["userId"] = result.get("userId", pd.Series(["anonymous"] * len(result))).fillna("anonymous").astype(str)
    result["chatId"] = result.get("chatId", pd.Series([""] * len(result))).fillna("").astype(str)
    result["sender"] = result.get("sender", pd.Series([""] * len(result))).fillna("").astype(str)
    result["text"] = result.get("text", pd.Series([""] * len(result))).fillna("").astype(str)
    result["data_source"] = "MongoDB"
    return result


def load_dashboard_data() -> tuple[pd.DataFrame, pd.DataFrame, str, str | None]:
    """
    Dashboard hanya membaca MongoDB.

    CSV fallback sengaja dinonaktifkan agar data simulasi tidak tampil
    ketika MongoDB kosong atau gagal terhubung.
    """
    mongodb_uri = get_config_value("MONGODB_URI") or ""
    db_name = get_config_value("MONGODB_DB_NAME", "mindspace_ai") or "mindspace_ai"
    mongo_assessments, mongo_chats, mongo_error = load_mongodb_data(mongodb_uri, db_name)

    if mongo_error:
        return pd.DataFrame(), pd.DataFrame(), "MongoDB error", mongo_error

    return (
        normalize_assessments(mongo_assessments),
        normalize_chats(mongo_chats),
        "MongoDB",
        None,
    )


def get_all_user_emails(assessments: pd.DataFrame, chats: pd.DataFrame) -> list[str]:
    emails: set[str] = set()
    for df in [assessments, chats]:
        if not df.empty and "userEmail" in df.columns:
            emails.update(str(email).lower() for email in df["userEmail"].dropna().unique() if str(email).strip())
    return sorted(emails)


def build_combined_table(assessments: pd.DataFrame, chats: pd.DataFrame) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []

    if not assessments.empty:
        cols = [
            "created_at", "userEmail", "userId", "chatId", "label", "classifier_label",
            "classifier_confidence", "score", "age", "mood", "tidur", "aktivitas", "energi",
            "stres", "sosial", "aiAdvice", "data_source",
        ]
        existing = [c for c in cols if c in assessments.columns]
        assessment_events = assessments[existing].copy()
        assessment_events.insert(0, "event_type", "Kuesioner")
        if "aiAdvice" in assessment_events.columns:
            assessment_events["content"] = assessment_events["aiAdvice"].map(stringify)
        frames.append(assessment_events)

    if not chats.empty:
        cols = ["created_at", "userEmail", "userId", "chatId", "sender", "text", "geminiModel", "geminiFallbackUsed", "geminiError", "data_source"]
        existing = [c for c in cols if c in chats.columns]
        chat_events = chats[existing].copy()
        chat_events.insert(0, "event_type", "Chat")
        if "text" in chat_events.columns:
            chat_events["content"] = chat_events["text"].map(stringify)
        frames.append(chat_events)

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True, sort=False)
    if "created_at" in combined.columns:
        combined = combined.sort_values("created_at", ascending=False, na_position="last")
    return combined


def render_global_analytics(assessments: pd.DataFrame, chats: pd.DataFrame, source_name: str) -> None:
    st.header("🌐 Global Analytics — Semua User")
    st.caption(f"Sumber data aktif: {source_name}. Dashboard hanya membaca MongoDB.")

    all_emails = get_all_user_emails(assessments, chats)
    total_users = len([email for email in all_emails if email and email != "anonymous"])

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total user", total_users)
    col2.metric("Total kuesioner", len(assessments))
    col3.metric("Total chat", len(chats))

    if not assessments.empty and "wellbeing_score" in assessments.columns:
        avg_score = pd.to_numeric(assessments["wellbeing_score"], errors="coerce").mean()
        col4.metric("Rata-rata skor", f"{avg_score:.2f}" if pd.notna(avg_score) else "N/A")
    else:
        col4.metric("Rata-rata skor", "N/A")

    st.markdown("---")

    left, right = st.columns(2)
    with left:
        st.subheader("Distribusi label mood")
        if not assessments.empty and "label" in assessments.columns:
            mood_counts = assessments["label"].fillna("UNKNOWN").value_counts().reset_index()
            mood_counts.columns = ["label", "jumlah"]
            fig = px.bar(mood_counts, x="label", y="jumlah", text="jumlah")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Belum ada data label mood.")

    with right:
        st.subheader("Tren mood/wellbeing dari waktu ke waktu")
        score_col = "wellbeing_score" if "wellbeing_score" in assessments.columns else ("score" if "score" in assessments.columns else None)
        if not assessments.empty and score_col and "created_at" in assessments.columns:
            trend_df = assessments.dropna(subset=["created_at"]).copy()
            trend_df[score_col] = pd.to_numeric(trend_df[score_col], errors="coerce")
            trend_df = trend_df.dropna(subset=[score_col])
            if not trend_df.empty:
                trend_df["tanggal"] = trend_df["created_at"].dt.date
                trend = trend_df.groupby("tanggal", as_index=False)[score_col].mean()
                fig = px.line(trend, x="tanggal", y=score_col, markers=True)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Skor belum tersedia untuk membuat tren.")
        else:
            st.info("Tanggal atau skor belum tersedia untuk membuat tren.")

    st.markdown("---")
    st.subheader("Tabel gabungan semua data")
    combined = build_combined_table(assessments, chats)
    if combined.empty:
        st.info("Belum ada data untuk ditampilkan.")
    else:
        st.dataframe(combined, use_container_width=True, hide_index=True)

    with st.expander("Lihat data mentah mood_assessments"):
        st.dataframe(assessments, use_container_width=True, hide_index=True)

    with st.expander("Lihat data mentah chat_messages"):
        if chats.empty:
            st.info("Belum ada data chat_messages di MongoDB.")
        else:
            st.dataframe(chats, use_container_width=True, hide_index=True)


def render_user_detail(assessments: pd.DataFrame, chats: pd.DataFrame) -> None:
    st.header("👤 User Detail")

    emails = get_all_user_emails(assessments, chats)
    if not emails:
        st.info("Belum ada email user di database. Pastikan frontend mengirim userEmail ke /api/kuesioner dan /api/chat.")
        return

    selected_email = st.selectbox("Pilih email user", emails)
    user_assessments = assessments[assessments["userEmail"] == selected_email].copy() if not assessments.empty else pd.DataFrame()
    user_chats = chats[chats["userEmail"] == selected_email].copy() if not chats.empty else pd.DataFrame()

    user_ids = []
    for df in [user_assessments, user_chats]:
        if not df.empty and "userId" in df.columns:
            user_ids.extend(df["userId"].dropna().astype(str).unique().tolist())

    st.subheader("Profil ringkas user")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Email", selected_email)
    col2.metric("User ID", user_ids[0] if user_ids else "N/A")
    col3.metric("Total kuesioner", len(user_assessments))
    col4.metric("Total pesan chat", len(user_chats))

    st.markdown("---")
    st.subheader("Riwayat kuesioner dan hasil classifier")
    if user_assessments.empty:
        st.info("User ini belum memiliki data kuesioner.")
    else:
        assessment_cols = [
            "created_at", "label", "classifier_label", "classifier_confidence", "score", "age",
            "mood", "tidur", "aktivitas", "energi", "stres", "sosial", "aiAdvice",
        ]
        existing = [col for col in assessment_cols if col in user_assessments.columns]
        st.dataframe(user_assessments[existing], use_container_width=True, hide_index=True)

        latest = user_assessments.sort_values("created_at", ascending=False).iloc[0]
        st.markdown("**Hasil classifier terbaru:**")
        st.json(
            {
                "label": latest.get("label"),
                "classifier_label": latest.get("classifier_label"),
                "classifier_confidence_percent": latest.get("classifier_confidence"),
                "score": latest.get("score"),
                "answers": {col: latest.get(col) for col in QUESTION_COLUMNS if col in user_assessments.columns},
            }
        )

    st.markdown("---")
    st.subheader("Riwayat chat berdasarkan chatId")
    if user_chats.empty:
        st.info("User ini belum memiliki data chat.")
    else:
        chat_ids = sorted(user_chats["chatId"].dropna().astype(str).unique().tolist())
        selected_chat_id = st.selectbox("Pilih chatId", chat_ids)
        selected_chat = user_chats[user_chats["chatId"].astype(str) == selected_chat_id].sort_values("created_at")

        for _, row in selected_chat.iterrows():
            sender = str(row.get("sender", "")).upper() or "UNKNOWN"
            created_at = row.get("created_at")
            timestamp = created_at.strftime("%d/%m/%Y %H:%M:%S") if pd.notna(created_at) else "tanpa waktu"
            with st.chat_message("assistant" if sender.lower() in {"ai", "assistant", "bot"} else "user"):
                st.caption(f"{sender} • {timestamp}")
                st.write(row.get("text", ""))

        with st.expander("Tabel chat user ini"):
            cols = ["created_at", "chatId", "sender", "text", "geminiModel", "geminiFallbackUsed", "geminiError"]
            existing = [col for col in cols if col in user_chats.columns]
            st.dataframe(user_chats[existing], use_container_width=True, hide_index=True)

    st.markdown("---")
    st.subheader("Tabel data mentah user")
    combined = build_combined_table(user_assessments, user_chats)
    if combined.empty:
        st.info("Belum ada data mentah untuk user ini.")
    else:
        st.dataframe(combined, use_container_width=True, hide_index=True)


def main() -> None:
    load_local_env()

    st.set_page_config(page_title="MindSpace Internal Analytics", layout="wide")

    if not require_admin_login():
        return

    st.title("🧠 MindSpace Internal Analytics Dashboard")
    st.caption("Dashboard admin untuk memantau kuesioner, classifier, mood, skor, dan chat user dari MongoDB.")

    assessments, chats, source_name, mongo_error = load_dashboard_data()

    mongodb_uri = get_config_value("MONGODB_URI") or ""
    db_name = get_config_value("MONGODB_DB_NAME", "mindspace_ai") or "mindspace_ai"

    with st.sidebar:
        st.header("🎛️ Mode dashboard")
        mode = st.radio("Pilih mode", ["Global Analytics", "User Detail"], index=0)
        st.markdown("---")
        st.caption(f"Sumber aktif: {source_name}")
        st.caption(f"Target MongoDB: {get_safe_mongo_target(mongodb_uri, db_name)}")
        st.success("MongoDB terhubung") if not mongo_error else st.error("MongoDB belum terhubung")

        if st.button("Refresh data"):
            st.cache_data.clear()
            st.rerun()

        if st.button("Reconnect MongoDB"):
            st.cache_data.clear()
            get_mongo_client.clear()
            st.rerun()

    if mongo_error:
        st.warning(f"Catatan MongoDB: {mongo_error}")
        st.info(
            "Periksa MONGODB_URI, MONGODB_DB_NAME, database user Atlas, dan Network Access Atlas. "
            "Untuk backend lokal, jalankan juga: npm run test:mongo"
        )

    if assessments.empty and chats.empty:
        st.info("Belum ada data di MongoDB. Isi kuesioner atau kirim chat dari website, lalu klik Refresh data.")
        return

    if mode == "Global Analytics":
        render_global_analytics(assessments, chats, source_name)
    else:
        render_user_detail(assessments, chats)


if __name__ == "__main__":
    main()