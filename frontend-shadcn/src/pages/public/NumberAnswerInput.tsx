import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { useEffect, useRef } from 'react';
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
  /** Shown under the field while the typed value is outside [min, max]. */
  outOfRangeMessage?: string;
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
 * Without a Min the field never accepts a negative number (clamped to 0). With Min/Max
 * the −/+ controls stop at the bounds, and a typed value outside them is kept as-is but
 * flagged with an error (the player also disables "Next" meanwhile) — never silently
 * rewritten.
 */
export function NumberAnswerInput({
  value,
  onChange,
  integerOnly,
  disabled,
  placeholder,
  min,
  max,
  outOfRangeMessage,
  labelledBy,
}: NumberAnswerInputProps) {
  const form = useForm<{ value: number | null }>({
    defaultValues: { value: value === '' ? null : Number(value) },
  });

  const minBound = min ?? null;
  const maxBound = max ?? null;
  const lowerLimit = minBound ?? 0;

  const onChangeRef = useRef(onChange);
  const messageRef = useRef(outOfRangeMessage);
  useEffect(() => {
    onChangeRef.current = onChange;
    messageRef.current = outOfRangeMessage;
  }, [onChange, outOfRangeMessage]);

  const { subscribe, setValue, setError, clearErrors, getFieldState, getValues } = form;
  useEffect(() => {
    const syncRangeError = (v: number | null | undefined) => {
      const outOfRange =
        v != null && ((minBound !== null && v < minBound) || (maxBound !== null && v > maxBound));
      const current = getFieldState('value').error?.message;
      if (outOfRange) {
        const message = messageRef.current ?? '';
        if (current !== message) setError('value', { type: 'range', message });
      } else if (current !== undefined) {
        clearErrors('value');
      }
    };

    // A restored answer (resume / back navigation) may already be out of range
    syncRangeError(getValues('value'));

    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const v = values.value;
        if (v == null || Number.isNaN(v)) {
          syncRangeError(null);
          onChangeRef.current('');
        } else if (minBound === null && v < 0) {
          // No Min declared: numeric free-input fields never accept a negative number
          setValue('value', 0);
        } else {
          syncRangeError(v);
          onChangeRef.current(String(v));
        }
      },
    });
  }, [subscribe, setValue, setError, clearErrors, getFieldState, getValues, minBound, maxBound]);

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
          // The range error is owned by syncRangeError above, not cleared on each keystroke
          clearErrorsOnChange={false}
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
