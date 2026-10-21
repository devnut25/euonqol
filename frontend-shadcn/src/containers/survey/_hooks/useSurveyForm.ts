import { zSurveyCreate, zSurveyEdit, type Survey } from '@/features/schema/survey/schema';
import type { Values } from '@/hooks/useCrudDataTable';
import { SendModeEnum, SurveyStatusEnum } from '@/utils/enum';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

export function useSurveyForm(initialValues: Values | undefined) {
  const isEdit = !!initialValues?.id;

  const form = useForm<Survey>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(isEdit ? zSurveyEdit() : zSurveyCreate()),
    defaultValues: {
      name: initialValues?.name ?? '',
      starting_date: initialValues?.starting_date
        ? new Date(initialValues.starting_date as string).toISOString().split('T')[0]
        : '',
      end_date: initialValues?.end_date
        ? new Date(initialValues.end_date as string).toISOString().split('T')[0]
        : '',
      reminder: initialValues?.reminder ?? false,
      frequency_tipology: initialValues?.frequency_tipology ?? null,
      frequency: initialValues?.frequency ?? null,
      reminder_max_count: (initialValues as any)?.reminder_max_count ?? null,
      send_mode: initialValues?.send_mode ?? SendModeEnum.Manual,
      send_delay_hours: (initialValues as any)?.send_delay_hours ?? null,
      send_scheduled_at: (initialValues as any)?.send_scheduled_at
        ? new Date((initialValues as any).send_scheduled_at as string).toISOString().slice(0, 16)
        : null,
      // Create AND duplicate (isEdit = false in both, id stripped) always start as draft —
      // never inherit the source row's status when duplicating a non-draft survey.
      status: isEdit ? ((initialValues?.status as Survey['status']) ?? 'draft') : 'draft',
      access_mode: (initialValues?.access_mode as Survey['access_mode']) ?? 'traced',
      full_name: (initialValues?.full_name as string | undefined) ?? null,
      created_at: (initialValues?.created_at as string | undefined) ?? null,
      updated_at: (initialValues?.updated_at as string | undefined) ?? null,
    },
  });

  const accessModeValue = useWatch({ control: form.control, name: 'access_mode' });
  const statusValue = useWatch({ control: form.control, name: 'status' });

  const isAnonymousSpontaneous = accessModeValue === 'anonymous_spontaneous';
  const isCompleted = statusValue === SurveyStatusEnum.Completed;

  return { form, isAnonymousSpontaneous, isEdit, isCompleted };
}
