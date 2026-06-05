import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";

/*
 * Halaman login ringan dan perlu tampil secepat mungkin.
 * Karena itu, Auth diimpor secara langsung.
 */
import Auth from "./Auth.jsx";

/*
 * Dashboard berukuran lebih besar.
 * File baru dimuat setelah user berhasil login.
 */
const Dashboard = lazy(() => import("./Dashboard.jsx"));

function LoadingScreen() {
  return (
    <div className="h-screen w-full bg-[#131314] flex items-center justify-center text-[#A8C7FA]">
      Memuat...
    </div>
  );
}

export default function App() {
  /*
   * auth.currentUser dipakai sebagai nilai awal jika sesi
   * sudah tersedia dari cache Firebase.
   */
  const [user, setUser] = useState(auth.currentUser);

  /*
   * Halaman login tidak perlu menunggu authReady.
   * authReady hanya dipakai untuk melindungi halaman dashboard.
   */
  const [authReady, setAuthReady] = useState(
    Boolean(auth.currentUser)
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/*
         * Halaman login langsung tampil.
         * Tidak perlu menunggu seluruh dashboard selesai dimuat.
         */}
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <Auth />
            )
          }
        />

        {/*
         * Dashboard tetap menunggu Firebase Auth karena
         * halaman ini hanya boleh terbuka setelah login.
         */}
        <Route
          path="/"
          element={
            !authReady ? (
              <LoadingScreen />
            ) : user ? (
              <Suspense fallback={<LoadingScreen />}>
                <Dashboard user={user} />
              </Suspense>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to={user ? "/" : "/login"}
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}