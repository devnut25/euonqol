import React from "react";
import type { UserTypeEnum } from "@/utils/enum";
import type { LoginAttemptResult } from "@/types/apiAuth";

export interface PromiseResponse {
  success?: boolean;
  message?: string;
  /** Errore di connessione/server, non legato ai dati inseriti */
  isServerError?: boolean;
}

/** Shape del JWT payload decodificato */
export interface AuthUser {
  sub?: string;
  email?: string;
  full_name?: string;
  user_type: UserTypeEnum;
  exp?: number;
  iat?: number;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginAttemptResult>;
  updatePassword: (
    email: string,
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; otpSent?: boolean; error?: string; isServerError?: boolean }>;
  verifyOTP: (otp: string) => Promise<{ success: boolean; error?: string; isServerError?: boolean }>;
  resendOTP: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<PromiseResponse>;
  resetPasswordWithOTP: (
    token: string,
    newPassword: string,
    email: string,
  ) => Promise<{ success: boolean; otpSent?: boolean; error?: string; isServerError?: boolean }>;
}

export const AuthContext = React.createContext<AuthContextType | undefined>(
  undefined,
);

export const useAuth = () => {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
