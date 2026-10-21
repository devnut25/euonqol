import type {
  ForgotPasswordResponse,
  LoginResponse,
  LogoutResponse,
  ResetPasswordResponse,
  UpdatePasswordResponse,
} from '@/types/apiAuth';
import type { AuthUser } from '@/hooks/useAuth';
import { t } from 'i18next';
import apiClient from '../client';

/**
 * POST /auth/login
 * Effettua il login e richiede OTP o password update
 */
export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  try {
    const response = await apiClient.post('/auth/login', { email, password });

    if (response.data.status === 'otp_required') {
      // Salva il temp token nel sessionStorage
      sessionStorage.setItem('temp_session_token', response.data.tempSessionToken);
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 400) {
      return error.response.data;
    }
    throw new Error(t('backend:serverError'));
  }
}

/**
 * POST /auth/update-password
 * Aggiorna la password dell'utente
 */
export async function updatePassword(
  email: string,
  oldPassword: string,
  newPassword: string
): Promise<UpdatePasswordResponse> {
  try {
    const response = await apiClient.post('/auth/update-password', {
      email,
      old_password: oldPassword,
      new_password: newPassword,
    });

    if (response.data.otpSent) {
      // Salva il temp token nel sessionStorage
      sessionStorage.setItem('temp_session_token', response.data.tempSessionToken);
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 400) {
      return error.response.data;
    }
    throw new Error(t('backend:serverError'));
  }
}

/**
 * POST /auth/logout
 * Effettua il logout
 */
export async function logout(refreshToken?: string): Promise<LogoutResponse> {
  const response = await apiClient.post('/auth/logout', {
    refresh_token: refreshToken,
  });
  return response.data;
}

/**
 * POST /auth/forgot-password
 * Invia email per reset password
 */
export async function forgotPassword(
  email: string
): Promise<ForgotPasswordResponse> {
  const response = await apiClient.post('/auth/forgot-password', { email });
  return response.data;
}

/**
 * POST /auth/reset-password
 * Reset password con token
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  email: string
): Promise<ResetPasswordResponse> {
  try {
    const response = await apiClient.post('/auth/reset-password', {
    token,
    new_password: newPassword,
    email,
  });

  if (response.data.otpSent) {
    // Salva il temp token nel sessionStorage
    sessionStorage.setItem('temp_session_token', response.data.tempSessionToken);
  }

  return response.data;
  } catch (error: any) {
    if (error.response?.status === 400) {
      return error.response.data;
    }
    throw new Error(t('backend:serverError'));
  }
}

/**
 * POST /auth/validate-session
 * Verifica se la sessione è ancora valida su Keycloak
 */
export async function validateSession(): Promise<{ valid: boolean; message?: string }> {
  try {
    const response = await apiClient.post('/auth/validate-session');
    return { valid: response.data.valid };
  } catch (error: any) {
    return { 
      valid: false, 
      message: error.response?.data?.message || t('backend:invalidSession') 
    };
  }
}

/**
 * GET User Info dal token JWT (decodifica client-side)
 */
export function decodeToken(token: string): AuthUser | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error(t('backend:failedTokenDecode'), error);
    return null;
  }
}