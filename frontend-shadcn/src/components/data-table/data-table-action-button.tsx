import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/tailwind/utils';
import { Loader2 } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { useNavigate } from 'react-router-dom';

export type AuthorizationAction =
  'view' | 'update' | 'delete' | 'reset_password' | 'toggle_status' | 'create';

export interface Authorizations {
  view?: boolean;
  update?: boolean;
  delete?: boolean;
  reset_password?: boolean;
  toggle_status?: boolean;
  create?: boolean;
}

export interface TableActionButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof Button>,
  'onClick'
> {
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  loading?: boolean;
  /** Nome accessibile, mostrato anche come tooltip (hover + focus; non su touch) */
  ariaLabel: string;
  /** Quale azione/permesso richiede questo bottone */
  action?: AuthorizationAction;
  /** Permessi dell'utente per questa risorsa */
  authorizations?: Authorizations;
}

export function TableActionButton({
  href,
  onClick,
  loading = false,
  ariaLabel,
  disabled,
  children,
  variant = 'outline',
  size = 'icon',
  className,
  action,
  authorizations,
  ...props
}: TableActionButtonProps) {
  const navigate = useNavigate();

  // Verifica se l'azione è autorizzata
  const isAuthorized = !action || !authorizations || authorizations[action] !== false;

  // Non renderizzare se non autorizzato
  if (!isAuthorized) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    if (loading || disabled) return;

    if (href) {
      navigate(href);
      return;
    }

    if (onClick) {
      await onClick(e);
    }
  };

  return (
    <SimpleTooltip label={ariaLabel}>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        className={cn('border-none shadow-none hover:bg-slate-300 hover:cursor-pointer', className)}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Button>
    </SimpleTooltip>
  );
}
