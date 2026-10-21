import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createQueryString } from '@/utils/queryParams';
import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import DevnutSection from './DevnutSection';

interface SegmentedItem {
  key: string;
  label: string;
  children: ReactNode;
}

interface SectionSegmentedProps {
  keyName?: string;
  items: SegmentedItem[];
  defaultValue?: string;
  hideTabBar?: boolean;
}

export const SectionSegmented = ({
  keyName = 'tab',
  items,
  defaultValue,
  hideTabBar = false,
}: SectionSegmentedProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pathname = location.pathname;

  const tabParamName = `${keyName}_tab`;
  const activeTabFromUrl = searchParams.get(tabParamName);
  // Un valore non valido nell'URL (es. link vecchio) non corrisponde a nessun TabsContent
  // e lascerebbe la sezione vuota: si ripiega su defaultValue o sulla prima tab.
  const isValidTab = (key?: string | null): key is string =>
    !!key && items.some((item) => item.key === key);
  const activeTab = isValidTab(activeTabFromUrl)
    ? activeTabFromUrl
    : isValidTab(defaultValue)
      ? defaultValue
      : (items[0]?.key ?? '');

  const handleTabChange = (value: string) => {
    const newQuery = createQueryString(searchParams, {
      [tabParamName]: value,
    });

    navigate(`${pathname}?${newQuery}`, { replace: true });
  };

  // Allinea l'URL alla tab realmente mostrata quando il valore presente non è valido
  // (replace: nessuna voce aggiuntiva nella cronologia).
  const hasInvalidTabInUrl = !!activeTabFromUrl && !!activeTab && activeTabFromUrl !== activeTab;
  useEffect(() => {
    if (hasInvalidTabInUrl) handleTabChange(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInvalidTabInUrl, activeTab]);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      {!hideTabBar && (
        <TabsList className="w-full h-auto flex-wrap">
          {items.map((item) => (
            <TabsTrigger key={item.key} value={item.key} className="flex-1">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}

      {items.map((item) => (
        <TabsContent
          key={item.key}
          value={item.key}
          className="mt-4"
          // Senza tab bar il trigger non esiste: l'aria-labelledby generato da Radix punterebbe a nulla.
          {...(hideTabBar ? { 'aria-labelledby': undefined, 'aria-label': item.label } : {})}
        >
          <DevnutSection.Grid>{item.children}</DevnutSection.Grid>
        </TabsContent>
      ))}
    </Tabs>
  );
};
