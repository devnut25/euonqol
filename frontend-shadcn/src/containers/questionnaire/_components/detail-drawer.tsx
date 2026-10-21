import apiClient from '@/api/client';
import DevnutSection from '@/components/DevnutSection';
import DevnutTypography from '@/components/DevnutTypography';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { ItemLoader } from '@/components/ItemLoader';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  QuestionsPanel,
  type ModuleSummary,
  type QuestionRow,
} from '@/containers/questions/_components/questions-panel';
import { useValueEnum } from '@/hooks/useValueEnum';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  questionnaireId: string | number | null;
  onClose: () => void;
  width?: number;
}

export interface QuestionnaireDetailFields {
  id: string | number;
  title: string;
  status: string;
  type: string;
  patient_group?: { id: string | number; name: string; description: string } | null;
  max_completions?: number | string | null;
  modules?: ModuleSummary[];
}

interface ModulePanelProps {
  mod: ModuleSummary;
  ordinal: number;
  defaultOpen?: boolean;
}

function ModulePanel({ mod, ordinal, defaultOpen }: ModulePanelProps) {
  const isDynamic = mod.module.type === 'dynamic';
  const kitVersionId = mod.module.kitVersion?.id;
  const catConfig = mod.module.catSetting?.api_configuration;
  const firstDimKey = catConfig?.dimensionOrder?.[0];
  const startCode = firstDimKey ? catConfig?.dimensions?.[firstDimKey]?.startItems?.[0] : undefined;
  const canFetch = isDynamic ? Boolean(kitVersionId && startCode) : true;

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(canFetch);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canFetch) return;

    if (isDynamic) {
      apiClient
        .get(`/kit-versions/${kitVersionId}/questions`, {
          params: { languageId: 29, questionCode: startCode, pageSize: 1 },
        })
        .then((res) => {
          const raw: any[] = res.data?.data ?? [];
          setQuestions(
            raw.map((q) => ({
              questionId: q.id,
              questionCode: q.question_code,
              questionText: q.question_text || q.question_code,
              questionHead: '',
              questionKind: q.question_kind,
              position: 0,
              isActive: true,
            }))
          );
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    } else {
      apiClient
        .get(`/modules/${mod.module.id}/questions`, { params: { languageId: 29 } })
        .then((res) => {
          setQuestions(res.data?.questions ?? []);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }
  }, [mod.module.id, isDynamic, canFetch, kitVersionId, startCode]);

  return (
    <QuestionsPanel
      mod={{ ...mod, questions, loading, error }}
      ordinal={ordinal}
      defaultOpen={defaultOpen}
    />
  );
}

export function QuestionnaireDetailDrawer({ open, questionnaireId, onClose, width }: Props) {
  const { t } = useTranslation(['questionnaire']);

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl overflow-y-auto"
        style={width != null ? { width, maxWidth: 'none' } : undefined}
      >
        <SheetTitle className="sr-only">{t('actions.info')}</SheetTitle>
        {open && questionnaireId && (
          <ItemLoader url={`/questionnaires/${questionnaireId}`}>
            {(item) => {
              if (!item) return null;
              return (
                <QuestionnaireDetailContent questionnaire={item as QuestionnaireDetailFields} />
              );
            }}
          </ItemLoader>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface QuestionnaireDetailContentProps {
  questionnaire: QuestionnaireDetailFields;
}

function QuestionnaireDetailContent({ questionnaire }: QuestionnaireDetailContentProps) {
  const { t } = useTranslation(['questionnaire']);
  const { valueOptions } = useValueEnum();

  const form = useForm<QuestionnaireDetailFields>({
    mode: 'onSubmit',
    defaultValues: questionnaire,
  });

  return (
    <DevnutSection.Grid className="gap-2 p-6">
      <DevnutTypography.SubTitle title={t('actions.info')} />
      <Form {...form} readonly className="w-full">
        <DevnutSection.Grid>
          <DevnutSection.Grid className="gap-2">
            <FormField label={t('form.title.label')}>
              <FormFieldController name="title" type="text" />
            </FormField>

            <FormField label={t('form.status.label')}>
              <FormFieldController
                name="status"
                type="select"
                options={valueOptions.questionnaireStatus}
              />
            </FormField>

            <FormField label={t('form.type.label')}>
              <FormFieldController name="type" type="text" />
            </FormField>

            {questionnaire.patient_group && (
              <FormField label={t('form.patient_group.label')}>
                <FormFieldController
                  type="api-select"
                  name="patient_group.id"
                  url="/patient-groups"
                  filters={{ is_active: true }}
                  getLabel={(item) => `${item.name} - ${item.description}`}
                />
              </FormField>
            )}

            {questionnaire.max_completions != null && (
              <FormField label={t('form.max_completions.label')}>
                <FormFieldController name="max_completions" type="number" />
              </FormField>
            )}
          </DevnutSection.Grid>

          <div className="w-full">
            <DevnutTypography.SubTitle title={t('form.modules_section.label')} />
            {(questionnaire.modules ?? []).length === 0 ? (
              <DevnutTypography.Description title={t('messages.no_modules')} className="italic" />
            ) : (
              <DevnutSection.Grid className="gap-2">
                {(questionnaire.modules ?? []).map((mod: ModuleSummary, i: number) => (
                  <ModulePanel
                    key={mod.questionnaireModuleId}
                    mod={mod}
                    ordinal={i + 1}
                    defaultOpen={i === 0}
                  />
                ))}
              </DevnutSection.Grid>
            )}
          </div>
        </DevnutSection.Grid>
      </Form>
    </DevnutSection.Grid>
  );
}
