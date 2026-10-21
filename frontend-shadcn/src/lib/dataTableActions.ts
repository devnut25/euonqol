import type { Values } from '@/hooks/useCrudDataTable';
import type { DataTableActionsConfig, TableAction } from '@/types/dataTableAction';

/**
 * Un'azione è effettivamente visibile per la riga se supera sia il predicato `visible`
 * sia (per le azioni senza `render` custom, che passano da TableActionButton) il check authorizations.
 */
export function isActionVisibleForRow(action: TableAction, row: Values): boolean {
  if (action.visible && !action.visible(row)) return false;
  if (!action.render && action.action) {
    const authorizations = row?.authorizations;
    if (authorizations && authorizations[action.action] === false) return false;
  }
  return true;
}

/**
 * Almeno un'azione è visibile per questa riga.
 */
export function rowHasVisibleAction(
  actionsConfig: DataTableActionsConfig | undefined,
  row: Values
): boolean {
  return !!actionsConfig?.actions?.some((action) => isActionVisibleForRow(action, row));
}
