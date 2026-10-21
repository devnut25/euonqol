import type { CrudDataTableType } from '@/hooks/useCrudDataTable';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DevnutButton } from '../DevnutButton';

interface FormSubmitterProps {
  type?: CrudDataTableType;
  loading?: boolean;
  onBack?: () => void;
  children?: ReactNode;
  className?: string;
  /** Forza la visualizzazione anche in readonly */
  showInReadOnly?: boolean;
}

export const FormSubmitter = ({
  type,
  loading = false,
  onBack,
  children,
  className,
  showInReadOnly = false,
}: FormSubmitterProps) => {
  const { t } = useTranslation(['common']);
  const readonly = useFormReadOnly();

  const content = readonly && !showInReadOnly ? null : children;

  const backButton = useMemo(() => {
    if (!onBack) return null;

    const label = type === 'default' ? t('buttons.values.back') : t('buttons.values.close');

    return (
      <DevnutButton
        type="button"
        variant="outline"
        disabled={loading}
        onClick={onBack}
        className="text-sm"
      >
        {label}
      </DevnutButton>
    );
  }, [onBack, loading, type, t]);

  // Layout: default - footer sticky in fondo alla pagina
  if (type === 'default') {
    return (
      <div
        // Il pulsante accessibilità fisso (AccessibilityMenu) si alza sopra questa barra
        data-fixed-form-submitter
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40',
          'flex items-center justify-between',
          'px-6 py-2',
          'bg-background/80 backdrop-blur-sm',
          'border-t',
          className
        )}
      >
        <div>{backButton}</div>
        <div className="flex items-center gap-2">{content}</div>
      </div>
    );
  }

  // Layout: drawer - footer assoluto in fondo al drawer
  if (type === 'drawer') {
    return (
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-50',
          'flex items-center justify-between',
          'px-6 py-3',
          'bg-background/80 backdrop-blur-sm',
          'border-t',
          className
        )}
      >
        <div>{backButton}</div>
        <div className="flex items-center gap-2">{content}</div>
      </div>
    );
  }

  // Layout: modal - footer inline con spacing
  if (type === 'modal') {
    return (
      <div className={cn('flex items-center justify-between w-full pt-2', className)}>
        <div>{backButton}</div>
        <div className="flex items-center gap-4">{content}</div>
      </div>
    );
  }

  // Fallback generico (type non specificato o sconosciuto)
  return (
    <div className={cn('flex items-center justify-between w-full', className)}>
      <div>{backButton}</div>
      <div className="flex items-center gap-2">{content}</div>
    </div>
  );
};
