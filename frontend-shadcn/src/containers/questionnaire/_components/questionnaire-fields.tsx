import DevnutSection from '@/components/DevnutSection';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { useValueEnum } from '@/hooks/useValueEnum';
import { ModuleTypeBadge } from '@/components/ModuleTypeBadge';
import { ModuleKindEnum, QuestionnaireStatusEnum } from '@/utils/enum';
import type { Control, FieldPath } from 'react-hook-form';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Questionnaire } from '../_hooks/useQuestionnaireForm';

interface FieldControlProps {
  control: Control<Questionnaire>;
}

interface GeneralFieldsProps {
  disabled?: boolean;
  isAnonymousSpontaneous?: boolean;
  isEdit?: boolean;
  effectiveStatus?: string;
}

export function GeneralFields({
  disabled,
  isAnonymousSpontaneous,
  isEdit,
  effectiveStatus,
}: GeneralFieldsProps) {
  const { t } = useTranslation(['questionnaire']);
  const { setValue } = useFormContext<Questionnaire>();
  const { valueEnum } = useValueEnum();

  // Name and max_completions stay editable in Draft/Public/Disabled — only Completed
  // locks the whole form (handled upstream via `disabled`, which the stepper sets to
  // true only when the questionnaire is completed).
  // The questionnaire's modules are chosen for a specific patient group, so the group
  // can never be changed once the questionnaire exists — not just while non-draft.
  const patientGroupDisabled = disabled || isEdit;

  // Status is only manually toggled between Public/Disabled. Draft→Public and the
  // transition to Completed happen automatically server-side, and AnonymousSpontaneous
  // questionnaires have no manual status of their own — they inherit the survey's.
  const showStatusField =
    !isAnonymousSpontaneous &&
    (effectiveStatus === QuestionnaireStatusEnum.Public ||
      effectiveStatus === QuestionnaireStatusEnum.Disabled);

  const values = [
    {
      value: QuestionnaireStatusEnum.Disabled,
      label: valueEnum.questionnaireStatus[QuestionnaireStatusEnum.Disabled],
    },
    {
      value: QuestionnaireStatusEnum.Public,
      label: valueEnum.questionnaireStatus[QuestionnaireStatusEnum.Public],
    },
  ];

  return (
    <>
      <FormField label={t('form.title.label')} required>
        <FormFieldController name="title" type="text" disabled={disabled} />
      </FormField>
      <FormField label={t('form.patient_group.label')} required>
        <FormFieldController
          type="api-select"
          name="patient_group_id"
          url="/patient-groups"
          filters={{ is_active: true }}
          getLabel={(item) => `${item.name} - ${item.description}`}
          disabled={patientGroupDisabled}
          onValueChange={() => setValue('modules', [{ moduleId: null, type: '' }])}
        />
      </FormField>
      <FormField label={t('form.max_completions.label')}>
        <FormFieldController
          name="max_completions"
          type="number"
          disabled={disabled}
          withControls
          integerOnly
        />
      </FormField>
      {showStatusField && (
        <FormField label={t('form.status.label', 'Status')} required>
          <FormFieldController name="status" type="select" options={values} disabled={disabled} />
        </FormField>
      )}
    </>
  );
}

interface ModulesFieldsProps extends FieldControlProps {
  disabled?: boolean;
}

const renderModuleLabel = (name: string, type?: string) => (
  <span className="inline-flex items-center gap-2">
    {type && <ModuleTypeBadge type={type} />}
    {name}
  </span>
);

export function ModulesFields({ control, disabled }: ModulesFieldsProps) {
  const { t } = useTranslation(['questionnaire']);
  const { setValue } = useFormContext<Questionnaire>();

  const patientGroupId = useWatch({ control, name: 'patient_group_id' });

  return (
    <FormField label={t('form.modules_section.label')} required>
      <FormFieldController
        type="list"
        name="modules"
        control={control}
        itemLabel="Module"
        itemFieldPath="moduleId"
        addButtonLabel={t('form.add_module.label')}
        defaultItem={{ moduleId: null, type: '' }}
        disabled={disabled}
      >
        {(index, _field, allValues) => {
          const otherModules = (allValues as Questionnaire['modules'])?.filter(
            (_, i) => i !== index
          );

          const otherSelectedIds = otherModules
            ?.map((m) => m.moduleId)
            .filter((id): id is string => !!id)
            .map(String);

          // A questionnaire has a single kit module: static OR dynamic, never both.
          // Once another row holds one, both kit types are hidden from this row.
          const otherHasKitModule = otherModules?.some(
            (m) => m.type === ModuleKindEnum.Static || m.type === ModuleKindEnum.Dynamic
          );
          const excludedTypes = otherHasKitModule
            ? [ModuleKindEnum.Static, ModuleKindEnum.Dynamic]
            : [];

          // The module library only lists active modules. A module that was disabled
          // after being added here would no longer be among the fetched options and
          // render as an empty box — this fallback keeps its name visible.
          const currentModule = (allValues as Questionnaire['modules'])?.[index];
          const fallbackOption =
            currentModule?.moduleId && currentModule?.name
              ? {
                  value: currentModule.moduleId,
                  label: renderModuleLabel(currentModule.name, currentModule.type),
                  textLabel: currentModule.name,
                }
              : undefined;

          // Each row gets its own field context so the selects have distinct ids and names.
          return (
            <FormField label={`Module ${index + 1}`} required>
              <FormFieldController
                type="api-select"
                name={`modules.${index}.moduleId` as FieldPath<Questionnaire>}
                control={control}
                url="/modules/all"
                filters={{
                  patient_group_id: patientGroupId,
                  is_active: true,
                  with_addition_modules: true,
                }}
                getLabel={(item) => renderModuleLabel(item.name, item.type)}
                getTextLabel={(item) => item.name}
                getValue={(item) => String(item.id)}
                hideLabel
                excludeValues={otherSelectedIds}
                excludeTypes={excludedTypes}
                disabled={disabled || !patientGroupId}
                fallbackOption={fallbackOption}
                onSelectItem={(item) =>
                  setValue(`modules.${index}.type` as FieldPath<Questionnaire>, item.type)
                }
              />
            </FormField>
          );
        }}
      </FormFieldController>
    </FormField>
  );
}

interface NormsFieldsProps {
  disabled?: boolean;
}

export function NormsFields({ disabled }: NormsFieldsProps) {
  const { t } = useTranslation(['questionnaire']);

  return (
    <DevnutSection.Grid>
      <FormField label={t('form.ctt_norms_version.label')} required>
        <FormFieldController
          type="api-select"
          name="ctt_norms_version_id"
          url="/ctt-norms/all"
          disabled={disabled}
        />
      </FormField>
    </DevnutSection.Grid>
  );
}
