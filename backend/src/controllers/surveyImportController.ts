import { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { PrismaClient } from '../generated/app';
import { ServiceError } from '../helpers/ServiceError.js';
import { PrivacyPolicyService } from '../services/PrivacyPolicyService.js';
import { SurveyClosingMessageService } from '../services/SurveyClosingMessageService.js';
import { SurveyEligibilityService } from '../services/SurveyEligibilityService.js';
import { SurveyPresentationService } from '../services/SurveyPresentationService.js';
import { SurveyPrivacyPolicyService } from '../services/SurveyPrivacyPolicyService.js';
import { SurveyStudyInfoSheetService } from '../services/SurveyStudyInfoSheetService.js';
import { upsertClosingMessageSchema } from '../validators/schemas/surveyClosingMessage.js';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../data/templates');

type ImportResult = {
  row: number;
  label: string;
  status: 'imported' | 'skipped';
  reason?: string;
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function findLanguage(name: string) {
  return prisma.eu_countries.findFirst({
    where: { language: { equals: String(name).trim(), mode: 'insensitive' } },
  });
}

function parseBase64Workbook(fileContent: string): XLSX.WorkBook {
  const buf = Buffer.from(fileContent, 'base64');
  return XLSX.read(buf, { type: 'buffer' });
}

// ─── Template: Presentations ─────────────────────────────────────────────────

export function downloadPresentationsTemplate(_req: Request, res: Response, next: NextFunction) {
  const filePath = path.join(TEMPLATES_DIR, 'Presentations_Template.xlsx');
  return res.download(filePath, 'presentations_template.xlsx', (err) => {
    if (err) {
      console.error('Error sending presentations template:', err);
      next(err);
    }
  });
}

// ─── Template: Eligibility Questions ─────────────────────────────────────────

export function downloadEligibilityTemplate(_req: Request, res: Response, next: NextFunction) {
  const filePath = path.join(TEMPLATES_DIR, 'Eligibility_Template.xlsx');
  return res.download(filePath, 'eligibility_template.xlsx', (err) => {
    if (err) {
      console.error('Error sending eligibility template:', err);
      next(err);
    }
  });
}

// ─── Template: Privacy Policies ──────────────────────────────────────────────

export function downloadPrivacyPoliciesTemplate(_req: Request, res: Response, next: NextFunction) {
  const filePath = path.join(TEMPLATES_DIR, 'PrivacyPolicies_Template.xlsx');
  return res.download(filePath, 'privacy_policies_template.xlsx', (err) => {
    if (err) {
      console.error('Error sending privacy policies template:', err);
      next(err);
    }
  });
}

// ─── Template: Study Info Sheet ──────────────────────────────────────────────

export function downloadStudyInfoSheetTemplate(_req: Request, res: Response, next: NextFunction) {
  const filePath = path.join(TEMPLATES_DIR, 'Info_&_Consent_Template.xlsx');
  return res.download(filePath, 'info_consent_template.xlsx', (err) => {
    if (err) {
      console.error('Error sending study info sheet template:', err);
      next(err);
    }
  });
}

// ─── Template: Closing Messages ──────────────────────────────────────────────

export function downloadClosingMessagesTemplate(_req: Request, res: Response, next: NextFunction) {
  const filePath = path.join(TEMPLATES_DIR, 'ClosingMessages_Template.xlsx');
  return res.download(filePath, 'closing_messages_template.xlsx', (err) => {
    if (err) {
      console.error('Error sending closing messages template:', err);
      next(err);
    }
  });
}

// ─── Import: Presentations ───────────────────────────────────────────────────

export async function importPresentations(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(String(req.params.id), 10);
    if (isNaN(surveyId)) return res.status(400).json({ error: 'Invalid survey ID' });

    const { fileContent } = req.body;
    if (!fileContent) return res.status(400).json({ error: 'fileContent is required' });

    let wb: XLSX.WorkBook;
    try {
      wb = parseBase64Workbook(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid or corrupted Excel file' });
    }

    const sheet = wb.Sheets['Presentations'];
    if (!sheet) {
      return res.status(400).json({ error: 'Excel file must contain a "Presentations" sheet' });
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as Array<{
      language: string;
      title?: string;
      content: string;
      is_fallback?: string;
    }>;

    if (!rows.length) {
      return res.status(400).json({ error: 'The "Presentations" sheet is empty' });
    }

    const results: ImportResult[] = [];

    // Upsert per language via the same service the single-record form uses: a
    // language already present for this survey gets updated in place (new version,
    // old one marked not-current); a new language is added. Languages not
    // mentioned in this file are never touched — no wholesale delete/deactivate.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based + header

      if (!row.language || !row.content) {
        results.push({
          row: rowNum,
          label: String(row.language ?? '—'),
          status: 'skipped',
          reason: 'Missing language or content',
        });
        continue;
      }

      const lang = await findLanguage(row.language);
      if (!lang) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: 'Language not found in system',
        });
        continue;
      }

      const fallbackCell = String(row.is_fallback ?? '')
        .trim()
        .toLowerCase();

      try {
        await SurveyPresentationService.upsertPresentation(surveyId, {
          language_id: lang.id,
          title: row.title ? String(row.title).trim() : undefined,
          content: String(row.content).trim(),
          // Blank cell → preserve whatever this language already was (or default
          // to non-fallback for a brand new one); only "yes"/"no" explicitly sets it.
          is_fallback: fallbackCell === '' ? undefined : fallbackCell === 'yes',
        });
        results.push({ row: rowNum, label: String(row.language), status: 'imported' });
      } catch (err) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: err instanceof ServiceError ? err.message : 'Failed to import row',
        });
      }
    }

    const importedCount = results.filter((r) => r.status === 'imported').length;
    return res.json({
      success: true,
      imported: importedCount,
      skipped: results.length - importedCount,
      results,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Import: Closing Messages ─────────────────────────────────────────────────

export async function importClosingMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(String(req.params.id), 10);
    if (isNaN(surveyId)) return res.status(400).json({ error: 'Invalid survey ID' });

    const { fileContent } = req.body;
    if (!fileContent) return res.status(400).json({ error: 'fileContent is required' });

    let wb: XLSX.WorkBook;
    try {
      wb = parseBase64Workbook(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid or corrupted Excel file' });
    }

    const sheet = wb.Sheets['ClosingMessages'];
    if (!sheet) {
      return res.status(400).json({ error: 'Excel file must contain a "ClosingMessages" sheet' });
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as Array<{
      language?: string;
      content?: string;
      link_used_message?: string;
      survey_closed_message?: string;
      resume_message?: string;
      is_fallback?: string;
    }>;

    if (!rows.length) {
      return res.status(400).json({ error: 'The "ClosingMessages" sheet is empty' });
    }

    const results: ImportResult[] = [];

    // Upsert per language via the same service the form uses: a language already
    // present gets a new version with all four texts replaced (blank optional
    // cells → null → default text on the public page); a new language is added.
    // Languages not mentioned in the file are never touched.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based + header

      if (!row.language) {
        results.push({ row: rowNum, label: '—', status: 'skipped', reason: 'Missing language' });
        continue;
      }

      const lang = await findLanguage(row.language);
      if (!lang) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: 'Language not found in system',
        });
        continue;
      }

      // Same validation as the form: content required (empty HTML rejected),
      // empty optional messages normalized to null.
      const parsed = upsertClosingMessageSchema.safeParse({
        language_id: lang.id,
        content: row.content != null ? String(row.content) : '',
        link_used_message: row.link_used_message != null ? String(row.link_used_message) : null,
        survey_closed_message:
          row.survey_closed_message != null ? String(row.survey_closed_message) : null,
        resume_message: row.resume_message != null ? String(row.resume_message) : null,
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: `${issue.path.join('.') || 'row'}: ${issue.message}`,
        });
        continue;
      }

      const fallbackCell = String(row.is_fallback ?? '')
        .trim()
        .toLowerCase();

      try {
        await SurveyClosingMessageService.upsertMessage(surveyId, {
          ...parsed.data,
          // Set after parsing: z.coerce.boolean would turn "no" into true. Blank cell →
          // preserve this language's current fallback status; "yes"/"no" sets it.
          is_fallback: fallbackCell === '' ? undefined : fallbackCell === 'yes',
        });
        results.push({ row: rowNum, label: String(row.language), status: 'imported' });
      } catch (err) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: err instanceof ServiceError ? err.message : 'Failed to import row',
        });
      }
    }

    const importedCount = results.filter((r) => r.status === 'imported').length;
    return res.json({
      success: true,
      imported: importedCount,
      skipped: results.length - importedCount,
      results,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Import: Eligibility Questions ───────────────────────────────────────────

export async function importEligibilityQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(String(req.params.id), 10);
    if (isNaN(surveyId)) return res.status(400).json({ error: 'Invalid survey ID' });

    const { fileContent } = req.body;
    if (!fileContent) return res.status(400).json({ error: 'fileContent is required' });

    let wb: XLSX.WorkBook;
    try {
      wb = parseBase64Workbook(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid or corrupted Excel file' });
    }

    const sheet = wb.Sheets['Questions'];
    if (!sheet) {
      return res.status(400).json({ error: 'Excel file must contain a "Questions" sheet' });
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as Array<{
      order_position: number;
      expected_answer: string;
      language: string;
      question_text: string;
      disqualification_message?: string;
      is_fallback?: string;
    }>;

    if (!rows.length) {
      return res.status(400).json({ error: 'The "Questions" sheet is empty' });
    }

    // Group rows by order_position — rows sharing a position are translations of
    // the same question.
    const grouped = new Map<number, typeof rows>();
    for (const row of rows) {
      const pos = Number(row.order_position);
      if (!grouped.has(pos)) grouped.set(pos, []);
      grouped.get(pos)!.push(row);
    }

    const results: ImportResult[] = [];
    const sortedPositions = [...grouped.keys()].sort((a, b) => a - b);

    // Fallback here is one language applied survey-wide across every question
    // (not per-question) — collect the first explicitly-requested fallback
    // language across the whole file and apply it once at the end, after every
    // question/translation below has been processed.
    let requestedFallbackLangId: number | null = null;

    for (const position of sortedPositions) {
      const group = grouped.get(position)!;
      const firstRow = group[0];
      const expectedAnswer = String(firstRow.expected_answer ?? '')
        .trim()
        .toLowerCase();

      if (!['yes', 'no'].includes(expectedAnswer)) {
        group.forEach((r) =>
          results.push({
            row: rows.indexOf(r) + 2,
            label: String(r.language ?? '—'),
            status: 'skipped',
            reason: `expected_answer must be "yes" or "no" (got "${expectedAnswer}")`,
          })
        );
        continue;
      }

      const translations: {
        language_id: number;
        question_text: string;
        disqualification_message: string | null;
      }[] = [];
      const resolvedRows: { rowIdx: number; languageLabel: string }[] = [];

      for (const row of group) {
        const rowIdx = rows.indexOf(row) + 2;

        if (!row.language || !row.question_text) {
          results.push({
            row: rowIdx,
            label: String(row.language ?? '—'),
            status: 'skipped',
            reason: 'Missing language or question_text',
          });
          continue;
        }

        const lang = await findLanguage(row.language);
        if (!lang) {
          results.push({
            row: rowIdx,
            label: String(row.language),
            status: 'skipped',
            reason: 'Language not found in system',
          });
          continue;
        }

        if (
          requestedFallbackLangId === null &&
          String(row.is_fallback ?? '')
            .trim()
            .toLowerCase() === 'yes'
        ) {
          requestedFallbackLangId = lang.id;
        }

        translations.push({
          language_id: lang.id,
          question_text: String(row.question_text).trim(),
          disqualification_message: row.disqualification_message
            ? String(row.disqualification_message).trim()
            : null,
        });
        resolvedRows.push({ rowIdx, languageLabel: String(row.language) });
      }

      if (translations.length === 0) continue; // every row in this group was invalid

      try {
        // Reuse the existing current question at this order_position if the
        // survey already has one — updateEligibilityQuestion merges these
        // translations into its existing ones (existing languages updated, new
        // languages added, languages not in this file left untouched) instead of
        // replacing the whole question set. A brand new order_position creates a
        // new question.
        const existing = await prisma.survey_eligibility_questions.findFirst({
          where: { survey_id: surveyId, order_position: position, is_current: true },
          select: { id: true },
        });

        if (existing) {
          await SurveyEligibilityService.updateEligibilityQuestion(surveyId, existing.id, {
            expected_answer: expectedAnswer,
            order_position: position,
            translations,
          });
        } else {
          await SurveyEligibilityService.createEligibilityQuestion(surveyId, {
            expected_answer: expectedAnswer,
            order_position: position,
            translations,
          });
        }

        resolvedRows.forEach(({ rowIdx, languageLabel }) =>
          results.push({ row: rowIdx, label: languageLabel, status: 'imported' })
        );
      } catch (err) {
        resolvedRows.forEach(({ rowIdx, languageLabel }) =>
          results.push({
            row: rowIdx,
            label: languageLabel,
            status: 'skipped',
            reason: err instanceof ServiceError ? err.message : 'Failed to import question group',
          })
        );
      }
    }

    if (requestedFallbackLangId !== null) {
      try {
        await SurveyEligibilityService.setEligibilityLanguageFallback(
          surveyId,
          requestedFallbackLangId
        );
      } catch {
        // Best-effort — the per-row results above already reflect whether the
        // question/translation content itself was imported successfully.
      }
    }

    const importedCount = results.filter((r) => r.status === 'imported').length;
    return res.json({
      success: true,
      imported: importedCount,
      skipped: results.length - importedCount,
      results,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Import: Privacy Policies ─────────────────────────────────────────────────

export async function importPrivacyPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(String(req.params.id), 10);
    if (isNaN(surveyId)) return res.status(400).json({ error: 'Invalid survey ID' });

    const { fileContent } = req.body;
    if (!fileContent) return res.status(400).json({ error: 'fileContent is required' });

    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { access_mode: true },
    });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const userKeycloakId: string | null = (req as any).user?.id ?? null;

    let wb: XLSX.WorkBook;
    try {
      wb = parseBase64Workbook(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid or corrupted Excel file' });
    }

    const sheet = wb.Sheets['PrivacyPolicies'];
    if (!sheet) {
      return res.status(400).json({ error: 'Excel file must contain a "PrivacyPolicies" sheet' });
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as Array<{
      language: string;
      title: string;
      content: string;
      is_fallback?: string;
    }>;

    if (!rows.length) {
      return res.status(400).json({ error: 'The "PrivacyPolicies" sheet is empty' });
    }

    const results: ImportResult[] = [];

    // Upsert per language: if the survey already has a current policy linked for
    // this language, update it in place (new version, link repointed, its
    // is_fallback preserved) instead of creating a duplicate. Languages not
    // mentioned in this file are never touched — no wholesale unlink/delete.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      if (!row.language || !row.title || !row.content) {
        results.push({
          row: rowNum,
          label: String(row.language ?? '—'),
          status: 'skipped',
          reason: 'Missing language, title, or content',
        });
        continue;
      }

      const lang = await findLanguage(row.language);
      if (!lang) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: 'Language not found in system',
        });
        continue;
      }

      const wantsFallback =
        String(row.is_fallback ?? '')
          .trim()
          .toLowerCase() === 'yes';

      try {
        const existingLink = await prisma.survey_privacy_policies.findFirst({
          where: {
            survey_id: surveyId,
            privacy_policy: { language_id: lang.id, is_current: true },
          },
          select: { privacy_policy_id: true, is_fallback: true },
        });

        let policyId: number;
        if (existingLink) {
          const updated = await PrivacyPolicyService.update(existingLink.privacy_policy_id, {
            title: String(row.title).trim(),
            content: String(row.content).trim(),
          });
          policyId = updated.id;
        } else {
          const created = await PrivacyPolicyService.create(
            {
              title: String(row.title).trim(),
              content: String(row.content).trim(),
              language_id: lang.id,
              survey_id: surveyId,
            },
            userKeycloakId
          );
          policyId = created.id;
        }

        // Only touch fallback when the file explicitly asks for it, and only if
        // it isn't already the fallback (setFallbackPolicy rejects a no-op call).
        if (wantsFallback && !(existingLink?.is_fallback ?? false)) {
          await SurveyPrivacyPolicyService.setFallbackPolicy(surveyId, policyId);
        }

        results.push({ row: rowNum, label: String(row.language), status: 'imported' });
      } catch (err) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: err instanceof ServiceError ? err.message : 'Failed to import row',
        });
      }
    }

    const importedCount = results.filter((r) => r.status === 'imported').length;
    return res.json({
      success: true,
      imported: importedCount,
      skipped: results.length - importedCount,
      results,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Import: Study Info Sheet ────────────────────────────────────────────────

export async function importStudyInfoSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(String(req.params.id), 10);
    if (isNaN(surveyId)) return res.status(400).json({ error: 'Invalid survey ID' });

    const { fileContent } = req.body;
    if (!fileContent) return res.status(400).json({ error: 'fileContent is required' });

    let wb: XLSX.WorkBook;
    try {
      wb = parseBase64Workbook(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid or corrupted Excel file' });
    }

    const sheet = wb.Sheets['Info&Consent'];
    if (!sheet) {
      return res.status(400).json({ error: 'Excel file must contain a "Info&Consent" sheet' });
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as Array<{
      language: string;
      title: string;
      content: string;
      rejection_message?: string;
      is_fallback?: string;
    }>;

    if (!rows.length) {
      return res.status(400).json({ error: 'The "Info&Consent" sheet is empty' });
    }

    const consentSheet = wb.Sheets['ConsentQuestions'];
    if (!consentSheet) {
      return res.status(400).json({ error: 'Excel file must contain a "ConsentQuestions" sheet' });
    }

    const consentRows = XLSX.utils.sheet_to_json(consentSheet) as Array<{
      language?: string;
      order?: number | string;
      question_text?: string;
    }>;

    // Consent questions grouped by language name (case-insensitive), ordered by
    // the "order" column and, for ties or blanks, by their position in the sheet.
    const langKey = (name: unknown) =>
      String(name ?? '')
        .trim()
        .toLowerCase();
    const consentByLanguage = new Map<
      string,
      {
        label: string;
        rowNum: number;
        questions: { question_text: string; order: number; index: number }[];
      }
    >();
    consentRows.forEach((row, index) => {
      const text = String(row.question_text ?? '').trim();
      const key = langKey(row.language);
      if (!key || !text) return;
      const order = Number(row.order);
      if (!consentByLanguage.has(key)) {
        consentByLanguage.set(key, {
          label: String(row.language).trim(),
          rowNum: index + 2,
          questions: [],
        });
      }
      consentByLanguage.get(key)!.questions.push({
        question_text: text,
        order:
          row.order !== undefined && row.order !== '' && Number.isFinite(order)
            ? order
            : Number.MAX_SAFE_INTEGER,
        index,
      });
    });
    const usedConsentLanguages = new Set<string>();

    const results: ImportResult[] = [];

    // Upsert per language via the same service the single-record form uses: a
    // language already present for this survey gets updated in place (new version,
    // old one marked not-current); a new language is added. Languages not
    // mentioned in this file are never touched — no wholesale delete/deactivate.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based + header

      if (!row.language || !row.title || !row.content) {
        results.push({
          row: rowNum,
          label: String(row.language ?? '—'),
          status: 'skipped',
          reason: 'Missing language, title, or content',
        });
        continue;
      }

      usedConsentLanguages.add(langKey(row.language));
      const consentQuestions = [...(consentByLanguage.get(langKey(row.language))?.questions ?? [])]
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map((q) => ({ question_text: q.question_text }));
      if (!consentQuestions.length) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: 'No consent questions for this language in the "ConsentQuestions" sheet',
        });
        continue;
      }

      const lang = await findLanguage(row.language);
      if (!lang) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: 'Language not found in system',
        });
        continue;
      }

      const fallbackCell = String(row.is_fallback ?? '')
        .trim()
        .toLowerCase();

      try {
        await SurveyStudyInfoSheetService.upsertStudyInfoSheet(surveyId, {
          language_id: lang.id,
          title: String(row.title).trim(),
          content: String(row.content).trim(),
          rejection_message: String(row.rejection_message ?? '').trim(),
          consent_questions: consentQuestions,
          // Blank cell → preserve whatever this language already was (or default
          // to non-fallback for a brand new one); only "yes"/"no" explicitly sets it.
          is_fallback: fallbackCell === '' ? undefined : fallbackCell === 'yes',
        });
        results.push({ row: rowNum, label: String(row.language), status: 'imported' });
      } catch (err) {
        results.push({
          row: rowNum,
          label: String(row.language),
          status: 'skipped',
          reason: err instanceof ServiceError ? err.message : 'Failed to import row',
        });
      }
    }

    // Consent questions for a language with no row in the "Info&Consent" sheet
    // have nothing to attach to: report them instead of dropping them silently.
    for (const [key, group] of consentByLanguage) {
      if (usedConsentLanguages.has(key)) continue;
      results.push({
        row: group.rowNum,
        label: `ConsentQuestions: ${group.label}`,
        status: 'skipped',
        reason: 'Language not present in the "Info&Consent" sheet',
      });
    }

    const importedCount = results.filter((r) => r.status === 'imported').length;
    return res.json({
      success: true,
      imported: importedCount,
      skipped: results.length - importedCount,
      results,
    });
  } catch (err) {
    return next(err);
  }
}
