import apiClient from '@/api/client';
import { DevnutButton } from '@/components/DevnutButton';
import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { FormSubmitter } from '@/components/form/form-submitter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  zKitVersionUpload,
  type KitVersionUpload,
} from '@/features/schema/kit-version/upload-schema';
import { downloadBlobFile } from '@/helpers/upload/download';
import { fileToBase64, readWorkbookSheets, type SheetData } from '@/helpers/upload/excel';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { useValueEnum } from '@/hooks/useValueEnum';
import { KitVersionTypeEnum, ModuleTypeGroupEnum } from '@/utils/enum';
import { zodResolver } from '@hookform/resolvers/zod';
import { DevnutToast } from '@/components/DevnutToast';
import { ItemLoader } from '@/components/ItemLoader';
import { LoadingDialog } from '@/components/LoadingDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CatApiSettingsForm, type CatApiSettingsValues } from '@/containers/cat-api-settings/form';
import { AlertTriangle, ChevronLeft, Download, Plus, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertMessage, type CatSettingValidationStatus } from './_components/AlertMessage';
import { TabPreview } from '@/components/ui/tab-preview';
import {
  checkWorkbookLanguages,
  extractCatSettingsSheet,
  hasBlockingLanguageDiff,
  hasLanguageDiff,
  validateScaleSettingsCoverage,
  validateSheets,
  type LanguageDiffData,
  type MissingCatSetting,
  type MissingScaleMapping,
  type SheetValidation,
} from './_helpers/validation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { SheetData };
export type { LanguageDiffData, MissingCatSetting, MissingScaleMapping, SheetValidation };

// ─── Component ────────────────────────────────────────────────────────────────

