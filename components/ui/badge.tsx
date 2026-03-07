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
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase",
        tone === "brand" && "border-brand/25 bg-brand/12 text-emerald-700",
        tone === "success" && "border-brand/25 bg-brand/12 text-emerald-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700",
        tone === "neutral" && "border-black/8 bg-[#f7f2ea] text-slate-700",
        className,
      )}
    >
      {children}
    </span>
  );
}
