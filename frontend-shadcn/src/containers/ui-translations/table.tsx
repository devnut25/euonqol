import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutButton } from '@/components/DevnutButton';
import { DevnutToast } from '@/components/DevnutToast';
import { Badge } from '@/components/ui/badge';
import { validateUiTranslation } from '@/features/schema/ui-translations/schema';
import { useApi } from '@/hooks/useApi';
import type { Values } from '@/hooks/useCrudDataTable';
import { cn } from '@/lib/tailwind/utils';
import type { TableAction } from '@/types/dataTableAction';
import type { ColumnDef } from '@tanstack/react-table';
import { useId, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

export interface UiTranslationRow {
  id: string;
  key: string;
  /** Where the text appears on the public page. */
  section: string;
  /** Never shown as visible text: tooltip, aria-label or screen-reader only. */
  hidden_text: boolean;
  language_id: number;
  /** English text, read-only reference. */
  reference: string | null;
  /** Saved text for the selected language; null = not translated (falls back to English). */
  value: string | null;
}

interface RowState {
  draft: string;
  error: string | null;
  saving: boolean;
}

/**
 * Unsaved edits per key, outside React state: the textarea and the Save button of a row
 * subscribe only to their own key, so typing never re-renders CrudDataTable/DataTable.
 * A DataTable re-render would remount the mobile cards and drop the textarea's focus.
 */
function createDraftStore() {
  const rows = new Map<string, RowState>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (key: string) => rows.get(key),
    patch(key: string, saved: string, patch: Partial<RowState>) {
      const current = rows.get(key) ?? { draft: saved, error: null, saving: false };
      rows.set(key, { ...current, ...patch });
      emit();
    },
    clear(key: string) {
      rows.delete(key);
      emit();
    },
  };
}

type DraftStore = ReturnType<typeof createDraftStore>;

// Drafts are per language too: switching the language filter must not show another
// language's unsaved edits.
const draftKey = (row: UiTranslationRow) => `${row.language_id}:${row.key}`;

const useRowState = (store: DraftStore, row: UiTranslationRow) =>
  useSyncExternalStore(store.subscribe, () => store.get(draftKey(row)));