export const ModuleLibraryUploadForm = () => {
  const { t } = useTranslation(['management', 'common']);
  const { valueOptions } = useValueEnum();

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<SheetData>({});
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [sheetValidation, setSheetValidation] = useState<SheetValidation | null>(null);
  const [languageDiff, setLanguageDiff] = useState<LanguageDiffData | null>(null);
  const { uploadProgress, isUploading, start, succeed, finish } = useUploadProgress();
  const [catItemBankOptions, setCatItemBankOptions] = useState<{ value: string; label: string }[]>(
    []
  );
  const [catItemBanksStatus, setCatItemBanksStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  // CAT API credentials (Settings → CAT API): without them every fetch-from-cat call
  // fails and importDynamic creates CatSettings with no api_configuration.
  const [catApiStatus, setCatApiStatus] = useState<'loading' | 'configured' | 'missing' | 'error'>(
    'loading'
  );
  const [isCatApiDialogOpen, setIsCatApiDialogOpen] = useState(false);
  const [missingCatSettings, setMissingCatSettings] = useState<MissingCatSetting[]>([]);
  const [isCreatingCatSettings, setIsCreatingCatSettings] = useState(false);
  const [missingScaleMappings, setMissingScaleMappings] = useState<MissingScaleMapping[]>([]);
  // Per-settingKey CAT-API fetch check, keyed by settingKey — populated by
  // validateMissingCatSettings. "Create Missing CAT Settings" stays disabled
  // until every distinct key here is 'ok', so a setting can never be saved
  // without a successfully fetched api_configuration (see handleCreateMissingCatSettings).
  const [catSettingValidation, setCatSettingValidation] = useState<
    Record<string, CatSettingValidationStatus>
  >({});

  const navigate = useNavigate();
  // Prefill when coming back from /cat-item-banks/upload (see handleCreateCatItemBank):
  // the freshly created bank is preselected and name/type are restored.
  const [searchParams] = useSearchParams();

  const fetchCatItemBanks = useCallback(() => {
    setCatItemBanksStatus('loading');
    apiClient
      .get('/cat-item-banks', { params: { pageSize: 200, isActive: 'true' } })
      .then((res) => {
        const banks = res.data?.data ?? [];
        setCatItemBankOptions(banks.map((b: any) => ({ value: String(b.id), label: b.name })));
        setCatItemBanksStatus('ready');
      })
      .catch(() => setCatItemBanksStatus('error'));
  }, []);

  useEffect(() => {
    fetchCatItemBanks();
  }, [fetchCatItemBanks]);

  const fetchCatApiStatus = useCallback(async (): Promise<boolean> => {
    setCatApiStatus('loading');
    try {
      const res = await apiClient.get('/settings/cat-api');
      const configured = !!res.data?.data?.hasApiKey;
      setCatApiStatus(configured ? 'configured' : 'missing');
      return configured;
    } catch {
      setCatApiStatus('error');
      return false;
    }
  }, []);

  const form = useForm<KitVersionUpload>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zKitVersionUpload()),
    defaultValues: {
      name: searchParams.get('name') ?? undefined,
      type: (searchParams.get('type') as KitVersionTypeEnum | null) ?? undefined,
      cat_item_bank_id: searchParams.get('cat_item_bank_id') ?? undefined,
    },
  });

  const kitType = form.watch('type') as KitVersionTypeEnum | undefined;

  const hasNoCatItemBank =
    kitType === KitVersionTypeEnum.Cat &&
    (catItemBanksStatus !== 'ready' || catItemBankOptions.length === 0);

  const hasCatPrerequisiteMissing =
    hasNoCatItemBank || (kitType === KitVersionTypeEnum.Cat && catApiStatus !== 'configured');

  useEffect(() => {
    if (kitType === KitVersionTypeEnum.Cat) void fetchCatApiStatus();
  }, [kitType, fetchCatApiStatus]);

  const handleCreateCatItemBank = () => {
    const returnParams = new URLSearchParams({ type: KitVersionTypeEnum.Cat });
    const name = form.getValues('name');
    if (name) returnParams.set('name', name);
    const returnTo = `/module-library/upload?${returnParams.toString()}`;
    navigate(`/cat-item-banks/upload?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const hasPreview = sheetNames.length > 0;

  const hasExtraSheets = !!sheetValidation && sheetValidation.extra.length > 0;

  const hasColumnErrors =
    !!sheetValidation &&
    Object.values(sheetValidation.columns).some(
      (c) =>
        c.missing.length > 0 ||
        c.typos.length > 0 ||
        c.duplicates.length > 0 ||
        c.invalidInValues.length > 0 ||
        c.invalidBounds.length > 0
    );

  // Informational only — an IRT scale with no CatSettings mapping doesn't block
  // upload, it's just handled as a fixed question instead. See AlertMessage.MissingScaleMapping.
  const hasMissingScaleMappings = missingScaleMappings.length > 0;

  const hasSheetErrors =
    !!sheetValidation &&
    (sheetValidation.missing.length > 0 ||
      sheetValidation.typos.length > 0 ||
      hasColumnErrors ||
      hasExtraSheets);

  const hasCatSettingKeyErrors = Object.values(catSettingValidation).some((s) => s === 'error');
  const invalidCatSettingKeys = Object.entries(catSettingValidation)
    .filter(([, v]) => v === 'error')
    .map(([key]) => key);

  // Languages the backend would reject (unknown or different from the stored ones)
  const hasLanguageErrors = hasBlockingLanguageDiff(languageDiff);

  useEffect(() => {
    if (!kitType || sheetNames.length === 0) return;
    setSheetValidation(validateSheets(kitType, sheetNames, sheets));
  }, [kitType, sheetNames, sheets]);

  const handleDownloadTemplate = () => {
    if (!kitType) return;
    return downloadBlobFile(`/kit-versions/template/${kitType}`, `${kitType}_template.xlsx`);
  };

  const handleCheckMissingCatSettings = async (currentSheets: SheetData) => {
    const catSettingsRows = extractCatSettingsSheet(currentSheets);
    if (catSettingsRows.length === 0) {
      setMissingCatSettings([]);
      return;
    }
    try {
      const res = await apiClient.post('/cat-settings/check-missing', {
        settingKeys: catSettingsRows.map((r) => r.settingKey),
      });
      const missingKeys: string[] = res.data?.data?.missing ?? [];
      const missing = catSettingsRows.filter((r) => missingKeys.includes(r.settingKey));
      setMissingCatSettings(missing);
      void validateMissingCatSettings(missing);
    } catch {
      setMissingCatSettings([]);
    }
  };

  // Checks, for every distinct settingKey among `items`, whether the external
  // CAT API actually has a configuration for it (same primitive the single-key
  // Cat Settings form already uses to gate its own Save button) — this is what
  // gates "Create Missing CAT Settings" below, so a key whose fetch fails can
  // never end up saved without ever having retrieved its CAT JSON.
  // `force` skips the CAT API status check — used right after the credentials were
  // saved from the dialog, when `catApiStatus` in this closure is still stale.
  const validateMissingCatSettings = async (items: MissingCatSetting[], force = false) => {
    const keys = [...new Set(items.map((m) => m.settingKey))];
    if (keys.length === 0) return;
    // Without CAT API credentials every key would fail — the banner asks to configure it first.
    if (!force && catApiStatus !== 'configured') return;
    setCatSettingValidation((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = 'checking';
      return next;
    });
    const invalidKeys: string[] = [];
    await Promise.all(
      keys.map(async (key) => {
        try {
          await apiClient.get(`/cat-settings/fetch-from-cat/${encodeURIComponent(key)}`);
          setCatSettingValidation((prev) => ({ ...prev, [key]: 'ok' }));
        } catch {
          invalidKeys.push(key);
          setCatSettingValidation((prev) => ({ ...prev, [key]: 'error' }));
        }
      })
    );
    if (invalidKeys.length > 0) {
      DevnutToast.warning(
        t(
          'upload.missingCatSettings.toast.invalidKeys',
          'Some CAT settings were not found on the CAT API'
        ),
        invalidKeys.join(', ')
      );
    }
  };

  const handleCatApiSaved = async () => {
    setIsCatApiDialogOpen(false);
    const configured = await fetchCatApiStatus();
    if (configured && missingCatSettings.length > 0) {
      void validateMissingCatSettings(missingCatSettings, true);
    }
  };

  const handleCreateMissingCatSettings = async () => {
    setIsCreatingCatSettings(true);
    try {
      // Dedupe by settingKey — the same key can legitimately appear for several
      // (scale, group) pairs (e.g. a scale using the same setting across all groups).
      const byKey = new Map(missingCatSettings.map((m) => [m.settingKey, m]));
      const res = await apiClient.post('/cat-settings/bulk', {
        settings: [...byKey.values()].map((m) => ({
          // Just the scale name — no "(Group X)" suffix (the group is already
          // tracked structurally, not part of the setting's display name).
          name: m.scaleCode,
          setting_key: m.settingKey,
        })),
      });
      const failed: { setting_key: string; error: string }[] = res.data?.data?.failed ?? [];
      const failedKeys = new Set(failed.map((f) => f.setting_key));
      // Only drop the ones actually created (or already existing) from the
      // banner — anything the CAT API fetch failed for stays listed, still
      // marked invalid, so the admin sees exactly what still needs fixing.
      setMissingCatSettings((prev) => prev.filter((m) => failedKeys.has(m.settingKey)));
      setCatSettingValidation((prev) => {
        const next = { ...prev };
        for (const f of failed) next[f.setting_key] = 'error';
        return next;
      });
      const createdCount = byKey.size - failedKeys.size;
      if (failed.length === 0) {
        DevnutToast.success(
          t('upload.missingCatSettings.toast.success', {
            count: createdCount,
            defaultValue: '{{count}} CAT settings created',
          })
        );
      } else {
        DevnutToast.warning(
          t('upload.missingCatSettings.toast.partial', {
            created: createdCount,
            failed: failed.length,
            defaultValue: '{{created}} CAT settings created, {{failed}} failed',
          }),
          failed.map((f) => `${f.setting_key}: ${f.error}`).join('\n')
        );
      }
    } catch (error: any) {
      // Banner left as-is — importDynamic will still auto-create these on upload
      DevnutToast.error(
        t('upload.missingCatSettings.toast.error', 'Unable to create the CAT settings'),
        error?.response?.data?.message ?? error?.message
      );
    } finally {
      setIsCreatingCatSettings(false);
    }
  };

  const handleFileChange = async (file: File | null) => {
    setSheetNames([]);
    setSheets({});
    setActiveSheet('');
    setSheetValidation(null);
    setLanguageDiff(null);
    setMissingCatSettings([]);
    setCatSettingValidation({});
    setMissingScaleMappings([]);
    if (!file) return;

    setIsPreviewing(true);
    try {
      const { names, sheets: allSheets } = await readWorkbookSheets(file);
      setSheetNames(names);
      setSheets(allSheets);
      setActiveSheet(names[0] ?? '');
      if (kitType) {
        setSheetValidation(validateSheets(kitType, names, allSheets));
      }
      setLanguageDiff(await checkWorkbookLanguages(allSheets));
      if (kitType === KitVersionTypeEnum.Cat) {
        await handleCheckMissingCatSettings(allSheets);
        setMissingScaleMappings(validateScaleSettingsCoverage(allSheets));
      }
    } finally {
      setIsPreviewing(false);
    }
  };

  // Changing 'type' invalidates everything derived from the previously uploaded file
  // (sheets belong to a different template) — clear the file field and every preview/
  // validation state.
  useEffect(() => {
    form.setValue('file', undefined as unknown as File);
    handleFileChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitType]);

  const handleSubmit = async (values: KitVersionUpload) => {
    if (hasSheetErrors || hasLanguageErrors) return;

    const fileContent = await fileToBase64(values.file);

    start();
    try {
      await apiClient.post(
        '/kit-versions',
        {
          name: values.name,
          is_active: true,
          question_kind: values.type,
          fileContent,
          fileName: values.file.name,
          auto_create_modules: true,
          cat_item_bank_id: values.cat_item_bank_id,
        },
        { timeout: 0 }
      );
      const moduleTypeGroup =
        values.type === KitVersionTypeEnum.SocioDemo || values.type === KitVersionTypeEnum.Feedback
          ? ModuleTypeGroupEnum.AdditionalModule
          : ModuleTypeGroupEnum.KitModule;

      succeed();
      setTimeout(() => navigate('/module-library', { state: { moduleTypeGroup } }), 800);
    } finally {
      finish();
    }
  };

  const watchedFile = form.watch('file');

  const handleUploadClick = async (submit: () => void) => {
    const valid = await form.trigger();
    // zod v4 skips the object-level superRefine (cat_item_bank_id required for cat)
    // while other fields still have issues — check it explicitly so its error shows too.
    const bankMissing = kitType === KitVersionTypeEnum.Cat && !form.getValues('cat_item_bank_id');
    if (bankMissing) {
      form.setError('cat_item_bank_id', {
        message: t(
          'upload.catItemBankRequired',
          'CAT item bank is required for dynamic kit versions'
        ),
      });
    }
    if (valid && !bankMissing) submit();
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
            {t('upload.uploading', 'Processing your kit version...')}
          </DialogTitle>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-lg font-semibold">
              {uploadProgress >= 100
                ? t('upload.done', 'Kit saved!')
                : t('upload.uploading', 'Processing your kit version...')}
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

      <LoadingDialog
        open={isCreatingCatSettings}
        title={t('upload.missingCatSettings.creatingDialog.title', 'Creating CAT settings...')}
        description={t(
          'upload.missingCatSettings.creatingDialog.description',
          'Fetching each configuration from the CAT API. Please do not close this page.'
        )}
      />

      {/* Kept outside the upload <Form>: React events bubble through portals, so the
          CAT API form's submit would otherwise also reach the kit upload onSubmit. */}
      <Dialog open={isCatApiDialogOpen} onOpenChange={setIsCatApiDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>{t('upload.catApiDialogTitle', 'Configure CAT API')}</DialogTitle>
          <ItemLoader<CatApiSettingsValues> url="/settings/cat-api">
            {(item) => <CatApiSettingsForm initialValues={item} onSaved={handleCatApiSaved} />}
          </ItemLoader>
        </DialogContent>
      </Dialog>

      <DevnutSection.Grid>
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button
            variant="link"
            onClick={() => navigate('/module-library')}
            className="text-black p-0!"
            aria-label={t('common:buttons.values.back')}
          >
            <ChevronLeft />
          </Button>
          <h2 className="text-lg font-semibold">{t('upload.title')}</h2>
        </div>

        {/* Form */}
        <Form
          {...form}
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-8"
          messages={{ error: t('upload.error.title') }}
          submitter={{
            className: 'self-end',
            render: (helpers) => (
              <FormSubmitter type="default" onBack={() => navigate('/module-library')}>
                <DevnutButton
                  type="button"
                  onClick={() => void handleUploadClick(helpers.submit)}
                  disabled={
                    hasSheetErrors ||
                    hasCatSettingKeyErrors ||
                    hasLanguageErrors ||
                    hasCatPrerequisiteMissing ||
                    isUploading ||
                    !watchedFile ||
                    helpers.isSubmitting
                  }
                >
                  {t('upload.submit')}
                </DevnutButton>
              </FormSubmitter>
            ),
          }}
        >
          <DevnutSection.Grid className="md:grid-cols-2 md:gap-24">
            <DevnutSection.Grid>
              <FormField label={t('common.name.label')} required>
                <FormFieldController name="name" type="text" placeholder={t('common.name.label')} />
              </FormField>

              <FormField label={t('common.type.label')} required>
                <FormFieldController
                  type="select"
                  name="type"
                  placeholder={t('common.type.label')}
                  options={valueOptions.kitVersionType}
                />
              </FormField>

              {kitType === KitVersionTypeEnum.Cat &&
                (catItemBanksStatus === 'error' ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>
                      {t('upload.catItemBankLoadError', 'Unable to load CAT item banks')}
                    </AlertTitle>
                    <AlertDescription>
                      <Button type="button" variant="outline" size="sm" onClick={fetchCatItemBanks}>
                        {t('upload.catItemBankRetry', 'Retry')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : catItemBanksStatus === 'ready' && catItemBankOptions.length === 0 ? (
                  <Alert>
                    <AlertTriangle />
                    <AlertTitle>
                      {t('upload.catItemBankEmpty.title', 'No CAT item bank configured')}
                    </AlertTitle>
                    <AlertDescription>
                      <p>
                        {t(
                          'upload.catItemBankEmpty.description',
                          'A CAT kit version requires an active CAT item bank. Create one first, you will be brought back here afterwards.'
                        )}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-2"
                        onClick={handleCreateCatItemBank}
                      >
                        <Plus className="size-4 mr-2" />
                        {t('upload.catItemBankEmpty.cta', 'Create CAT item bank')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <FormField label={t('upload.catItemBank', 'CAT Item Bank')} required>
                    <FormFieldController
                      type="select"
                      name="cat_item_bank_id"
                      placeholder={t('upload.catItemBank', 'CAT Item Bank')}
                      options={catItemBankOptions}
                      readonly={catItemBanksStatus === 'loading'}
                    />
                  </FormField>
                ))}

              {kitType === KitVersionTypeEnum.Cat && catApiStatus === 'missing' && (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>
                    {t('upload.catApiMissing.title', 'CAT API not configured')}
                  </AlertTitle>
                  <AlertDescription>
                    <p>
                      {t(
                        'upload.catApiMissing.description',
                        'CAT kit versions need the CAT API credentials to fetch the CAT settings configuration.'
                      )}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      onClick={() => setIsCatApiDialogOpen(true)}
                    >
                      <Settings className="size-4 mr-2" />
                      {t('upload.catApiMissing.cta', 'Configure CAT API')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {kitType === KitVersionTypeEnum.Cat && catApiStatus === 'error' && (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>
                    {t('upload.catApiLoadError', 'Unable to load the CAT API configuration')}
                  </AlertTitle>
                  <AlertDescription>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchCatApiStatus()}
                    >
                      {t('upload.catItemBankRetry', 'Retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {kitType && (
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
              )}
            </DevnutSection.Grid>

            <FormField>
              <FormFieldController
                name="file"
                type="file"
                readonly={hasCatPrerequisiteMissing}
                otherText={t('upload.file.placeholder')}
                onFileChange={(file) => {
                  handleFileChange(file);
                }}
              />
            </FormField>
          </DevnutSection.Grid>
        </Form>

        {/* Preview — validation banners and sheets right below the form */}
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

                {/* Scale/group mapping banner (dynamic type only) — informational, not
                    blocking: an IRT scale with no setting_key for its group is handled
                    as a fixed question instead of an adaptive one (see backend). */}
                {hasMissingScaleMappings && (
                  <AlertMessage.MissingScaleMapping missing={missingScaleMappings} />
                )}

                {/* Missing CAT settings banner (dynamic type only) — non-blocking, the
                    upload will auto-create these anyway if left unaddressed here. */}
                {missingCatSettings.length > 0 && (
                  <AlertMessage.MissingCatSettings
                    missing={missingCatSettings}
                    validation={catSettingValidation}
                    onCreate={handleCreateMissingCatSettings}
                    onRetryValidation={() => validateMissingCatSettings(missingCatSettings)}
                    isCreating={isCreatingCatSettings}
                    catApiMissing={catApiStatus !== 'configured'}
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
                    {sheetValidation.extra.map((name) => (
                      <AlertMessage.Extra key={name} name={name} />
                    ))}
                    {sheetValidation.valid.map((sheetName) => {
                      const col = sheetValidation.columns[sheetName];
                      if (
                        !col ||
                        (col.typos.length === 0 &&
                          col.missing.length === 0 &&
                          col.duplicates.length === 0 &&
                          col.invalidInValues.length === 0 &&
                          col.invalidBounds.length === 0)
                      )
                        return null;
                      return (
                        <AlertMessage.ColumnError
                          key={sheetName}
                          sheetName={sheetName}
                          typos={col.typos}
                          missing={col.missing}
                          duplicates={col.duplicates}
                          invalidInValues={col.invalidInValues}
                          invalidBounds={col.invalidBounds}
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
                  invalidCatSettingKeys={invalidCatSettingKeys}
                />
              </div>
            )}
          </DevnutSection.Grid>
        )}
      </DevnutSection.Grid>
    </div>
  );
};
