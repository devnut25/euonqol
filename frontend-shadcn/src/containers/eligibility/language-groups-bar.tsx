import { SimpleTooltip } from '@/components/ui/tooltip';
import { DevnutBadge } from '@/components/DevnutBadge';
import { DevnutButton } from '@/components/DevnutButton';
import { DevnutDeleteButton } from '@/components/buttons/devnut-delete-button';
import { TableActionButton } from '@/components/data-table/data-table-action-button';
import { CARD_ACTION_LAYOUT_CLASS, CARD_ACTION_OUTLINE_CLASS } from '@/lib/dataTableActions';
import { useIsMobile } from '@/hooks/useMediaQuery';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/useApi';
import { PolicyContext, PolicyProvider } from '@/hooks/usePolicy';
import { cn } from '@/lib/tailwind/utils';
import { ChevronDown, ChevronUp, Loader2, Pencil, PencilLine, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ReorderCell } from './_component/reorder-cell';
import type { Language, LanguageGroup, Question } from './utils/types';

interface LanguageGroupsBarProps {
  surveyId: string;
  items: Question[];
  reload: () => void;
  onEdit: (group: LanguageGroup) => void;
  onStateChange?: (state: {
    hasQuestions: boolean;
    languages: Language[];
    questionCount: number;
    questions: Question[];
  }) => void;
}

