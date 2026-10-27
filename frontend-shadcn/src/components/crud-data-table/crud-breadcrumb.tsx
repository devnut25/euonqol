import { useIsMobile } from '@/hooks/useMediaQuery';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface ParentCrumb {
  label: string;
  onClick?: () => void;
}

interface CrudBreadcrumbProps {
  title?: string;
  currentLabel: string;
  onBack: () => void;
  parentBreadcrumbs?: ParentCrumb[];
}

export function CrudBreadcrumb({
  title,
  currentLabel,
  onBack,
  parentBreadcrumbs,
}: CrudBreadcrumbProps) {
  const { t } = useTranslation(['common']);
  const isMobile = useIsMobile(768);

  if (!title) return null;

  // Mobile: a single line — ancestors collapsed into a "…" menu, then the parent level and
  // the current page truncated, so long nested paths don't wrap over several lines
  if (isMobile) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap">
          {!!parentBreadcrumbs?.length && (
            <>
              <BreadcrumbItem className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="flex items-center rounded-sm hover:text-foreground"
                    aria-label={t('common:breadcrumb.show_path')}
                  >
                    <BreadcrumbEllipsis className="size-6" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {parentBreadcrumbs.map((crumb, i) => (
                      <DropdownMenuItem key={i} disabled={!crumb.onClick} onSelect={crumb.onClick}>
                        {crumb.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem className="max-w-[40%] shrink-0">
            <BreadcrumbLink asChild>
              <button type="button" onClick={onBack} className="cursor-pointer truncate">
                {title}
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="block truncate">{currentLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {parentBreadcrumbs?.map((crumb, i) => (
          <Fragment key={i}>
            <BreadcrumbItem>
              {crumb.onClick ? (
                <BreadcrumbLink asChild>
                  <button type="button" onClick={crumb.onClick} className="cursor-pointer">
                    {crumb.label}
                  </button>
                </BreadcrumbLink>
              ) : (
                <span className="text-muted-foreground text-sm">{crumb.label}</span>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <button type="button" onClick={onBack} className="cursor-pointer">
              {title}
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