const TranslationCell = ({ store, row }: { store: DraftStore; row: UiTranslationRow }) => {
  const { t } = useTranslation(['settings']);
  const errorId = useId();
  const state = useRowState(store, row);
  const saved = row.value ?? '';
  const draft = state?.draft ?? saved;

  return (
    <div className="flex flex-col gap-1 min-w-48">
      <textarea
        rows={2}
        value={draft}
        placeholder={row.reference ?? undefined}
        aria-label={t('ui_translations.value_label', { section: row.section })}
        aria-invalid={state?.error ? true : undefined}
        aria-describedby={state?.error ? errorId : undefined}
        onChange={(e) => store.patch(draftKey(row), saved, { draft: e.target.value, error: null })}
        className={cn(
          'flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y',
          'aria-invalid:border-destructive aria-invalid:ring-destructive'
        )}
      />
      {state?.error && (
        <p id={errorId} className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
};

const SaveTranslationButton = ({
  store,
  row,
  reload,
}: {
  store: DraftStore;
  row: UiTranslationRow;
  reload: () => void;
}) => {
  const { t } = useTranslation(['settings']);
  const { makeRequest } = useApi();
  const state = useRowState(store, row);
  const saved = row.value ?? '';
  const dirty = !!state && state.draft.trim() !== saved.trim();

  const handleSave = async () => {
    if (!state || !dirty || state.saving) return;
    const error = validateUiTranslation(row.reference, state.draft);
    if (error) {
      store.patch(draftKey(row), saved, { error });
      DevnutToast.error(error);
      return;
    }
    store.patch(draftKey(row), saved, { saving: true });
    try {
      await makeRequest(`/settings/ui-translations/${row.key}`, 'put', {
        language_id: row.language_id,
        value: state.draft,
      });
      DevnutToast.success(t('ui_translations.saved'));
      store.clear(draftKey(row));
      reload();
    } catch (err: any) {
      store.patch(draftKey(row), saved, { saving: false });
      DevnutToast.error(typeof err === 'string' ? err : t('ui_translations.save_error'));
    }
  };

  return (
    <DevnutButton
      size="sm"
      loading={state?.saving}
      aria-disabled={!dirty || state?.saving || undefined}
      aria-label={`${t('ui_translations.save')}: ${row.section}`}
      onClick={handleSave}
      className="aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
    >
      {t('ui_translations.save')}
    </DevnutButton>
  );
};

export const UiTranslationsTable = ({ defaultLanguageId }: { defaultLanguageId: number }) => {
  const { t } = useTranslation(['settings']);
  const storeRef = useRef<DraftStore | null>(null);
  storeRef.current ??= createDraftStore();
  const store = storeRef.current;

  const columns = useMemo<ColumnDef<Values>[]>(
    () => [
      {
        // Toolbar filter only: every row belongs to the filtered language
        id: 'language_id',
        header: t('ui_translations.columns.language'),
        accessorKey: 'language_id',
        enableSorting: false,
        meta: {
          filterable: true,
          filterVariant: 'apiSelect',
          filterUrl: '/languages/all',
          filterLabelKey: 'language',
          hideInTable: true,
          hideInMobile: true,
        },
      },
      {
        id: 'reference',
        header: t('ui_translations.columns.reference'),
        // '' instead of null: Cell renders "-" for null values without calling `cell`
        accessorFn: (row) => (row as UiTranslationRow).reference ?? '',
        enableSorting: false,
        meta: {
          mobileCardRole: 'body',
          mobileCardOrder: 2,
          label: t('ui_translations.columns.reference'),
        },
        cell: ({ row }) => (
          <span className="block min-w-40 max-w-80 whitespace-normal text-sm">
            {(row.original as UiTranslationRow).reference ?? '—'}
          </span>
        ),
      },
      {
        id: 'display',
        header: t('ui_translations.columns.display'),
        // '' instead of false/null: Cell renders "-" for null values without calling `cell`
        accessorFn: (row) => ((row as UiTranslationRow).hidden_text ? 'hidden' : ''),
        enableSorting: false,
        meta: { mobileCardRole: 'trailing', label: t('ui_translations.columns.display') },
        cell: ({ row }) =>
          (row.original as UiTranslationRow).hidden_text ? (
            <Badge variant="outline" title={t('ui_translations.hidden_text_hint')}>
              {t('ui_translations.hidden_text')}
            </Badge>
          ) : null,
      },
      {
        id: 'section',
        header: t('ui_translations.columns.section'),
        accessorKey: 'section',
        meta: { searchable: true, mobileCardRole: 'title', mobileCardOrder: 1 },
        cell: ({ row }) => (
          <span className="block min-w-40 max-w-72 whitespace-normal text-sm">
            {(row.original as UiTranslationRow).section}
          </span>
        ),
      },
      {
        id: 'value',
        header: t('ui_translations.columns.value'),
        accessorFn: (row) => (row as UiTranslationRow).value ?? '',
        enableSorting: false,
        meta: {
          mobileCardRole: 'body',
          mobileCardOrder: 3,
          label: t('ui_translations.columns.value'),
        },
        cell: ({ row }) => <TranslationCell store={store} row={row.original as UiTranslationRow} />,
      },
    ],
    [t, store]
  );

  const actionsConfig = useMemo<TableAction[]>(
    () => [
      {
        id: 'save',
        label: t('ui_translations.save'),
        render: (row, reload) => (
          <SaveTranslationButton store={store} row={row as UiTranslationRow} reload={reload} />
        ),
      },
    ],
    [t, store]
  );

  // English preselected in the language filter (and restored by Reset)
  const defaultParams = useMemo(
    () => ({ language_id: String(defaultLanguageId) }),
    [defaultLanguageId]
  );

  return (
    <CrudDataTable
      className="p-0"
      title={t('ui_translations.title')}
      columns={columns}
      url="/settings/ui-translations"
      defaultParams={defaultParams}
      actionsConfig={actionsConfig}
      hideCreateButton
      hideBuiltinActions={['edit', 'delete', 'duplicate']}
      disableRowClick
    />
  );
};
