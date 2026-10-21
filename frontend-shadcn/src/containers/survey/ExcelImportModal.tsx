import apiClient from '@/api/client';
import { DevnutToast } from '@/components/DevnutToast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UploadDropzone } from '@/components/ui/upload-dropzone';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExcelImportType =
  | 'presentations'
  | 'eligibility-questions'
  | 'privacy-policies'
  | 'study-info-sheet'
  | 'closing-messages'
  | 'patients';

type ImportIds = { surveyId: string; questionnaireId?: string };

type ImportResult = {
  row: number;
  label: string;
  status: 'imported' | 'skipped';
  reason?: string;
};

type PreviewRow = Record<string, string | number | null>;

type SheetPreview = { sheetName: string; columns: string[]; rows: PreviewRow[] };

/** Expected columns of one sheet of the workbook. */
type SheetColumnsConfig = {
  sheetName: string;
  columns: string[];
  /** Columns not required to have a value in every row (still shown in the reference/preview). */
  optionalColumns: string[];
  columnHints: Record<string, string>;
};

/** Columns carrying HTML content — rendered formatted in preview instead of raw text. */
const HTML_COLUMNS = new Set([
  'content',
  'link_used_message',
  'survey_closed_message',
  'resume_message',
]);

/** Tag set actually producible by RichTextEditor's toolbar (src/components/ui/rich-text-editor.tsx). */
const ALLOWED_HTML_TAGS_HINT =
  'Allowed tags: <p>, <h1>/<h2>/<h3>, <strong>, <em>, <u>, <a href="...">, <ul>/<ol> with <li>.';

// ─── Config ───────────────────────────────────────────────────────────────────

const IMPORT_CONFIG: Record<
  ExcelImportType,
  SheetColumnsConfig & {
    label: string;
    templatePath: (ids: ImportIds) => string;
    importPath: (ids: ImportIds) => string;
    templateFilename: string;
    /** Extra fields merged into the import POST body, beyond fileContent. */
    extraBody?: Record<string, unknown>;
    description: string;
    /** Further required sheets of the same workbook, validated and previewed like the main one. */
    extraSheets?: SheetColumnsConfig[];
  }
