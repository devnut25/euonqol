import { escapeHtml } from '../../helpers/escapeHtml.js';
import { emailLayout } from './layout.js';

/**
 * Template email for notifying a manager that a survey has been shared with them.
 * @param surveyName - Name of the shared survey
 * @param inviterName - Display name of the user who shared the survey
 * @param accessType - Granted access level ('edit' | 'view')
 * @param surveyUrl - Link to the survey page on the platform
 * @returns Full HTML string ready to be sent as an email body
 */
export const surveyManagerInvitedEmail = (
  surveyName: string,
  inviterName: string,
  accessType: string,
  surveyUrl: string
): string => {
  const accessLabel = accessType === 'view' ? 'View only' : 'Edit';
  const content = `
        <div class="container">
          <div class="content">
            <h2 style="color: #007bff; margin-top: 0;">You've been added to a survey</h2>

            <p>${escapeHtml(inviterName)} shared a survey with you:</p>

            <table style="margin: 20px auto; text-align: left; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Survey</td>
                <td style="padding: 6px 0; font-weight: bold;">${escapeHtml(surveyName)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Shared by</td>
                <td style="padding: 6px 0; font-weight: bold;">${escapeHtml(inviterName)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Access</td>
                <td style="padding: 6px 0; font-weight: bold;">${accessLabel}</td>
              </tr>
            </table>

            <a href="${surveyUrl}" class="survey-link">Open survey</a>

            <div class="footer">
              <p>You received this email because a survey was shared with you on EUonQoL Survey Hub.</p>
            </div>
          </div>
        </div>
    `;
  return emailLayout(content);
};
