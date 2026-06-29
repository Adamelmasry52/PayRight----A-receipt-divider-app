/*
  Generic segmented control (the split-mode switcher in the design export).
  A pill track with one button per option; the active option is raised.
*/

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full gap-1 rounded-pill bg-surface-2 p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "min-h-[40px] flex-1 rounded-pill px-2 text-sm font-semibold transition-colors " +
              (active
                ? "bg-surface-0 text-text shadow"
                : "text-text-secondary hover:text-text")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