> = {
  presentations: {
    label: 'Presentations',
    sheetName: 'Presentations',
    templatePath: () => '/surveys/templates/presentations',
    importPath: (ids) => `/surveys/${ids.surveyId}/presentations/import`,
    templateFilename: 'presentations.xlsx',
    columns: ['language', 'title', 'content', 'is_fallback'],
    optionalColumns: ['title', 'is_fallback'],
    description:
      'Import welcome/intro text per language. Each row represents one language version — re-uploading a language already present updates it in place, other languages are left untouched. The "title" column is optional. Set is_fallback to "yes" for the language used as default when the patient\'s language is not available; leave blank to keep each language\'s current fallback status unchanged.',
    columnHints: {
      language: 'Language name (e.g. "English", "Italian")',
      title: 'Optional short title shown above the text',
      content: `HTML content of the presentation text. ${ALLOWED_HTML_TAGS_HINT}`,
      is_fallback: '"yes"/"no" to set, or leave blank to keep unchanged',
    },
  },
  'eligibility-questions': {
    label: 'Eligibility Questions',
    sheetName: 'Questions',
    templatePath: () => '/surveys/templates/eligibility-questions',
    importPath: (ids) => `/surveys/${ids.surveyId}/eligibility-questions/import`,
    templateFilename: 'eligibility-questions.xlsx',
    columns: [
      'order_position',
      'expected_answer',
      'language',
      'question_text',
      'disqualification_message',
      'is_fallback',
    ],
    optionalColumns: ['disqualification_message', 'is_fallback'],
    description:
      'Import eligibility screening questions with multilingual translations. Rows sharing the same order_position represent the same question in different languages — re-uploading an order_position already present updates that question (existing languages updated, new languages added, others left untouched); a new order_position adds a new question. The "disqualification_message" column is optional. is_fallback applies survey-wide per language (not per question) — set it to "yes" on any row for the language that should be the default when the patient\'s language is not available.',
    columnHints: {
      order_position: 'Integer — rows with the same value are the same question translated',
      expected_answer: '"yes" or "no" — the answer that qualifies the respondent',
      language: 'Language name (e.g. "English", "Italian")',
      question_text: 'The question text shown to the respondent',
      disqualification_message: 'Optional message shown if the respondent is disqualified',
      is_fallback: '"yes"/"no", applies to the whole survey, not just this question',
    },
  },
  'privacy-policies': {
    label: 'Privacy Policies',
    sheetName: 'PrivacyPolicies',
    templatePath: () => '/surveys/templates/privacy-policies',
    importPath: (ids) => `/surveys/${ids.surveyId}/privacy-policies/import`,
    templateFilename: 'privacy-policies.xlsx',
    columns: ['language', 'title', 'content', 'is_fallback'],
    optionalColumns: ['is_fallback'],
    description:
      'Import one privacy policy per language. Each policy is created and automatically linked to this survey — re-uploading a language already linked updates it in place, other languages are left untouched. Set is_fallback to "yes" for the language used as default when the patient\'s language is not available; leave blank to keep each language\'s current fallback status unchanged.',
    columnHints: {
      language: 'Language name (e.g. "English", "Italian")',
      title: 'Policy title shown to the respondent',
      content: `Full HTML content of the privacy policy. ${ALLOWED_HTML_TAGS_HINT}`,
      is_fallback: '"yes"/"no" to set, or leave blank to keep unchanged',
    },
  },
  'study-info-sheet': {
    label: 'Info & Consent',
    sheetName: 'Info&Consent',
    templatePath: () => '/surveys/templates/study-info-sheet',
    importPath: (ids) => `/surveys/${ids.surveyId}/study-info-sheet/import`,
    templateFilename: 'info-consent.xlsx',
    columns: ['language', 'title', 'content', 'rejection_message', 'is_fallback'],
    optionalColumns: ['rejection_message', 'is_fallback'],
    description:
      'Import one Info & Consent sheet per language. Each row represents one language version — re-uploading a language already present updates it in place, other languages are left untouched. The "rejection_message" column is optional. The consent questions go in the second sheet "ConsentQuestions": one row per question, at least one per language; the respondent must consent to every question to proceed. Set is_fallback to "yes" for the language used as default when the patient\'s language is not available; leave blank to keep each language\'s current fallback status unchanged.',
    columnHints: {
      language: 'Language name (e.g. "English", "Italian")',
      title: 'Title shown to the respondent',
      content: `Full HTML content of the Info & Consent sheet. ${ALLOWED_HTML_TAGS_HINT}`,
      rejection_message:
        'Optional message shown if the respondent rejects the Info & Consent sheet',
      is_fallback: '"yes"/"no" to set, or leave blank to keep unchanged',
    },
    extraSheets: [
      {
        sheetName: 'ConsentQuestions',
        columns: ['language', 'order', 'question_text'],
        optionalColumns: ['order'],
        columnHints: {
          language: 'Language name — must match a language in the "Info&Consent" sheet',
          order:
            'Optional integer — display order of the question within its language (row order if blank)',
          question_text:
            'Consent question text; the respondent answers "I consent" / "I do not consent"',
        },
      },
    ],
  },
  'closing-messages': {
    label: 'Closing Messages',
    sheetName: 'ClosingMessages',
    templatePath: () => '/surveys/templates/closing-messages',
    importPath: (ids) => `/surveys/${ids.surveyId}/closing-messages/import`,
    templateFilename: 'closing-messages.xlsx',
    columns: [
      'language',
      'content',
      'link_used_message',
      'survey_closed_message',
      'resume_message',
      'is_fallback',
    ],
    optionalColumns: ['link_used_message', 'survey_closed_message', 'resume_message', 'is_fallback'],
    description:
      'Import the closing messages per language. Each row represents one language version — re-uploading a language already present replaces all its messages (new version), other languages are left untouched. Only "content" is required: leave link_used_message, survey_closed_message or resume_message blank to show the default English text. Set is_fallback to "yes" for the language used as default when the patient\'s language is not available; leave blank to keep each language\'s current fallback status unchanged.',
    columnHints: {
      language: 'Language name (e.g. "English", "Italian")',
      content: `HTML shown once the patient has completed and submitted the questionnaire. ${ALLOWED_HTML_TAGS_HINT}`,
      link_used_message:
        'Optional HTML shown when a private link that already completed the survey is opened again',
      survey_closed_message:
        'Optional HTML shown when the survey is no longer available (not started, ended, completed or disabled)',
      resume_message:
        'Optional HTML shown when a questionnaire in progress is resumed — {count} is replaced with the responses saved so far',
      is_fallback: '"yes"/"no" to set, or leave blank to keep unchanged',
    },
  },
  patients: {
    label: 'Patients',
    sheetName: 'Patients',
    templatePath: () => '/patients/template',
    importPath: (ids) =>
      `/surveys/${ids.surveyId}/questionnaires/${ids.questionnaireId}/assignments/patients/bulk`,
    templateFilename: 'PatientsTemplate.xlsx',
    extraBody: { fileType: 'excel' },
    columns: ['patient_id', 'mail'],
    optionalColumns: ['mail'],
    description:
      'Bulk-add participants to this questionnaire. Each row is one patient — patient_id is required and must be unique within this questionnaire; mail is optional but, if provided, must also be unique within this questionnaire (case-insensitive, saved lowercase). If any row in the file fails validation, no patients are imported (fix the file and re-upload). Patients created this way get no phone number (phone_prefix/phone are left empty) and are always active.',
    columnHints: {
      patient_id: 'Unique participant identifier within this questionnaire (required)',
      mail: 'Must be unique within this questionnaire if provided (case-insensitive, saved lowercase)',
    },
  },
};

