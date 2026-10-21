import { emailLayout } from './layout.js';

/**
 * Template email for sending a questionnaire assignment link to a patient.
 * @param surveyName - Name of the survey
 * @param questionnaireName - Title of the questionnaire
 * @param surveyUrl - Full URL to the patient's unique questionnaire link
 * @param qrCid - CID reference for the embedded QR code image (e.g. "qrcode@euonqol")
 * @returns Full HTML string ready to be sent as an email body
 */
export const assignmentLinkEmail = (
  surveyName: string,
  questionnaireName: string,
  surveyUrl: string,
  qrCid: string
): string => {
  const content = `
        <div class="container">
          <div class="content">
            <h2>You have a new questionnaire to complete</h2>

            <p>You have been assigned a questionnaire as part of the following survey:</p>

            <table style="margin: 20px auto; text-align: left; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Survey</td>
                <td style="padding: 6px 0; font-weight: bold;">${surveyName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Questionnaire</td>
                <td style="padding: 6px 0; font-weight: bold;">${questionnaireName}</td>
              </tr>
            </table>

            <p>Click the button below to open your questionnaire:</p>

            <a href="${surveyUrl}" class="survey-link">Fill in the questionnaire</a>

            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 28px 0;" />

            <p style="color: #666; font-size: 14px;">Or scan this QR code with your mobile device:</p>

            <div class="qr-block">
              <img src="cid:${qrCid}" alt="QR Code for questionnaire" />
            </div>

            <div class="footer">
              <p>This link is unique to you. Please do not share it with others.</p>
              <p>If you have any questions, please contact the study coordinator.</p>
            </div>
          </div>
        </div>
    `;
  return emailLayout(content);
};
