import { DevnutBadge } from '@/components/DevnutBadge';
import { DevnutButton } from '@/components/DevnutButton';
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
import { DevnutDeleteButton } from '@/components/buttons/devnut-delete-button';
import { TableActionButton } from '@/components/data-table/data-table-action-button';
import { CARD_ACTION_LAYOUT_CLASS, CARD_ACTION_OUTLINE_CLASS } from '@/lib/dataTableActions';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useApi } from '@/hooks/useApi';
import { sanitizeHtml } from '@/lib/rich-text';
import { cn } from '@/lib/tailwind/utils';
import { ChevronDown, ChevronUp, Loader2, Pencil, PencilLine, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EXTRA_MESSAGE_FIELDS, type ClosingMessageRow } from './utils/types';

interface ClosingMessageLanguageCardsProps {
  surveyId: string | number;
  items: ClosingMessageRow[];
  reload: () => void;
  onEdit: (row: ClosingMessageRow) => void;
}

export const ClosingMessageLanguageCards = ({
  surveyId,
  items,
  reload,
  onEdit,
}: ClosingMessageLanguageCardsProps) => {
  const { t } = useTranslation(['closingMessages']);
  const { makeRequest } = useApi();
  const url = `/surveys/${surveyId}/closing-message`;

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingRow, setDeletingRow] = useState<ClosingMessageRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isMobile = useIsMobile(768);

  const toggleCollapse = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Already the fallback: nothing to do — marking another language unsets this one,
  // so a survey is never left without a fallback closing message.
  const handleToggleFallback = async (row: ClosingMessageRow) => {
    if (row.is_fallback) return;
    setTogglingId(row.id);
    try {
      await makeRequest(`${url}/${row.id}/fallback`, 'put');
      reload();
      toast.success(t('language_bar.fallback_updated', { language: row.language }));
    } catch {
      toast.error(t('language_bar.fallback_failed'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    setDeleting(true);
    try {
      await makeRequest(`${url}/${deletingRow.id}`, 'delete');
      reload();
      toast.success(t('language_bar.language_removed'));
    } catch (err) {
      toast.error(typeof err === 'string' ? err : t('language_bar.language_remove_failed'));
    } finally {
      setDeleting(false);
      setDeletingRow(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 && (
        <div className="border rounded-md p-10 bg-white flex flex-col items-center gap-3 text-center text-muted-foreground">
          <p className="font-medium text-sm">{t('empty.title')}</p>
          <p className="text-xs max-w-sm">{t('empty.description')}</p>
        </div>
      )}

      {items.map((row) => {
        const isCollapsed = isMobile !== expanded.has(row.id);
        const canUpdate = row.authorizations?.update !== false;
        const canDelete = row.authorizations?.delete !== false;
        const isTogglingFallback = togglingId === row.id;
        const fallbackButton = row.is_fallback ? null : (
          <DevnutButton
            variant="outline"
            size="icon"
            className="size-8 text-muted-foreground hover:text-amber-700"
            title={t('language_bar.toggle_fallback')}
            aria-label={t('language_bar.toggle_fallback')}
            aria-pressed={row.is_fallback}
            disabled={isTogglingFallback}
            onClick={() => handleToggleFallback(row)}
          >
            {isTogglingFallback ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Star className="size-4" />
            )}
          </DevnutButton>
        );
        const fallbackBadge = row.is_fallback ? (
          <DevnutBadge className="bg-amber-100 text-amber-800 text-xs gap-1">
            <Star className="size-2.5 fill-amber-700 text-amber-700" />
            {t('language_bar.fallback_badge')}
          </DevnutBadge>
        ) : null;
        return (
          <div
            key={row.id}
            className={cn('border rounded-md bg-white', row.is_fallback && 'border-amber-300')}
          >
            <div
              className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3 cursor-pointer select-none"
              onClick={() => toggleCollapse(row.id)}
            >
              <div className="flex items-center justify-between gap-2 md:contents">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(row.id);
                  }}
                  className="flex flex-wrap items-center gap-2 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isCollapsed ? (
                    <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp aria-hidden="true" className="size-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{row.language}</span>
                  {row.original_lang && row.original_lang !== row.language && (
                    <span className="text-xs text-muted-foreground">({row.original_lang})</span>
                  )}
                  {!isMobile && fallbackBadge}
                </button>
                {isMobile && (row.is_fallback || (canUpdate && fallbackButton)) && (
                  <div onClick={(e) => e.stopPropagation()}>
                    {row.is_fallback ? fallbackBadge : fallbackButton}
                  </div>
                )}
              </div>
              {isMobile ? (
                // Same layout/buttons as the CrudDataTable cards (ListCard)
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-2 items-stretch pt-2 border-t [&>*]:flex-[1_1_6.25rem] [&>*]:min-w-0">
                    {canUpdate && (
                      <TableActionButton
                        ariaLabel={t('actions.edit')}
                        className={CARD_ACTION_OUTLINE_CLASS}
                        onClick={() => onEdit(row)}
                      >
                        <PencilLine className="h-4 w-4" />
                        <span className="text-xs">{t('actions.edit')}</span>
                      </TableActionButton>
                    )}
                    {canDelete && (
                      <DevnutDeleteButton
                        url={`${url}/${row.id}`}
                        confirmTitle={t('language_bar.delete_language_title')}
                        confirmDescription={t('language_bar.delete_language_description', {
                          language: row.language,
                        })}
                        confirmText={t('language_bar.delete_language_confirm')}
                        onSuccess={reload}
                        showLabel
                        className={CARD_ACTION_LAYOUT_CLASS}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {canUpdate && (
                    <>
                      {fallbackButton}
                      <DevnutButton
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title={t('actions.edit')}
                        aria-label={t('actions.edit')}
                        onClick={() => onEdit(row)}
                      >
                        <Pencil className="size-4" />
                      </DevnutButton>
                    </>
                  )}
                  {canDelete && (
                    <DevnutButton
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      title={t('language_bar.remove_language')}
                      aria-label={t('language_bar.remove_language')}
                      onClick={() => setDeletingRow(row)}
                    >
                      <Trash2 className="size-4" />
                    </DevnutButton>
                  )}
                </div>
              )}
            </div>

            {!isCollapsed && (
              <div className="divide-y border-t">
                <MessageSection label={t('form.content.label')} html={row.content} />
                {EXTRA_MESSAGE_FIELDS.map((field) => (
                  <MessageSection
                    key={field}
                    label={t(`form.${field}.label`)}
                    html={row[field]}
                    missingLabel={t('language_bar.missing_text')}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <AlertDialog
        open={deletingRow !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('language_bar.delete_language_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('language_bar.delete_language_description', { language: deletingRow?.language })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
              {t('language_bar.delete_language_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface MessageSectionProps {
  label: string;
  html: string | null;
  /** Shown when the text is empty (versions saved before every message was required). */
  missingLabel?: string;
}

const MessageSection = ({ label, html, missingLabel }: MessageSectionProps) => (
  <div className="px-4 py-3">
    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
    {html ? (
      <div
        className="prose-content text-sm"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    ) : (
      <p className="text-sm italic text-destructive">{missingLabel}</p>
    )}
  </div>
);
