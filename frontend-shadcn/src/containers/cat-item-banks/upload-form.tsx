import apiClient from '@/api/client';
import DevnutSection from '@/components/DevnutSection';
import { DevnutToast } from '@/components/DevnutToast';
import { Form, setFormErrors } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { FormSubmitter } from '@/components/form/form-submitter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { TabPreview } from '@/components/ui/tab-preview';
import { AlertMessage } from '@/containers/module-library/_components/AlertMessage';
import {
  checkWorkbookLanguages,
  hasBlockingLanguageDiff,
  hasLanguageDiff,
  type LanguageDiffData,
} from '@/containers/module-library/_helpers/validation';
import {
  zCatItemBankUpload,
  type CatItemBankUpload,
} from '@/features/schema/cat-item-banks/upload-schema';
import { downloadBlobFile } from '@/helpers/upload/download';
import { fileToBase64, readWorkbookSheets, type SheetData } from '@/helpers/upload/excel';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, Download } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  hasBlockingSheetErrors,
  validateSheets,
  type SheetValidation,
} from './_helpers/validation';

const SETTINGS_PATH = '/settings?settings_tab=cat-item-banks';

// Only same-origin relative paths are accepted, to avoid open redirects.
const parseReturnTo = (value: string | null): string | null =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : null;

// ─── Component ────────────────────────────────────────────────────────────────

