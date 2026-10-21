import { createTempSessionToken } from "../helpers/session.js";
import { EmailPayloadMap, emailService, EmailType } from "../services/email/index.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import pool from "../config/database";
import {
  getKeycloakUserByEmail,
  getSSOLogoutUrl,
  introspectToken,
  logoutUser,
  removeRequiredAction,
  updateUserPassword,
  verifyUserCredentials
} from "../helpers/keycloak";
import Otp from "../models/Otp";

const otpService = new Otp(pool);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * POST /euonqol-api/auth/login
 * Step 1: Verifica credenziali e invia OTP
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    // 1. ✅ Verifica credenziali SENZA creare sessione
    const credentialsCheck = await verifyUserCredentials(email, password);

    if (!credentialsCheck.valid) {
      return res.status(400).json({
        status: "error",
        message: credentialsCheck.error || "Invalid credentials",
      });
    }

    const user = credentialsCheck.user!;

    if(user.attributes?.is_active.toString() === "false") {
      return res.status(400).json({
        status: "error",
        message: "Invalid credentials or user not found",
      });
    }

    // 2. Controlla se serve aggiornamento password
    if (credentialsCheck.needsPasswordUpdate) {
      return res.json({
        status: "password_update_required",
        message: "Password update required before proceeding",
      });
    }

    // 3. ✅ Credenziali valide → Genera e salva OTP
    const otp = otpService.generateOTP();
    await otpService.saveOTPToDatabase(user.id, otp);

    // 4. Invia OTP via email
    await otpService.sendOTPEmail(email, otp);

    // Crea token con password CRIPTATA
    const tempSessionToken = createTempSessionToken(user.id, email, password);

    return res.json({
      status: "otp_required",
      message: "OTP code sent via email",
      tempSessionToken,
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/auth/update-password
 * Aggiorna la password dell'utente e invia OTP
 */
export const updatePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, old_password, new_password } = req.body;

    if (!email || !old_password || !new_password) {
      return res.status(400).json({
        status: "error",
        message: "Email, old password and new password are required",
      });
    }

    // Validazione password
    if (new_password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "New password must be at least 8 characters long",
      });
    }

    // 1. Trova utente
    const user = await getKeycloakUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // 2. Aggiorna password su Keycloak
    await updateUserPassword(user.id, new_password);

    // 3. Rimuovi required action se presente
    if (user.requiredActions?.includes("UPDATE_PASSWORD")) {
      await removeRequiredAction(user.id, "UPDATE_PASSWORD");
    }

    // 4. Genera e salva OTP nel database
    const otp = otpService.generateOTP();
    await otpService.saveOTPToDatabase(user.id, otp);

    // 5. Invia OTP via email
    await otpService.sendOTPEmail(email, otp);

    // Crea token con password CRIPTATA
    const tempSessionToken = createTempSessionToken(user.id, email, new_password);

    return res.json({
      status: "success",
      message: "Password updated successfully. OTP code sent via email",
      otpSent: true,
      tempSessionToken,
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/auth/logout
 * Effettua il logout
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    if (refresh_token) {
      try {
        // ✅ Chiama il servizio Keycloak
        logoutUser(refresh_token);
      } catch (keycloakError: any) {
        console.warn('⚠️ Keycloak logout warning:', keycloakError.response?.data);
        // Token già scaduto o non valido, ignora l'errore
      }
    }

    return res.json({
      status: 'success',
      message: 'Logout effettuato con successo',
      // ✅ URL per SSO logout completo (opzionale)
      sso_logout_url: getSSOLogoutUrl(),
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/auth/forgot-password
 * Invia email con link per reset password
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Trova utente in Keycloak
    const user = await getKeycloakUserByEmail(email);

    if (!user) {
      // Per sicurezza, restituisci sempre lo stesso messaggio
      return res.json({
        success: true,
        message: "If the email exists, you will receive instructions to reset",
      });
    }

    // Genera token di reset
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + 3600000); // 1 ora

    // Salva token nel database
    // Salva token nel database
    await pool.query(
      // 'INSERT INTO euonqol.password_reset_tokens (keycloak_user_id, token_hash, expires_at) VALUES ($1, $2, $3) ON CONFLICT (keycloak_user_id) DO UPDATE SET token_hash = $2, expires_at = $3',
      'INSERT INTO euonqol.password_reset_tokens (keycloak_user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetTokenHash, expiresAt]
    );

    // Link al frontend
    const resetLink = `${FRONTEND_URL}/reset-password-confirm?token=${resetToken}`;

    const emailType: EmailType = EmailType.FORGOT_PASSWORD;
    const payload: EmailPayloadMap[EmailType.FORGOT_PASSWORD] = { resetLink, expiryMinutes: 60 };
    await emailService.sendEmail(emailType, email, payload);

    return res.json({
      success: true,
      message: "If the email exists, you will receive instructions to reset",
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/auth/reset-password
 * Reset password con token
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, new_password, email } = req.body;

    if (!token || !new_password || !email) {
      return res.status(400).json({
        success: false,
        error: "Token, new password and email are required",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters long",
      });
    }

    // L'email si risolve in Keycloak invece che con una join su user_entity: quella
    // tabella sta in un altro schema, il cui nome e' configurabile, e questa era
    // l'unica query dell'applicazione che lo attraversava.
    const keycloakUser = await getKeycloakUserByEmail(email);

    const result = keycloakUser
      ? await pool.query(`
      SELECT prt.keycloak_user_id, prt.token_hash
      FROM euonqol.password_reset_tokens prt
      WHERE prt.keycloak_user_id = $1
      AND prt.expires_at > NOW()
      ORDER BY prt.created_at
      DESC LIMIT 1`,
          [keycloakUser.id]
        )
      : { rows: [] as { keycloak_user_id: string; token_hash: string }[] };

    // Stesso errore sia per email inesistente sia per token scaduto: distinguerli
    // direbbe a chi prova quali indirizzi sono registrati.
    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired token",
      });
    }

    const row = result.rows[0];

    // Verifica token
    const isValidToken = await bcrypt.compare(token, row.token_hash);

    if (!isValidToken) {
      return res.status(400).json({
        success: false,
        error: "Invalid token",
      });
    }

    // Aggiorna password in Keycloak
    await updateUserPassword(row.keycloak_user_id, new_password);

    // Elimina token usato
    await pool.query(
      'DELETE FROM euonqol.password_reset_tokens WHERE keycloak_user_id = $1',
      [row.keycloak_user_id]
    );

    // 1. ✅ Verifica credenziali SENZA creare sessione
    const credentialsCheck = await verifyUserCredentials(email, new_password);

    if (!credentialsCheck.valid) {
      return res.status(400).json({
        status: "error",
        message: credentialsCheck.error || "Invalid credentials",
      });
    }

    const user = credentialsCheck.user!;

    // Genera e salva OTP nel database
    const otp = otpService.generateOTP();
    await otpService.saveOTPToDatabase(row.keycloak_user_id, otp);

    // Invia OTP via email
    await otpService.sendOTPEmail(email, otp);

    // Crea token con password CRIPTATA
    const tempSessionToken = createTempSessionToken(user.id, email, new_password);

    return res.json({
      success: true,
      message: "Password updated successfully. OTP code sent via email",
      otpSent: true,
      tempSessionToken,
    });
  } catch (error: any) {
    return next(error);
  }
};

/**
 * POST /euonqol-api/auth/validate-session
 */
export const validateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        valid: false,
        message: 'Token missing',
      });
    }

    const accessToken = authHeader.split(' ')[1];

    // ✅ Chiama il servizio Keycloak per introspection
    const introspectionData = await introspectToken(accessToken);

    if (!introspectionData.active) {
      return res.status(401).json({
        status: 'error',
        valid: false,
        message: 'Session expired or invalid',
      });
    }

    return res.json({
      status: 'success',
      valid: true,
      user: {
        sub: introspectionData.sub,
        username: introspectionData.username,
        email: introspectionData.email,
      },
    });
  } catch (error: any) {
    return next(error);
  }
};
