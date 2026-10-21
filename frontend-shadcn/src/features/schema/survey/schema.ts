import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

const surveyBaseObject = () =>
  z.object({
    id: z.union([z.string(), z.number()]).optional(),
    name: zu.fieldText.required({ error: t('survey:form.name.required') }),
    starting_date: zu.fieldText.required({ error: t('survey:form.starting_date.required') }),
    end_date: zu.fieldText.required({ error: t('survey:form.end_date.required') }),
    reminder: z.union([z.boolean(), z.string()]).optional().nullable(),
    frequency_tipology: z.enum(['daily', 'weekly', 'monthly']).optional().nullable(),
    frequency: z.union([z.number(), z.string()]).optional().nullable(),
    reminder_max_count: z.union([z.number(), z.string()]).optional().nullable(),
    send_mode: z.enum(['manual', 'immediate', 'after_delay', 'scheduled']).default('manual'),
    send_delay_hours: z.union([z.number(), z.string()]).optional().nullable(),
    send_scheduled_at: z.string().optional().nullable(),
    status: z.enum(['draft', 'public', 'disabled', 'completed']).optional(),
    access_mode: z
      .enum(['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'])
      .optional()
      .default('traced'),
    full_name: z.string().optional().nullable(),
    created_at: z.string().optional().nullable(),
    updated_at: z.string().optional().nullable(),
  });

const dateOrderRefine = (data: { starting_date?: string; end_date?: string }) => {
  if (data.starting_date && data.end_date) {
    return new Date(data.starting_date) <= new Date(data.end_date);
  }
  return true;
};

const startingDateNotInPastRefine = (data: { starting_date?: string }) => {
  if (!data.starting_date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(data.starting_date) >= today;
};

// Defense-in-depth: the reminder=no case is already handled in the UI (RemindersFields
// clears these on change), but any submit that still carries stale frequency/reminder_max_count
// alongside reminder=false must not persist them — mirrors the DB invariant we want.
const nullifyReminderFieldsWhenInactive = <
  T extends { reminder?: boolean | string | null; frequency?: unknown; frequency_tipology?: unknown; reminder_max_count?: unknown },
>(
  data: T
): T => {
  const reminderActive = data.reminder === true || data.reminder === 'true';
  if (reminderActive) return data;
  return { ...data, frequency: null, frequency_tipology: null, reminder_max_count: null };
};

export const zSurveyCreate = () =>
  z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      name: zu.fieldText.required({ error: t('survey:form.name.required') }),
      starting_date: zu.fieldText.required({ error: t('survey:form.starting_date.required') }),
      end_date: zu.fieldText.required({ error: t('survey:form.end_date.required') }),
      reminder: z.union([z.boolean(), z.string()]).optional().nullable(),
      frequency_tipology: z.enum(['daily', 'weekly', 'monthly']).optional().nullable(),
      frequency: z.union([z.number(), z.string()]).optional().nullable(),
      reminder_max_count: z.union([z.number(), z.string()]).optional().nullable(),
      send_mode: z.enum(['manual', 'immediate', 'after_delay', 'scheduled']).default('manual'),
      send_delay_hours: z.union([z.number(), z.string()]).optional().nullable(),
      send_scheduled_at: z.string().optional().nullable(),
      status: z.enum(['draft', 'public', 'disabled', 'completed']).optional(),
      access_mode: z
        .enum(['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'])
        .optional()
        .default('traced'),
      full_name: z.string().optional().nullable(),
      created_at: z.string().optional().nullable(),
      updated_at: z.string().optional().nullable(),
    })
    .refine(dateOrderRefine, {
      message: 'Starting date must be before end date',
      path: ['end_date'],
    })
    .refine(startingDateNotInPastRefine, {
      message: 'Starting date cannot be in the past',
      path: ['starting_date'],
    })
    .superRefine((data, ctx) => {
      if (data.access_mode !== 'anonymous_spontaneous') {
        if (data.send_mode === 'after_delay' && !data.send_delay_hours) {
          ctx.addIssue({
            code: 'custom',
            message: 'Delay hours required',
            path: ['send_delay_hours'],
          });
        }
        if (data.send_mode === 'scheduled' && !data.send_scheduled_at) {
          ctx.addIssue({
            code: 'custom',
            message: 'Scheduled date required',
            path: ['send_scheduled_at'],
          });
        }
        const reminderActive = data.reminder === true || data.reminder === 'true';
        if (reminderActive) {
          if (!data.frequency) {
            ctx.addIssue({
              code: 'custom',
              message: t('survey:form.frequency.required'),
              path: ['frequency'],
            });
          }
          if (!data.frequency_tipology) {
            ctx.addIssue({
              code: 'custom',
              message: t('survey:form.frequency_tipology.required'),
              path: ['frequency_tipology'],
            });
          }
        }
      }
    })
    .transform(nullifyReminderFieldsWhenInactive);

export const zSurveyEdit = () =>
  z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      name: zu.fieldText.required({ error: t('survey:form.name.required') }),
      starting_date: zu.fieldText.required({ error: t('survey:form.starting_date.required') }),
      end_date: zu.fieldText.required({ error: t('survey:form.end_date.required') }),
      reminder: z.union([z.boolean(), z.string()]).optional().nullable(),
      frequency_tipology: z.enum(['daily', 'weekly', 'monthly']).optional().nullable(),
      frequency: z.union([z.number(), z.string()]).optional().nullable(),
      reminder_max_count: z.union([z.number(), z.string()]).optional().nullable(),
      send_mode: z.enum(['manual', 'immediate', 'after_delay', 'scheduled']).default('manual'),
      send_delay_hours: z.union([z.number(), z.string()]).optional().nullable(),
      send_scheduled_at: z.string().optional().nullable(),
      status: z.enum(['draft', 'public', 'disabled', 'completed']).optional(),
      access_mode: z
        .enum(['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'])
        .optional()
        .default('traced'),
      full_name: z.string().optional().nullable(),
      created_at: z.string().optional().nullable(),
      updated_at: z.string().optional().nullable(),
    })
    .refine(dateOrderRefine, {
      message: 'Starting date must be before end date',
      path: ['end_date'],
    })
    .transform(nullifyReminderFieldsWhenInactive);

export const zSurvey = () =>
  surveyBaseObject().refine(dateOrderRefine, {
    message: 'Starting date must be before end date',
    path: ['end_date'],
  });

export type Survey = z.input<ReturnType<typeof zSurvey>>;
