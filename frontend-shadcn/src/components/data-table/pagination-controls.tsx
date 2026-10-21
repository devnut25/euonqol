import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface PaginationControlsProps {
  pageIndex: number;
  pageSize: number;
  total: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export function PaginationControls({
  pageIndex,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationControlsProps) {
  const { t } = useTranslation(['common']);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4">
      <p className="text-sm text-muted-foreground">
        {t('data_table.pagination.range', {
          defaultValue: '{{rangeStart}}-{{rangeEnd}} of {{total}}',
          rangeStart,
          rangeEnd,
          total,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger
            id="page-size-select"
            aria-invalid={false}
            aria-label={t('data_table.pagination.rowsPerPage', { defaultValue: 'Rows per page' })}
          >
            <SelectValue placeholder="10" />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={String(size)} value={String(size)}>
                {t('data_table.pagination.perPage', {
                  defaultValue: '{{size}} / page',
                  size,
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pageIndex === 0}
            onClick={() => onPageChange(pageIndex - 1)}
          >
            {t('data_table.pagination.previous', { defaultValue: 'Previous' })}
          </Button>
          <span className="text-sm text-muted-foreground px-2 whitespace-nowrap">
            {pageIndex + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pageIndex + 1 >= pageCount}
            onClick={() => onPageChange(pageIndex + 1)}
          >
            {t('data_table.pagination.next', { defaultValue: 'Next' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
