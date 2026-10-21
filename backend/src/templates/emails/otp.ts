import { emailLayout } from "./layout";

/*
Template email per l'invio del codice OTP.
@param otp - Il codice OTP da inviare
@param expiryMinutes - Minuti prima che il codice scada
@return HTML completo dell'email OTP
*/
export const otpEmail = (otp: string, expiryMinutes: number = 10): string => {
  const content = `
        <div class="container">
        <div class="content">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #9ca3af;">EUonQoL</p>
          <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #111827;">Verification code</h1>
          <p style="margin: 0 0 24px; font-size: 15px; color: #4b5563;">Enter this code to finish signing in. It expires in ${expiryMinutes} minutes.</p>

          <div class="otp-code">${otp}</div>

          <div class="footer">
            <p>If you didn't request this code, you can safely ignore this email.</p>
          </div>
        </div>
        </div>
    `;
  return emailLayout(content);
}