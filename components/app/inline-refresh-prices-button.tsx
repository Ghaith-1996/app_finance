"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { refreshHoldingPrices } from "@/lib/actions/portfolio";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InlineRefreshPricesButton({
  portfolioId,
  className,
}: {
  portfolioId: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    try {
      await refreshHoldingPrices(portfolioId);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      aria-label="Refresh prices"
      className={cn(
        buttonStyles({
          variant: "ghost",
          className:
            "h-7 gap-1.5 px-2 text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-60",
        }),
        className,
      )}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  );
}