export const CatItemBankUploadForm = () => {
  const { t } = useTranslation(['management', 'common']);
  const navigate = useNavigate();
  // Set when the user lands here from another flow (e.g. Module Library upload with no
  // CAT item bank configured): after upload/back they are sent back there instead of Settings.
  const [searchParams] = useSearchParams();
  const returnTo = parseReturnTo(searchParams.get('returnTo'));
  const backPath = returnTo ?? SETTINGS_PATH;

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<SheetData>({});
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [sheetValidation, setSheetValidation] = useState<SheetValidation | null>(null);
  const [languageDiff, setLanguageDiff] = useState<LanguageDiffData | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const { uploadProgress, isUploading, start, succeed, finish } = useUploadProgress();

  const form = useForm<CatItemBankUpload>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zCatItemBankUpload()),
  });

  const hasPreview = sheetNames.length > 0;

  const hasSheetErrors = hasBlockingSheetErrors(sheetValidation);
  // Languages the backend would reject (unknown or different from the stored ones)
  const hasLanguageErrors = hasBlockingLanguageDiff(languageDiff);

  const handleDownloadTemplate = () =>
    downloadBlobFile('/cat-item-banks/template', 'CatItemBank_Template.xlsx');

  const handleFileChange = async (file: File | null) => {
    setSheetNames([]);
    setSheets({});
    setActiveSheet('');
    setSheetValidation(null);
    setLanguageDiff(null);
    setResultMessage(null);
    if (!file) return;

    setIsPreviewing(true);
    try {
      const { names, sheets: allSheets } = await readWorkbookSheets(file);
      setSheetNames(names);
      setSheets(allSheets);
      setActiveSheet(names[0] ?? '');
      setSheetValidation(validateSheets(names, allSheets));
      setLanguageDiff(await checkWorkbookLanguages(allSheets));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async (values: CatItemBankUpload) => {
    if (hasSheetErrors || hasLanguageErrors || !values.file) return;

    const fileContent = await fileToBase64(values.file);

    start();
    try {
      const res = await apiClient.post(
        '/cat-item-banks',
        {
          name: values.name,
          description: values.description,
          fileContent,
          fileName: values.file.name,
        },
        { timeout: 0 }
      );
      succeed();
      setResultMessage(res.data?.message ?? null);
      const createdId = res.data?.data?.id;
      let target = SETTINGS_PATH;
      if (returnTo) {
        const url = new URL(returnTo, window.location.origin);
        if (createdId != null) url.searchParams.set('cat_item_bank_id', String(createdId));
        target = `${url.pathname}${url.search}`;
      }
      setTimeout(() => navigate(target), 1200);
    } catch (error: any) {
      setFormErrors(form, error?.response?.data?.errors);
      DevnutToast.error(
        t('common:errors.generic'),
        error?.response?.data?.message ?? error?.message
      );
    } finally {
      finish();
    }
  };

  const watchedFile = form.watch('file');

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
            {t('cat_item_banks.upload.uploading', 'Importing items...')}
          </DialogTitle>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-lg font-semibold">
              {uploadProgress >= 100
                ? t('cat_item_banks.upload.done', 'Items imported!')
                : t('cat_item_banks.upload.uploading', 'Importing items...')}
            </p>
            <p className="text-sm text-muted-foreground">
              {uploadProgress >= 100
                ? (resultMessage ?? t('cat_item_banks.upload.doneHint', 'Redirecting...'))
                : t(
                    'cat_item_banks.upload.uploadingHint',
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
            onClick={() => navigate(backPath)}
            className="text-black p-0!"
            aria-label={t('common:buttons.values.back')}
          >
            <ChevronLeft />
          </Button>
          <h2 className="text-lg font-semibold">
            {t('cat_item_banks.create.title', 'Create CAT Item Bank')}
          </h2>
        </div>

        {/* Form */}
        <Form
          {...form}
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-8"
          submitter={{
            submitButtonProps: {
              disabled: hasSheetErrors || hasLanguageErrors || isUploading || !watchedFile,
            },
            resetButtonProps: { style: { display: 'none' } },
            searchConfig: {
              submitText: t('cat_item_banks.upload.submit', 'Upload'),
            },
            render: (helpers, defaultDom) => (
              <FormSubmitter
                type="default"
                onBack={() => navigate(backPath)}
                loading={helpers?.isSubmitting}
              >
                {defaultDom}
              </FormSubmitter>
            ),
          }}
        >
          <DevnutSection.Grid className="md:grid-cols-2 md:gap-24">
            <DevnutSection.Grid>
              <FormField label={t('cat_item_banks.form.name')} required>
                <FormFieldController name="name" type="text" />
              </FormField>

              <FormField label={t('cat_item_banks.form.description')}>
                <FormFieldController name="description" type="text" />
              </FormField>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={handleDownloadTemplate}
              >
                <Download className="size-4 mr-2" />
                {t('upload.downloadTemplate', 'Download Template')}
              </Button>
            </DevnutSection.Grid>

            <FormField>
              <FormFieldController
                name="file"
                type="file"
                otherText={t('upload.file.placeholder')}
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
            <p className="font-semibold text-center">{t('upload.preview.title')}</p>
            <Separator />
            {isPreviewing ? (
              <div className="w-full flex justify-center py-6">
                <DevnutSection.Loading />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Language diff banner — blocking when the backend would reject the file */}
                {hasLanguageDiff(languageDiff) && (
                  <AlertMessage.LanguageDiff
                    onlyInDb={languageDiff.onlyInDb}
                    onlyInFile={languageDiff.onlyInFile}
                    changed={languageDiff.changed}
                    unknownIds={languageDiff.unknownIds}
                  />
                )}

                {/* Sheet validation banner */}
                {sheetValidation && (
                  <div className="flex flex-col gap-2">
                    {sheetValidation.typos.map(({ found, expected }) => (
                      <AlertMessage.Typo key={found} found={found} expected={expected} />
                    ))}
                    {sheetValidation.missing.map((name) => (
                      <AlertMessage.Missing key={name} name={name} />
                    ))}
                    {sheetValidation.valid.map((sheetName) => {
                      const col = sheetValidation.columns[sheetName];
                      if (
                        !col ||
                        (col.typos.length === 0 &&
                          col.missing.length === 0 &&
                          col.duplicates.length === 0)
                      )
                        return null;
                      return (
                        <AlertMessage.ColumnError
                          key={sheetName}
                          sheetName={sheetName}
                          typos={col.typos}
                          missing={col.missing}
                          duplicates={col.duplicates}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Table preview */}
                <TabPreview
                  activeSheet={activeSheet}
                  sheetNames={sheetNames}
                  sheets={sheets}
                  sheetValidation={sheetValidation}
                  setActiveSheet={setActiveSheet}
                  languageDiff={languageDiff}
                />
              </div>
            )}
          </DevnutSection.Grid>
        )}
      </DevnutSection.Grid>
    </div>
  );
};
