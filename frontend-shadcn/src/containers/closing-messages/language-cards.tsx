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
import { useApi } from '@/hooks/useApi';
import { sanitizeHtml } from '@/lib/rich-text';
import { cn } from '@/lib/tailwind/utils';
import { getDefaultClosingMessages } from '@/pages/public/labels';
import { ChevronDown, ChevronUp, Loader2, Pencil, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClosingMessageDialog } from './dialog';
import { OPTIONAL_MESSAGE_FIELDS, type ClosingMessageRow } from './utils/types';

interface ClosingMessageLanguageCardsProps {
  surveyId: string | number;
  items: ClosingMessageRow[];
  reload: () => void;
}

export const ClosingMessageLanguageCards = ({
  surveyId,
  items,
  reload,
}: ClosingMessageLanguageCardsProps) => {
  const { t } = useTranslation(['closingMessages']);
  const { makeRequest } = useApi();
  const url = `/surveys/${surveyId}/closing-message`;

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ClosingMessageRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<ClosingMessageRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const defaults = getDefaultClosingMessages();

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
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
        <div className="border rounded-md p-10 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <p className="font-medium text-sm">{t('empty.title')}</p>
          <p className="text-xs max-w-sm">{t('empty.description')}</p>
        </div>
      )}

      {items.map((row) => {
        const isCollapsed = collapsed.has(row.id);
        const canUpdate = row.authorizations?.update !== false;
        const canDelete = row.authorizations?.delete !== false;
        return (
          <div
            key={row.id}
            className={cn('border rounded-md bg-white', row.is_fallback && 'border-amber-300')}
          >
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
              onClick={() => toggleCollapse(row.id)}
            >
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(row.id);
                }}
                className="flex items-center gap-2 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                {row.is_fallback && (
                  <DevnutBadge className="bg-amber-100 text-amber-800 text-xs gap-1">
                    <Star className="size-2.5 fill-amber-700 text-amber-700" />
                    {t('language_bar.fallback_badge')}
                  </DevnutBadge>
                )}
                <span className="text-xs text-muted-foreground">
                  {t('language_bar.version', { version: row.version })}
                </span>
              </button>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {canUpdate && (
                  <>
                    <DevnutButton
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'size-8',
                        row.is_fallback
                          ? 'text-amber-700 hover:text-amber-800'
                          : 'text-muted-foreground hover:text-amber-700'
                      )}
                      title={
                        row.is_fallback
                          ? t('language_bar.fallback_badge')
                          : t('language_bar.toggle_fallback')
                      }
                      aria-label={
                        row.is_fallback
                          ? t('language_bar.fallback_badge')
                          : t('language_bar.toggle_fallback')
                      }
                      aria-pressed={row.is_fallback}
                      disabled={row.is_fallback || togglingId === row.id}
                      onClick={() => handleToggleFallback(row)}
                    >
                      {togglingId === row.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Star className={cn('size-4', row.is_fallback && 'fill-amber-700')} />
                      )}
                    </DevnutButton>
                    <DevnutButton
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title={t('actions.edit')}
                      aria-label={t('actions.edit')}
                      onClick={() => setEditing(row)}
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
            </div>

            {!isCollapsed && (
              <div className="divide-y border-t">
                <MessageSection label={t('form.content.label')} html={row.content} />
                {OPTIONAL_MESSAGE_FIELDS.map((field) => (
                  <MessageSection
                    key={field}
                    label={t(`form.${field}.label`)}
                    html={row[field]}
                    defaultText={defaults[field]}
                    defaultLabel={t('language_bar.default_text')}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <ClosingMessageDialog
          url={url}
          editing={editing}
          excludeLanguageIds={[]}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            reload();
            setEditing(null);
          }}
        />
      )}

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
  defaultText?: string;
  defaultLabel?: string;
}

const MessageSection = ({ label, html, defaultText, defaultLabel }: MessageSectionProps) => (
  <div className="px-4 py-3">
    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
    {html ? (
      <div
        className="prose-content text-sm"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    ) : (
      <p className="text-sm italic text-muted-foreground">
        {defaultText} <span className="not-italic text-xs">({defaultLabel})</span>
      </p>
    )}
  </div>
);
