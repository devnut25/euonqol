import type { Values } from '@/hooks/useCrudDataTable';
import type { Item, ParentBreadcrumb, Tab } from '@/types/crud-data-table';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import DevnutSection from '../DevnutSection';

interface TabsSectionProps {
  keyName: string;
  item: Item;
  mutate: Function;
  baseForm: (initialValues: Values | undefined, mutate?: Function) => ReactNode;
  tabs: Tab[];
  parentBreadcrumbs: ParentBreadcrumb[];
}

export function TabsSection({
  keyName,
  item,
  mutate,
  baseForm,
  tabs,
  parentBreadcrumbs,
}: TabsSectionProps) {
  const { t } = useTranslation(['common']);
  const [searchParams] = useSearchParams();

  const parentIdKey = `${keyName}_id`;
  const childTableOpen = [...searchParams.keys()].some(
    (k) => k.endsWith('_id') && k !== parentIdKey
  );

  const allTabs = [
    ...tabs.map((tab) => ({
      ...tab,
      children:
        typeof tab.children === 'function' ? tab.children({ parentBreadcrumbs }) : tab.children,
    })),
    {
      key: 'detail',
      label: t('crud_data_table.tabs.detail'),
      children: baseForm(item, mutate),
    },
  ];

  if (childTableOpen) {
    const activeTabKey = searchParams.get(`${keyName}_tab`);
    const activeTab = allTabs.find((t) => t.key === activeTabKey) ?? allTabs[0];
    return <>{activeTab?.children ?? null}</>;
  }

  return <DevnutSection.Segmented keyName={keyName} items={allTabs} />;
}
