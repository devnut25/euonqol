import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { UploadSheetErrorMessageEnum } from '@/utils/enum';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { InvalidBoundsRow } from '../_helpers/validation';

const alertConfig: Record<
  UploadSheetErrorMessageEnum,
  {
    icon: React.ElementType;
    variant?: 'destructive' | 'default';
  }
> = {
  typo: {
    icon: AlertTriangle,
  },
  missing: {
    icon: XCircle,
  },
  col_error: {
    icon: AlertTriangle,
  },
  language_diff: {
    icon: Info,
    variant: 'default',
  },
  missing_cat_settings: {
    icon: Info,
    variant: 'default',
  },
  missing_scale_mapping: {
    icon: Info,
    variant: 'default',
  },
  extra_sheet: {
    icon: AlertTriangle,
  },
};

interface AlertMessageProps {
  type: UploadSheetErrorMessageEnum;
  title?: React.ReactNode;
  children: React.ReactNode;
}

function CommonAlertMessage({ type, title, children }: AlertMessageProps) {
  const config = alertConfig[type];
  const Icon = config.icon;

  return (
    <Alert variant={config.variant ?? 'destructive'} className="py-2">
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

interface TypoMessageProps {
  found: string;
  expected: string;
}

function TypoMessage({ found, expected }: TypoMessageProps) {
  const { t } = useTranslation('management');

  return (
    <CommonAlertMessage
      title={t('alert_messages.missing')}
      type={UploadSheetErrorMessageEnum.TypoSheet}
    >
      <Trans
        ns="management"
        i18nKey="alert_messages.typo_description"
        values={{ found, expected }}
        components={{ strong: <strong /> }}
      />
    </CommonAlertMessage>
  );
}

interface MissingMessageProps {
  name: string;
}

function MissingMessage({ name }: MissingMessageProps) {
  const { t } = useTranslation('management');

  return (
    <CommonAlertMessage
      title={t('alert_messages.missing')}
      type={UploadSheetErrorMessageEnum.MissingSheet}
    >
      <Trans
        ns="management"
        i18nKey="alert_messages.missing_description"
        values={{ name }}
        components={{ strong: <strong /> }}
      />
    </CommonAlertMessage>
  );
}

interface ColErrorMessageProps {
  sheetName: string;
  typos: { found: string; expected: string }[];
  missing: string[];
  duplicates: string[];
  extra?: string[];
  invalidInValues?: { row: number; value: string }[];
  invalidBounds?: InvalidBoundsRow[];
}

function ColError({
  sheetName,
  typos,
  missing,
  duplicates,
  extra,
  invalidInValues,
  invalidBounds,
}: ColErrorMessageProps) {
  return (
    <CommonAlertMessage
      type={UploadSheetErrorMessageEnum.ColumnError}
      title={
        <Trans
          ns="management"
          i18nKey="alert_messages.column_error"
          values={{ sheetName }}
          components={{ strong: <strong /> }}
        />
      }
    >
      <div className="flex flex-col gap-1 mt-1">
        {typos.map(({ found, expected }) => (
          <span key={found}>
            <Trans
              ns="management"
              i18nKey="alert_messages.column_error_typo_description"
              values={{ found, expected }}
              components={{ strong: <strong /> }}
            />
          </span>
        ))}
        {missing.map((c) => (
          <span key={c}>
            <Trans
              ns="management"
              i18nKey="alert_messages.column_error_missing_description"
              values={{ col: c }}
              components={{ strong: <strong /> }}
            />
          </span>
        ))}
        {duplicates.map((c) => (
          <span key={`dup-${c}`}>
            <Trans
              ns="management"
              i18nKey="alert_messages.column_error_duplicate_description"
              values={{ col: c }}
              components={{ strong: <strong /> }}
            />
          </span>
        ))}
        {extra &&
          extra.map((c) => (
            <span key={`extra-${c}`}>
              <Trans
                ns="management"
                i18nKey="alert_messages.column_error_extra_description"
                values={{ col: c }}
                components={{ strong: <strong /> }}
              />
            </span>
          ))}
        {invalidInValues &&
          invalidInValues.map(({ row, value }) => (
            <span key={`in-${row}`}>
              <Trans
                ns="management"
                i18nKey="alert_messages.invalid_in_value_description"
                values={{ row, value }}
                components={{ strong: <strong /> }}
              />
            </span>
          ))}
        {invalidBounds &&
          invalidBounds.map(({ row, column, value, reason }) => (
            <span key={`bounds-${row}-${column}-${reason}`}>
              <Trans
                ns="management"
                i18nKey={`alert_messages.invalid_bounds_${reason}`}
                values={{ row, column, value }}
                components={{ strong: <strong /> }}
              />
            </span>
          ))}
      </div>
    </CommonAlertMessage>
  );
}

interface ExtraSheetMessageProps {
  name: string;
}

function ExtraSheetMessage({ name }: ExtraSheetMessageProps) {
  const { t } = useTranslation('management');

  return (
    <CommonAlertMessage
      title={t('alert_messages.extra_sheet')}
      type={UploadSheetErrorMessageEnum.ExtraSheet}
    >
      <Trans
        ns="management"
        i18nKey="alert_messages.extra_sheet_description"
        values={{ name }}
        components={{ strong: <strong /> }}
      />
    </CommonAlertMessage>
  );
}

interface LanguageDiffMessageProps {
  onlyInDb: { id: number; language: string }[];
  onlyInFile: { id: number; language: string }[];
  changed: {
    id: number;
    language: string;
    changes: { field: string; fileValue: string; dbValue: string }[];
  }[];
}

const LANG_DIFF_THRESHOLD = 5;

function LanguageDiffMessage({ onlyInDb, onlyInFile, changed }: LanguageDiffMessageProps) {
  const { t } = useTranslation('management');
  const totalItems = onlyInFile.length + onlyInDb.length + changed.length;
  const shouldCollapse = totalItems > LANG_DIFF_THRESHOLD;

  const listContent = (
    <div className="flex flex-col gap-1 mt-1">
      {onlyInFile.map((l) => (
        <span key={`file-${l.id}`}>
          <Trans
            ns="management"
            i18nKey="alert_messages.language_diff_only_in_file"
            values={{ id: l.id, language: l.language }}
            components={{ strong: <strong /> }}
          />
        </span>
      ))}
      {onlyInDb.map((c) => (
        <span key={`db-${c.id}`}>
          <Trans
            ns="management"
            i18nKey="alert_messages.language_diff_only_in_db"
            values={{ id: c.id, language: c.language }}
            components={{ strong: <strong /> }}
          />
        </span>
      ))}
      {changed.map((entry) => (
        <div key={`changed-${entry.id}`} className="flex flex-col gap-0.5">
          <span>
            <Trans
              ns="management"
              i18nKey="alert_messages.language_diff_changed"
              values={{ id: entry.id, language: entry.language }}
              components={{ strong: <strong /> }}
            />
          </span>
          {entry.changes.map((c) => (
            <span key={c.field} className="pl-4">
              <Trans
                ns="management"
                i18nKey="alert_messages.language_diff_changed_field"
                values={{ field: c.field, fileValue: c.fileValue, dbValue: c.dbValue }}
                components={{ strong: <strong /> }}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <CommonAlertMessage
      type={UploadSheetErrorMessageEnum.LanguageDiff}
      title={t('alert_messages.language_diff')}
    >
      {shouldCollapse ? (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-sm font-medium">
            {t('alert_messages.language_diff_show_all', { count: totalItems })}
          </summary>
          {listContent}
        </details>
      ) : (
        listContent
      )}
    </CommonAlertMessage>
  );
}

export type CatSettingValidationStatus = 'checking' | 'ok' | 'error';

interface MissingCatSettingsMessageProps {
  missing: { scaleCode: string; group: string; settingKey: string }[];
  validation: Record<string, CatSettingValidationStatus>;
  onCreate: () => void;
  onRetryValidation: () => void;
  isCreating: boolean;
  // CAT API credentials not configured: keys can't be checked nor created yet.
  catApiMissing?: boolean;
}

function MissingCatSettingsMessage({
  missing,
  validation,
  onCreate,
  onRetryValidation,
  isCreating,
  catApiMissing = false,
}: MissingCatSettingsMessageProps) {
  const { t } = useTranslation('management');

  const keys = [...new Set(missing.map((m) => m.settingKey))];
  const isValidating = keys.some((k) => validation[k] === undefined || validation[k] === 'checking');
  const hasInvalid = keys.some((k) => validation[k] === 'error');
  const canCreate = !catApiMissing && !isValidating && !hasInvalid;

  return (
    <CommonAlertMessage
      type={UploadSheetErrorMessageEnum.MissingCatSettings}
      title={t('upload.missingCatSettings.title', 'CAT settings not yet in the database')}
    >
      <div className="flex flex-col gap-2 mt-1">
        <p>
          {t(
            'upload.missingCatSettings.description',
            'The following CAT settings referenced by the "CatSettings" sheet must be fetched from the CAT API before they can be saved. Each key below is checked against the CAT service; only once every key succeeds can they be created.'
          )}
        </p>
        {/* Polite live region: each key's check result is announced as it lands. */}
        <ul className="list-disc pl-4" aria-live="polite">
          {missing.map((m) => {
            const status = validation[m.settingKey];
            return (
              <li key={`${m.scaleCode}-${m.group}-${m.settingKey}`} className="flex items-center gap-1.5">
                <strong>{m.scaleCode}</strong> ({m.group}) → {m.settingKey}
                {catApiMissing ? null : status === 'checking' || status === undefined ? (
                  <>
                    <Loader2
                      className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Checking</span>
                  </>
                ) : status === 'ok' ? (
                  <>
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span className="sr-only">Found</span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                    <span className="sr-only">Not found</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {catApiMissing && (
          <p className="text-sm text-destructive">
            {t(
              'upload.missingCatSettings.catApiRequired',
              'Configure the CAT API first: these keys can only be checked and created once the CAT API credentials are set.'
            )}
          </p>
        )}
        {!catApiMissing && hasInvalid && (
          <p className="text-sm text-destructive">
            {t(
              'upload.missingCatSettings.invalidHint',
              'One or more setting keys could not be found on the CAT API — fix the key or retry once the CAT service is reachable.'
            )}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={isCreating || !canCreate}
            onClick={onCreate}
          >
            {isCreating
              ? t('upload.missingCatSettings.creating', 'Creating…')
              : !catApiMissing && isValidating
                ? t('upload.missingCatSettings.checking', 'Checking CAT API…')
                : t('upload.missingCatSettings.button', 'Create Missing CAT Settings')}
          </Button>
          {!catApiMissing && hasInvalid && (
            <Button type="button" variant="ghost" size="sm" onClick={onRetryValidation}>
              {t('upload.missingCatSettings.retry', 'Retry check')}
            </Button>
          )}
        </div>
      </div>
    </CommonAlertMessage>
  );
}

interface MissingScaleMappingMessageProps {
  missing: { scaleCode: string; group: string }[];
}

function MissingScaleMappingMessage({ missing }: MissingScaleMappingMessageProps) {
  const { t } = useTranslation('management');
  // Collapsed by default — this is informational/non-blocking (see the
  // description below) and was previously always fully expanded as the very
  // first thing shown in the preview, pushing down the banners that actually
  // need attention. Expand on request via the chevron instead.
  const [open, setOpen] = useState(false);

  return (
    <CommonAlertMessage
      type={UploadSheetErrorMessageEnum.MissingScaleMapping}
      title={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left cursor-pointer"
        >
          <span className="flex-1">
            {t('upload.missingScaleMapping.title', 'IRT scales without a CAT setting')} ({missing.length})
          </span>
          {open ? (
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
          )}
        </button>
      }
    >
      {open && (
        <div className="flex flex-col gap-2 mt-1">
          <p>
            {t(
              'upload.missingScaleMapping.description',
              'The following ScaleCode/group combinations are used by active IRT questions in the "Questions" sheet but have no setting_key in "CatSettings". This is not blocking: these questions will be presented to patients in fixed order (like static questions) instead of adaptively, and their IRT score will still be computed at completion via a direct CAT call.'
            )}
          </p>
          <ul className="list-disc pl-4">
            {missing.map((m) => (
              <li key={`${m.scaleCode}-${m.group}`}>
                <strong>{m.scaleCode}</strong> ({m.group})
              </li>
            ))}
          </ul>
        </div>
      )}
    </CommonAlertMessage>
  );
}

const AlertMessage = {
  Typo: TypoMessage,
  Missing: MissingMessage,
  ColumnError: ColError,
  LanguageDiff: LanguageDiffMessage,
  MissingCatSettings: MissingCatSettingsMessage,
  MissingScaleMapping: MissingScaleMappingMessage,
  Extra: ExtraSheetMessage,
};

export { AlertMessage };
