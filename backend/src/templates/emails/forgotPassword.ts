import { emailLayout } from "./layout";

/**
  Template email per il reset della password.
  @param resetLink - Il link per resettare la password
  @param expiryMinutes - Minuti prima che il link scada
  @return HTML completo dell'email di reset della password
*/
export const forgotPasswordEmail = (resetLink: string, expiryMinutes: number = 60): string => {
    const content = `
        <div class="container">
        <div class="content">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #9ca3af;">EUonQoL</p>
          <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #111827;">Reset your password</h1>
          <p style="margin: 0 0 24px; font-size: 15px; color: #4b5563;">Click the button below to choose a new password. The link expires in ${expiryMinutes} minutes.</p>

          <a href="${resetLink}" style="display: inline-block; margin: 0 0 24px; padding: 12px 28px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Reset password</a>

          <p style="margin: 0; font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin: 4px 0 0; font-size: 13px; word-break: break-all;"><a href="${resetLink}" style="color: #4b5563;">${resetLink}</a></p>

          <div class="footer">
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </div>
        </div>
    `;
  return emailLayout(content);
}