import { CreateButton, type CreateButtonProps } from '@/components/buttons/create-button';
import { DevnutDeleteButton } from '@/components/buttons/devnut-delete-button';
import { DevnutDuplicateButton } from '@/components/buttons/devnut-duplicate-button';
import { DataTable } from '@/components/data-table/data-table';
import DevnutSection from '@/components/DevnutSection';
import { DevnutToast } from '@/components/DevnutToast';
import { ItemLoader } from '@/components/ItemLoader';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useApi } from '@/hooks/useApi';
import {
  CrudDataTableContext,
  type CrudDataTableType,
  type Values,
} from '@/hooks/useCrudDataTable';
import { cn } from '@/lib/tailwind/utils';
import { FormChangedContextProvider } from '@/providers/FormChangedContextProvider';
import type { ActionOnSave, Item, ParentBreadcrumb, Tab } from '@/types/crud-data-table';
import type { TableAction } from '@/types/dataTableAction';
import { createQueryString, deleteQueryParams, removeParamsByPrefix } from '@/utils/queryParams';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilLine, Star } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CrudBreadcrumb } from './crud-data-table/crud-breadcrumb';
import { CrudDataTableFooter } from './crud-data-table/crud-footer';
import { TabsSection } from './crud-data-table/crud-tabs-section';
import DevnutTypography from './DevnutTypography';
import type { FormProps } from './FormContainer';

interface DeleteButtonConfig {
  confirmTitle?: string;
  confirmDescription?: string;
  requireInput?: boolean;
  onSuccess?: () => void;
  visible?: (item: Values) => boolean;
}

export interface CrudDataTableProps {
  // DataTable props
  mockData?: Values[];
  columns: ColumnDef<Values>[];
  children?: ReactNode;
  className?: string;

  // CRUD specific props
  url: string;
  type?: CrudDataTableType;
  title?: string;
  titleAddon?: ReactNode;

  // Form configuration
  form?: ComponentType<FormProps>;
  formProps?: Partial<FormProps>;
  formRender?: (item: Values) => ReactNode;

  // Tabs
  tabs?: Tab[] | ((item: Item) => Tab[]);

  // Keys
  keyName?: string;
  keyField?: string;

  // Behavior
  actionOnSave?: ActionOnSave;
  paged?: boolean;

  // Buttons
  hideCreateButton?: boolean;
  createButtonLabel?: string;
  createButtonProps?: CreateButtonProps;
  deleteButtonConfig?: DeleteButtonConfig;

  // Enables the built-in "duplicate" action: opens the create form prefilled from the source row,
  // submitting to `${url}/${row[keyField]}/duplicate`.
  showDuplicate?: boolean;

  // Enables the built-in "toggle fallback" action: PUTs to `url(row)` and reloads the table.
  // Shown only for rows where `is_fallback` is falsy.
  fallbackToggleConfig?: {
    url: (row: Values) => string;
    confirmTitle: string;
    confirmDescription: string;
  };

  // Actions config
  actionsConfig?: TableAction[];

  // Hide specific built-in actions ('view' | 'edit' | 'delete' | 'duplicate')
  hideBuiltinActions?: ('view' | 'edit' | 'delete' | 'duplicate')[];

  // Hide the actions column entirely (no header, no cell)
  hideActionsColumn?: boolean;

  // Hide the form title/back button header
  hideFormTitle?: boolean;

  // Modal/Drawer props
  modalProps?: {
    width?: number;
    className?: string;
    [key: string]: any;
  };
  drawerProps?: {
    width?: number;
    [key: string]: any;
  };

  // Toolbar
  toolbarButton?: {
    actions?: ReactNode[];
    [key: string]: any;
  };

  // Breadcrumb label for current item
  breadcrumbLabel?: (item: Values) => string;

  // Extra breadcrumb segments rendered before title (e.g. parent resource hierarchy)
  parentBreadcrumbs?: { label: string; onClick?: () => void }[];

  // `_id` query-param names this table's own form may open beneath it via custom
  // in-form nesting (not the built-in `tabs` prop) — e.g. QuestionnaireForm renders
  // email-template/assignment sub-tables itself. When one of these is present, this
  // table's own breadcrumb is suppressed in favor of the child's, mirroring what
  // `tabs` already provides automatically.
  childIdKeys?: string[];

  // API specific (for CrudDataTableWithApi)
  searchable?: boolean;
  paginated?: boolean;
  params?: Values;
  // Initial filter values shown on mount; user can freely change/clear them afterwards
  defaultParams?: Values;

