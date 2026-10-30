import { SelectNative } from '@/components/ui/select-native';
import { useMemo } from 'react';

type YearAnswerSelectProps = {
  /** Current answer_text: a 'YYYY' year, '' when empty. */
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  placeholder: string;
  /** Year range from the Answers sheet Min/Max columns — null/undefined = default bound. */
  min?: number | null;
  max?: number | null;
  /** id of the element holding the question text: names the select for assistive tech. */
  labelledBy?: string;
};

// Fallback range when the Answers row declares no Min/Max.
const DEFAULT_MIN_YEAR = 1900;

/**
 * Year picker for socio-demo and feedback 'Date' answers (e.g. "Year of birth"): a native select
 * listing the years from Max (default: current year) down to Min, most recent first.
 * The answer is saved as a plain 'YYYY' answer_text, so the numeric bounds checks
 * (player and server) apply unchanged.
 */
export function YearAnswerSelect({
  value,
  onChange,
  disabled,
  placeholder,
  min,
  max,
  labelledBy,
}: YearAnswerSelectProps) {
  const years = useMemo(() => {
    const to = max ?? new Date().getFullYear();
    const from = min ?? DEFAULT_MIN_YEAR;
    const list: number[] = [];
    for (let y = to; y >= from; y--) list.push(y);
    return list;
  }, [min, max]);

  return (
    <div className="w-full max-w-sm">
      <SelectNative
        aria-labelledby={labelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-auto! rounded-lg border-gray-500 bg-white pl-4 pr-9 py-2 text-base focus-visible:ring-2 focus-visible:ring-primary"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </SelectNative>
    </div>
  );
}
