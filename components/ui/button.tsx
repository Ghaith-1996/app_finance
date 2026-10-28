import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 font-semibold transition duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
    size === "lg" ? "text-base" : "text-sm",
    variant === "primary" &&
      "border-brand bg-brand text-brand-foreground hover:border-brand-strong hover:bg-brand-strong",
    variant === "secondary" &&
      "border-subtle bg-surface-raised text-primary hover:border-strong hover:bg-surface-hover",
    variant === "ghost" &&
      "border-transparent bg-transparent text-secondary hover:bg-surface-hover hover:text-primary",
    className,
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonStyles({ variant, size, className })}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
