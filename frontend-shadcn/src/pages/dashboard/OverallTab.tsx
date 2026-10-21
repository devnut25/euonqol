import apiClient from '@/api/client';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useEffect, useState } from 'react';
import { DEFAULT_STATUS, RESPONSES_LABEL, useFilterParams, type Filters } from './downloadFilters';
import { KpiRow } from './KpiRow';
import { SurveyCard, type SurveyCardData } from './SurveyCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverallData {
  mainKpis: {
    activeSurveys: number;
    questionnaires: number;
    completions: number;
    patientsEnrolled: number;
  };
  meta: {
    dateFrom: string | null;
    dateTo: string | null;
  };
}

interface Props {
  filters: Filters;
  /** Opens the Download tab on that survey. */
  onSelectSurvey: (id: number, name: string) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ''}`} />;
}

/**
 * Width of each card for a given number of them: the cards share the row while
 * they fit (one takes it all, two half each), and only past three per row do
 * they start to scroll.
 */
function cardBasis(count: number): string {
  if (count <= 1) return 'basis-full';
  if (count === 2) return 'basis-full lg:basis-1/2';
  return 'basis-full lg:basis-1/2 2xl:basis-1/3';
}

/** Whether the carousel holds more cards than it shows, i.e. its arrows do something. */
function useCanScroll(api: CarouselApi | undefined): boolean {
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    if (!api) return;
    const update = () => setCanScroll(api.canScrollPrev() || api.canScrollNext());
    update();
    // The answer changes with the window width too, not only with the cards.
    api.on('reInit', update).on('select', update).on('resize', update);
    return () => {
      api.off('reInit', update).off('select', update).off('resize', update);
    };
  }, [api]);

  return canScroll;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OverallTab({ filters, onSelectSurvey }: Props) {
  const [data, setData] = useState<OverallData | null>(null);
  const [surveys, setSurveys] = useState<SurveyCardData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const canScroll = useCanScroll(carouselApi);

  const params = useFilterParams(filters);
  const completionStatus = filters.completionStatus ?? DEFAULT_STATUS;

  useEffect(() => {
    // `cancelled` drops the answer of a request the filters have since moved past:
    // without it a slower, older response could land last and overwrite the
    // current one (typing a date fires one request per intermediate value).
    let cancelled = false;
    setLoading(true);
    setError(null);

    // KPIs and per-survey cards answer to the same filters, so they are fetched
    // together and fail together.
    Promise.all([
      apiClient.get('/dashboard/overall', { params }),
      apiClient.get('/dashboard/overall/surveys', { params }),
    ])
      .then(([overallRes, surveysRes]) => {
        if (cancelled) return;
        setData(overallRes.data.data);
        setSurveys(surveysRes.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load dashboard data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-busy="true">
        <span className="sr-only">Loading dashboard data…</span>
        <Skeleton className="h-7 w-full max-w-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border bg-destructive/10 px-6 py-8 text-center text-destructive text-sm"
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { mainKpis } = data;

  return (
    <div className="flex min-h-full flex-col gap-6">
      {/* ── Headline figures ──────────────────────────────────────────────── */}
      <KpiRow
        items={[
          {
            value: mainKpis.activeSurveys,
            label: 'Surveys',
            hint: 'Surveys you can see, in any status',
          },
          {
            value: mainKpis.questionnaires,
            label: 'Questionnaires',
            hint: 'Distinct questionnaires used by these surveys',
          },
          {
            value: mainKpis.completions,
            label: `${RESPONSES_LABEL[completionStatus]} questionnaires`,
            hint: 'Questionnaires in the selected completion status and date range',
          },
          {
            value: mainKpis.patientsEnrolled,
            label: 'Enrolled patients',
            hint: 'Distinct patients assigned to at least one questionnaire, at any time',
          },
        ]}
      />

      {/* ── Per-survey cards ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {!surveys || surveys.length === 0 ? (
          <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground shadow-sm">
            No surveys match the selected filters.
          </div>
        ) : (
          // Side padding leaves room for the arrows, which sit outside the
          // viewport — and which only show when there is something to scroll to.
          <div className={`flex-1 ${canScroll ? 'px-10 sm:px-12' : ''}`}>
            <Carousel
              setApi={setCarouselApi}
              opts={{ align: 'start', slidesToScroll: 1 }}
              className="h-full"
            >
              <CarouselContent viewportClassName="h-full" className="h-full">
                {surveys.map((survey) => (
                  <CarouselItem key={survey.id} className={cardBasis(surveys.length)}>
                    <SurveyCard
                      survey={survey}
                      onSelect={() => onSelectSurvey(survey.id, survey.name)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
              {canScroll && (
                <>
                  <CarouselPrevious />
                  <CarouselNext />
                </>
              )}
            </Carousel>
          </div>
        )}
      </div>
    </div>
  );
}
