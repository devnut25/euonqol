export interface LoginResponse {
  status: "otp_required" | "password_update_required" | "error";
  message: string;
}

export interface UpdatePasswordResponse {
  status: "success" | "error";
  message: string;
  otpSent?: boolean;
  tempSessionToken?: string;
}

export interface VerifyOTPResponse {
  status: "success" | "error";
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  message?: string;
}

export interface ResendOTPResponse {
  status: "success" | "error";
  message: string;
}

export interface TokenResponse {
  status: "success" | "error";
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
}

export interface LogoutResponse {
  status: "success";
  message: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
  otpSent?: boolean;
  tempSessionToken?: string;
}

export interface LoginAttemptResult {
  success: boolean;
  requiresPasswordUpdate?: boolean;
  requiresOTP?: boolean;
  error?: string;
  /** Errore di connessione/server, non legato ai dati inseriti */
  isServerError?: boolean;
}