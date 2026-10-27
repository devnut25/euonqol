import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutButton } from '@/components/DevnutButton';
import { ModuleTypeBadge } from '@/components/ModuleTypeBadge';
import { SectionInfoModal } from '@/components/SectionInfoModal';
import { UsageCell } from '@/components/UsageCell';
import type { Values } from '@/hooks/useCrudDataTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { ModuleTypeGroupEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/table-core';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ModuleForm } from './form';

export const ModuleLibraryTable = () => {
  const { t } = useTranslation(['management']);

  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(768);

  const initialType =
    (location.state as { moduleTypeGroup?: ModuleTypeGroupEnum } | null)?.moduleTypeGroup ??
    ModuleTypeGroupEnum.KitModule;

  const moduleColumns: ColumnDef<Values>[] = [
    {
      id: 'name',
      header: t('module.columns.name'),
      accessorKey: 'name',
      meta: { searchable: true, mobileCardRole: 'title', mobileCardOrder: 1 },
    },
    {
      id: 'type',
      header: t('module.columns.type'),
      accessorKey: 'type',
      enableSorting: false,
      cell: ({ row }) => (
        <ModuleTypeBadge
          type={row.getValue('type') as string}
          className="min-w-[90px] justify-center"
        />
      ),
      meta: {
        filterable: true,
        filterVariant: 'switch',
        filterEnum: 'moduleTypeGroup',
        mobileCardRole: 'trailing',
        mobileCardOrder: 2,
      },
    },
    {
      id: 'patientGroup',
      header: t('module.columns.group'),
      accessorKey: 'patient_group.description',
      enableSorting: false,
      meta: { hideInMobile: true },
      cell: ({ row }) =>
        (row.getValue('patientGroup') as string | null | undefined) ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'questionCount',
      header: t('module.columns.questions'),
      accessorKey: 'question_count',
      enableSorting: false,
      meta: { valueType: 'number', hideInMobile: true },
    },
    {
      id: 'languageCount',
      header: t('module.columns.languages'),
      accessorKey: 'language_count',
      enableSorting: false,
      meta: { valueType: 'number', hideInMobile: true },
    },
    {
      id: 'itemBank',
      header: t('module.columns.item_bank'),
      accessorKey: 'cat_item_bank.name',
      enableSorting: false,
      meta: { mobileCardRole: 'body', mobileCardOrder: 3 },
      cell: ({ row }) =>
        row.original.cat_item_bank?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'usage',
      header: t('module.columns.usage'),
      accessorKey: 'questionnaire_count',
      enableSorting: false,
      meta: { mobileCardRole: 'body', mobileCardOrder: 4 },
      cell: ({ row }) => (
        <UsageCell
          surveyCount={row.original.survey_count ?? 0}
          questionnaireCount={row.original.questionnaire_count ?? 0}
        />
      ),
    },
    {
      id: 'is_active',
      header: t('module.columns.is_active'),
      accessorKey: 'is_active',
      enableSorting: false,
      meta: {
        valueType: 'boolean',
        filterVariant: 'select',
        filterable: true,
        filterEnum: 'active',
        mobileCardRole: 'leading',
      },
    },
  ];

  const infoItems = [
    ...(isMobile
      ? []
      : [
          {
            heading: 'Upload new version',
            description: 'Upload a new module version file to add it to the library.',
          },
        ]),
    {
      heading: 'Filter by type',
      description: 'Toggle the type filter to narrow the list to a specific module type.',
    },
    {
      heading: 'Filter by status',
      description: 'Filter modules by active or inactive status.',
    },
    {
      heading: 'Search',
      description: 'Search modules by name.',
    },
  ];

  const renderActions = () => {
    if (isMobile) {
      return [];
    }

    return [
      <DevnutButton
        key="upload"
        aria-label="Upload version"
        className="px-6"
        onClick={() => navigate('/module-library/upload')}
      >
        {t('buttons.values.upload')}
      </DevnutButton>,
    ];
  };

  return (
    <CrudDataTable
      hideCreateButton
      keyName="modules"
      url="/modules"
      title={t('title')}
      titleAddon={<SectionInfoModal title="Module Library" items={infoItems} />}
      params={{ filter: { type: ModuleTypeGroupEnum.KitModule } }}
      defaultParams={{ type: initialType }}
      columns={moduleColumns}
      form={ModuleForm}
      deleteButtonConfig={{ visible: (row) => row.canDelete !== false }}
      toolbarButton={{
        actions: renderActions(),
      }}
    />
  );
};
