import apiClient from '@/api/client';
import DevnutSection from '@/components/DevnutSection';
import { DevnutToast } from '@/components/DevnutToast';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertMessage } from '@/containers/module-library/_components/AlertMessage';
import { TabPreview } from '@/components/ui/tab-preview';
import type { SheetData, SheetValidation } from '@/containers/module-library/form-upload';
import { useApi } from '@/hooks/useApi';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, Download } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { readWorkbookSheets } from '@/helpers/upload/excel';
import readXlsxFile from 'read-excel-file/browser';
import { z } from 'zod';

// ─── Column config ────────────────────────────────────────────────────────────

const SHEET_NAME = 'Patients';
const REQUIRED_COLUMNS = ['patient_id'];
const OPTIONAL_COLUMNS = ['mail', 'phone_prefix', 'phone', 'is_active'];

// ─── Schema ───────────────────────────────────────────────────────────────────

const zUpload = () =>
  z.object({
    file: z.instanceof(File, { message: 'File is required' }),
  });

type UploadForm = z.infer<ReturnType<typeof zUpload>>;

// ─── Upload result types ──────────────────────────────────────────────────────

interface UploadError {
  row: number;
  field: string;
  message: string;
}

interface UploadResult {
  totalRows: number;
  created: number;
  skipped: number;
  errors: UploadError[];
}

// ─── Column validation ────────────────────────────────────────────────────────

const ALL_KNOWN_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

