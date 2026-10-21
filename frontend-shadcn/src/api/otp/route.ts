import type {
  ResendOTPResponse,
  TokenResponse,
  VerifyOTPResponse,
} from '@/types/apiAuth';
import { t } from 'i18next';
import apiClient from '../client';

/**
 * POST /otp/verify-otp
 * Verifica il codice OTP e ottiene i token
 */
export async function verifyOTP(
  otp: string
): Promise<VerifyOTPResponse> {
  const tempSessionToken = sessionStorage.getItem('temp_session_token');

  try {
    const response = await apiClient.post('/otp/verify-otp', {
      tempSessionToken,
      otp,
    });

    if(response.data.status === 'success') {
      // Rimuovi il temp token
      sessionStorage.removeItem('temp_session_token');
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      return error.response.data;
    }
    if (error.response?.status === 400) {
      return error.response.data;
    }
    throw new Error(t('backend:serverError'));
  }
}

/**
 * POST /otp/resend-otp
 * Richiede un nuovo codice OTP
 */
export async function resendOTP(): Promise<ResendOTPResponse> {
  const tempSessionToken = sessionStorage.getItem('temp_session_token');

  try {
    const response = await apiClient.post('/otp/resend-otp', { tempSessionToken });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 400) {
      return error.response.data;
    }
    if (error.response?.status === 429) {
      return error.response.data;
    }
    throw new Error(t('backend:serverError'));
  }
}

/**
 * POST /otp/refresh-token
 * Rinnova il token di accesso
 * 
 * ⚠️ NOTA: Questa funzione è raramente usata direttamente perché
 * l'interceptor gestisce automaticamente il refresh su 401.
 * La teniamo per eventuali casi d'uso manuali.
 */
export async function refreshToken(
  refreshToken: string
): Promise<TokenResponse> {
  try {
    const response = await apiClient.post('/otp/refresh-token', {
      refresh_token: refreshToken,
    });
    return response.data;
  } catch {
    throw new Error(t('backend:invalidRefreshToken'));
  }
}