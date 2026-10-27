import { DevnutBadgeList } from '@/components/DevnutBadgeList';
import { DevnutItemList } from '@/components/DevnutItemList';
import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { zModuleEdit, type ModuleEdit } from '@/features/schema/module-library/schema';
import { useValueEnum } from '@/hooks/useValueEnum';
import { ModuleKindEnum } from '@/utils/enum';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ModuleQuestionnaireTable } from './_components/module-questionnaire-table';

export const ModuleForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['management']);
  const { valueOptions } = useValueEnum();

  const languages: any[] = [...(initialValues?.languages ?? [])].sort((a, b) =>
    a.language.localeCompare(b.language)
  );
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
          <FormField label={t('module.common.type.label')}>
            <FormFieldController
              type="select"
              name="type"
              options={valueOptions.moduleType}
              disabled
            />
          </FormField>
          <FormField label={t('module.common.is_active.label')}>
            <FormFieldController type="select" name="is_active" options={valueOptions.active} />
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
          {initialValues?.type === ModuleKindEnum.Dynamic && (
            <FormField label={t('module.common.item_bank.label')}>
              <FormFieldController type="text" name="cat_item_bank.name" disabled />
            </FormField>
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

      {!isEdit && initialValues?.id && (
        <DevnutSection.Segmented
          keyName="module_detail"
          items={[
            {
              key: 'used-in',
              label: t('common.usage.title'),
              children: <ModuleQuestionnaireTable moduleId={initialValues.id} />,
            },
            {
              key: 'questions',
              label: t('module.detail.view_questions'),
              children: (
                <DevnutItemList
                  emptyText={t('module.detail.no_questions')}
                  items={questions}
                  getKey={(q) => q.moduleQuestionId}
                  getText={(q) => q.questionText || q.questionCode}
                  getActive={(q) => q.isActive}
                />
              ),
            },
          ]}
        />
      )}
    </DevnutSection.Grid>
  );
};