function buildSheetValidation(headers: string[], sheetName: string): SheetValidation {
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  const typos: { found: string; expected: string }[] = [];

  for (const col of REQUIRED_COLUMNS) {
    if (headers.includes(col)) continue;
    const typo = headers.find((h) => h.toLowerCase() === col.toLowerCase() && h !== col);
    if (typo) typos.push({ found: typo, expected: col });
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const h of headers) {
    if (seen.has(h)) {
      if (!duplicates.includes(h)) duplicates.push(h);
    } else {
      seen.add(h);
    }
  }

  const extra = headers.filter((h) => !ALL_KNOWN_COLUMNS.includes(h));

  const colValidation = {
    missing,
    typos,
    duplicates,
    extra,
    invalidInValues: [],
    invalidBounds: [],
  };
  const hasErrors =
    missing.length > 0 || typos.length > 0 || duplicates.length > 0 || extra.length > 0;

  return {
    missing: [],
    typos: [],
    valid: hasErrors ? [] : [sheetName],
    extra: [],
    columns: { [sheetName]: colValidation },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PatientsUploadForm = () => {
  const { t } = useTranslation(['patients', 'common']);
  const navigate = useNavigate();
  const { makeRequest } = useApi();

  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<SheetData>({});
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [sheetValidation, setSheetValidation] = useState<SheetValidation | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadSucceededRef = useRef(false);

  const hasPreview = sheetNames.length > 0;
  const isSheetValid = sheetValidation?.valid.includes(SHEET_NAME) ?? false;

  const form = useForm<UploadForm>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zUpload()),
  });

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiClient.get('/patients/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PatientsTemplate.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  };

  const handleFileChange = async (file: File | null) => {
    setUploadResult(null);
    setSheetNames([]);
    setSheets({});
    setActiveSheet('');
    setSheetValidation(null);
    if (!file) return;

    setIsPreviewing(true);
    try {
      // Same sheet the backend imports: "Patients", else the first non-Legend sheet.
      const { names } = await readWorkbookSheets(file);
      const dataSheet = names.includes(SHEET_NAME) ? SHEET_NAME : names[0];
      if (!dataSheet) {
        setIsPreviewing(false);
        return;
      }
      const rows = (await readXlsxFile(file, { sheet: dataSheet })) as (string | number | null)[][];
      if (!rows || rows.length === 0) {
        setIsPreviewing(false);
        return;
      }
      const headers = rows[0].map((h) => String(h ?? '').trim());
      const allSheets: SheetData = { [SHEET_NAME]: rows };
      setSheets(allSheets);
      setSheetNames([SHEET_NAME]);
      setActiveSheet(SHEET_NAME);
      setSheetValidation(buildSheetValidation(headers, SHEET_NAME));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async (values: UploadForm) => {
    if (!isSheetValid) return;

    const arrayBuffer = await values.file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const fileContent = btoa(binary);

    // Start simulated progress with easing (slows down as it approaches 90%)
    setUploadProgress(0);
    uploadSucceededRef.current = false;
    setIsUploading(true);
    progressIntervalRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressIntervalRef.current!);
          return prev;
        }
        const increment = Math.max(0.3, (90 - prev) * 0.07);
        return Math.min(prev + increment, 90);
      });
    }, 300);

    try {
      const [res] = await Promise.all([
        makeRequest('/patients/bulk', 'post', {
          fileContent,
          fileType: 'excel',
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);

      clearInterval(progressIntervalRef.current!);
      progressIntervalRef.current = null;
      uploadSucceededRef.current = true;
      setUploadProgress(100);

      if (res) {
        setUploadResult({
          totalRows: res.totalRows ?? 0,
          created: res.created ?? 0,
          skipped: res.skipped ?? 0,
          errors: res.errors ?? [],
        });

        if (!res.errors?.length) {
          // Toasts persist across navigation, so the result is still announced after the redirect.
          DevnutToast.success(t('upload.done', 'Upload complete!'));
          setTimeout(() => navigate('/patients'), 1500);
        } else {
          setTimeout(() => setIsUploading(false), 600);
        }
      } else {
        setTimeout(() => setIsUploading(false), 600);
      }
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (!uploadSucceededRef.current) setIsUploading(false);
    }
  };

  return (
    <div className="w-11/12 mx-auto">
      {/* Upload progress modal */}
      <Dialog open={isUploading} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md flex flex-col items-center gap-6 py-10"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {t('upload.uploading', 'Uploading patients...')}
          </DialogTitle>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-lg font-semibold">
              {uploadProgress >= 100
                ? t('upload.done', 'Upload complete!')
                : t('upload.uploading', 'Uploading patients...')}
            </p>
            <p className="text-sm text-muted-foreground">
              {uploadProgress >= 100
                ? t('upload.doneHint', 'Redirecting...')
                : t(
                    'upload.uploadingHint',
                    'This may take a moment. Please do not close this page.'
                  )}
            </p>
          </div>
          <div className="w-full px-4">
            <Progress value={uploadProgress} className="h-3" />
            <p className="text-xs text-muted-foreground text-right mt-1">
              {Math.round(uploadProgress)}%
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <DevnutSection.Grid>
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button
            variant="link"
            onClick={() => navigate('/patients')}
            className="text-black p-0!"
            aria-label={t('common:buttons.values.back')}
          >
            <ChevronLeft />
          </Button>
          <h2 className="text-lg font-semibold">{t('upload.title', 'Add patients')}</h2>
        </div>

        {/* Form */}
        <Form
          {...form}
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-8"
          messages={{ error: t('upload.error', 'Upload failed') }}
          submitter={{
            className: 'self-end',
            searchConfig: { submitText: t('upload.submit', 'Upload') },
            submitButtonProps: { disabled: !isSheetValid || isPreviewing },
            resetButtonProps: { style: { display: 'none' } },
          }}
        >
          <DevnutSection.Grid className="md:grid-cols-2 md:gap-24">
            {/* Left: column info */}
            <DevnutSection.Grid className="gap-2 content-start">
              <p className="text-sm font-semibold">
                {t('upload.columns_title', 'Required Excel columns')}
              </p>
              <Separator />
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex gap-2 flex-wrap">
                  {REQUIRED_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded text-xs"
                    >
                      {col} *
                    </span>
                  ))}
                  {OPTIONAL_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="font-mono bg-muted px-2 py-0.5 rounded text-xs text-muted-foreground"
                    >
                      {col}
                    </span>
                  ))}
                </div>
                {/* <p className="text-xs text-muted-foreground mt-1">
                  {t('upload.columns_hint', '* Required.')}
                </p> */}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start mt-1"
                onClick={handleDownloadTemplate}
              >
                <Download className="size-4 mr-2" />
                {t('upload.downloadTemplate', 'Download Template')}
              </Button>
            </DevnutSection.Grid>

            {/* Right: file picker */}
            <FormField label={t('upload.file_label', 'Excel file')} required>
              <FormFieldController
                name="file"
                type="file"
                otherText={t('upload.file_placeholder', 'Select an .xlsx or .xls file')}
                onFileChange={(file) => {
                  handleFileChange(file);
                }}
              />
            </FormField>
          </DevnutSection.Grid>
        </Form>

        {/* Preview */}
        {(isPreviewing || hasPreview) && (
          <DevnutSection.Grid className="gap-2">
            <p className="font-semibold text-center">{t('upload.preview_title', 'Preview')}</p>
            <Separator />
            {isPreviewing ? (
              <div className="w-full flex justify-center py-6">
                <DevnutSection.Loading />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Column validation banners */}
                {sheetValidation &&
                  sheetNames.map((sheetName) => {
                    const col = sheetValidation.columns[sheetName];
                    if (
                      !col ||
                      (col.typos.length === 0 &&
                        col.missing.length === 0 &&
                        col.duplicates.length === 0 &&
                        (col.extra?.length ?? 0) === 0)
                    )
                      return null;
                    return (
                      <AlertMessage.ColumnError
                        key={sheetName}
                        sheetName={sheetName}
                        typos={col.typos}
                        missing={col.missing}
                        duplicates={col.duplicates}
                        extra={col.extra}
                      />
                    );
                  })}

                {/* Table preview */}
                <TabPreview
                  activeSheet={activeSheet}
                  sheetNames={sheetNames}
                  sheets={sheets}
                  sheetValidation={sheetValidation}
                  setActiveSheet={setActiveSheet}
                />
              </div>
            )}
          </DevnutSection.Grid>
        )}

        {/* Result — persistent live region so the outcome is announced when it arrives */}
        <p role="status" className="sr-only">
          {uploadResult
            ? t(
                'upload.result_announcement',
                'Upload result: {{created}} created, {{skipped}} skipped / errors',
                { created: uploadResult.created, skipped: uploadResult.skipped }
              )
            : ''}
        </p>
        {uploadResult && (
          <DevnutSection.Grid className="gap-3">
            <p className="font-semibold">{t('upload.result_title', 'Upload result')}</p>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">
                  {t('upload.total_rows', 'Total rows')}
                </span>
                <span className="font-medium text-lg">{uploadResult.totalRows}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">{t('upload.created', 'Created')}</span>
                <span className="font-medium text-lg text-green-700">{uploadResult.created}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">
                  {t('upload.skipped', 'Skipped / errors')}
                </span>
                <span className="font-medium text-lg text-amber-700">{uploadResult.skipped}</span>
              </div>
            </div>

            {uploadResult.errors.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <p role="alert" className="text-sm font-semibold text-red-800">
                  {t('upload.errors_title', 'Errors')} ({uploadResult.errors.length})
                </p>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  {uploadResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className="text-xs bg-red-50 text-red-800 rounded px-3 py-1.5"
                    >
                      <span className="font-medium">Row {err.row}</span>
                      {err.field && <span> · {err.field}</span>}: {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResult.errors.length === 0 && (
              <p className="text-sm text-green-700 font-medium">
                {t('upload.success', 'Upload completed successfully. Redirecting…')}
              </p>
            )}
          </DevnutSection.Grid>
        )}
      </DevnutSection.Grid>
    </div>
  );
};
