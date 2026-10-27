import apiClient from '@/api/client';
import { ModuleTypeBadge } from '@/components/ModuleTypeBadge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────
interface ModuleSummary {
  questionnaireModuleId: number;
  position: number;
  module: {
    id: number;
    name: string;
    type: 'static' | 'dynamic' | 'additional' | 'feedback';
    questionCount: number;
    kitVersion?: { id: number; name: string } | null;
    catSetting?: {
      id: number;
      name: string;
      api_configuration?: {
        dimensionOrder?: string[];
        dimensions?: Record<string, { startItems?: string[] }>;
      } | null;
    } | null;
  };
}

interface QuestionRow {
  questionId: number;
  questionCode: string;
  questionKind: string;
  questionText: string;
  questionHead: string;
  position: number;
  isActive: boolean;
}

interface ModuleWithQuestions extends ModuleSummary {
  questions: QuestionRow[];
  loading: boolean;
  error: boolean;
}

// ── Module panel (accordion) ───────────────────────────────────────
function ModulePanel({
  mod,
  ordinal,
  defaultOpen,
}: {
  mod: ModuleWithQuestions;
  ordinal: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const panelId = useId();
  const isCat = mod.module.type === 'dynamic';

  // For CAT: resolve start code and question from api_configuration
  const catConfig = isCat ? (mod.module.catSetting?.api_configuration ?? null) : null;
  const catStartCode = (() => {
    if (!catConfig) return null;
    const firstDimKey = catConfig.dimensionOrder?.[0];
    if (!firstDimKey) return null;
    return catConfig.dimensions?.[firstDimKey]?.startItems?.[0] ?? null;
  })();
  // Try to find matching question, then fall back to first question
  const catStartQuestion =
    mod.questions.find((q) => q.questionCode === catStartCode) ??
    (mod.questions.length > 0 ? mod.questions[0] : null);

  const visibleQuestions = isCat ? (catStartQuestion ? [catStartQuestion] : []) : mod.questions;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">
          {ordinal}.
        </span>
        <span className="font-medium text-sm flex-1 truncate">{mod.module.name}</span>
        <ModuleTypeBadge type={mod.module.type} />
        <span className="text-xs text-muted-foreground shrink-0">
          {mod.module.questionCount} items
        </span>
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
      </button>

      {/* Collapsible body */}
      {open && (
        <>
          <Separator />
          <div id={panelId} className="px-4 py-3 flex flex-col gap-3">
            {/* CAT setting name + start item code */}
            {isCat && mod.module.catSetting && (
              <p className="text-xs text-muted-foreground">
                CAT Setting:{' '}
                <span className="font-semibold text-foreground">{mod.module.catSetting.name}</span>
                {catStartCode && (
                  <>
                    {' — '}
                    <span className="font-mono">{catStartCode}</span>
                  </>
                )}
              </p>
            )}

            {mod.loading && (
              <div className="flex flex-col gap-2">
                <div className="h-5 w-full rounded bg-muted animate-pulse" />
                <div className="h-5 w-4/5 rounded bg-muted animate-pulse" />
                <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
              </div>
            )}
            {!mod.loading && mod.error && (
              <p className="text-sm text-destructive">Failed to load questions.</p>
            )}
            {!mod.loading && !mod.error && (
              <div className="flex flex-col gap-1.5">
                {visibleQuestions.length === 0 ? (
                  // CAT with no accessible questions: show start code from config
                  isCat && catStartCode ? (
                    <div className="flex items-start gap-3 py-1">
                      <span className="text-xs font-mono text-gray-600 w-6 text-right shrink-0 mt-0.5">
                        1.
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">
                          {catStartCode}
                        </span>
                        <p className="text-xs text-muted-foreground italic mt-0.5">
                          Text not available in the current language
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground italic shrink-0">
                        (CAT start item)
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No questions available.</p>
                  )
                ) : (
                  visibleQuestions.map((q, idx) => (
                    <div key={q.questionId} className="flex items-start gap-3 py-1">
                      <span className="text-xs font-mono text-gray-600 w-6 text-right shrink-0 mt-0.5">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        {q.questionHead && (
                          <p className="text-xs text-muted-foreground italic">{q.questionHead}</p>
                        )}
                        <span className="text-sm">{q.questionText || q.questionCode}</span>
                      </div>
                      {isCat && idx === 0 && (
                        <span className="text-xs text-muted-foreground italic shrink-0">
                          (CAT start item)
                        </span>
                      )}
                    </div>
                  ))
                )}
                {isCat && mod.questions.length > 1 && (
                  <p className="pl-9 text-xs text-muted-foreground italic mt-1">
                    + {mod.questions.length - 1} more CAT items not shown in preview
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
const QuestionnairePreview: React.FC = () => {
  const { surveyId } = useParams<{ surveyId: string }>();
  const [searchParams] = useSearchParams();
  const questionnaireId = searchParams.get('questionnaires_id') ?? undefined;
  const navigate = useNavigate();

  const [surveyName, setSurveyName] = useState('');
  const [questionnaireName, setQuestionnaireName] = useState('');
  const [modules, setModules] = useState<ModuleWithQuestions[]>([]);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(true);
  const [errorQuestionnaire, setErrorQuestionnaire] = useState(false);

  // Fetch survey name
  useEffect(() => {
    if (!surveyId) return;
    apiClient
      .get(`/surveys/${surveyId}`)
      .then((res) => {
        const s = res.data?.data ?? res.data;
        setSurveyName(s?.name ?? '');
      })
      .catch(() => {});
  }, [surveyId]);

  // Step 1: fetch questionnaire details
  useEffect(() => {
    if (!questionnaireId) return;
    setLoadingQuestionnaire(true);
    apiClient
      .get(`/questionnaires/${questionnaireId}`)
      .then((res) => {
        const q = res.data?.data ?? res.data;
        setQuestionnaireName(q?.title ?? '');
        const mods: ModuleWithQuestions[] = (q?.modules ?? []).map((m: ModuleSummary) => ({
          ...m,
          questions: [],
          loading: true,
          error: false,
        }));
        setModules(mods);
      })
      .catch(() => setErrorQuestionnaire(true))
      .finally(() => setLoadingQuestionnaire(false));
  }, [questionnaireId]);

  // Step 2: fetch questions per module
  // - CAT (dynamic): fetch full kit-version bank by code to find start item, same as form-create
  // - static / socio-demo: fetch module-assigned questions, English (id=29)
  useEffect(() => {
    if (modules.length === 0) return;
    modules.forEach((mod, i) => {
      if (mod.module.type === 'dynamic') {
        // CAT: resolve start item from the full kit-version question bank
        const kitVersionId = mod.module.kitVersion?.id;
        const catConfig = mod.module.catSetting?.api_configuration;
        const firstDimKey = catConfig?.dimensionOrder?.[0];
        const startCode = firstDimKey
          ? catConfig?.dimensions?.[firstDimKey]?.startItems?.[0]
          : undefined;
        if (!kitVersionId || !startCode) {
          setModules((prev) =>
            prev.map((m, idx) =>
              idx === i ? { ...m, loading: false, error: false, questions: [] } : m
            )
          );
          return;
        }
        apiClient
          .get(`/kit-versions/${kitVersionId}/questions`, {
            params: { languageId: 29, questionCode: startCode, pageSize: 1 },
          })
          .then((res) => {
            const raw: any[] = res.data?.data ?? [];
            const mapped: QuestionRow[] = raw.map((q) => ({
              questionId: q.id,
              questionCode: q.question_code,
              questionText: q.question_text || q.question_code,
              questionHead: '',
              questionKind: q.question_kind,
              position: 0,
              isActive: true,
            }));
            setModules((prev) =>
              prev.map((m, idx) => (idx === i ? { ...m, questions: mapped, loading: false } : m))
            );
          })
          .catch(() => {
            setModules((prev) =>
              prev.map((m, idx) => (idx === i ? { ...m, loading: false, error: true } : m))
            );
          });
      } else {
        apiClient
          .get(`/modules/${mod.module.id}/questions`, {
            params: { languageId: 29 },
          })
          .then((res) => {
            setModules((prev) =>
              prev.map((m, idx) =>
                idx === i ? { ...m, questions: res.data?.questions ?? [], loading: false } : m
              )
            );
          })
          .catch(() => {
            setModules((prev) =>
              prev.map((m, idx) => (idx === i ? { ...m, loading: false, error: true } : m))
            );
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules.length]);

  const backPath = `/survey/${surveyId}/questionnaires`;

  if (errorQuestionnaire) {
    return (
      <div className="flex flex-col gap-4 p-4 lg:p-8">
        <Button variant="link" className="text-black p-0 w-fit" onClick={() => navigate(backPath)}>
          <ChevronLeft className="size-4" />
          Back to questionnaires
        </Button>
        <p className="text-destructive text-sm">Failed to load questionnaire.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 max-w-3xl mx-auto w-full">
      {/* Breadcrumb nav */}
      <div className="flex flex-col gap-1">
        <Button
          variant="link"
          className="text-black p-0 w-fit flex items-center gap-1 h-auto"
          onClick={() => navigate(backPath)}
        >
          <ChevronLeft className="size-4" />
          {surveyName ? (
            <span>
              Questionnaires of <span className="font-semibold">{surveyName}</span>
            </span>
          ) : (
            'Back to questionnaires'
          )}
        </Button>
      </div>

      {/* Header */}
      {loadingQuestionnaire ? (
        <div className="h-7 w-56 rounded-md bg-muted animate-pulse" />
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Questionnaire preview
          </p>
          <h1 className="text-2xl font-bold">{questionnaireName}</h1>
          <p className="text-sm text-muted-foreground">{modules.length} modules</p>
        </div>
      )}

      {/* Modules */}
      {loadingQuestionnaire ? (
        <div className="flex flex-col gap-2">
          <div className="h-12 w-full rounded-lg bg-muted animate-pulse" />
          <div className="h-12 w-full rounded-lg bg-muted animate-pulse" />
          <div className="h-12 w-full rounded-lg bg-muted animate-pulse" />
        </div>
      ) : modules.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No modules associated with this questionnaire.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {modules.map((mod, i) => (
            <ModulePanel
              key={mod.questionnaireModuleId}
              mod={mod}
              ordinal={i + 1}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default QuestionnairePreview;
