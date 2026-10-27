import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { Resend } from 'resend';
import { AppSettingsDefaults, AppSettingsKeys, AppSettingsService } from '../AppSettingsService.js';
import { assignmentLinkEmail } from '../../templates/emails/assignmentLink.js';
import { forgotPasswordEmail } from '../../templates/emails/forgotPassword.js';
import { escapeHtml } from '../../helpers/escapeHtml.js';
import { emailLayout } from '../../templates/emails/layout.js';
import { otpEmail } from '../../templates/emails/otp.js';
import { surveyEndReminderEmail } from '../../templates/emails/surveyEndReminder.js';
import { surveyManagerInvitedEmail } from '../../templates/emails/surveyManagerInvited.js';
import { surveyManagerRemovedEmail } from '../../templates/emails/surveyManagerRemoved.js';
import { welcomeEmail } from '../../templates/emails/welcome.js';

export interface ResolvedEmailConfig {
  provider: string;
  from: string;
  resendApiKey?: string;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
}

/**
 * Resolves the current outgoing-email config from `app_settings` (admin-editable
 * at runtime via the Settings page). The env only seeds the table on the first
 * boot, see AppSettingsService.initialiseFromEnv.
 */
export async function resolveEmailConfig(): Promise<ResolvedEmailConfig> {
  const settings = await AppSettingsService.getMany([
    AppSettingsKeys.EMAIL_PROVIDER,
    AppSettingsKeys.EMAIL_FROM,
    AppSettingsKeys.EMAIL_RESEND_API_KEY,
    AppSettingsKeys.EMAIL_HOST,
    AppSettingsKeys.EMAIL_PORT,
    AppSettingsKeys.EMAIL_SECURE,
    AppSettingsKeys.EMAIL_USER,
    AppSettingsKeys.EMAIL_PASSWORD,
  ]);

  return {
    provider: settings[AppSettingsKeys.EMAIL_PROVIDER] || AppSettingsDefaults[AppSettingsKeys.EMAIL_PROVIDER],
    from: settings[AppSettingsKeys.EMAIL_FROM] || AppSettingsDefaults[AppSettingsKeys.EMAIL_FROM],
    resendApiKey: settings[AppSettingsKeys.EMAIL_RESEND_API_KEY] || undefined,
    host: settings[AppSettingsKeys.EMAIL_HOST] || AppSettingsDefaults[AppSettingsKeys.EMAIL_HOST],
    port: parseInt(
      settings[AppSettingsKeys.EMAIL_PORT] || AppSettingsDefaults[AppSettingsKeys.EMAIL_PORT],
      10
    ),
    secure:
      (settings[AppSettingsKeys.EMAIL_SECURE] ?? AppSettingsDefaults[AppSettingsKeys.EMAIL_SECURE]) === 'true',
    user: settings[AppSettingsKeys.EMAIL_USER] || undefined,
    password: settings[AppSettingsKeys.EMAIL_PASSWORD] || undefined,
  };
}

/*
Interfaccia comune per i provider di email
*/
interface EmailProvider {
  /*
    Metodo per l'invio di email
    @param options - Opzioni per l'invio dell'email
    @returns Promessa risolta quando l'email è stata inviata
    */
  send(options: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    attachments?: Array<{ filename: string; content: Buffer; cid: string }>;
  }): Promise<void>;
}

/*
Tipi di email supportati
*/
enum EmailType {
  WELCOME = 'WELCOME',
  OTP = 'OTP',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  ASSIGNMENT_LINK = 'ASSIGNMENT_LINK',
  SURVEY_END_REMINDER = 'SURVEY_END_REMINDER',
  SURVEY_MANAGER_INVITED = 'SURVEY_MANAGER_INVITED',
  SURVEY_MANAGER_REMOVED = 'SURVEY_MANAGER_REMOVED',
}

