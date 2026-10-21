import { useCrudDataTable } from '@/hooks/useCrudDataTable';
import { useFormChangedContext } from '@/hooks/useFormChanged';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubmitterRenderHelpers } from '../form/form';
import { FormSubmitter } from '../form/form-submitter';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface CrudDataTableFooterProps {
  children?: ReactNode;
  helpers?: SubmitterRenderHelpers;
}

export function CrudDataTableFooter({ children, helpers }: CrudDataTableFooterProps) {
  const { t } = useTranslation(['common']);
  const { type, loading, handleBack } = useCrudDataTable();

  const context = useFormChangedContext();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const checkHandleBack = () => {
    // Prima controlla se helpers.isDirty è disponibile (più affidabile)
    if (helpers?.isDirty) {
      setConfirmOpen(true);
      return;
    }

    // Fallback al vecchio sistema context
    if (context && Object.keys(context.checkFormChanged).length > 0) {
      let formChanged = false;
      for (const fn of Object.values(context.checkFormChanged)) {
        formChanged = fn();
        if (formChanged) break;
      }
      if (formChanged) {
        setConfirmOpen(true);
        return;
      }
    }

    handleBack();
  };

  const handleConfirmBack = () => {
    setConfirmOpen(false);
    handleBack();
  };

  return (
    <>
      <FormSubmitter
        type={type}
        loading={helpers?.isSubmitting ?? loading}
        onBack={checkHandleBack}
      >
        {children}
      </FormSubmitter>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-100">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('crud_data_table.footer_dialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('crud_data_table.footer_dialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('crud_data_table.footer_dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmBack}>
              {t('crud_data_table.footer_dialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
