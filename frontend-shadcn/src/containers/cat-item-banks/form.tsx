import { DevnutBadgeList } from '@/components/DevnutBadgeList';
import { DevnutItemList } from '@/components/DevnutItemList';
import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { Separator } from '@/components/ui/separator';
import {
  zFormFieldsCatItemBankCreate,
  zFormFieldsCatItemBankEdit,
  type FormFieldsCatItemBank,
} from '@/features/schema/cat-item-banks/schema';
import { useValueEnum } from '@/hooks/useValueEnum';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ItemBankQuestionnaireTable } from './_components/item-bank-questionnaire-table';

export const CatItemBankForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['management', 'common']);
  const { valueOptions } = useValueEnum();

  const isReadOnly = props.readonly;
  const isEdit = !!initialValues?.id && !isReadOnly;
  const languages: any[] = [...(initialValues?.languages ?? [])].sort((a, b) =>
    a.language.localeCompare(b.language)
  );
  const questions: any[] = initialValues?.questions ?? [];
  const modules: any[] = initialValues?.modules ?? [];

  const form = useForm<FormFieldsCatItemBank>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(isEdit ? zFormFieldsCatItemBankEdit() : zFormFieldsCatItemBankCreate()),
    defaultValues: {
      ...initialValues,
      // CatItemBankResource returns `isActive` (camelCase); the field itself is
      // `is_active` to match the PATCH payload the backend expects — map it here.
      is_active: initialValues?.isActive ?? initialValues?.is_active,
    },
  });

  // Real bank creation now happens via the dedicated /cat-item-banks/upload
  // route (backend requires a file at create time) — this create branch stays
  // only as CrudDataTable's generic create fallback (name/description only).
  return (
    <DevnutSection.Grid className="gap-8">
      <Form
        {...form}
        {...props}
        initialValues={initialValues}
        className="w-full flex flex-col gap-8"
      >
        <DevnutSection.Grid className="gap-4">
          <FormField label={t('cat_item_banks.form.name')} required>
            <FormFieldController name="name" type="text" />
          </FormField>

          <FormField label={t('cat_item_banks.form.description')}>
            <FormFieldController name="description" type="text" />
          </FormField>

          {isEdit && (
            <FormField label={t('cat_item_banks.form.is_active')}>
              <FormFieldController type="select" name="is_active" options={valueOptions.active} />
            </FormField>
          )}

          {isReadOnly && (
            <div>
              <DevnutBadgeList
                label={t('cat_item_banks.detail.modules')}
                items={modules}
                getKey={(module) => module.id}
                getText={(module) => module.name}
                emphasized
              />

              <Separator className="mt-2" />
            </div>
          )}

          <DevnutBadgeList
            label={t('common.languages.label', 'Languages')}
            items={languages}
            getKey={(lang) => lang.id}
            getText={(lang) => lang.language}
            emphasized={!isEdit}
          />
        </DevnutSection.Grid>
      </Form>

      {/* Outside <Form>: the read-only fieldset would disable the table controls */}
      {!isEdit && initialValues?.id && (
        <DevnutSection.Segmented
          keyName="cat_item_bank_detail"
          items={[
            {
              key: 'used-in',
              label: t('common.usage.title'),
              children: <ItemBankQuestionnaireTable bankId={initialValues.id} />,
            },
            {
              key: 'questions',
              label: t('cat_item_banks.detail.view_questions'),
              children: (
                <DevnutItemList
                  emptyText={t('cat_item_banks.detail.no_questions')}
                  items={questions}
                  getKey={(q) => q.id}
                  getText={(q) => q.questionText || q.questionCode}
                />
              ),
            },
          ]}
        />
      )}
    </DevnutSection.Grid>
  );
};
