import { Label } from '@/components/ui/label';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/tailwind/utils';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { ButtonGroup } from './ui/button-group';
import { Input } from './ui/input';

interface DevnutInputProps extends React.ComponentProps<typeof Input> {
  label?: string;
  startIcon?: LucideIcon;
  endIcon?: LucideIcon;
  startIconClassName?: string;
  endIconClassName?: string;
  labelClassName?: string;
  containerClassName?: string;
  inputHeight?: 'xs' | 'sm' | 'default' | 'lg';
  actions?: React.ReactNode;
}

function DevnutInput({
  className,
  label,
  startIcon: StartIcon,
  endIcon: EndIcon,
  startIconClassName,
  endIconClassName,
  labelClassName,
  containerClassName,
  id,
  inputHeight,
  actions,
  ...props
}: DevnutInputProps) {
  const isTablet = useIsTablet();

  const generatedId = React.useId();
  const inputId = id || generatedId;

  const inputVariant = cva(
    'rounded-full bg-white shadow-none focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
    {
      variants: {
        inputHeight: {
          xs: 'h-7 text-sm',
          sm: 'h-8',
          default: 'h-9',
          lg: 'h-10',
        },
      },
      defaultVariants: {
        inputHeight: isTablet ? 'xs' : 'default',
      },
    }
  );

  // "rounded-full border-black border-[0.5px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]",
  const coreInput = (
    <Input
      id={inputId}
      className={cn(
        inputVariant({ inputHeight }),
        StartIcon && 'pl-9',
        EndIcon && 'pr-9',
        actions && 'rounded-r-none',
        className
      )}
      {...props}
    />
  );

  const inputElement = actions ? (
    <ButtonGroup className="w-full [&>*:last-child]:rounded-r-full [&>*:last-child]:rounded-l-none">
      {coreInput}
      {actions}
    </ButtonGroup>
  ) : (
    coreInput
  );

  if (!label && !StartIcon && !EndIcon && !actions) {
    return inputElement;
  }

  return (
    <div className={cn('w-full space-y-2', containerClassName)}>
      {label && (
        <Label htmlFor={inputId} className={labelClassName}>
          {label}
        </Label>
      )}
      <div className="relative">
        {StartIcon && (
          <div className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50">
            <StartIcon className={cn('size-4', startIconClassName)} />
          </div>
        )}
        {inputElement}
        {EndIcon && (
          <div className="text-muted-foreground pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center pr-3 peer-disabled:opacity-50">
            <EndIcon className={cn('size-4', endIconClassName)} />
          </div>
        )}
      </div>
    </div>
  );
}

export { DevnutInput };