export const LanguageGroupsBar = ({
  surveyId,
  items,
  reload: reloadTable,
  onEdit,
  onStateChange,
}: LanguageGroupsBarProps) => {
  const { t } = useTranslation(['eligibility', 'common']);
  const { makeRequest } = useApi();
  const isMobile = useIsMobile(768);

  // Groups the user toggled away from the default (open on desktop, closed on mobile)
  const [toggledGroups, setToggledGroups] = useState<Set<number>>(new Set());
  const [togglingFallbackLangId, setTogglingFallbackLangId] = useState<number | null>(null);
  const [deletingLangId, setDeletingLangId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sortedQuestions = useMemo(
    () => [...items].sort((a, b) => a.order_position - b.order_position),
    [items]
  );

  const languageGroups = useMemo<LanguageGroup[]>(() => {
    const map = new Map<number, LanguageGroup>();
    const sorted = sortedQuestions;
    for (const q of sorted) {
      for (const tr of q.translations) {
        if (!map.has(tr.language_id)) {
          map.set(tr.language_id, {
            language_id: tr.language_id,
            language_name: tr.language ?? '',
            original_lang: tr.original_lang ?? '',
            is_fallback: false,
            items: [],
          });
        }
        const group = map.get(tr.language_id)!;
        if (tr.is_fallback) group.is_fallback = true;
        group.items.push({
          question_id: q.id,
          expected_answer: q.expected_answer,
          order_position: q.order_position,
          question_text: tr.question_text,
          disqualification_message: tr.disqualification_message,
        });
      }
    }
    return [...map.values()];
  }, [items]);

  const hasQuestions = items.length > 0;
  const usedLanguages = useMemo(
    () =>
      languageGroups.map((g) => ({
        id: g.language_id,
        language: g.language_name,
        original_lang: g.original_lang,
      })),
    [languageGroups]
  );

  useEffect(() => {
    onStateChange?.({
      hasQuestions,
      questionCount: items.length,
      languages: usedLanguages,
      questions: sortedQuestions,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQuestions, items.length, usedLanguages, sortedQuestions]);

  const toggleGroupCollapse = (langId: number) => {
    setToggledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(langId)) next.delete(langId);
      else next.add(langId);
      return next;
    });
  };

  // Already the fallback: nothing to do — mark a different language as fallback
  // instead, which unsets this one automatically (a survey can never be left
  // with zero fallback languages, so unsetting without a replacement isn't
  // offered here).
  const handleToggleFallback = async (group: LanguageGroup) => {
    if (group.is_fallback) return;
    setTogglingFallbackLangId(group.language_id);
    try {
      await makeRequest(`/surveys/${surveyId}/eligibility-questions/language-fallback`, 'patch', {
        language_id: group.language_id,
      });
      reloadTable();
      toast.success(t('language_bar.fallback_updated', { language: group.language_name }));
    } catch {
      toast.error(t('language_bar.fallback_failed'));
    } finally {
      setTogglingFallbackLangId(null);
    }
  };

  const handleDeleteLanguage = async () => {
    if (deletingLangId === null) return;
    setDeleting(true);
    try {
      await makeRequest(
        `/surveys/${surveyId}/eligibility-questions/language/${deletingLangId}`,
        'delete'
      );
      reloadTable();
      toast.success(t('language_bar.language_removed'));
    } catch (err) {
      toast.error(typeof err === 'string' ? err : t('language_bar.language_remove_failed'));
    } finally {
      setDeleting(false);
      setDeletingLangId(null);
    }
  };

  const deletingGroup = languageGroups.find((g) => g.language_id === deletingLangId);

  return (
    <div className="flex flex-col gap-4">
      {languageGroups.length === 0 && (
        <div className="border rounded-md p-10 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <p className="font-medium text-sm">{t('empty.title')}</p>
          <p className="text-xs max-w-sm">{t('empty.description')}</p>
        </div>
      )}

      {languageGroups.map((group) => {
        const isCollapsed = isMobile !== toggledGroups.has(group.language_id);
        const isMasterGroup = group.language_id === languageGroups[0]?.language_id;
        const isTogglingFallback = togglingFallbackLangId === group.language_id;
        // Star button: same text as accessible name and tooltip
        const fallbackLabel = group.is_fallback
          ? t('language_bar.fallback_badge')
          : t('language_bar.toggle_fallback');
        const groupAuthorizations =
          (group.items[0]
            ? items.find((i) => i.id === group.items[0].question_id)?.authorizations
            : undefined) ?? {};
        const canUpdate = groupAuthorizations.update !== false;
        const fallbackButton = group.is_fallback ? null : (
          <SimpleTooltip label={fallbackLabel}>
            {/* aria-disabled instead of disabled: stays hoverable/focusable so
              its tooltip still explains the state */}
            <DevnutButton
              variant="outline"
              size="icon"
              className={cn(
                'size-8 rounded-md aria-disabled:cursor-not-allowed',
                'text-muted-foreground hover:text-amber-700'
              )}
              aria-label={fallbackLabel}
              aria-pressed={group.is_fallback}
              aria-disabled={group.is_fallback || isTogglingFallback || undefined}
              aria-busy={isTogglingFallback || undefined}
              onClick={() => {
                if (group.is_fallback || isTogglingFallback) return;
                void handleToggleFallback(group);
              }}
            >
              {isTogglingFallback ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Star
                  aria-hidden="true"
                  className={cn('size-4', group.is_fallback && 'fill-amber-700')}
                />
              )}
            </DevnutButton>
          </SimpleTooltip>
        );
        // Same slot as the star button, so the state indicator never shifts
        const fallbackBadge = group.is_fallback ? (
          <DevnutBadge className="bg-amber-100 text-amber-800 text-xs gap-1">
            <Star className="size-2.5 fill-amber-700 text-amber-700" />
            {t('language_bar.fallback_badge')}
          </DevnutBadge>
        ) : null;
        return (
          <div
            key={group.language_id}
            className={cn('border rounded-md bg-white', group.is_fallback && 'border-amber-300')}
          >
            <div
              className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3 cursor-pointer select-none"
              onClick={() => toggleGroupCollapse(group.language_id)}
            >
              <div className="flex items-center justify-between gap-2 md:contents">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroupCollapse(group.language_id);
                  }}
                  className="flex flex-wrap items-center gap-2 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isCollapsed ? (
                    <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp aria-hidden="true" className="size-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{group.language_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('language_bar.questions_count', { count: group.items.length })}
                  </span>
                </button>
                {isMobile && (group.is_fallback || (canUpdate && fallbackButton)) && (
                  <div onClick={(e) => e.stopPropagation()}>
                    {group.is_fallback ? fallbackBadge : fallbackButton}
                  </div>
                )}
              </div>
              <PolicyProvider authorizations={groupAuthorizations}>
                <PolicyContext.Consumer>
                  {(ctx) =>
                    isMobile ? (
                      // Same layout/buttons as the CrudDataTable cards (ListCard)
                      <div onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-2 items-stretch pt-2 border-t [&>*]:flex-[1_1_6.25rem] [&>*]:min-w-0">
                          {ctx?.authorizations.update !== false && (
                            <>
                              <TableActionButton
                                ariaLabel={t('common:crud_data_table.actions.edit')}
                                className={CARD_ACTION_OUTLINE_CLASS}
                                onClick={() => onEdit(group)}
                              >
                                <PencilLine className="h-4 w-4" />
                                <span className="text-xs">
                                  {t('common:crud_data_table.actions.edit')}
                                </span>
                              </TableActionButton>
                            </>
                          )}
                          {ctx?.authorizations.delete !== false && (
                            <DevnutDeleteButton
                              url={`/surveys/${surveyId}/eligibility-questions/language/${group.language_id}`}
                              confirmTitle={t('language_bar.delete_language_title')}
                              confirmDescription={t('language_bar.delete_language_description', {
                                language: group.language_name,
                              })}
                              confirmText={t('language_bar.delete_language_confirm')}
                              onSuccess={reloadTable}
                              showLabel
                              className={CARD_ACTION_LAYOUT_CLASS}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {fallbackBadge}
                        {ctx?.authorizations.update !== false && (
                          <>
                            {fallbackButton}

                            <SimpleTooltip label={t('actions.edit')}>
                              <DevnutButton
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={t('actions.edit')}
                                onClick={() => onEdit(group)}
                              >
                                <Pencil aria-hidden="true" className="size-4" />
                              </DevnutButton>
                            </SimpleTooltip>
                          </>
                        )}
                        {ctx?.authorizations.delete !== false && (
                          <SimpleTooltip label={t('language_bar.remove_language')}>
                            <DevnutButton
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              aria-label={t('language_bar.remove_language')}
                              onClick={() => setDeletingLangId(group.language_id)}
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </DevnutButton>
                          </SimpleTooltip>
                        )}
                      </div>
                    )
                  }
                </PolicyContext.Consumer>
              </PolicyProvider>
            </div>

            {!isCollapsed && (
              <div className="divide-y border-t">
                {group.items.map((item, idx) => {
                  const question = sortedQuestions.find((q) => q.id === item.question_id);
                  return (
                    <div key={item.question_id} className="px-4 py-3 flex items-start gap-3">
                      {isMasterGroup && question ? (
                        <ReorderCell
                          item={question}
                          items={sortedQuestions}
                          surveyId={surveyId}
                          reload={reloadTable}
                        />
                      ) : (
                        <div className="w-5 shrink-0" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-muted-foreground font-medium">
                            #{idx + 1}
                          </span>
                          <DevnutBadge
                            className={cn(
                              'text-xs capitalize',
                              item.expected_answer === 'yes'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            )}
                          >
                            {t('language_bar.expected', { answer: item.expected_answer })}
                          </DevnutBadge>
                        </div>
                        <p className="text-sm font-medium">{item.question_text}</p>
                        <p className={cn('text-xs mt-0.5 italic', 'text-muted-foreground')}>
                          ↳ {item.disqualification_message}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <AlertDialog
        open={deletingLangId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingLangId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('language_bar.delete_language_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('language_bar.delete_language_description', {
                language: deletingGroup?.language_name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('language_manager.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLanguage} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
              {t('language_bar.delete_language_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
