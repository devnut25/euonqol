import { zQuestionnaire, type Questionnaire } from '@/features/schema/questionnaire/schema';
import type { Values } from '@/hooks/useCrudDataTable';
import { AccessModeEnum, QuestionnaireStatusEnum } from '@/utils/enum';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

export type { Questionnaire };

export function useQuestionnaireForm(
  initialValues: Values | undefined,
  surveyAccessMode?: string,
  surveyStatus?: string
) {
  const isEdit = !!initialValues?.id;

  const isAnonymousSpontaneous = surveyAccessMode === AccessModeEnum.AnonymousSpontaneous;

  // Traced / AnonymousOnInvitation: locked once patients are assigned.
  const hasAssignedPatients = isEdit && Number(initialValues?.totalAssignments ?? 0) > 0;

  // AnonymousSpontaneous: no assignments possible; locked once a public link exists.
  const hasPublicLink = isEdit && !!(initialValues as any)?.has_public_link;

  // Combined lock used by the stepper/fields - access mode decides which signal applies.
  const isQuestionnaireLocked = isAnonymousSpontaneous ? hasPublicLink : hasAssignedPatients;

  // Modules can only be added/removed/reordered while the questionnaire is still a draft.
  // New questionnaires are always draft; existing ones gate on their current status.
  const canEditModules = !isEdit || (initialValues?.status as string | undefined) === 'draft';

  const defaultModules = initialValues?.modules
    ? (initialValues.modules as any[]).map((m: any) => ({
        moduleId:
          m.module?.id != null
            ? String(m.module.id)
            : m.moduleId != null
              ? String(m.moduleId)
              : null,
        type: m.module?.type ?? '',
        // UI-only fallback label: the module library only lists active modules, so a
        // module disabled after being added here would otherwise render as an empty box.
        name: m.module?.name ?? '',
      }))
    : [{ moduleId: null, type: '', name: '' }];

  const form = useForm<Questionnaire>({
    mode: 'onSubmit',
    resolver: zodResolver(zQuestionnaire()),
    defaultValues: {
      title: (initialValues?.title as string) ?? '',
      description: (initialValues?.description as string) ?? '',
      patient_group_id: initialValues?.patient_group
        ? String((initialValues.patient_group as any).id)
        : initialValues?.patient_group_id
          ? String(initialValues.patient_group_id)
          : '',
      type: (initialValues?.type as Questionnaire['type']) ?? 'static',
      status: (initialValues?.status as Questionnaire['status']) ?? 'draft',
      modules: defaultModules,
      ctt_norms_version_id: (initialValues as any)?.ctt_norms_version_id
        ? String((initialValues as any).ctt_norms_version_id)
        : '',
      max_completions: (initialValues as any)?.max_completions ?? null,
      has_static_module: false,
      hasKitModule: false,
    },
  });

  const selectedNormsId = useWatch({ control: form.control, name: 'ctt_norms_version_id' });
  const selectedModules = useWatch({ control: form.control, name: 'modules' });
  const statusValue = useWatch({ control: form.control, name: 'status' });

  // AnonymousSpontaneous questionnaires have no independent status: they inherit/follow
  // the survey's own status since the public link plays the role of "assignment".
  const effectiveStatus = isAnonymousSpontaneous
    ? surveyStatus
    : ((statusValue as string | undefined) ?? (initialValues?.status as string | undefined));

  const isCompleted = effectiveStatus === QuestionnaireStatusEnum.Completed;

  const hasStaticModule = selectedModules?.some((m) => m.type === 'static');
  const hasKitModule = selectedModules?.some((m) => m.type === 'static' || m.type === 'dynamic');
  const detectedType: 'static' | 'dynamic' = selectedModules?.some((m) => m.type === 'dynamic')
    ? 'dynamic'
    : 'static';

  useEffect(() => {
    form.setValue('type', detectedType, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedType]);

  useEffect(() => {
    form.setValue('has_static_module', !!hasStaticModule, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStaticModule]);

  useEffect(() => {
    form.setValue('hasKitModule', !!hasKitModule, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKitModule]);

  return {
    form,
    isEdit,
    isQuestionnaireLocked,
    canEditModules,
    isAnonymousSpontaneous,
    selectedModules,
    detectedType,
    hasStaticModule,
    hasKitModule,
    selectedNormsId,
    effectiveStatus,
    isCompleted,
  };
}
