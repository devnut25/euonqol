import { EmailPayloadMap, emailService, EmailType } from "../services/email/index.js";
import bcrypt from "bcrypt";
import { Pool } from "pg";

class Otp {
  private static EXPIRY_MINUTES = 10;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Genera un OTP casuale
   * @returns {string} Codice OTP a 6 cifre
   */
  public generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Verifica se esiste un OTP creato nell'ultimo minuto
   */
  public async hasRecentOTP(keycloakUserId: string): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const result = await this.pool.query(
      `SELECT COUNT(*) as count 
     FROM euonqol.user_otp 
     WHERE keycloak_user_id = $1 
     AND created_at > $2`,
      [keycloakUserId, oneMinuteAgo]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Conta quanti OTP sono stati creati in una finestra temporale (in minuti)
   */
  public async getOTPCountInTimeWindow(
    keycloakUserId: string,
    minutes: number
  ): Promise<number> {
    const timeWindow = new Date(Date.now() - minutes * 60 * 1000);

    const result = await this.pool.query(
      `SELECT COUNT(*) as count 
     FROM euonqol.user_otp 
     WHERE keycloak_user_id = $1 
     AND created_at > $2`,
      [keycloakUserId, timeWindow]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Salva OTP nel database con hash bcrypt
   */
  public async saveOTPToDatabase(
    keycloakUserId: string,
    otp: string
  ): Promise<void> {
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + Otp.EXPIRY_MINUTES * 60 * 1000);

    // Invalida eventuali OTP precedenti non usati per questo utente
    await this.pool.query(
      "UPDATE euonqol.user_otp SET used = TRUE WHERE keycloak_user_id = $1 AND used = FALSE",
      [keycloakUserId]
    );

    // Salva nuovo OTP
    await this.pool.query(
      "INSERT INTO euonqol.user_otp (keycloak_user_id, otp_hash, expires_at) VALUES ($1, $2, $3)",
      [keycloakUserId, otpHash, expiresAt]
    );
  }

  /**
   * Verifica OTP dal database
   */
  public async verifyOTPFromDatabase(
    keycloakUserId: string,
    otp: string
  ): Promise<{ valid: boolean; error?: string }> {
    // Recupera OTP validi non usati per questo utente
    const result = await this.pool.query(
      `SELECT id, otp_hash, expires_at 
      FROM euonqol.user_otp 
      WHERE keycloak_user_id = $1 
      AND used = FALSE 
      AND expires_at > NOW()
      ORDER BY created_at DESC 
      LIMIT 1`,
      [keycloakUserId]
    );

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: "OTP not found, expired or already used",
      };
    }

    const otpRecord = result.rows[0];

    // Verifica OTP con bcrypt
    const isValid = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!isValid) {
      return {
        valid: false,
        error: "OTP invalid",
      };
    }

    // Marca OTP come usato
    await this.pool.query(
      "UPDATE euonqol.user_otp SET used = TRUE WHERE id = $1",
      [otpRecord.id]
    );

    return { valid: true };
  }

  /**
   * Invia OTP via email
   */
  public async sendOTPEmail(email: string, otp: string): Promise<void> {
    const emailType: EmailType = EmailType.OTP;
    const payload: EmailPayloadMap[EmailType.OTP] = { otp, expiryMinutes: Otp.EXPIRY_MINUTES };
    await emailService.sendEmail(emailType, email, payload);
  }
  /**
   * Elimina tutti gli OTP di un utente (dopo login riuscito)
   */
  public async deleteUserOTPs(keycloakUserId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM euonqol.user_otp WHERE keycloak_user_id = $1',
      [keycloakUserId]
    );
  }
}

export default Otp;