  // Override default row click (navigate to detail page instead of inline open)
  onRowClick?: (row: Values) => void;
  disableRowClick?: boolean;

  renderBeforeTable?: (items: Values[]) => ReactNode;

  // Called with the list response's `meta` object whenever the table data reloads
  onMetaChange?: (meta: Values) => void;

  // Called once after a create, update, or delete actually succeeds (not on plain reload/pagination)
  onSuccess?: () => void;
}

export function CrudDataTable({
  form: Form,
  formProps,
  formRender,
  url,
  type = 'default',
  title,
  tabs,
  className,
  actionOnSave = 'list',
  keyName,
  keyField = 'id',
  hideCreateButton = false,
  createButtonLabel,
  createButtonProps,
  deleteButtonConfig,
  showDuplicate = false,
  fallbackToggleConfig,
  modalProps,
  drawerProps,
  children,
  columns,
  toolbarButton,
  titleAddon,
  actionsConfig = [],
  hideBuiltinActions = [],
  hideActionsColumn = false,
  // hideFormTitle = false,
  breadcrumbLabel,
  parentBreadcrumbs,
  params,
  defaultParams,
  onRowClick,
  disableRowClick,
  renderBeforeTable,
  onMetaChange,
  onSuccess,
  childIdKeys,
}: CrudDataTableProps) {
  const { t } = useTranslation(['common']);
  const { makeRequest } = useApi();

  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const reloadRef = useRef<(() => void) | null>(null);

  const [searchParams] = useSearchParams();
  const [item, setItem] = useState<Values>();
  const [loading, setLoading] = useState(false);
  const [formModeState, setFormModeState] = useState<'view' | 'edit' | 'create'>('view');
  const [listAuthorizations, setListAuthorizations] = useState<Record<string, boolean>>();
  const [duplicateSource, setDuplicateSource] = useState<Values | undefined>();

  // Generate internal key name for query params
  const cleanedUpUrl = useMemo(() => {
    const splitted = url?.split('/');
    const output = splitted?.[splitted.length - 1];
    return output ?? url?.replace('/', '');
  }, [url]);

  const internalKeyName = keyName ? `${keyName}_id` : `${cleanedUpUrl}_id`;

  // Get item ID from query params
  const queryItemId = useMemo(() => {
    return searchParams.get(internalKeyName);
  }, [searchParams, internalKeyName]);

  const queryMode = searchParams.get('mode') as 'view' | 'edit' | null;

  // Derive open state from queryItemId
  const open = useMemo(() => !!queryItemId, [queryItemId]);

  // Only meaningful for a table that has descendants of its own: either the built-in
  // `tabs` prop (e.g. SurveyTable — another `_id` param means a child tab's item is
  // open), or an explicit `childIdKeys` list for custom in-form nesting (e.g.
  // QuestionnaireTable/QuestionnaireForm). A leaf table with neither has no descendant
  // to detect this way — any other `_id` param present belongs to an ancestor, not a
  // child, so isChildOpen must stay false or its own breadcrumb never shows.
  const isChildOpen = useMemo(() => {
    if (tabs) {
      return [...searchParams.keys()].some((k) => k.endsWith('_id') && k !== internalKeyName);
    }
    if (childIdKeys?.length) {
      return childIdKeys.some((k) => searchParams.has(k));
    }
    return false;
  }, [tabs, childIdKeys, searchParams, internalKeyName]);

  // In the 'default' type the list and the detail replace each other in the page: the element
  // that had focus (row button, breadcrumb, "Back") gets hidden and focus would fall back to
  // <body>. Move it to the content that is now shown (WCAG 2.4.3). Modal/drawer types are
  // handled by the dialog focus trap.
  const listRef = useRef<HTMLDivElement>(null);
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    if (type !== 'default') return;

    const hiddenContainers = open
      ? [listRef.current]
      : [breadcrumbRef.current, detailRef.current];
    const active = document.activeElement;
    const focusLost =
      !active ||
      active === document.body ||
      hiddenContainers.some((container) => container?.contains(active));
    if (!focusLost) return;

    const hasBreadcrumb = !!breadcrumbRef.current?.firstElementChild && !isChildOpen;
    const target = open
      ? hasBreadcrumb
        ? breadcrumbRef.current
        : detailRef.current
      : listRef.current;
    target?.focus();
  }, [open, type, isChildOpen]);

  // Derive itemId from queryItemId
  const itemId = useMemo(() => {
    if (queryItemId && queryItemId !== 'create') {
      return { [keyField]: queryItemId };
    }
    return {};
  }, [queryItemId, keyField]);

  const formMode: 'view' | 'edit' | 'create' = useMemo(() => {
    if (queryItemId === 'create') return 'create';
    if (queryItemId) return queryMode ?? formModeState;
    return 'create';
  }, [queryItemId, queryMode, formModeState]);

  const componentTitle = useMemo(() => {
    if (formMode === 'create') return t('crud_data_table.form.create');
    if (formMode === 'edit') return t('crud_data_table.form.edit');
    return t('crud_data_table.form.informations');
  }, [formMode, t]);

  const currentLabel = useMemo(() => {
    if (formMode === 'create') return t('crud_data_table.form.create');
    if (breadcrumbLabel && item) return breadcrumbLabel(item);
    return item?.name ?? item?.title ?? componentTitle;
  }, [formMode, item, breadcrumbLabel, componentTitle, t]);

  const handleChangeItem = (item: Values | undefined) => {
    setLoading(false);

    if (item?.[keyField as string]) {
      const spWithoutMode = new URLSearchParams(searchParams.toString());
      spWithoutMode.delete('mode');
      const newQuery = createQueryString(spWithoutMode, {
        [internalKeyName]: item[keyField as string],
      });
      navigate(`${pathname}?${newQuery}`, {
        replace: type !== 'default',
      });
    }

    if (!item) {
      setItem(undefined);
      setFormModeState('view');
      setDuplicateSource(undefined);
      const tabName = `${keyName ?? cleanedUpUrl}_tab`;
      const spNoExtra = removeParamsByPrefix(searchParams, 'extra_');
      const queryString = deleteQueryParams(spNoExtra, [internalKeyName, tabName, 'mode']);
      navigate(`${pathname}?${queryString}`, {
        replace: type !== 'default',
      });
    }
  };

  const key = itemId?.[keyField as string];
  const itemUrl = key
    ? `${url}/${key}`
    : duplicateSource
      ? `${url}/${duplicateSource[keyField as string]}/duplicate`
      : url;

  const reloadTable = () => {
    reloadRef.current?.();
  };

  const handleBack = () => {
    handleChangeItem(undefined);
  };

  const handleRowClick = disableRowClick
    ? undefined
    : (row: Values) => {
        if (onRowClick) {
          onRowClick(row);
          return;
        }
        const newQuery = createQueryString(searchParams, {
          [internalKeyName]: String(row[keyField as string]),
        });
        navigate(`${pathname}?${newQuery}`, { replace: type !== 'default' });
      };

  const baseForm = (initialValues: Values | undefined, mutate?: Function) => {
    if (!initialValues) return null;

    // Custom form render
    if (formRender) return formRender(initialValues);

    if (!Form) return null;

    return (
      <>
        {/* {type == 'default' && !hideFormTitle && (
          <div className="flex items-center gap-2">
            <Button variant="link" onClick={handleBack} className="text-black p-0!">
              <ChevronLeft />
            </Button>
            {componentTitle && <h2 className="text-lg font-semibold">{componentTitle}</h2>}
          </div>
        )} */}
        <Form
          key={initialValues.id}
          readonly={formMode === 'view'}
          onEdit={() => {
            const newQuery = createQueryString(searchParams, { mode: 'edit' });
            navigate(`${pathname}?${newQuery}`, { replace: type !== 'default' });
          }}
          onLoadingChange={setLoading}
          initialValues={initialValues}
          url={itemUrl}
          onSuccess={({ data }) => {
            reloadTable();
            onSuccess?.();

            // Handle redirect after save
            if (actionOnSave === 'detail') {
              mutate?.();
              setFormModeState('view');
              handleChangeItem(data);
            } else if (actionOnSave === 'list') {
              handleChangeItem(undefined);
            } else if (typeof actionOnSave === 'object' && actionOnSave.type === 'custom') {
              const customRoute = actionOnSave.route(data);
              navigate(customRoute);
            }
          }}
          submitter={{
            searchConfig: {
              submitText: t('buttons.values.save'),
            },
            resetButtonProps: {
              style: { display: 'none' }, // Nascondi il reset, usi "Indietro" del FormSubmitter
            },
            render: (helpers, defaultDom) => (
              <CrudDataTableFooter helpers={helpers}>{defaultDom}</CrudDataTableFooter>
            ),
          }}
          {...formProps}
        />
      </>
    );
  };

  const renderContent = () => {
    if (!open) return null;

    // Render with tabs
    if (tabs && key) {
      return (
        <ItemLoader url={itemUrl} onItemChange={setItem}>
          {(item, mutate) => {
            if (!item) return null;
            const _tabs = Array.isArray(tabs) ? tabs : tabs(item);
            const tabsParentBreadcrumbs: ParentBreadcrumb[] = [
              { label: title ?? '', onClick: handleBack },
              { label: currentLabel },
            ];
            return (
              <FormChangedContextProvider>
                <TabsSection
                  keyName={keyName ?? cleanedUpUrl}
                  item={item}
                  mutate={mutate}
                  baseForm={baseForm}
                  tabs={_tabs}
                  parentBreadcrumbs={tabsParentBreadcrumbs}
                />
              </FormChangedContextProvider>
            );
          }}
        </ItemLoader>
      );
    }

    // Create mode (no key)
    if (!key) {
      const initial = duplicateSource
        ? { ...duplicateSource, id: undefined, created_at: undefined, updated_at: undefined }
        : itemId;
      return baseForm(initial);
    }

    // Edit/View mode
    return (
      <ItemLoader url={itemUrl} onItemChange={setItem}>
        {(item, mutate) => (
          <FormChangedContextProvider>{baseForm(item, mutate)}</FormChangedContextProvider>
        )}
      </ItemLoader>
    );
  };

  // Context value
  const contextValue = {
    item,
    type,
    loading,
    open,
    setLoading,
    handleChangeItem,
    handleBack,
    reloadTable,
  };

  // TODO: aggiungere la possibilità di aggiungere ulteriori azioni all'interno delle actions
  // Enhanced actions config with CRUD operations
  const enhancedActionsConfig: TableAction[] = [
    // {
    //   id: 'view',
    //   label: t('crud_data_table.actions.view'),
    //   icon: Info,
    //   action: 'view',
    //   onClick: (row: { id: string | number }) => {
    //     setFormModeState('view');
    //     const newQuery = createQueryString(searchParams, {
    //       [internalKeyName]: String(row.id),
    //     });
    //     navigate(`${pathname}?${newQuery}`, {
    //       replace: type !== 'default',
    //     });
    //   },
    // },
    ...(fallbackToggleConfig
      ? [
          {
            id: 'toggle-fallback',
            label: t('common:crud_data_table.actions.toggle_fallback'),
            visible: (row: Values) => !row.is_fallback && row.authorizations?.update !== false,
            iconFn: () => () => <Star />,
            requireConfirm: true,
            confirmConfig: {
              title: fallbackToggleConfig.confirmTitle,
              description: fallbackToggleConfig.confirmDescription,
              confirmText: t('common:crud_data_table.actions.toggle_fallback_confirm_text'),
            },
            onClick: async (row: Values, reload: () => void) => {
              try {
                await makeRequest(fallbackToggleConfig.url(row), 'put');
                reload();
              } catch (err) {
                DevnutToast.error(typeof err === 'string' ? err : 'Failed to update fallback');
              }
            },
          } as TableAction,
        ]
      : []),
    {
      id: 'edit',
      label: t('crud_data_table.actions.edit'),
      icon: PencilLine,
      action: 'update',
      onClick: (row: Values) => {
        const newQuery = createQueryString(searchParams, {
          [internalKeyName]: String(row[keyField as string]),
          mode: 'edit',
        });
        navigate(`${pathname}?${newQuery}`, {
          replace: type !== 'default',
        });
      },
    },
    ...(showDuplicate
      ? [
          {
            id: 'duplicate',
            label: t('common:crud_data_table.actions.duplicate'),
            render: (row: Values) => (
              <DevnutDuplicateButton
                ariaLabel={t('common:crud_data_table.actions.duplicate')}
                onDuplicate={() => {
                  setDuplicateSource(row);
                  const newQuery = createQueryString(searchParams, {
                    [internalKeyName]: 'create',
                  });
                  navigate(`${pathname}?${newQuery}`, {
                    replace: type !== 'default',
                  });
                  handleChangeItem({});
                }}
              />
            ),
          } as TableAction,
        ]
      : []),
    {
      id: 'delete',
      label: t('crud_data_table.actions.delete'),
      action: 'delete' as const,
      visible: (row: Values) =>
        row.authorizations?.delete !== false && (deleteButtonConfig?.visible?.(row) ?? true),
      render: (row: Values, reload: () => void) => {
        const {
          onSuccess: configOnSuccess,
          visible: _visible,
          ...restConfig
        } = deleteButtonConfig ?? {};
        return (
          <DevnutDeleteButton
            url={`${url}/${row[keyField as string]}`}
            {...restConfig}
            onSuccess={() => {
              reload();
              configOnSuccess?.();
              onSuccess?.();
            }}
          />
        );
      },
    },
  ];

  const componentMap = {
    default: DefaultCrud,
    modal: ModalCrud,
    drawer: DrawerCrud,
  } as const;

  const Component = componentMap[type as keyof typeof componentMap] || DefaultCrud;

  return (
    <CrudDataTableContext.Provider value={contextValue}>
      {children}

      <div
        ref={listRef}
        tabIndex={-1}
        className={cn('outline-none', type === 'default' && open && 'hidden')}
      >
        <DataTable
          url={url}
          columns={columns}
          className={className}
          reloadRef={reloadRef}
          params={params}
          defaultFilters={defaultParams}
          renderBeforeTable={renderBeforeTable}
          onRowClick={handleRowClick}
          onMetaChange={(meta) => {
            setListAuthorizations(meta?.authorizations);
            onMetaChange?.(meta);
          }}
          fetchEnabled={type !== 'modal' || !open}
          actionsConfig={
            hideActionsColumn
              ? undefined
              : {
                  baseUrl: url,
                  actions: [
                    ...actionsConfig,
                    ...enhancedActionsConfig.filter(
                      (a) => !hideBuiltinActions.includes(a.id as any)
                    ),
                  ],
                }
          }
        >
          {/* Toolbar with create button */}
          <div className="flex items-center justify-between">
            <div className="flex justify-between items-center gap-2">
              {title && <DevnutTypography.Title title={title} />}
              {titleAddon}
            </div>
            <div className="flex items-center gap-2">
              {...toolbarButton?.actions ?? []}
              {!hideCreateButton && (
                <CreateButton
                  label={createButtonLabel}
                  onClick={() => {
                    const newQuery = createQueryString(searchParams, {
                      [internalKeyName]: 'create',
                    });
                    navigate(`${pathname}?${newQuery}`, {
                      replace: type !== 'default',
                    });
                    handleChangeItem({});
                  }}
                  {...createButtonProps}
                  disabled={listAuthorizations?.create === false || createButtonProps?.disabled}
                />
              )}
            </div>
          </div>
        </DataTable>
      </div>

      <div
        ref={breadcrumbRef}
        tabIndex={-1}
        className={cn('outline-none', (!open || isChildOpen) && 'hidden')}
      >
        <CrudBreadcrumb
          title={title}
          currentLabel={currentLabel}
          onBack={handleBack}
          parentBreadcrumbs={parentBreadcrumbs}
        />
      </div>

      <Component
        open={open}
        onClose={handleBack}
        title={componentTitle}
        contentRef={detailRef}
        {...modalProps}
        {...drawerProps}
      >
        {renderContent()}
      </Component>
    </CrudDataTableContext.Provider>
  );
}

