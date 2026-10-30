import * as authApi from '@/api/auth/route';
import * as otpApi from '@/api/otp/route';
import { AuthContext, type AuthUser, type PromiseResponse } from '@/hooks/useAuth';
import { requestTokensFromOpenTabs, respondToTokenRequests } from '@/lib/auth-tab-sync';
import type { LoginAttemptResult } from '@/types/apiAuth';
import { t } from 'i18next';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Listen to global logout event (from interceptor)
  useEffect(() => {
    const handleLogout = async () => {
      setUser(null);
      setAccessToken(null);
      sessionStorage.clear();
      navigate('/login', { replace: true });
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [navigate]);

  // Share this tab's session with new tabs that ask for it
  useEffect(() => respondToTokenRequests(), []);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      // New tab (sessionStorage is per tab): borrow the session from an open tab
      if (!sessionStorage.getItem('refresh_token')) {
        const shared = await requestTokensFromOpenTabs();
        if (shared) {
          sessionStorage.setItem('access_token', shared.access_token);
          sessionStorage.setItem('refresh_token', shared.refresh_token);
        }
      }

      const token = sessionStorage.getItem('access_token');
      const refreshToken = sessionStorage.getItem('refresh_token');

      // Restore session if both tokens are present
      if (token && refreshToken) {
        try {
          const userInfo = authApi.decodeToken(token);
          if (!userInfo) throw new Error('Failed to decode token');

          const currentTime = Math.floor(Date.now() / 1000);
          const tokenExpired = userInfo.exp && userInfo.exp < currentTime;

          if (!tokenExpired) {
            // Token is valid, also verify with Keycloak
            try {
              const sessionValidation = await authApi.validateSession();

              if (!sessionValidation.valid) {
                // Session invalidated by admin
                throw new Error(t('auth:errorCode.sessionInvalidated'));
              }

              setUser(userInfo);
              setAccessToken(token);
            } catch {
              // Validation failed, try to refresh
              const result = await otpApi.refreshToken(refreshToken);

              if (result.status === 'success' && result.access_token) {
                sessionStorage.setItem('access_token', result.access_token);
                sessionStorage.setItem('refresh_token', result.refresh_token!);

                const newUserInfo = authApi.decodeToken(result.access_token);
                setUser(newUserInfo);
                setAccessToken(result.access_token);
              } else {
                throw new Error(t('auth:errorCode.failedRefresh'));
              }
            }
          } else {
            // Token expired, try to refresh
            const result = await otpApi.refreshToken(refreshToken);

            if (result.status === 'success' && result.access_token) {
              sessionStorage.setItem('access_token', result.access_token);
              sessionStorage.setItem('refresh_token', result.refresh_token!);

              const newUserInfo = authApi.decodeToken(result.access_token);
              setUser(newUserInfo);
              setAccessToken(result.access_token);
            } else {
              throw new Error(t('auth:errorCode.failedRefresh'));
            }
          }
        } catch {
          sessionStorage.clear();
          setUser(null);
          setAccessToken(null);
        }
      }
      // Only refresh token present (access_token deleted)
      else if (!token && refreshToken) {
        try {
          const result = await otpApi.refreshToken(refreshToken);

          if (result.status === 'success' && result.access_token) {
            sessionStorage.setItem('access_token', result.access_token);
            sessionStorage.setItem('refresh_token', result.refresh_token!);

            const newUserInfo = authApi.decodeToken(result.access_token);
            setUser(newUserInfo);
            setAccessToken(result.access_token);
          } else {
            throw new Error(t('auth:errorCode.failedRefresh'));
          }
        } catch {
          sessionStorage.clear();
          setUser(null);
          setAccessToken(null);
        }
      }
      // No tokens present
      else {
        setUser(null);
        setAccessToken(null);
      }

      setLoading(false);
    };

    restoreSession();
  }, []);

  /**
   * Login - Verifica credenziali
   */
  const login = async (email: string, password: string): Promise<LoginAttemptResult> => {
    try {
      const result = await authApi.login(email, password);

      if (result.status === 'password_update_required') {
        return {
          success: false,
          requiresPasswordUpdate: true,
        };
      }

      if (result.status === 'otp_required') {
        return {
          success: false,
          requiresOTP: true,
        };
      }

      return {
        success: false,
        error: result.message || t('auth:errorCode.failedLogin'),
      };
    } catch {
      return {
        success: false,
        isServerError: true,
        error: t('backend:serverError'),
      };
    }
  };

  /**
   * Update Password - Aggiorna password
   */
  const updatePassword = async (
    email: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; isServerError?: boolean }> => {
    try {
      const result = await authApi.updatePassword(email, oldPassword, newPassword);

      if (result.status === 'success') {
        return { success: true };
      }

      return {
        success: false,
        error: result.message || t('auth:errorCode.failedUpdatePassword'),
      };
    } catch {
      return {
        success: false,
        isServerError: true,
        error: t('backend:serverError'),
      };
    }
  };

  /**
   * Richiede il reset della password tramite il backend
   */
  const forgotPassword = async (email: string): Promise<PromiseResponse> => {
    try {
      const result = await authApi.forgotPassword(email);

      if (result.success) {
        return {
          success: true,
          message: result.message || t('auth:successCode.emailSent'),
        };
      }

      return {
        success: false,
        message: result.message || t('auth:errorCode.failedPasswordReset'),
      };
    } catch {
      return {
        success: false,
        isServerError: true,
        message: t('backend:serverError'),
      };
    }
  };

  /**
   * Resetta la password e riceve OTP per completare il login
   */
  const resetPasswordWithOTP = async (
    token: string,
    newPassword: string,
    email: string
  ): Promise<{ success: boolean; otpSent?: boolean; error?: string; isServerError?: boolean }> => {
    try {
      const result = await authApi.resetPassword(token, newPassword, email);

      if (result.success) {
        if (result.otpSent) {
          return {
            success: true,
            otpSent: true,
          };
        }

        return { success: true };
      }

      return {
        success: false,
        error: result.error || result.message || t('auth:errorCode.failedPasswordReset'),
      };
    } catch {
      return {
        success: false,
        isServerError: true,
        error: t('backend:serverError'),
      };
    }
  };

  /**
   * Verify OTP - Step 3: Verifica OTP e completa login
   */
  const verifyOTP = async (otp: string): Promise<{ success: boolean; error?: string; isServerError?: boolean }> => {
    try {
      const result = await otpApi.verifyOTP(otp);

      if (result.status === 'success' && result.access_token) {
        // Salva token
        sessionStorage.setItem('access_token', result.access_token);
        sessionStorage.setItem('refresh_token', result.refresh_token!);

        // Decodifica user info
        const userInfo = authApi.decodeToken(result.access_token);

        setAccessToken(result.access_token);
        setUser(userInfo);

        return { success: true };
      }

      return {
        success: false,
        error: result.message || t('auth:errorCode.otpNotValid'),
      };
    } catch {
      return {
        success: false,
        isServerError: true,
        error: t('backend:serverError'),
      };
    }
  };

  /**
   * Resend OTP
   */
  const resendOTP = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await otpApi.resendOTP();

      if (result.status === 'success') {
        return { success: true };
      }

      return {
        success: false,
        error: result.message || t('auth:errorCode.otpResend'),
      };
    } catch {
      throw new Error(t('backend:serverError'));
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    const refreshToken = sessionStorage.getItem('refresh_token');

    try {
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch (err) {
      console.error('Error', err);
    } finally {
      sessionStorage.clear();
      setUser(null);
      setAccessToken(null);
      navigate('/login', { replace: true });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        loading,
        login,
        updatePassword,
        forgotPassword,
        resetPasswordWithOTP,
        verifyOTP,
        resendOTP,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