/** Missing/typo/duplicate/extra header checks — any non-empty category blocks import. */
function validateColumns(headers: string[], config: SheetColumnsConfig): string[] {
  const required = config.columns.filter((c) => !config.optionalColumns.includes(c));

  const missing = required.filter((c) => !headers.includes(c));

  const typos = required
    .filter((c) => !headers.includes(c))
    .map((c) => headers.find((h) => h.toLowerCase() === c.toLowerCase() && h !== c))
    .filter((h): h is string => !!h);

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const h of headers) {
    if (seen.has(h)) {
      if (!duplicates.includes(h)) duplicates.push(h);
    } else {
      seen.add(h);
    }
  }

  const extra = headers.filter((h) => h && !config.columns.includes(h));

  const messages: string[] = [];
  if (missing.length > 0) messages.push(`Missing required columns: ${missing.join(', ')}`);
  if (typos.length > 0)
    messages.push(
      `Possible typo in column name(s): ${typos.join(', ')} — check exact spelling/case against the template`
    );
  if (duplicates.length > 0) messages.push(`Duplicate column header(s): ${duplicates.join(', ')}`);
  if (extra.length > 0) messages.push(`Unrecognized column(s): ${extra.join(', ')}`);
  return messages;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  surveyId: string;
  /** Required when type is 'patients'. */
  questionnaireId?: string;
  type: ExcelImportType;
}

