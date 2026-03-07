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
        "rounded-[32px] border border-black/6 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl",
        glow && "shadow-[0_26px_90px_rgba(23,182,122,0.12)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
