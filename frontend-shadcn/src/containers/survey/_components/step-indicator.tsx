import { cn } from '@/lib/tailwind/utils';
import type { StepLabel } from '../_hooks/useSurveyStepper';

type StepIndicatorStep = StepLabel & { error?: boolean };

type StepIndicatorProps = {
  steps: StepIndicatorStep[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
};

export function StepIndicator({ steps, currentIndex, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-start w-full mb-6">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center flex-1 last:flex-none">
          <button
            type="button"
            disabled={step.disabled || !onStepClick}
            aria-current={idx === currentIndex ? 'step' : undefined}
            className={cn(
              'flex flex-col items-center min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !step.disabled && onStepClick ? 'cursor-pointer' : 'cursor-default'
            )}
            onClick={() => !step.disabled && onStepClick?.(idx)}
          >
            <div
              className={cn(
                'size-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0',
                step.disabled
                  ? 'bg-muted text-muted-foreground'
                  : step.error
                    ? idx === currentIndex
                      ? 'bg-destructive text-destructive-foreground ring-4 ring-destructive/20'
                      : 'bg-destructive text-destructive-foreground'
                    : idx < currentIndex
                      ? 'bg-primary text-primary-foreground'
                      : idx === currentIndex
                        ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                        : 'bg-muted text-muted-foreground'
              )}
            >
              {!step.disabled && !step.error && idx < currentIndex ? (
                <svg viewBox="0 0 16 16" fill="none" className="size-4">
                  <path
                    d="M3 8l3.5 3.5L13 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                idx + 1
              )}
            </div>
            <span
              className={cn(
                'text-xs mt-1 text-center',
                step.disabled
                  ? 'text-muted-foreground line-through'
                  : step.error
                    ? 'text-destructive font-semibold'
                    : idx === currentIndex
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
            {(step.disabled || step.error || (idx < currentIndex)) && (
              <span className="sr-only">
                {step.disabled ? ' (unavailable)' : step.error ? ' (contains errors)' : ' (completed)'}
              </span>
            )}
          </button>
          {idx < steps.length - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 mx-2 mb-5 transition-colors',
                !step.disabled && idx < currentIndex ? 'bg-primary' : 'bg-border'
              )}
            />
          )}
        </div>
      ))}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {steps[currentIndex]
          ? `Step ${currentIndex + 1} of ${steps.length}: ${steps[currentIndex].label}`
          : ''}
      </p>
    </div>
  );
}
