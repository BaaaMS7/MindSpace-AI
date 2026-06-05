import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    /*
     * Gunakan alamat yang konsisten dengan frontend dan backend.
     */
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,

    /*
     * Setelah server siap, browser langsung membuka halaman login.
     */
    open: "/login",

    /*
     * Transform hanya file yang selalu diperlukan saat login.
     * Dashboard sengaja tidak dimasukkan karena ukurannya lebih besar
     * dan baru diperlukan setelah user berhasil login.
     */
    warmup: {
      clientFiles: [
        "./src/main.jsx",
        "./src/App.jsx",
        "./src/Auth.jsx",
        "./src/firebase.js",
        "./src/index.css",
      ],
    },
  },
});