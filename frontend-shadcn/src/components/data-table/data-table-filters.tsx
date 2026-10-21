import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { useValueEnum } from '@/hooks/useValueEnum';
import { FILTER_COLOR_MAPS } from '@/utils/filterColorMaps';
import { normalizeFilterValue } from '@/utils/serialize';
import type { Column } from '@tanstack/react-table';
import { SearchIcon } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { useEffect, useId } from 'react';
import { DevnutInput } from '../DevnutInput';
import { DevnutMultiSelect } from '../DevnutMultiSelect';
import { DevnutSelect } from '../DevnutSelect';

interface DataTableFilterProps {
  column: Column<any, unknown>;
  onSearch?: (value: string) => void;
  searchValue?: string;
}

export function DataTableFilter({ column, onSearch, searchValue }: DataTableFilterProps) {
  const { meta, header } = column.columnDef;
  const { valueOptions } = useValueEnum();
  const { filterVariant, filterEnum: columnFilterEnum, filterMode, showAllOption } = meta ?? {};

  const id = useId();
  const isTablet = useIsTablet();

  // const isTablet = useIsTablet();
  const columnFilterValue = column.getFilterValue();
  // JSX/function headers have no text: meta.label provides it when set
  const columnHeader =
    typeof header === 'string' ? header : ((meta as { label?: string } | undefined)?.label ?? '');
  const inputLabel = isTablet ? '' : columnHeader;
  // Accessible name kept even when the visible label is hidden (tablet) or missing
  const filterName = columnHeader || column.id;

  // Handler comune per i cambi di filtro
  // Questo aggiorna lo stato della colonna, che viene poi sincronizzato
  // con i filtri API tramite onColumnFiltersChange nel DataTable
  const handleFilterChange = (value: any) => {
    column.setFilterValue(value);
  };

  if (filterVariant === 'range') {
    const rangeValue = (columnFilterValue as [number, number]) ?? [undefined, undefined];

    return (
      <div className="space-y-2">
        {columnHeader && <Label htmlFor={`${id}-range-1`}>{columnHeader}</Label>}
        <div className="flex">
          <Input
            id={`${id}-range-1`}
            className="flex-1 rounded-r-none [-moz-appearance:textfield] focus:z-10 [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            value={rangeValue[0] ?? ''}
            onChange={(e) => {
              const newValue = e.target.value ? Number(e.target.value) : undefined;
              handleFilterChange([newValue, rangeValue[1]]);
            }}
            placeholder="Min"
            type="number"
            aria-label={`${filterName} min`}
          />
          <Input
            id={`${id}-range-2`}
            className="-ms-px flex-1 rounded-l-none [-moz-appearance:textfield] focus:z-10 [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            value={rangeValue[1] ?? ''}
            onChange={(e) => {
              const newValue = e.target.value ? Number(e.target.value) : undefined;
              handleFilterChange([rangeValue[0], newValue]);
            }}
            placeholder="Max"
            type="number"
            aria-label={`${filterName} max`}
          />
        </div>
      </div>
    );
  }

  if (filterVariant === 'select') {
    const options = columnFilterEnum ? valueOptions[columnFilterEnum] : [];
    const filterColorMap = columnFilterEnum ? FILTER_COLOR_MAPS[columnFilterEnum] : undefined;

    if (filterMode === 'multiple') {
      return (
        <DevnutMultiSelect
          id={id}
          label={columnHeader}
          aria-label={filterName}
          value={(columnFilterValue as string[]) ?? []}
          onValueChange={(value) => {
            // Se l'array è vuoto, rimuovi il filtro
            handleFilterChange(normalizeFilterValue(value.length > 0 ? value : undefined));
          }}
          options={options}
          optionColorMap={filterColorMap?.colorMap}
          optionDotColorMap={filterColorMap?.dotColorMap}
          triggerClassName="w-full min-w-[220px] max-w-[300px]"
          showAllOption={showAllOption}
        />
      );
    }

    return (
      <DevnutSelect
        id={id}
        label={columnHeader}
        aria-label={filterName}
        value={columnFilterValue as string}
        onValueChange={(value) => {
          // Se il valore è vuoto, rimuovi il filtro
          handleFilterChange(normalizeFilterValue(value));
        }}
        options={options}
        triggerClassName="w-full min-w-[120px] max-w-[200px]"
      />
    );
  }

  if (filterVariant === 'switch') {
    const switchOptions = columnFilterEnum ? (valueOptions[columnFilterEnum] ?? []) : [];

    // Imposta il primo valore come filtro iniziale se non c'è ancora un filtro
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (columnFilterValue === undefined && switchOptions.length > 0) {
        column.setFilterValue(switchOptions[0].value);
      }
    }, [columnFilterValue, column, switchOptions]);

    return (
      <div className="flex flex-col gap-1">
        {columnHeader && <Label id={`${id}-label`}>{columnHeader}</Label>}
        {/* Single choice among options: radio group semantics (arrow keys move and select) */}
        <RadioGroup.Root
          id={id}
          orientation="horizontal"
          aria-labelledby={columnHeader ? `${id}-label` : undefined}
          aria-label={columnHeader ? undefined : filterName}
          value={(columnFilterValue as string) ?? ''}
          onValueChange={(value) => handleFilterChange(normalizeFilterValue(value))}
          className="inline-flex w-fit items-center rounded-full bg-white border p-[3px]"
        >
          {switchOptions.map((opt) => (
            <RadioGroup.Item
              key={opt.value}
              value={opt.value}
              className="cursor-pointer rounded-full px-3 py-1 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
            >
              {opt.label}
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>
    );
  }

  // Default: input di ricerca testuale
  return (
    <DevnutInput
      type="text"
      id={`${id}-input`}
      label={inputLabel}
      aria-label={inputLabel ? undefined : filterName}
      startIcon={SearchIcon}
      value={searchValue}
      onChange={(e) => {
        // Chiama anche onSearch per la ricerca globale se fornito
        const value = e.target.value;
        onSearch?.(value);
      }}
      placeholder={`Search by ${filterName.toLowerCase()}...`}
    />
  );
}
