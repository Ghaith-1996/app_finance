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
    "inline-flex items-center justify-center rounded-full border text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    size === "lg" ? "h-12 px-6" : "h-10 px-5",
    variant === "primary" &&
      "border-brand bg-brand text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_40px_rgba(23,182,122,0.18)] hover:border-brand-strong hover:bg-brand-strong",
    variant === "secondary" &&
      "border-black/8 bg-white text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:border-black/12 hover:bg-[#fffaf4]",
    variant === "ghost" &&
      "border-transparent bg-transparent text-slate-700 hover:bg-black/5 hover:text-slate-950",
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
