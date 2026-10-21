import { useAuth } from "@/hooks/useAuth";
import { useTokenValidator } from "@/hooks/useValidator";
import { Navigate, Outlet } from "react-router-dom";
import DevnutSection from "./DevnutSection";

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  // ✅ Verifica token automaticamente
  useTokenValidator();

  // Mostra loading mentre verifica l'autenticazione
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <DevnutSection.Loading />
      </div>
    );
  }

  // Se autenticato, mostra la route protetta, altrimenti redirect al login
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
