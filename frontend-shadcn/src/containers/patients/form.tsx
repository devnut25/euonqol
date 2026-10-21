// import apiClient from '@/api/client';
// import DevnutSection from '@/components/DevnutSection';
// import { Form } from '@/components/form/form';
// import { FormField } from '@/components/form/form-field';
// import { FormFieldController } from '@/components/form/form-field-controller';
// import type { FormProps } from '@/components/FormContainer';
// import { Label } from '@/components/ui/label';
// import { Separator } from '@/components/ui/separator';
// import { zPatient, type Patient } from '@/features/schema/patient/schema';
// import { useValueEnum } from '@/hooks/useValueEnum';
// import { zodResolver } from '@hookform/resolvers/zod';
// import { useEffect } from 'react';
// import { useForm } from 'react-hook-form';
// import { useTranslation } from 'react-i18next';

// function formatDate(value: string | null | undefined) {
//   if (!value) return '—';
//   return new Date(value).toLocaleDateString(undefined, {
//     year: 'numeric',
//     month: 'short',
//     day: 'numeric',
//   });
// }

// /** Simple label/value row used in View mode for non-form data */
// function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
//   return (
//     <div className="flex justify-between items-center py-1">
//       <span className="text-primary font-bold text-sm">{label}</span>
//       <span className="font-light text-sm">{children}</span>
//     </div>
//   );
// }

// export const PatientForm = ({ initialValues, readonly, ...props }: FormProps) => {
//   const { t } = useTranslation(['patients']);
//   const { valueOptions } = useValueEnum();

//   const isEdit = !!initialValues?.id;
//   // Numeric DB id used to exclude current patient from uniqueness checks
//   const excludeId = initialValues?.id as number | undefined;

//   const form = useForm<Patient>({
//     mode: 'onSubmit',
//     reValidateMode: 'onSubmit',
//     resolver: zodResolver(zPatient()),
//     defaultValues: {
//       patient_id: initialValues?.patientId ?? initialValues?.patient_id ?? '',
//       mail: initialValues?.mail ?? '',
//       phone_prefix: initialValues?.phone_prefix ?? '',
//       phone: initialValues?.phone ?? '',
//       is_active: initialValues?.isActive ?? initialValues?.is_active ?? true,
//     },
//   });

//   useEffect(() => {
//     // no-op: group loading removed
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   const checkField = async (field: 'patient_id' | 'mail', value: string) => {
//     const trimmed = value.trim();
//     if (!trimmed) return;
//     try {
//       const params: Record<string, string> = { [field]: trimmed };
//       if (excludeId) params.excludeId = String(excludeId);
//       const res = await apiClient.get('/patients/check', { params });
//       if (res.data?.exists) {
//         form.setError(field, {
//           type: 'manual',
//           message:
//             field === 'patient_id'
//               ? t('form.error_patient_id_exists', 'A patient with this ID already exists')
//               : t('form.error_mail_exists', 'A patient with this email already exists'),
//         });
//       }
//     } catch {
//       // ignore network errors during async check
//     }
//   };

//   const creatorName =
//     (initialValues?.creator?.username as string | undefined) ??
//     (initialValues?.creator?.email as string | undefined);
//   const assignmentCount = initialValues?.assignmentCount as number | undefined;
//   const sessionCount = initialValues?.sessionCount as number | undefined;

//   return (
//     <Form {...form} {...props} readonly={readonly} initialValues={initialValues} className="w-full">
//       <DevnutSection.Grid className="gap-1">
//         {/* ── Editable / readonly form fields ── */}
//         <FormField label={t('form.patient_id', 'Patient ID')} required={!readonly}>
//           <FormFieldController
//             name="patient_id"
//             type="text"
//             control={form.control}
//             readonly={isEdit && !readonly ? true : undefined}
//             onChange={() => form.clearErrors('patient_id')}
//             onBlur={(e) => checkField('patient_id', e.target.value)}
//           />
//         </FormField>

//         <FormField label={t('form.mail', 'Email')}>
//           <FormFieldController
//             name="mail"
//             type="text"
//             control={form.control}
//             onChange={() => form.clearErrors('mail')}
//             onBlur={(e) => checkField('mail', e.target.value)}
//           />
//         </FormField>

//         <div className="w-full grid grid-cols-1 md:grid-cols-4 items-start gap-2 md:gap-0">
//           <Label className="text-sm pt-2">{t('form.phone', 'Phone')}</Label>
//           <div className="md:col-span-3 flex gap-2">
//             <FormField className="w-24 shrink-0">
//               <FormFieldController
//                 name="phone_prefix"
//                 type="text"
//                 control={form.control}
//                 placeholder="+39"
//               />
//             </FormField>
//             <FormField className="flex-1">
//               <FormFieldController name="phone" type="text" control={form.control} />
//             </FormField>
//           </div>
//         </div>

//         <FormField label={t('form.is_active', 'Status')}>
//           <FormFieldController
//             type="select"
//             name="is_active"
//             control={form.control}
//             options={valueOptions.active}
//           />
//         </FormField>

//         {/* Group and access_mode fields removed — now set at questionnaire level */}

//         {/* ── View-only metadata (shown only in readonly mode) ── */}
//         {readonly && isEdit && (
//           <>
//             <Separator className="my-3" />

//             {creatorName && (
//               <InfoRow label={t('form.created_by', 'Created by')}>{creatorName}</InfoRow>
//             )}
//             <InfoRow label={t('form.created_at', 'Created at')}>
//               {formatDate(initialValues?.createdAt as string)}
//             </InfoRow>
//             <InfoRow label={t('form.updated_at', 'Last updated')}>
//               {formatDate(initialValues?.updatedAt as string)}
//             </InfoRow>

//             <Separator className="my-3" />

//             <div className="grid grid-cols-2 gap-4 text-center">
//               <div className="rounded-lg border p-3">
//                 <p className="text-2xl font-bold text-primary">{assignmentCount ?? 0}</p>
//                 <p className="text-xs text-muted-foreground mt-1">
//                   {t('form.assignment_count', 'Assignments')}
//                 </p>
//               </div>
//               <div className="rounded-lg border p-3">
//                 <p className="text-2xl font-bold text-primary">{sessionCount ?? 0}</p>
//                 <p className="text-xs text-muted-foreground mt-1">
//                   {t('form.session_count', 'Sessions')}
//                 </p>
//               </div>
//             </div>
//           </>
//         )}
//       </DevnutSection.Grid>
//     </Form>
//   );
// };
