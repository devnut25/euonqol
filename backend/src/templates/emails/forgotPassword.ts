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
                <h2 style="color: #007bff; margin-top: 0;">🔐 Password Reset</h2>
                <p>You have requested a password reset.</p>
                <p>Click the button below to proceed:</p>
                
                <div style="text-align: center;">
                  <a href="${resetLink}" class="button">Reset Password</a>
                </div>
                
                <div class="footer">
                  <p><strong>⏰ This link will expire in ${expiryMinutes} minutes.</strong></p>
                  <p>If you did not request the reset, ignore this email.</p>
                </div>
              </div>
            </div>
      `;
      return emailLayout(content)
}