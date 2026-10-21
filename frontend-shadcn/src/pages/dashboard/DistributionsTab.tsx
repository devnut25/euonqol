import apiClient from '@/api/client';
import { DevnutSelect } from '@/components/DevnutSelect';
import { useEffect, useState } from 'react';
import { DEFAULT_STATUS, RESPONSES_LABEL, useFilterParams, type Filters } from './downloadFilters';
import { QuestionChartBrowser, type ChartType, type DataPoint } from './QuestionCharts';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The module types that have a distributions tab of their own. */
export type DistributionModuleType = 'static' | 'dynamic' | 'feedback';

interface QuestionnaireOption {
  id: number;
  title: string;
  /** `static` or `dynamic`: the questionnaire's own type. */
  type: string;
}

interface QuestionDetail {
  questionId: number;
  questionCode: string;
  questionKind: string;
  questionText: string;
  totalResponses: number;
  distribution: DataPoint[];
  chartType: ChartType;
}

interface ModuleDetail {
  id: number;
  name: string;
  type: string;
  questions: QuestionDetail[];
}

interface QuestionnaireDistributions {
  questionnaire: { id: number; title: string; type: string };
  totalRespondents: number;
  modules: ModuleDetail[];
}

const TYPE_NOUN: Record<DistributionModuleType, string> = {
  static: 'static',
  dynamic: 'dynamic (adaptive)',
  feedback: 'feedback',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Message({ children, alert }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className={`rounded-xl border bg-card px-6 py-12 text-center text-sm shadow-sm ${
        alert ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Answer distributions of one questionnaire's modules of a given type.
 *
 * Needs a survey; the questionnaire is the dock's when one is picked there,
 * otherwise it is chosen here among the survey's questionnaires.
 */
export function DistributionsTab({
  filters,
  moduleType,
}: {
  filters: Filters;
  moduleType: DistributionModuleType;
}) {
  const { surveyId } = filters;
  const params = useFilterParams(filters);

  const [questionnaires, setQuestionnaires] = useState<QuestionnaireOption[]>([]);
  const [pickedQuestionnaire, setPickedQuestionnaire] = useState('');
  const [loaded, setData] = useState<QuestionnaireDistributions | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── The survey's questionnaires, when the dock does not pick one ───────────
  const needsList = Boolean(surveyId && !filters.questionnaireId);
  useEffect(() => {
    if (!needsList) return;
    let cancelled = false;
    apiClient
      .get(`/dashboard/download/surveys/${surveyId}/questionnaires`, { params })
      .then((r) => {
        if (cancelled) return;
        const rows: QuestionnaireOption[] = (r.data.data?.questionnaires ?? []).map(
          (q: QuestionnaireOption) => ({ id: q.id, title: q.title, type: q.type })
        );
        setQuestionnaires(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load the questionnaires of this survey.');
      });
    return () => {
      cancelled = true;
    };
  }, [needsList, surveyId, params]);

  // Static and Dynamic offer only the questionnaires of their own type; feedback
  // modules can sit in either, so the Feedback tab offers them all. Derived, so a
  // new survey or a shorter list falls back to its first entry.
  const listed = needsList
    ? questionnaires.filter((q) => moduleType === 'feedback' || q.type === moduleType)
    : [];
  const questionnaireId =
    filters.questionnaireId ??
    (listed.find((q) => String(q.id) === pickedQuestionnaire) ?? listed[0])?.id;

  // ── The distributions ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!surveyId || !questionnaireId) return;
    // `cancelled` drops the answer of a request the filters have since moved past.
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get(`/dashboard/distributions/questionnaires/${questionnaireId}`, { params })
      .then((r) => {
        if (!cancelled) setData(r.data.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load the answer distributions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, questionnaireId, params]);

  if (!surveyId) {
    return (
      <Message>
        Pick a survey in the filters on the left to see its {TYPE_NOUN[moduleType]} answers.
      </Message>
    );
  }

  const questionnairePicker = listed.length > 1 && (
    <div className="w-full sm:w-80">
      <DevnutSelect
        label="Questionnaire"
        searchable
        searchPlaceholder="Search questionnaire…"
        value={String(questionnaireId ?? '')}
        onValueChange={(v) => setPickedQuestionnaire(v ?? '')}
        options={listed.map((q) => ({ label: q.title, value: String(q.id) }))}
        placeholder="Select a questionnaire"
        showAllOption={false}
        triggerClassName="w-full text-xs"
      />
    </div>
  );

  // Only the answer for the questionnaire on screen: another one's would be stale.
  const data = loaded?.questionnaire.id === questionnaireId ? loaded : null;

  const body = (() => {
    if (error) return <Message alert>{error}</Message>;
    if (loading && !data) {
      return (
        <div role="status" className="py-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (!questionnaireId) {
      return (
        <Message>
          This survey has no{moduleType === 'feedback' ? '' : ` ${TYPE_NOUN[moduleType]}`}{' '}
          questionnaires.
        </Message>
      );
    }
    if (!data) return null;

    const modules = data.modules.filter((m) => m.type === moduleType);
    if (modules.length === 0) {
      return <Message>This questionnaire has no {TYPE_NOUN[moduleType]} modules.</Message>;
    }

    // Derived rather than synced, so a new questionnaire falls back to its first module.
    const activeModule = modules.find((m) => m.id === activeModuleId) ?? modules[0];

    // Each patient answers a different subset of the adaptive items, and most of
    // the bank goes unused in a small sample: only the items someone answered
    // are charted.
    const charted =
      activeModule.type === 'dynamic'
        ? activeModule.questions.filter((q) => q.totalResponses > 0)
        : activeModule.questions;

    return (
      <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          {/* Module selector, only when there is more than one to choose from */}
          {modules.length > 1 ? (
            <div
              role="group"
              aria-label="Modules"
              className="flex items-center gap-1 overflow-x-auto rounded-full bg-muted px-1 py-1"
            >
              {modules.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveModuleId(mod.id)}
                  title={mod.name}
                  aria-pressed={mod.id === activeModule.id}
                  // neutral-600, not muted-foreground: 4.35:1 on the muted pill is
                  // under WCAG AA's 4.5:1.
                  className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    mod.id === activeModule.id
                      ? 'bg-primary text-white shadow-sm hover:bg-[#554fa3]'
                      : 'text-neutral-600 hover:text-foreground'
                  }`}
                >
                  {mod.name}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="pt-1.5 text-sm font-semibold text-foreground">{activeModule.name}</h2>
          )}

          <div className="shrink-0 pt-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data.totalRespondents}</span>{' '}
            {RESPONSES_LABEL[filters.completionStatus ?? DEFAULT_STATUS].toLowerCase()}
            {' · '}
            {charted.length} {charted.length === 1 ? 'question' : 'questions'}
          </div>
        </div>

        {/* Keyed by module, so switching module starts from its first question. */}
        <QuestionChartBrowser
          key={activeModule.id}
          label="Question"
          allLabel="All questions"
          loading={loading}
          questions={charted.map((q) => ({
            key: String(q.questionId),
            text: q.questionText,
            chartType: q.chartType,
            totalResponses: q.totalResponses,
            data: q.distribution,
          }))}
        />
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-4">
      {questionnairePicker}
      {body}
    </div>
  );
}
