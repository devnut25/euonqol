import { emailLayout } from './layout.js';

/**
 * Template email for notifying a survey's creator and collaborators that it's about to close.
 * @param surveyName - Name of the survey
 * @param endDate - The survey's end date, already formatted for display
 * @param daysRemaining - Number of days left until the survey closes
 * @returns Full HTML string ready to be sent as an email body
 */
export const surveyEndReminderEmail = (
  surveyName: string,
  endDate: string,
  daysRemaining: number
): string => {
  const content = `
        <div class="container">
          <div class="content">
            <h2 style="color: #d97706; margin-top: 0;">⏰ Survey closing soon</h2>

            <p>The survey is scheduled to close in ${daysRemaining} days:</p>

            <table style="margin: 20px auto; text-align: left; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">Survey</td>
                <td style="padding: 6px 0; font-weight: bold;">${surveyName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 16px 6px 0; color: #666; font-size: 14px;">End date</td>
                <td style="padding: 6px 0; font-weight: bold;">${endDate}</td>
              </tr>
            </table>

            <div class="footer">
              <p>Review pending assignments and completion rates before it closes.</p>
            </div>
          </div>
        </div>
    `;
  return emailLayout(content);
};
