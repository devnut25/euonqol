import { useEffect } from "react";
import { useAuth } from "./useAuth";

export const useTokenValidator = () => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const validateTokens = () => {
      const accessToken = sessionStorage.getItem("access_token");
      const refreshToken = sessionStorage.getItem("refresh_token");

      // Se autenticato ma token mancanti
      if (isAuthenticated && !accessToken && !refreshToken) {
        window.dispatchEvent(new Event("auth:logout"));
      }
    };

    validateTokens();

    // Verifica periodica
    const interval = setInterval(validateTokens, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);
};
