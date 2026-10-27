import type { Values } from '@/hooks/useCrudDataTable';
import type { ComponentType, ReactNode } from 'react';

export type ActionMode = 'modal' | 'drawer' | 'page';

export interface TableAction {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  iconFn?: (row: Values) => ComponentType<{ className?: string }>;
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline';

  className?: string;

  // Modalità di apertura
  openMode?: ActionMode;

  // Handler custom
  onClick?: (row: Values, reload: () => void) => void | Promise<void>;
  // ctx.layout = 'card' quando renderizzato nella card mobile (bottoni con label testuale)
  render?: (row: Values, reload: () => void, ctx?: { layout: 'card' | 'table' }) => ReactNode;

  // Configurazione per action che usano form
  action?: 'view' | 'update' | 'create' | 'delete';

  // Configurazione per page mode
  route?: string;

  // Visibilità condizionale
  visible?: (row: Values) => boolean;

  // Conferma richiesta
  requireConfirm?: boolean;
  confirmConfig?: {
    title?: string;
    description?: string;
    confirmText?: string;
    requireInput?: boolean;
    inputText?: string;
  };
}

export interface DataTableActionsConfig {
  baseUrl: string;
  formComponent?: ComponentType<any>;
  defaultOpenMode?: ActionMode;
  actions?: TableAction[];
  disableDefaultActions?: boolean;
  onActionSuccess?: (action: string, row: Values) => void;
  onActionError?: (action: string, row: Values, error: Error) => void;
}
