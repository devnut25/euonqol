import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { TypeBadge } from './type-badge';

export interface ModuleSummary {
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

export interface QuestionRow {
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

export function QuestionsPanel({
  mod,
  ordinal,
  defaultOpen,
}: {
  mod: ModuleWithQuestions;
  ordinal: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const isCat = mod.module.type === 'dynamic';

  const catConfig = isCat ? (mod.module.catSetting?.api_configuration ?? null) : null;
  const catStartCode = (() => {
    if (!catConfig) return null;
    const firstDimKey = catConfig.dimensionOrder?.[0];
    if (!firstDimKey) return null;
    return catConfig.dimensions?.[firstDimKey]?.startItems?.[0] ?? null;
  })();
  const catStartQuestion =
    mod.questions.find((q) => q.questionCode === catStartCode) ??
    (mod.questions.length > 0 ? mod.questions[0] : null);

  const visibleQuestions = isCat ? (catStartQuestion ? [catStartQuestion] : []) : mod.questions;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">
          {ordinal}.
        </span>
        <span className="font-medium text-sm flex-1 truncate">{mod.module.name}</span>
        <TypeBadge type={mod.module.type} />
        <span className="text-xs text-muted-foreground shrink-0">
          {mod.module.questionCount} items
        </span>
        {open ? (
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <>
          <Separator />
          <div className="px-4 py-3 flex flex-col gap-3">
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