export function ExcelImportModal({
  open,
  onClose,
  onSuccess,
  surveyId,
  questionnaireId,
  type,
}: Props) {
  const config = IMPORT_CONFIG[type];
  const sheets: SheetColumnsConfig[] = [config, ...(config.extraSheets ?? [])];
  const isMultiSheet = sheets.length > 1;
  const ids: ImportIds = { surveyId, questionnaireId };

  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previews, setPreviews] = useState<SheetPreview[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    imported: number;
    skipped: number;
    rows: ImportResult[];
  } | null>(null);

  const reset = () => {
    setFileBase64(null);
    setFileName(null);
    setPreviews([]);
    setValidationErrors([]);
    setResults(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);

    try {
      // Validate and preview every sheet with read-excel-file, collecting the
      // errors of all sheets so the user sees every problem at once.
      const errors: string[] = [];
      const sheetPreviews: SheetPreview[] = [];

      for (const sheet of sheets) {
        const rows = await readXlsxFile(file, { sheet: sheet.sheetName }).catch(() => null);

        if (!rows || rows.length < 2) {
          errors.push(
            `Sheet "${sheet.sheetName}" not found or contains no data rows. Check that you are using the correct template.`
          );
          continue;
        }

        const headers = rows[0].map((h) => String(h ?? '').trim());
        const columnErrors = validateColumns(headers, sheet);

        if (columnErrors.length > 0) {
          errors.push(
            ...columnErrors.map((e) => (isMultiSheet ? `"${sheet.sheetName}": ${e}` : e))
          );
          continue;
        }

        // Build preview (first 5 data rows)
        sheetPreviews.push({
          sheetName: sheet.sheetName,
          columns: sheet.columns,
          rows: rows.slice(1, 6).map((row) => {
            const obj: PreviewRow = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] as string | number | null;
            });
            return obj;
          }),
        });
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }

      setPreviews(sheetPreviews);

      // Convert to base64
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      setFileBase64(btoa(binary));
    } catch {
      setValidationErrors(['Failed to parse the Excel file. Make sure it is a valid .xlsx file.']);
    }
  };

  const handleImport = async () => {
    if (!fileBase64) return;
    setImporting(true);
    try {
      const res = await apiClient.post(config.importPath(ids), {
        fileContent: fileBase64,
        ...(config.extraBody ?? {}),
      });
      const { imported, skipped, results: rows } = res.data;
      setResults({ imported, skipped, rows: rows ?? [] });
      if (imported > 0) {
        DevnutToast.success(
          `Import completed: ${imported} item(s) imported${skipped > 0 ? `, ${skipped} skipped` : ''}`
        );
        onSuccess();
      } else {
        DevnutToast.warning(`No items were imported (${skipped} skipped)`);
      }
    } catch (err: any) {
      DevnutToast.error(err.response?.data?.error ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiClient.get(config.templatePath(ids), { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = config.templateFilename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      DevnutToast.error('Failed to download template');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-green-600" />
            Import {config.label} from Excel
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">{config.description}</p>

          {/* Step 1 — Download template */}
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Step 1 — Download the template</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fill in the template and upload it in the step below.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={handleDownloadTemplate}
            >
              <Download className="size-4" />
              Template
            </Button>
          </div>

          {/* Column reference — one block per sheet */}
          {sheets.map((sheet) => (
            <div
              key={sheet.sheetName}
              className="rounded-md border bg-muted/10 p-3 flex flex-col gap-1.5"
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {isMultiSheet
                  ? `Sheet "${sheet.sheetName}" — column reference`
                  : 'Column reference'}
              </p>
              {sheet.columns.map((col) => (
                <div key={col} className="flex gap-2 text-xs">
                  <span className="font-mono font-medium text-foreground w-44 shrink-0">{col}</span>
                  <span className="text-muted-foreground">{sheet.columnHints[col]}</span>
                </div>
              ))}
            </div>
          ))}

          {/* Step 2 — Upload */}
          {!results && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Step 2 — Upload the completed file</p>
              <UploadDropzone
                accept={{
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                }}
                defaultText={fileName ?? 'Click to select a .xlsx file'}
                onDrop={(files) => handleFile(files[0])}
              />
            </div>
          )}

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 flex flex-col gap-1"
            >
              {validationErrors.map((e, i) => (
                <p key={i} className="text-sm text-red-700">
                  {e}
                </p>
              ))}
            </div>
          )}

          {/* Preview tables — one per sheet */}
          {previews.length > 0 && !results && (
            <div className="flex flex-col gap-4">
              {previews.map((preview) => (
                <div key={preview.sheetName} className="flex flex-col gap-2">
                  <p className="text-sm font-medium">
                    Preview{isMultiSheet ? ` "${preview.sheetName}"` : ''} — first{' '}
                    {preview.rows.length} data row{preview.rows.length !== 1 ? 's' : ''}
                  </p>
                  <PreviewTable columns={preview.columns} rows={preview.rows} />
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="flex flex-col gap-3">
              <div role="status" className="flex gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <CheckCircle2 className="size-4" />
                  {results.imported} imported
                </span>
                {results.skipped > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                    <XCircle className="size-4" />
                    {results.skipped} skipped
                  </span>
                )}
              </div>
              <div className="overflow-y-auto max-h-52 rounded-md border divide-y">
                {results.rows.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 text-sm gap-4"
                  >
                    <span className="text-muted-foreground text-xs shrink-0">row {r.row}</span>
                    <span className="flex-1 font-medium">{r.label}</span>
                    {r.status === 'imported' ? (
                      <span className="text-emerald-700 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" /> Imported
                      </span>
                    ) : (
                      <span className="text-red-700 text-xs shrink-0">
                        Skipped{r.reason ? ` — ${r.reason}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleClose}>
              {results ? 'Close' : 'Cancel'}
            </Button>
            {!results && (
              <Button
                disabled={!fileBase64 || validationErrors.length > 0 || importing}
                onClick={handleImport}
                className="gap-2"
              >
                {importing ? (
                  <>
                    <span className="size-4 rounded-full border-2 border-t-transparent border-white animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Import
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({ columns, rows }: { columns: string[]; rows: PreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="text-xs w-full">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {columns.map((col) =>
                HTML_COLUMNS.has(col) ? (
                  <td key={col} className="px-3 py-2 min-w-[280px] align-top">
                    <div
                      className="prose-content max-h-28 overflow-y-auto text-xs"
                      dangerouslySetInnerHTML={{ __html: String(row[col] ?? '') }}
                    />
                  </td>
                ) : (
                  <td key={col} className="px-3 py-2 max-w-[320px] truncate text-muted-foreground">
                    {String(row[col] ?? '')}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
