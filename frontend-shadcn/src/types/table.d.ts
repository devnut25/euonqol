import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // meta per badge
  export interface BadgeConfig {
    variants?: Record<string, string>; // classi tailwind, es. { true: "bg-green-500 text-white" }
    labels?: Record<string, string>;
  }

  export interface ColumnMeta<TData extends RowData> {
    filterVariant?: 'text' | 'range' | 'select' | 'switch';
    // valueType usato dal tuo TableConfigProvider
    valueType?:
      | 'boolean'
      | 'number'
      | 'currency'
      | 'date'
      | 'datetime'
      | 'percentage'
      | 'badge'
      | 'longText'
      | 'longTextHtml'
      | string;
    // filterEnum: chiave enum per le opzioni del filtro (switch/select)
    filterEnum?: string;
    // filterMode: 'multiple' abilita selezione multipla sul filtro 'select' (invia array a filter[field])
    filterMode?: 'single' | 'multiple';
    // showAllOption: mostra l'opzione "Select All" nel dropdown
    showAllOption?: boolean;
    // valueEnum: chiave enum per la label nella cella
    valueEnum?: string;
    // indica se la colonna deve essere inclusa nei filtri di ricerca
    searchable?: boolean;
    // indica se la colonna deve essere filtrabile
    filterable?: boolean;
    // config per badge
    badgeConfig?: BadgeConfig;
    // callback opzionale per toggle inline (se vuoi supportare toggling boolean)
    onToggle?: (row: TData, columnId: string) => Promise<void> | void;

    // ============================================
    // Mobile Card Layout Props (tipo Flutter ListTile)
    // ============================================
    // Ruolo della colonna nella card mobile
    mobileCardRole?: 'title' | 'subtitle' | 'leading' | 'trailing' | 'body';
    // Ordine di visualizzazione (per body fields)
    mobileCardOrder?: number;
    // Nascondi colonna su mobile
    hideInMobile?: boolean;
    // Nascondi colonna in tabella
    hideInTable?: boolean;
    // Alternativa a hideInMobile
    mobileCardHide?: boolean;
  }
}
