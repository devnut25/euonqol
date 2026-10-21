import { cn } from '@/lib/tailwind/utils';

interface LoadingStatusProps {
  /** Announced to screen readers in place of the spinner (e.g. t.loading). */
  label: string;
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * Spinner exposed as a polite status message (WCAG 4.1.3) — the visual ring is
 * hidden from assistive tech, the label is read instead.
 */
export function LoadingStatus({ label, size = 'sm', className }: LoadingStatusProps) {
  return (
    <div role="status" className={cn('flex items-center justify-center', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'animate-spin rounded-full border-b-2 border-primary',
          size === 'lg' ? 'h-12 w-12' : 'h-5 w-5'
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
