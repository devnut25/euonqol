import { cn } from '@/lib/tailwind/utils';
import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

const SelectNative = ({
  className,
  children,
  size: _size = 'default',
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & {
  size?: 'xs' | 'sm' | 'default';
}) => {
  return (
    <div className="relative">
      <select
        data-slot="select-native"
        className={cn(
          'peer border-input text-foreground focus-visible:border-ring focus-visible:ring-ring has-[option[disabled]:checked]:text-muted-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex w-full cursor-pointer appearance-none items-center rounded-md border text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=xs]:h-7',
          props.multiple ? '[&_option:checked]:bg-accent py-1 *:px-3 *:py-1' : 'pr-8 pl-3 py-1',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {!props.multiple && (
        <span className="text-muted-foreground/80 peer-aria-invalid:text-destructive/80 pointer-events-none absolute inset-y-0 right-0 flex h-full w-9 items-center justify-center peer-disabled:opacity-50">
          <ChevronDownIcon size={16} aria-hidden="true" />
        </span>
      )}
    </div>
  );
};

export { SelectNative };
