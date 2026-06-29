import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill px-5 font-display " +
  "font-semibold tracking-tight transition-colors duration-150 " +
  // Large tap targets — mobile-first.
  "min-h-[52px] text-base select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-success text-surface-0 hover:brightness-105 active:brightness-95",
  secondary: "bg-surface-2 text-text hover:bg-surface-2/80 active:brightness-95",
  ghost: "bg-transparent text-text-secondary hover:text-text hover:bg-white/5",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
