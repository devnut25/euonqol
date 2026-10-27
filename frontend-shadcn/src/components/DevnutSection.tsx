import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/tailwind/utils";
import { createQueryString } from "@/utils/queryParams";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { DevnutButton } from "./DevnutButton";

interface GridProps extends PropsWithChildren {
  className?: string;
  style?: React.CSSProperties;
}

const Grid = ({ className, children, style }: GridProps) => {
  const hasGridCols =
    className?.startsWith("grid-cols-") || className?.includes(" grid-cols-");

  return (
    <div
      style={style}
      className={cn(
        "grid gap-4 w-full items-start",
        !hasGridCols && "grid-cols-1",
        className
      )}
    >
      {children}
    </div>
  );
};

const Loading = () => {
    const { t } = useTranslation(["common"]);

  return (
    <div role="status" className="text-center">
      <div aria-hidden="true" className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      <p className="mt-4 text-gray-600">{t("loading.text")}</p>
    </div>
  );
};

interface SegmentedItem {
  key: string;
  label: string;
  children: ReactNode;
}

interface SegmentedProps {
  keyName?: string;
  items: SegmentedItem[];
  defaultValue?: string;
  hideTabBar?: boolean;
}

// Oltre questo numero di tab, su mobile la riga segmented andrebbe a capo:
// si passa al trigger con bottom sheet (pattern Material).
const MAX_SEGMENTED_TABS_MOBILE = 3;

interface SegmentedSheetProps {
  items: SegmentedItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
}

const SegmentedSheet = ({ items, activeTab, onTabChange }: SegmentedSheetProps) => {
  const { t } = useTranslation(["common"]);
  const [open, setOpen] = useState(false);

  const activeLabel = items.find((item) => item.key === activeTab)?.label;

  return (
    <>
      <DevnutButton
        variant="outline"
        className="w-full justify-between"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </DevnutButton>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("common:crud_data_table.tabs.sections")}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("common:crud_data_table.tabs.sections")}
            </DrawerDescription>
          </DrawerHeader>
          <nav className="flex flex-col overflow-y-auto px-2 pb-6">
            {items.map((item) => {
              const isActive = item.key === activeTab;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center justify-between rounded-md px-3 text-left text-sm",
                    isActive ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                  )}
                  onClick={() => {
                    onTabChange(item.key);
                    setOpen(false);
                  }}
                >
                  {item.label}
                  {isActive && <Check aria-hidden="true" className="size-4" />}
                </button>
              );
            })}
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  );
};

const Segmented = ({
  keyName = "tab",
  items,
  defaultValue,
  hideTabBar = false,
}: SegmentedProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile(768);
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
      : (items[0]?.key ?? "");

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

  const showSheet = !hideTabBar && isMobile && items.length > MAX_SEGMENTED_TABS_MOBILE;
  // Senza TabsTrigger (tab bar nascosta o bottom sheet) l'aria-labelledby
  // generato da Radix punterebbe a nulla.
  const hasTriggers = !hideTabBar && !showSheet;

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      {showSheet && (
        <SegmentedSheet items={items} activeTab={activeTab} onTabChange={handleTabChange} />
      )}

      {hasTriggers && (
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
          className="mt-2 md:mt-4"
          {...(!hasTriggers ? { "aria-labelledby": undefined, "aria-label": item.label } : {})}
        >
          <Grid>{item.children}</Grid>
        </TabsContent>
      ))}
    </Tabs>
  );
};

const DevnutSection = { Grid, Loading, Segmented };

export default DevnutSection;
