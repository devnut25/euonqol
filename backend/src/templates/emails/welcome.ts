import { emailLayout } from "./layout";

/**
  Template mail di benvenuto con credenziali temporanee.
  @param email - L'email dell'utente
  @param password - La password temporanea generata
  @param platformUrl - L'URL della piattaforma
  @return HTML completo dell'email di benvenuto
*/
export const welcomeEmail = (email: string, password: string, platformUrl: string): string => {
    const content = `
        <div class="container">
          <div class="content">
            <div class="header">
              <h2>🎉 Welcome to the Platform</h2>
            </div>
            
            <p>Your account has been successfully created. Here are your credentials to access the platform:</p>
            
            <div class="credentials-box">
              <div class="credential-item">
                <span class="credential-label">📧 Email:</span>
                <div class="credential-value">${email}</div>
              </div>
              
              <div class="credential-item">
                <span class="credential-label">🔑 Temporary Password:</span>
                <div class="credential-value">${password}</div>
              </div>
            </div>
            
            <div class="warning-box">
              <strong>⚠️ Important:</strong> This is a temporary password. You will be required to change it on your first login to ensure your account security.
            </div>
            
            <div class="access-box">
              <p><strong>🌐 Access the platform:</strong></p>
              <a href="${platformUrl}" class="platform-link">${platformUrl}</a>
            </div>
            
            <div class="footer">
              <p>If you did not request the creation of this account, please contact the system administrator.</p>
            </div>
          </div>
        </div>
        `;
  return emailLayout(content);
}