/*
Payload specifici per ogni tipo di email
*/
type EmailPayloadMap = {
  [EmailType.WELCOME]: { tempPassword: string };
  [EmailType.OTP]: { otp: string; expiryMinutes?: number };
  [EmailType.FORGOT_PASSWORD]: { resetLink: string; expiryMinutes?: number };
  [EmailType.ASSIGNMENT_LINK]: { surveyName: string; questionnaireName: string; surveyUrl: string };
  [EmailType.SURVEY_END_REMINDER]: { surveyName: string; endDate: string; daysRemaining: number };
  [EmailType.SURVEY_MANAGER_INVITED]: {
    surveyId: number;
    surveyName: string;
    inviterName: string;
    accessType: string;
  };
  [EmailType.SURVEY_MANAGER_REMOVED]: { surveyName: string; removedByName: string };
};

/*
Classe per l'invio di email tramite Resend
*/
class ResendProvider implements EmailProvider {
  private resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  /*
    Metodo per l'invio di email
    @param options - Opzioni per l'invio dell'email
    @returns Promessa risolta quando l'email è stata inviata
    */
  async send({
    to,
    subject,
    html,
    from,
    attachments,
  }: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    attachments?: Array<{ filename: string; content: Buffer; cid: string }>;
  }): Promise<void> {
    await this.resend.emails.send({
      from: from || 'EUonQoL <onboarding@resend.dev>',
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      })),
    });
  }
}

/*
Classe per l'invio di email tramite SMTP usando Nodemailer
*/
class SMTPProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor(transporter: nodemailer.Transporter) {
    this.transporter = transporter;
  }
  async send({
    to,
    subject,
    html,
    from,
    attachments,
  }: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    attachments?: Array<{ filename: string; content: Buffer; cid: string }>;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: from || 'info@example.com',
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        cid: a.cid,
      })),
    });
  }
}

/*
Classe principale per la gestione delle email
*/
class EmailService {
  /**
   * Resolves the provider+from to use for the next send, rebuilding only when the
   * config actually changed (e.g. an admin just saved new SMTP settings) — see
   * {@link createEmailProvider}.
   */
  private async getContext(): Promise<{ provider: EmailProvider; from: string }> {
    const config = await resolveEmailConfig();
    return { provider: await createEmailProvider(config), from: config.from };
  }

