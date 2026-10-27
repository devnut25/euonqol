import { SimpleTooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/tailwind/utils';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DevnutDuplicateButtonProps {
  onDuplicate: () => void;
  className?: string;
  ariaLabel?: string;
  /** Mostra la label accanto all'icona (card mobile) */
  showLabel?: boolean;
}

export function DevnutDuplicateButton({
  onDuplicate,
  className,
  ariaLabel,
  showLabel = false,
}: DevnutDuplicateButtonProps) {
  const { t } = useTranslation();
  // Icon-only: the label names the button and is shown as its tooltip
  const label = ariaLabel ?? t('crud_data_table.actions.duplicate');

  return (
    <SimpleTooltip label={label}>
      <Button
        variant="outline"
        size={showLabel ? 'default' : 'icon'}
        className={cn('border-none shadow-none hover:bg-slate-300 hover:cursor-pointer', className)}
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
        aria-label={label}
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
        {showLabel && <span className="text-xs">{label}</span>}
      </Button>
    </SimpleTooltip>
  );
}
