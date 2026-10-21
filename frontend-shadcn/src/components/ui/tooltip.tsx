import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/tailwind/utils';

// Radix tooltip: shown on hover AND keyboard focus, dismissable with Esc,
// hoverable and persistent — WCAG 1.4.13 (unlike the native `title` attribute).
// Styled like the browser's native tooltip (dark grey box, white text, no animation),
// but with a short delay: the native one takes ~1s to appear.

function TooltipProvider({
  delayDuration = 150,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-100 w-fit rounded-sm bg-[#4a4a4a] px-2 py-1 text-xs text-white shadow-md forced-colors:border forced-colors:border-[CanvasText]',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/**
 * Tooltip for an icon-only control: `children` must be a single element that accepts
 * a ref (button, link). The control still needs its own accessible name (aria-label).
 */
function SimpleTooltip({
  label,
  side = 'bottom',
  children,
}: {
  label: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side'];
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { SimpleTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
