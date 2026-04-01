import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  glow = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass-surface rounded-2xl border border-subtle bg-surface-raised p-6 shadow-[var(--surface-shadow)] backdrop-blur-xl",
        glow && "shadow-[0_0_40px_rgba(16,185,129,0.12)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
