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
        "rounded-2xl border border-subtle bg-surface-raised p-6 shadow-[var(--surface-shadow)]",
        glow && "border-strong",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
