import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'react-i18next';

// Sample data used only for the in-app preview — real placeholder substitution
// happens server-side in backend/src/services/email/email.ts (sendCustomAssignmentEmail),
// which this mirrors exactly so the preview matches the real email.
const SAMPLE_SURVEY_NAME = 'Sample Survey';
const SAMPLE_QUESTIONNAIRE_NAME = 'Sample Questionnaire';
const SAMPLE_SURVEY_URL = 'https://euonqol.example.com/q/demo-link';

function buildPreviewHtml(subject: string, body: string) {
  const linkButton = `<a href="${SAMPLE_SURVEY_URL}" style="display:inline-block;padding:12px 28px;background-color:#0056b3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Link</a>`;
  const qrSvg = renderToStaticMarkup(<QRCodeSVG value={SAMPLE_SURVEY_URL} size={180} />);
  const qrBlock = `<div style="padding:16px;background-color:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;display:inline-block;">${qrSvg}</div>`;

  const substitute = (input: string) =>
    input
      .replaceAll('{{survey_name}}', SAMPLE_SURVEY_NAME)
      .replaceAll('{{questionnaire_name}}', SAMPLE_QUESTIONNAIRE_NAME)
      .replaceAll('{{link}}', linkButton)
      .replaceAll('{{qr_code}}', qrBlock);

  return { subject: substitute(subject), bodyHtml: substitute(body) };
}

interface EmailTemplatePreviewProps {
  subject: string;
  body: string;
}

export function EmailTemplatePreview({ subject, body }: EmailTemplatePreviewProps) {
  const { t } = useTranslation(['emailTemplates']);
  const { subject: resolvedSubject, bodyHtml } = buildPreviewHtml(subject ?? '', body ?? '');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t('preview.notice')}</p>
      <div className="rounded-lg p-5">
        <div className="mx-auto max-w-[600px] rounded-lg bg-white p-6 text-center shadow-sm">
          <p className="mb-4 border-b border-gray-200 pb-3 text-sm font-semibold text-gray-800">
            {resolvedSubject || t('preview.no_subject')}
          </p>
          <div
            className="prose-content text-left"
            dangerouslySetInnerHTML={{ __html: bodyHtml || `<p>${t('preview.no_body')}</p>` }}
          />
        </div>
      </div>
    </div>
  );
}
