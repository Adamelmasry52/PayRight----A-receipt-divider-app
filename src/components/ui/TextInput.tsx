import type { InputHTMLAttributes } from "react";

/** Plain themed text input. */
export function TextInput({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className={
        "min-h-[44px] rounded-md bg-surface-2 px-3 text-text outline-none " +
        "placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent-blue " +
        className
      }
      {...rest}
    />
  );
}
