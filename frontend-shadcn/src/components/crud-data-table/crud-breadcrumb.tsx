import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb';

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
  if (!title) return null;
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
