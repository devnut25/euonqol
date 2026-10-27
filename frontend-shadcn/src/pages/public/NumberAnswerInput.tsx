import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { useCallback, useEffect, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

type NumberAnswerInputProps = {
  /** Current answer_text ('' when empty). */
  value: string;
  onChange: (text: string) => void;
  integerOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Bounds from the Answers sheet Min/Max columns — null/undefined = unbounded side. */
  min?: number | null;
  max?: number | null;
  /** id of the element holding the question text: names the input for assistive tech. */
  labelledBy?: string;
};

// Keys that would let the patient type an exponent value into a number input.
const EXPONENT_KEYS = ['+', 'e', 'E'];

/**
 * Numeric free-input for the public player, rendered with the same FieldNumber
 * (withControls) used in the admin forms. The player keeps answers in plain state as
 * answer_text strings, so this wraps the field in a local single-field RHF form and
 * syncs its value back as a string. Initial value is read on mount only — remount it
 * (key) when the question changes.
 *
 * The value never leaves [min, max] (no Min = 0, so no negative numbers): the −/+
 * controls stop at the bounds, and a typed value outside them is clamped to the nearest
 * bound when the field loses focus — not while typing, so "25" can be typed with a Min
 * of 18. Pressing Next blurs the field first, so the saved answer is always in range and
 * no out-of-range message (to be translated in every language) is needed.
 */
export function NumberAnswerInput({
  value,
  onChange,
  integerOnly,
  disabled,
  placeholder,
  min,
  max,
  labelledBy,
}: NumberAnswerInputProps) {
  const form = useForm<{ value: number | null }>({
    defaultValues: { value: value === '' ? null : Number(value) },
  });

  const maxBound = max ?? null;
  const lowerLimit = min ?? 0;

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const { subscribe, setValue, getValues } = form;
  const clampToBounds = useCallback(() => {
    const v = getValues('value');
    if (v == null || Number.isNaN(v)) return;
    const clamped = Math.min(Math.max(v, lowerLimit), maxBound ?? Infinity);
    if (clamped !== v) setValue('value', clamped);
  }, [getValues, setValue, lowerLimit, maxBound]);

  useEffect(() => {
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const v = values.value;
        if (v == null || Number.isNaN(v)) {
          onChangeRef.current('');
        } else if (min == null && v < 0) {
          // No Min declared: numeric free-input fields never accept a negative number
          setValue('value', 0);
        } else {
          onChangeRef.current(String(v));
        }
      },
    });
    // A restored answer (resume / back navigation) may be out of range if the bounds changed
    clampToBounds();
    return unsubscribe;
  }, [subscribe, setValue, clampToBounds, min]);

  return (
    <FormProvider {...form}>
      <FormField className="max-w-sm">
        <FormFieldController
          name="value"
          type="number"
          withControls
          min={lowerLimit}
          max={maxBound ?? undefined}
          integerOnly={integerOnly}
          disabled={disabled}
          placeholder={placeholder}
          aria-labelledby={labelledBy}
          hideControlsFromAssistiveTech
          onBlur={clampToBounds}
          onKeyDown={(e) => {
            if (EXPONENT_KEYS.includes(e.key) || (e.key === '-' && lowerLimit >= 0)) {
              e.preventDefault();
            }
          }}
        />
      </FormField>
    </FormProvider>
  );
}
