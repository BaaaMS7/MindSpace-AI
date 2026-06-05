import axios from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },

  /*
   * Backend membutuhkan waktu untuk menjalankan classifier
   * dan menyiapkan saran. Timeout tetap dibatasi agar UI tidak
   * menunggu tanpa batas ketika layanan eksternal bermasalah.
   */
  timeout: 45000,
});

export function getApiErrorMessage(
  error,
  fallback = 'Terjadi kesalahan saat menghubungi server.'
) {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}