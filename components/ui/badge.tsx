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
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase",
        tone === "brand" && "border-brand/25 bg-brand/10 text-emerald-400",
        tone === "success" && "border-brand/25 bg-brand/10 text-emerald-400",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-400",
        tone === "danger" && "border-rose-500/25 bg-rose-500/10 text-rose-400",
        tone === "neutral" && "border-white/8 bg-white/5 text-slate-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
