import { escapeHtml } from '../../helpers/escapeHtml.js';
import { emailLayout } from './layout.js';

/**
 * Template email for notifying a manager that their access to a survey has been revoked.
 * @param surveyName - Name of the survey
 * @param removedByName - Display name of the user who revoked the access
 * @returns Full HTML string ready to be sent as an email body
 */
export const surveyManagerRemovedEmail = (surveyName: string, removedByName: string): string => {
  const content = `
        <div class="container">
          <div class="content">
            <h2 style="color: #dc2626; margin-top: 0;">Your access to a survey was removed</h2>

            <p>You no longer have access to the following survey:</p>

            <table style="margin: 20px auto; text-align: left; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Survey</td>
                <td style="padding: 6px 0; font-weight: bold;">${escapeHtml(surveyName)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Removed by</td>
                <td style="padding: 6px 0; font-weight: bold;">${escapeHtml(removedByName)}</td>
              </tr>
            </table>

            <div class="footer">
              <p>If you think this is a mistake, please contact the survey owner.</p>
            </div>
          </div>
        </div>
    `;
  return emailLayout(content);
};
