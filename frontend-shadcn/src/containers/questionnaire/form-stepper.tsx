import apiClient from '@/api/client';
import DevnutSection from '@/components/DevnutSection';
import DevnutTypography from '@/components/DevnutTypography';
import { Form } from '@/components/form/form';
import { FormSubmitterStepper } from '@/components/form/form-submitter-stepper';
import type { FormProps } from '@/components/FormContainer';
import { ItemLoader } from '@/components/ItemLoader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CttNormEntry } from '@/containers/ctt-norms/_components/norms-types';
import type { Values } from '@/hooks/useCrudDataTable';
import { AlertTriangleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StepIndicator } from '../survey/_components/step-indicator';
import { GeneralFields, ModulesFields, NormsFields } from './_components/questionnaire-fields';
import { useQuestionnaireForm } from './_hooks/useQuestionnaireForm';
import { useQuestionnaireStepper } from './_hooks/useQuestionnaireStepper';

export const QuestionnaireStepperForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['questionnaire']);

  const {
    form,
    isEdit,
    isQuestionnaireLocked,
    canEditModules,
    isAnonymousSpontaneous,
    selectedModules,
    selectedNormsId,
    effectiveStatus,
    isCompleted,
  } = useQuestionnaireForm(initialValues, props.surveyAccessMode, (props as any).surveyStatus);

  // Scale codes actually used by the questionnaire's (non-CAT) modules, so the Norms step
  // can warn if the selected CTT Norms Version doesn't cover all of them. Mirrors the exact
  // filter cttScoringService.ts uses at scoring time (score_system 'CTT' + non-null scale).
  const [requiredScaleCodes, setRequiredScaleCodes] = useState<string[]>([]);

  const moduleKey = (selectedModules ?? [])
    .map((m) => `${m.moduleId ?? ''}:${m.type ?? ''}`)
    .join(',');

  useEffect(() => {
    const moduleIds = (selectedModules ?? [])
      .filter((m) => m.moduleId && m.type !== 'dynamic')
      .map((m) => m.moduleId as string);

    if (moduleIds.length === 0) {
      setRequiredScaleCodes([]);
      return;
    }

    let cancelled = false;
    Promise.all(
      moduleIds.map((id) =>
        apiClient
          .get(`/modules/${id}/questions`)
          .then((res) => res.data?.questions ?? [])
          .catch(() => [])
      )
    ).then((results) => {
      if (cancelled) return;
      const codes = new Set<string>();
      results.flat().forEach((q: any) => {
        if (q.scoreSystem === 'CTT' && q.scale) codes.add(q.scale);
      });
      setRequiredScaleCodes([...codes]);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);
  const { activeStep, activeIndex, isFirst, isLast, labels, next, back } = useQuestionnaireStepper({
    form,
    isEdit,
    isQuestionnaireLocked,
    canEditModules,
    isCompleted,
  });

  return (
    <Form
      {...form}
      {...props}
      className="w-full"
      initialValues={initialValues}
      submitter={{
        ...props.submitter,
        render: (helpers) => (
          <FormSubmitterStepper
            helpers={helpers}
            back={back}
            next={next}
            isFirst={isFirst}
            isLast={isLast}
          />
        ),
      }}
    >
      <StepIndicator steps={labels} currentIndex={activeIndex} />

      <DevnutSection.Grid className="gap-1">
        {activeStep.id === 'general' && (
          <DevnutSection.Grid>
            <div>
              <DevnutTypography.Paragraph title={t('form.title.section')} />
              <DevnutTypography.Description title={t('form.title.hint')} />
            </div>
            <GeneralFields
              disabled={activeStep.disabled}
              isAnonymousSpontaneous={isAnonymousSpontaneous}
              isEdit={isEdit}
              effectiveStatus={effectiveStatus}
            />
          </DevnutSection.Grid>
        )}
        {activeStep.id === 'modules' && (
          <DevnutSection.Grid>
            <div>
              <DevnutTypography.Paragraph title={t('form.modules_section.section')} />
              <DevnutTypography.Description title={t('form.modules_section.hint')} />
            </div>
            <ModulesFields control={form.control} disabled={activeStep.disabled} />
          </DevnutSection.Grid>
        )}
        {activeStep.id === 'norms' && (
          <DevnutSection.Grid>
            <div>
              <DevnutTypography.Paragraph title={t('form.ctt_norms_version.section')} />
              <DevnutTypography.Description title={t('form.ctt_norms_version.hint')} />
            </div>
            <NormsFields disabled={activeStep.disabled} />
            {selectedNormsId && (
              <ItemLoader url={`/ctt-norms/${selectedNormsId}`}>
                {(item: Values) => {
                  if (!item) return null;
                  const norms = item.norms as CttNormEntry[];
                  if (!Array.isArray(norms)) {
                    return (
                      <Alert className="bg-red-50 border border-red-200 text-red-800 mb-3">
                        <AlertTriangleIcon />
                        <AlertTitle>Invalid CTT Norms data</AlertTitle>
                        <AlertDescription className="text-red-800">
                          The selected CTT Norms Version has malformed data and cannot be
                          displayed.
                        </AlertDescription>
                      </Alert>
                    );
                  }
                  const normsScaleCodes = new Set(norms.map((n) => n.scaleCode));
                  const missingScales = requiredScaleCodes.filter(
                    (code) => !normsScaleCodes.has(code)
                  );
                  return (
                    <>
                      {missingScales.length > 0 && (
                        <Alert className="bg-amber-50 border border-amber-200 text-amber-800 mb-3">
                          <AlertTriangleIcon />
                          <AlertTitle>Missing scale codes in the selected CTT Norms</AlertTitle>
                          <AlertDescription className="text-amber-800">
                            The selected CTT Norms Version doesn't define{' '}
                            {missingScales.length === 1 ? 'this scale code' : 'these scale codes'}{' '}
                            used by the questionnaire's modules:{' '}
                            <span className="font-mono">{missingScales.join(', ')}</span>. You can
                            still save the questionnaire — T-scores for{' '}
                            {missingScales.length === 1 ? 'this scale' : 'these scales'} just won't
                            be computed until the norms version is updated.
                          </AlertDescription>
                        </Alert>
                      )}
                      <Table tableContainerClassName="overflow-y-auto rounded-md border">
                        <TableHeader className="sticky top-0">
                          <TableRow className="bg-slate-200">
                            <TableHead className="text-xs">Scale</TableHead>
                            <TableHead className="text-xs">Code</TableHead>
                            <TableHead className="text-xs text-right w-20">Avg</TableHead>
                            <TableHead className="text-xs text-right w-20">SD</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {norms.map((entry) => (
                            <TableRow key={entry.scaleCode}>
                              <TableCell className="text-xs">{entry.name}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {entry.scaleCode}
                              </TableCell>
                              <TableCell className="text-xs text-right">{entry.average}</TableCell>
                              <TableCell className="text-xs text-right">{entry.sd}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  );
                }}
              </ItemLoader>
            )}
          </DevnutSection.Grid>
        )}
      </DevnutSection.Grid>
    </Form>
  );
};