// --- Crud wrapper components ---
interface ComponentProps {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  /** Focus target of the inline ('default') detail */
  contentRef?: RefObject<HTMLDivElement | null>;
}

export const ModalCrud = ({
  open,
  children,
  onClose,
  className,
  title,
  contentRef: _contentRef,
  ...props
}: ComponentProps & { width?: number; className?: string }) => {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()} {...props}>
      <DialogContent
        className={cn('overflow-y-auto max-h-[90vh] gap-12 w-11/12 lg:max-w-4xl', className)}
      >
        <DialogHeader className="sm:text-center">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
};

const DrawerCrud = ({
  open,
  children,
  onClose,
  title,
  contentRef: _contentRef,
  ...props
}: ComponentProps) => (
  <Drawer open={open} onOpenChange={(val) => !val && onClose()} direction="right" {...props}>
    <DrawerContent>
      {/* The drawer is a dialog: it needs a title for its accessible name (WCAG 4.1.2) */}
      <DrawerTitle className="sr-only">{title}</DrawerTitle>
      <DevnutSection.Grid className="pb-16">{children}</DevnutSection.Grid>
    </DrawerContent>
  </Drawer>
);

const DefaultCrud = ({ children, contentRef }: ComponentProps) => {
  return (
    <div ref={contentRef} tabIndex={-1} className="outline-none">
      <DevnutSection.Grid>{children}</DevnutSection.Grid>
    </div>
  );
};
