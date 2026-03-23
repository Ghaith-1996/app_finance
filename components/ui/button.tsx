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
    "inline-flex items-center justify-center rounded-xl border text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    size === "lg" ? "h-12 px-6" : "h-10 px-5",
    variant === "primary" &&
      "border-brand bg-brand text-[#080c11] shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:border-brand-strong hover:bg-brand-strong",
    variant === "secondary" &&
      "border-white/10 bg-surface-raised text-slate-200 shadow-sm hover:border-white/16 hover:bg-surface-hover",
    variant === "ghost" &&
      "border-transparent bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
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
