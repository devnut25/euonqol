/*
Layout template per le email
@param content - Il contenuto HTML specifico dell'email
@return HTML completo dell'email con layout applicato
*/
export const emailLayout = (content: string) => {
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #1f2937;
              background-color: #f3f4f6;
            }
            .container {
              max-width: 480px;
              margin: 0 auto;
              padding: 32px 16px;
            }
            .content {
              background-color: #ffffff;
              padding: 40px 36px;
              border-radius: 12px;
              border: 1px solid #e5e7eb;
              text-align: center;
            }
            .otp-code {
              font-size: 32px;
              font-weight: 600;
              color: #111827;
              letter-spacing: 8px;
              padding: 18px;
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 10px;
              margin: 24px 0;
              font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
            }
            .survey-link {
              display: inline-block;
              margin: 20px 0;
              padding: 12px 28px;
              background-color: #007bff;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
              font-size: 16px;
            }
            .qr-block {
              margin: 24px auto;
              padding: 16px;
              background-color: #f9f9f9;
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              display: inline-block;
            }
            .qr-block img {
              width: 180px;
              height: 180px;
              display: block;
            }
            .footer {
              margin-top: 28px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 13px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `;
};
