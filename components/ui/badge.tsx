import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "brand" && "border-brand/20 bg-brand/10 text-brand",
        tone === "success" && "border-brand/20 bg-brand/10 text-brand",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-400",
        tone === "danger" && "border-rose-500/25 bg-rose-500/10 text-rose-400",
        tone === "neutral" && "border-subtle bg-surface-soft text-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}