  /**
   * Invia email di benvenuto con credenziali temporanee
   * @param to - Destinatario dell'email
   * @param tempPassword - Password temporanea generata
   * @param platformUrl - URL della piattaforma
   * @returns Promessa risolta quando l'email è stata inviata
   */
  private async sendWelcomeEmail(
    to: string,
    tempPassword: string,
    platformUrl: string
  ): Promise<void> {
    const html = welcomeEmail(to, tempPassword, platformUrl);
    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: 'Welcome to EuonQoL Survey Hub', html, from });
  }

  /*
    Invia email OTP
    @param to - Destinatario dell'email
    @param otp - Codice OTP da inviare
    @param expiryMinutes - Minuti prima che il codice scada
    @returns Promessa risolta quando l'email è stata inviata
    */
  private async sendOtpEmail(to: string, otp: string, expiryMinutes: number = 10): Promise<void> {
    const html = otpEmail(otp, expiryMinutes);
    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: 'Your OTP Code', html, from });
  }

  /*
    Invia email per il reset della password
    @param to - Destinatario dell'email
    @param resetLink - Link per resettare la password
    @param expiryMinutes - Minuti prima che il link scada
    @returns Promessa risolta quando l'email è stata inviata
    */
  private async sendForgotPasswordEmail(
    to: string,
    resetLink: string,
    expiryMinutes: number = 60
  ): Promise<void> {
    const html = forgotPasswordEmail(resetLink, expiryMinutes);
    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: 'Reset Your Password', html, from });
  }

  private async sendAssignmentLinkEmail(
    to: string,
    surveyName: string,
    questionnaireName: string,
    surveyUrl: string
  ): Promise<void> {
    const QR_CID = 'qrcode@euonqol';
    const qrBuffer = await QRCode.toBuffer(surveyUrl, { width: 300, margin: 2 });
    const html = assignmentLinkEmail(surveyName, questionnaireName, surveyUrl, QR_CID);
    const { provider, from } = await this.getContext();
    await provider.send({
      to,
      subject: `Questionnaire assigned: ${questionnaireName}`,
      html,
      from,
      attachments: [{ filename: 'qrcode.png', content: qrBuffer, cid: QR_CID }],
    });
  }

  /**
   * Notifies the survey creator or a collaborator that the survey is about to close.
   * @param to - Recipient's email address
   * @param surveyName - Name of the survey
   * @param endDate - The survey's end date, already formatted for display
   * @param daysRemaining - Number of days left until the survey closes
   */
  private async sendSurveyEndReminderEmail(
    to: string,
    surveyName: string,
    endDate: string,
    daysRemaining: number
  ): Promise<void> {
    const html = surveyEndReminderEmail(surveyName, endDate, daysRemaining);
    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: `"${surveyName}" is closing in ${daysRemaining} days`, html, from });
  }

  /**
   * Notifies a manager that a survey has been shared with them.
   * @param to - Recipient's email address
   * @param surveyId - ID of the shared survey, used to build the link to its page
   * @param surveyName - Name of the survey
   * @param inviterName - Display name of the user who shared the survey
   * @param accessType - Granted access level ('edit' | 'view')
   */
  private async sendSurveyManagerInvitedEmail(
    to: string,
    surveyId: number,
    surveyName: string,
    inviterName: string,
    accessType: string
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const surveyUrl = `${frontendUrl}/survey?surveys_id=${surveyId}`;
    const html = surveyManagerInvitedEmail(surveyName, inviterName, accessType, surveyUrl);
    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: `You've been invited to "${surveyName}"`, html, from });
  }

  /**
   * Notifies a manager that their access to a survey has been revoked.
   * @param to - Recipient's email address
   * @param surveyName - Name of the survey
   * @param removedByName - Display name of the user who revoked the access
   */
  private async sendSurveyManagerRemovedEmail(
    to: string,
    surveyName: string,
    removedByName: string
  ): Promise<void> {
    const html = surveyManagerRemovedEmail(surveyName, removedByName);
    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: `Your access to "${surveyName}" was removed`, html, from });
  }

  /*
    Invia email basata su template
    @param type - Tipo di email da inviare
    @param to - Destinatario dell'email
    @param payload - Dati necessari per il template dell'email
    @returns Promessa risolta quando l'email è stata inviata
    */
  public async sendEmail<T extends EmailType>(
    type: T,
    to: string,
    payload: EmailPayloadMap[T]
  ): Promise<void> {
    console.log(`Sending email of type ${type} to ${to}`);
    switch (type) {
      case EmailType.WELCOME:
        const welcomePayload = payload as EmailPayloadMap[EmailType.WELCOME];
        const platformUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return this.sendWelcomeEmail(to, welcomePayload.tempPassword, platformUrl);
      case EmailType.OTP:
        const otpPayload = payload as EmailPayloadMap[EmailType.OTP];
        return this.sendOtpEmail(to, otpPayload.otp, otpPayload.expiryMinutes);
      case EmailType.FORGOT_PASSWORD:
        const forgotPasswordPayload = payload as EmailPayloadMap[EmailType.FORGOT_PASSWORD];
        return this.sendForgotPasswordEmail(
          to,
          forgotPasswordPayload.resetLink,
          forgotPasswordPayload.expiryMinutes
        );
      case EmailType.ASSIGNMENT_LINK:
        const assignmentPayload = payload as EmailPayloadMap[EmailType.ASSIGNMENT_LINK];
        return this.sendAssignmentLinkEmail(
          to,
          assignmentPayload.surveyName,
          assignmentPayload.questionnaireName,
          assignmentPayload.surveyUrl
        );
      case EmailType.SURVEY_END_REMINDER:
        const surveyEndReminderPayload = payload as EmailPayloadMap[EmailType.SURVEY_END_REMINDER];
        return this.sendSurveyEndReminderEmail(
          to,
          surveyEndReminderPayload.surveyName,
          surveyEndReminderPayload.endDate,
          surveyEndReminderPayload.daysRemaining
        );
      case EmailType.SURVEY_MANAGER_INVITED:
        const invitedPayload = payload as EmailPayloadMap[EmailType.SURVEY_MANAGER_INVITED];
        return this.sendSurveyManagerInvitedEmail(
          to,
          invitedPayload.surveyId,
          invitedPayload.surveyName,
          invitedPayload.inviterName,
          invitedPayload.accessType
        );
      case EmailType.SURVEY_MANAGER_REMOVED:
        const removedPayload = payload as EmailPayloadMap[EmailType.SURVEY_MANAGER_REMOVED];
        return this.sendSurveyManagerRemovedEmail(
          to,
          removedPayload.surveyName,
          removedPayload.removedByName
        );
    }
  }

  /**
   * Send a custom assignment email built from a DB template.
   * Placeholders supported in htmlBody: {{survey_name}}, {{questionnaire_name}},
   * {{link}} (renders as a styled button), {{qr_code}} (renders embedded QR image).
   * The QR code attachment is generated automatically when {{qr_code}} is present.
   */
  public async sendCustomAssignmentEmail(
    to: string,
    subject: string,
    templateBody: string,
    surveyName: string,
    questionnaireName: string,
    surveyUrl: string
  ): Promise<void> {
    const QR_CID = 'qrcode@euonqol';
    const hasQr = templateBody.includes('{{qr_code}}');

    const linkButton = `<a href="${surveyUrl}" class="survey-link" style="display:inline-block;margin:20px 0;padding:12px 28px;background-color:#0056b3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Link</a>`;
    const qrBlock = `<div class="qr-block" style="margin:24px auto;padding:16px;background-color:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;display:inline-block;"><img src="cid:${QR_CID}" alt="QR Code for questionnaire" /></div>`;

    const resolvedSubject = subject
      .replace(/\{\{survey_name\}\}/g, surveyName)
      .replace(/\{\{questionnaire_name\}\}/g, questionnaireName);

    let body = templateBody
      .replace(/\{\{survey_name\}\}/g, escapeHtml(surveyName))
      .replace(/\{\{questionnaire_name\}\}/g, escapeHtml(questionnaireName))
      .replace(/\{\{link\}\}/g, linkButton)
      .replace(/\{\{qr_code\}\}/g, qrBlock)
      .replace(/\n/g, '<br>');

    const html = emailLayout(`<div class="container"><div class="content">${body}</div></div>`);

    const attachments: Array<{ filename: string; content: Buffer; cid: string }> = [];
    if (hasQr) {
      const qrBuffer = await QRCode.toBuffer(surveyUrl, { width: 300, margin: 2 });
      attachments.push({ filename: 'qrcode.png', content: qrBuffer, cid: QR_CID });
    }

    const { provider, from } = await this.getContext();
    await provider.send({ to, subject: resolvedSubject, html, from, attachments });
  }
}

function buildEmailProvider(config: ResolvedEmailConfig): EmailProvider {
  switch (config.provider) {
    case 'resend':
      return new ResendProvider(config.resendApiKey || 'your-resend-api-key');

    case 'mailpit':
    case 'smtp': {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
      });
      return new SMTPProvider(transporter);
    }
    default:
      throw new Error(`Unsupported email provider: ${config.provider}`);
  }
}

let cachedProvider: { provider: EmailProvider; signature: string } | null = null;

/**
 * Builds (or reuses, if the config hasn't changed since last call) the email provider
 * for the given config. Called with an explicit config (e.g. by the admin "Send test
 * email" action, to try out settings before saving) or with the currently resolved one.
 */
async function createEmailProvider(config?: ResolvedEmailConfig): Promise<EmailProvider> {
  const resolved = config ?? (await resolveEmailConfig());
  const signature = JSON.stringify(resolved);

  if (!cachedProvider || cachedProvider.signature !== signature) {
    console.log(`Creating email provider ${resolved.provider}`);
    cachedProvider = { provider: buildEmailProvider(resolved), signature };
  }

  return cachedProvider.provider;
}

export { createEmailProvider, EmailProvider, EmailService, EmailType };
export type { EmailPayloadMap };
