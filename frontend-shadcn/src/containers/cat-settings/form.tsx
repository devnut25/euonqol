import { DevnutAccordion } from '@/components/DevnutAccordion';
import { DevnutBadgeList } from '@/components/DevnutBadgeList';
import DevnutSection from '@/components/DevnutSection';
import { DevnutToast } from '@/components/DevnutToast';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  zFormFieldsCatSettingCreate,
  zFormFieldsCatSettingEdit,
  type FormFieldsCatSetting,
} from '@/features/schema/cat-settings/schema';
import { useApi } from '@/hooks/useApi';
import { zodResolver } from '@hookform/resolvers/zod';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export const CatSettingForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['management']);
  const { makeRequest } = useApi();

  const isReadOnly = props.readonly;
  const isEdit = !!initialValues?.id && !isReadOnly;
  const itemBanks: any[] = initialValues?.itemBanks ?? [];
  const scales: any[] = initialValues?.scales ?? [];
  const modules: any[] = initialValues?.modules ?? [];

  const getScaleText = (scale: any) =>
    [scale.displayName ?? scale.scaleCode, scale.patientGroup?.name].filter(Boolean).join(' · ');

  const [isFetching, setIsFetching] = useState(false);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);

  const form = useForm<FormFieldsCatSetting>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(isEdit ? zFormFieldsCatSettingEdit() : zFormFieldsCatSettingCreate()),
    defaultValues: initialValues,
  });

  const apiConfiguration = form.watch('api_configuration');
  const currentSettingKey = form.watch('setting_key');
  const saveDisabled = !isEdit && (fetchedKey === null || fetchedKey !== currentSettingKey);

  const handleFetchFromCat = async () => {
    const settingKey = currentSettingKey;
    if (!settingKey) {
      form.setError('setting_key', { message: t('cat_settings.fetch.key_required') });
      return;
    }

    setIsFetching(true);

    try {
      const data = await makeRequest(
        `/cat-settings/fetch-from-cat/${encodeURIComponent(settingKey)}`,
        'get'
      );
      form.setValue('api_configuration', data.api_configuration, { shouldDirty: true });
      setFetchedKey(settingKey);
    } catch (err: any) {
      const message = typeof err === 'string' ? err : t('cat_settings.fetch.error_generic');
      DevnutToast.error(message);
    } finally {
      setIsFetching(false);
    }
  };

  const renderFetchButtonContent = () => {
    if (isFetching) {
      return (
        <>
          <RefreshCw aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" />
          {t('cat_settings.fetch.loading')}
        </>
      );
    }

    return (
      <>
        <RefreshCw aria-hidden="true" className="w-4 h-4 mr-2" />
        {t('cat_settings.fetch.button')}
      </>
    );
  };

  return (
    <Form
      {...form}
      {...props}
      initialValues={initialValues}
      className="w-full flex flex-col gap-8"
      submitter={{
        ...props.submitter,
        submitButtonProps: {
          ...props.submitButtonProps,
          disabled: saveDisabled,
        },
      }}
    >
      <DevnutSection.Grid className="gap-6">
        <FormField label={t('cat_settings.form.name')} required>
          <FormFieldController name="name" type="text" />
        </FormField>

        <FormField label={t('cat_settings.form.description')}>
          <FormFieldController name="description" type="text" />
        </FormField>

        {!isEdit && (
          <FormField label={t('cat_settings.form.setting_key')} required>
            <FormFieldController
              name="setting_key"
              type="text"
              onChange={() => setFetchedKey(null)}
              actions={
                <Button
                  type="button"
                  variant="default"
                  className="self-start"
                  disabled={isFetching}
                  onClick={handleFetchFromCat}
                >
                  {renderFetchButtonContent()}
                </Button>
              }
            />
          </FormField>
        )}

        {isReadOnly && initialValues?.id && (
          <div>
            <DevnutBadgeList
              label={t('cat_settings.detail.item_banks')}
              items={itemBanks}
              getKey={(itemBank) => itemBank.id}
              getText={(itemBank) => itemBank.name}
              emphasized
            />

            <Separator className="mt-2" />
          </div>
        )}

        {isReadOnly && initialValues?.id && (
          <div>
            <DevnutBadgeList
              label={t('cat_settings.detail.scales')}
              items={scales}
              getKey={(s) => s.id}
              getText={getScaleText}
              emphasized
            />

            <Separator className="mt-2" />
          </div>
        )}

        {isReadOnly && initialValues?.id && (
          <DevnutBadgeList
            label={t('cat_settings.detail.modules')}
            items={modules}
            getKey={(m) => m.id}
            getText={(m) => m.name}
            emphasized
          />
        )}
      </DevnutSection.Grid>

      {/* JSON viewer: visible in view mode and create mode (after fetch) */}
      {!isEdit && apiConfiguration != null && (
        <DevnutAccordion
          defaultOpen={['api_configuration']}
          sections={[
            {
              value: 'api_configuration',
              title: t('cat_settings.form.api_configuration'),
              content: (
                <pre className="p-4 rounded-md bg-muted text-xs overflow-auto max-h-96 text-left">
                  {JSON.stringify(apiConfiguration, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      )}
    </Form>
  );
};
