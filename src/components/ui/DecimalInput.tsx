import { useEffect, useState } from "react";
import { parseMoney } from "../../core/index.ts";

/*
  Controlled numeric input that keeps a local text buffer so partial entries
  ("12.", "") survive while typing, then lifts a parsed number up. Parsing goes
  through core's parseMoney, so Arabic-Indic digits work for free.
*/

interface DecimalInputProps {
  value: number;
  onChange: (value: number) => void;
  "aria-label": string;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  id?: string;
}

const display = (v: number) => (v ? String(v) : "");

export function DecimalInput({
  value,
  onChange,
  placeholder,
  className = "",
  invalid = false,
  id,
  "aria-label": ariaLabel,
}: DecimalInputProps) {
  const [text, setText] = useState(() => display(value));

  // Sync when the value changes from outside (reset, "match to items", etc.)
  // without clobbering an in-progress entry like "12.".
  useEffect(() => {
    if ((parseMoney(text) ?? 0) !== value) setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        onChange(parseMoney(raw) ?? 0);
      }}
      className={
        "min-h-[44px] rounded-md bg-surface-2 px-3 text-text outline-none " +
        "placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent-blue " +
        (invalid ? "ring-2 ring-danger " : "") +
        className
      }
    />
  );
}
