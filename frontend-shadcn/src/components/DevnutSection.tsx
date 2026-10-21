import { cn } from "@/lib/tailwind/utils";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

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

const DevnutSection = { Grid, Loading };

export default DevnutSection;