import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutBadge } from '@/components/DevnutBadge';
import { SectionInfoModal } from '@/components/SectionInfoModal';
import type { Values } from '@/hooks/useCrudDataTable';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/tailwind/utils';
import type { UserTypeEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { UserForm } from './form';

export const UsersTable = () => {
  const { t } = useTranslation(['users']);

  const isTablet = useIsTablet();

  const userColumns: ColumnDef<Values>[] = [
    // {
    //   accessorKey: "id",
    //   header: "ID",
    //   cell: ({ row }) => <span>{row.getValue("id")}</span>,
    //   size: 10,
    // },
    {
      size: 10,
      maxSize: 10,
      id: 'user_type',
      header: t('header_columns.user_type'),
      accessorKey: 'user_type',
      enableSorting: false,
      meta: {
        filterVariant: 'select',
        filterable: true,
        filterEnum: 'userTypes',
        mobileCardRole: 'trailing',
      },
      cell: ({ row }) => {
        const isActive: UserTypeEnum = row.getValue('is_active');

        return (
          <DevnutBadge
            variant={'secondary'}
            className={cn(
              'md:px-8 py-1 font-light italic min-w-20 md:min-w-32',
              !isActive && 'bg-red-500/30'
            )}
          >
            {row.getValue('user_type')}
          </DevnutBadge>
        );
      },
    },
    {
      id: 'full_name',
      header: t('header_columns.full_name'),
      accessorKey: 'full_name',
      meta: {
        searchable: true,
        mobileCardRole: 'title',
        mobileCardOrder: 1,
      },
    },
    {
      header: t('header_columns.email'),
      accessorKey: 'email',
      meta: {
        mobileCardRole: 'subtitle',
        mobileCardOrder: 2,
      },
    },
    {
      id: 'created_at',
      header: t('header_columns.created_at'),
      accessorKey: 'created_at',
      meta: {
        valueType: 'date',
        hideInMobile: true,
      },
    },
    {
      id: 'last_access',
      header: t('header_columns.last_access'),
      accessorKey: 'last_access',
      meta: {
        valueType: 'date',
        hideInMobile: true,
      },
    },
    {
      id: 'is_active',
      header: t('header_columns.is_active'),
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

  return (
    <CrudDataTable
      columns={userColumns}
      url="/users"
      type={isTablet ? 'default' : 'modal'}
      title={t('title')}
      titleAddon={
        <SectionInfoModal
          title="Users"
          items={[
            {
              heading: 'Overview',
              description:
                'Manage all platform accounts — admins and managers who can access and operate the system.',
            },
            {
              heading: 'Add a user',
              description:
                'Create a new account by providing name, email and assigning a role (admin or manager).',
            },
            {
              heading: 'Edit details',
              description: "Update an existing user's information or change their assigned role.",
            },
            {
              heading: 'Deactivate',
              description:
                'Disable a user account to revoke access without permanently deleting it.',
            },
          ]}
        />
      }
      form={UserForm}
      createButtonLabel={t('buttons.values.add')}
    />
  );
};
