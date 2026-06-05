import { useState } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleAuth = async (event) => {
    event.preventDefault();

    setError("");

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (authError) {
      setError(authError.message);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-ms-bg text-ms-text font-sans">
      <div className="w-full max-w-md bg-ms-surface p-8 rounded-[28px] border border-white/10 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold mb-2">
            <span className="gradient-text">MindSpace AI</span>
          </h1>

          <p className="text-ms-textmuted text-sm">
            {isLogin
              ? "Masuk untuk melanjutkan sesi kamu"
              : "Daftarkan akun barumu"}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-5 py-3.5 bg-ms-bg border border-white/5 rounded-2xl focus:outline-none focus:border-ms-primary transition-colors text-white"
              required
            />
          </div>

          <div>
            <input
              type="password"
              placeholder="Password (minimal 6 karakter)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full px-5 py-3.5 bg-ms-bg border border-white/5 rounded-2xl focus:outline-none focus:border-ms-primary transition-colors text-white"
              required
              minLength="6"
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-[#004A77] text-ms-primary font-bold rounded-2xl hover:brightness-125 transition-all"
          >
            {isLogin ? "Masuk" : "Daftar Sekarang"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ms-textmuted">
          {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}

          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-ms-primary font-medium hover:underline"
          >
            {isLogin ? "Daftar" : "Masuk"}
          </button>
        </p>
      </div>
    </div>
  );
}