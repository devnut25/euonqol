import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiOptions } from '@/hooks/useApiOptions';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { useValueEnum } from '@/hooks/useValueEnum';
import { FILTER_COLOR_MAPS } from '@/utils/filterColorMaps';
import { normalizeFilterValue } from '@/utils/serialize';
import type { Column } from '@tanstack/react-table';
import { SearchIcon } from 'lucide-react';
import { useId } from 'react';
import { DevnutChipGroup, type DevnutChipGroupProps } from '../DevnutChipGroup';
import { DevnutInput } from '../DevnutInput';
import { DevnutMultiSelect } from '../DevnutMultiSelect';
import { DevnutSelect } from '../DevnutSelect';

interface DataTableFilterProps {
  column: Column<any, unknown>;
  onSearch?: (value: string) => void;
  searchValue?: string;
  /** Controlled mode (mobile drawer draft): replaces the column filter state */
  value?: unknown;
  onValueChange?: (value: unknown) => void;
  /** 'chips': options rendered as tappable pills instead of selects (mobile drawer) */
  variant?: 'default' | 'chips';
  /** Height of the text search input */
  inputHeight?: 'xs' | 'sm' | 'default' | 'lg';
}

/** 'apiSelect' filter as pills: options loaded from `url`. */
function ApiChipFilter({
  url,
  labelKey,
  ...props
}: Omit<DevnutChipGroupProps, 'options' | 'disabled'> & { url: string; labelKey?: string }) {
  const { options, isLoading } = useApiOptions(url, labelKey);
  return <DevnutChipGroup {...props} options={options} disabled={isLoading} />;
}

interface ApiSelectFilterProps {
  id: string;
  url: string;
  /** Item field used as option label (default `name`). */
  labelKey?: string;
  label: string;
  ariaLabel: string;
  value: string | undefined;
  onChange: (value: any) => void;
}

/** Select filter whose options (`id` → value, `labelKey` → label) are loaded from `url`. */
function ApiSelectFilter({
  id,
  url,
  labelKey,
  label,
  ariaLabel,
  value,
  onChange,
}: ApiSelectFilterProps) {
  const { options, isLoading } = useApiOptions(url, labelKey);

  return (
    <DevnutSelect
      id={id}
      label={label}
      aria-label={ariaLabel}
      value={value}
      onValueChange={(selected) => onChange(normalizeFilterValue(selected))}
      options={options}
      disabled={isLoading}
      triggerClassName="w-full min-w-[120px] max-w-[200px]"
    />
  );
}

export function DataTableFilter({
  column,
  onSearch,
  searchValue,
  value,
  onValueChange,
  variant = 'default',
  inputHeight,
}: DataTableFilterProps) {
  const { meta, header } = column.columnDef;
  const { valueOptions } = useValueEnum();
  const { filterVariant, filterEnum: columnFilterEnum, filterMode, showAllOption } = meta ?? {};

  const id = useId();
  const isTablet = useIsTablet();

  // const isTablet = useIsTablet();
  const isControlled = onValueChange !== undefined;
  const columnFilterValue = isControlled ? value : column.getFilterValue();
  // JSX/function headers have no text: meta.label provides it when set
  const columnHeader =
    typeof header === 'string' ? header : ((meta as { label?: string } | undefined)?.label ?? '');
  const inputLabel = isTablet ? '' : columnHeader;
  // Accessible name kept even when the visible label is hidden (tablet) or missing
  const filterName = columnHeader || column.id;

  // Handler comune per i cambi di filtro
  // Questo aggiorna lo stato della colonna, che viene poi sincronizzato
  // con i filtri API tramite onColumnFiltersChange nel DataTable
  const handleFilterChange = (next: any) => {
    if (isControlled) onValueChange(next);
    else column.setFilterValue(next);
  };

  const enumOptions = columnFilterEnum ? (valueOptions[columnFilterEnum] ?? []) : [];

  // Mobile drawer: every choice filter becomes a group of pills
  if (variant === 'chips') {
    const chipProps = {
      id,
      label: columnHeader,
      'aria-label': filterName,
      value: columnFilterValue,
      onValueChange: (next: unknown) => handleFilterChange(normalizeFilterValue(next)),
    };
    // Same default as DevnutSelect: "All" unless the column opts out
    const allOptionLabel = showAllOption === false ? undefined : 'All';

    if (filterVariant === 'select') {
      return (
        <DevnutChipGroup
          {...chipProps}
          options={enumOptions}
          multiple={filterMode === 'multiple'}
          allOptionLabel={allOptionLabel}
        />
      );
    }
    if (filterVariant === 'apiSelect' && meta?.filterUrl) {
      return (
        <ApiChipFilter
          {...chipProps}
          url={meta.filterUrl}
          labelKey={meta.filterLabelKey}
          allOptionLabel={allOptionLabel}
        />
      );
    }
    if (filterVariant === 'switch') {
      return <DevnutChipGroup {...chipProps} options={enumOptions} />;
    }
  }

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

  if (filterVariant === 'apiSelect' && meta?.filterUrl) {
    return (
      <ApiSelectFilter
        id={id}
        url={meta.filterUrl}
        labelKey={meta.filterLabelKey}
        label={columnHeader}
        ariaLabel={filterName}
        value={columnFilterValue as string | undefined}
        onChange={handleFilterChange}
      />
    );
  }

  if (filterVariant === 'switch') {
    // Initial value (first option) is set by DataTableToolbar, which stays mounted
    return (
      <DevnutChipGroup
        id={id}
        label={columnHeader}
        aria-label={filterName}
        appearance="segmented"
        className="gap-1"
        options={enumOptions}
        value={columnFilterValue}
        onValueChange={(next) => handleFilterChange(normalizeFilterValue(next))}
      />
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
      inputHeight={inputHeight}
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
