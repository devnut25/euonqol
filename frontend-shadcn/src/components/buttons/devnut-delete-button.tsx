import { DevnutToast } from '@/components/DevnutToast';
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
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useApi } from '@/hooks/useApi';
import type { Values } from '@/hooks/useCrudDataTable';
import { cn } from '@/lib/tailwind/utils';
import { Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DevnutDeleteButtonProps {
  url: string;
  onSuccess?: () => void;
  requireInput?: boolean;
  params?: Values;
  confirmTitle?: string;
  confirmDescription?: string;
  confirmText?: string;
  className?: string;
  /** Mostra la label accanto all'icona (card mobile) */
  showLabel?: boolean;
}

export function DevnutDeleteButton({
  url,
  onSuccess,
  requireInput = false,
  params,
  confirmTitle,
  confirmDescription,
  confirmText: confirmTextProp,
  className,
  showLabel = false,
}: DevnutDeleteButtonProps) {
  const { t } = useTranslation();
  const { makeRequest, isLoading } = useApi();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const instructionId = useId();

  const confirmText = confirmTextProp ?? t('buttons.deleteConfirm.text', 'Delete');
  const inputValid = !requireInput || inputValue === confirmText;

  const handleDelete = async () => {
    try {
      await makeRequest(url, 'delete', params);
      setOpen(false);
      DevnutToast.success(t('crud_data_table.delete_success', 'Deleted successfully'));
      onSuccess?.();
    } catch (err: any) {
      DevnutToast.error(
        t('crud_data_table.delete_error', 'Delete failed'),
        typeof err === 'string' ? err : undefined
      );
    }
  };

  return (
    <>
      <SimpleTooltip label={t('crud_data_table.actions.delete')}>
        <Button
          variant="outline"
          size={showLabel ? 'default' : 'icon'}
          className={cn(
            showLabel
              ? // Con label: outline rosso, si riempie su hover/click. Contrasti WCAG AA:
                // red-600 su bianco 4.8:1, red-400 su sfondo dark 7:1, bianco su red-600/700 4.8/6.5:1
                'group/delete border border-red-600 bg-transparent text-red-600 shadow-none hover:cursor-pointer hover:bg-red-600 hover:text-white active:bg-red-700 active:text-white focus-visible:ring-red-600/50 dark:border-red-400 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white dark:active:bg-red-700'
              : 'group/delete border-none shadow-none group-hover:bg-red-100 hover:bg-red-500! hover:cursor-pointer',
            className
          )}
          onClick={(e) => {
            e.stopPropagation();
            setInputValue('');
            setOpen(true);
          }}
          aria-label={t('crud_data_table.actions.delete')}
        >
          <Trash2
            aria-hidden="true"
            className={cn(
              'h-4 w-4',
              showLabel ? 'text-current' : 'text-destructive group-hover/delete:text-white!'
            )}
          />
          {showLabel && <span className="text-xs">{t('crud_data_table.actions.delete')}</span>}
        </Button>
      </SimpleTooltip>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="z-99!">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTitle ?? t('crud_data_table.delete_error_messages.confirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription ?? t('crud_data_table.delete_error_messages.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {requireInput && (
            <div className="py-2">
              <p id={instructionId} className="text-sm text-muted-foreground mb-2">
                {t('crud_data_table.delete_type_to_confirm', 'Type "{{text}}" to confirm', {
                  text: confirmText,
                })}
              </p>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                aria-labelledby={instructionId}
                // Flag a mismatch only once the user has typed something
                aria-invalid={inputValue !== '' && !inputValid ? true : undefined}
                placeholder={confirmText}
                autoFocus
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              {t('crud_data_table.actions.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.stopPropagation();
                await handleDelete();
              }}
              disabled={isLoading || !inputValid}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
