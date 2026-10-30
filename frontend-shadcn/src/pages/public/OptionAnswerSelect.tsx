import { SelectNative } from '@/components/ui/select-native';

type OptionAnswerSelectProps = {
  options: { id: number; label: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
  placeholder: string;
  /** id of the element holding the question text: names the select for assistive tech. */
  labelledBy?: string;
};

/**
 * Single-choice answer picker for questions with many options (see RadioList): a native
 * select, so keyboard, screen readers and the mobile picker work out of the box. Saves
 * the same option id as the radio list it replaces.
 */
export function OptionAnswerSelect({
  options,
  selected,
  onSelect,
  disabled,
  placeholder,
  labelledBy,
}: OptionAnswerSelectProps) {
  return (
    <div className="w-full max-w-sm">
      <SelectNative
        aria-labelledby={labelledBy}
        value={selected != null ? String(selected) : ''}
        onChange={(e) => onSelect(Number(e.target.value))}
        disabled={disabled}
        className="h-auto! rounded-lg border-gray-500 bg-white pl-4 pr-9 py-2 text-base focus-visible:ring-2 focus-visible:ring-primary"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={String(opt.id)}>
            {opt.label}
          </option>
        ))}
      </SelectNative>
    </div>
  );
}
