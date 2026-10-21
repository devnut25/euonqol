import { DevnutItemList } from '@/components/DevnutItemList';
import { DevnutLanguageBadges } from '@/components/DevnutLanguageBadges';
import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { zModuleEdit, type ModuleEdit } from '@/features/schema/module-library/schema';
import { useValueEnum } from '@/hooks/useValueEnum';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export const ModuleForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['management']);
  const { valueOptions } = useValueEnum();

  const languages = initialValues?.languages ?? [];
  const questions: any[] = initialValues?.questions ?? [];
  const isReadOnly = props.readonly;
  const isEdit = !!initialValues?.id && !isReadOnly;

  const form = useForm<ModuleEdit>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zModuleEdit()),
    defaultValues: initialValues,
  });

  return (
    <DevnutSection.Grid className="gap-8">
      <Form
        {...form}
        {...props}
        initialValues={initialValues}
        className="w-full text-center flex flex-col justify-center items-center gap-12"
      >
        <DevnutSection.Grid className="place-items-center">
          <FormField label={t('module.common.name.label')}>
            <FormFieldController name="name" type="text" />
          </FormField>
          <FormField label={t('module.common.is_active.label')}>
            <FormFieldController
              type="select"
              name="is_active"
              options={valueOptions.active}
            />
          </FormField>
          <FormField label={t('module.common.group.label')}>
            <FormFieldController
              type="api-select"
              name="patient_group_id"
              getLabel={(item) => item.description}
              url="/patient-groups"
              filters={{ is_active: true }}
              placeholder={t('module.common.group.placeholder')}
              disabled={isEdit}
            />
          </FormField>
        </DevnutSection.Grid>
      </Form>

      <DevnutLanguageBadges
        languages={languages}
        label={t('common.languages.label', 'Languages')}
        emphasized={!isEdit}
      />

      <DevnutItemList
        title={t('module.detail.view_questions')}
        emptyText={t('module.detail.no_questions')}
        items={questions}
        getKey={(q) => q.moduleQuestionId}
        getText={(q) => q.questionText || q.questionCode}
        getActive={(q) => q.isActive}
      />
    </DevnutSection.Grid>
  );
};
