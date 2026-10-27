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

/**
 * Stile unico dei bottoni azione nelle card mobile: layout a tutta larghezza + Outlined.
 * Il delete ha il proprio outline rosso (DevnutDeleteButton con showLabel): usare solo il layout.
 */
export const CARD_ACTION_LAYOUT_CLASS = 'w-full min-w-0 h-auto min-h-8 whitespace-normal text-center';
export const CARD_ACTION_OUTLINE_CLASS = `${CARD_ACTION_LAYOUT_CLASS} border border-solid border-input bg-transparent hover:bg-slate-300`;
