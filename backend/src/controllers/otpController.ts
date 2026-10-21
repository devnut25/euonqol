import { invalidateTempSessionToken, verifyTempSessionToken } from "../helpers/session.js";
import { NextFunction, Request, Response } from "express";
import pool from "../config/database";

import {
  loginUserWithKeycloak,
  refreshAccessToken
} from "../helpers/keycloak";
import Otp from "../models/Otp";

const otpService = new Otp(pool);

/**
 * POST /euonqol-api/otp/verify-otp
 * Step 2: Verifica OTP e completa login su Keycloak
 */
export const verifyOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tempSessionToken, otp } = req.body;

    if (!tempSessionToken || !otp) {
      return res.status(400).json({
        status: "error",
        message: "Session token and OTP are required",
      });
    }

    // Verifica il temp session token
    const { userId, email, password } = verifyTempSessionToken(tempSessionToken);

    // 1. Verifica OTP dal database
    const otpValid = await otpService.verifyOTPFromDatabase(userId, otp);

    if (!otpValid.valid) {
      return res.status(400).json({
        status: "error",
        message: otpValid.error || "OTP invalid or expired",
      });
    }

    // Invalida token
    invalidateTempSessionToken(tempSessionToken);

    // 2. ✅ OTP valido → ADESSO fai login completo su Keycloak
    const loginResult = await loginUserWithKeycloak(email, password);

    if (!loginResult.success) {
      return res.status(400).json({
        status: "error",
        message: loginResult.error || "Login failed",
      });
    }

    // 3. OTP valido - Elimina tutti gli OTP dell'utente
    await otpService.deleteUserOTPs(userId);

    return res.json({
      status: "success",
      message: "Login completed successfully",
      access_token: loginResult.tokens!.access_token,
      refresh_token: loginResult.tokens!.refresh_token,
      expires_in: loginResult.tokens!.expires_in,
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/otp/resend-otp
 * Reinvia il codice OTP
 */
export const resendOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tempSessionToken } = req.body;

    if (!tempSessionToken) {
      return res.status(400).json({
        status: "error",
        message: "Session token required",
      });
    }

    // 1. Trova utente
    // Verifica il temp session token
    const { userId, email } = verifyTempSessionToken(tempSessionToken);

    // 2. Verifica se esiste già un OTP recente (ultimo minuto)
    const hasRecentOTP = await otpService.hasRecentOTP(userId);
    
    if (hasRecentOTP) {
      return res.status(400).json({
        status: "error",
        message: "An OTP code has already been sent recently. Please wait before requesting another.",
      });
    }

    // 3. Verifica limite di 3 OTP in 5 minuti
    const otpCount = await otpService.getOTPCountInTimeWindow(userId, 5);
    
    if (otpCount >= 3) {
      return res.status(429).json({
        status: "error",
        message: "You have reached the maximum limit of OTP requests. Please try again in a few minutes.",
      });
    }


    // 2. Genera nuovo OTP e salvalo nel database
    const otp = otpService.generateOTP();
    await otpService.saveOTPToDatabase(userId, otp);

    // 3. Invia OTP via email
    await otpService.sendOTPEmail(email, otp);

    return res.json({
      status: "success",
      message: "New OTP code sent",
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/otp/refresh-token
 * Rinnova il token di accesso
 */
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        status: 'error',
        message: 'Refresh token required',
      });
    }

    // ✅ Chiama il servizio Keycloak
    const tokenData = await refreshAccessToken(refresh_token);

    return res.json({
      status: 'success',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    });
  } catch (error: any) {
    console.error('❌ Refresh token error:');
    console.error('  Message:', error.message);
    console.error('  Response:', error.response?.data);

    return next(error);
  }
};