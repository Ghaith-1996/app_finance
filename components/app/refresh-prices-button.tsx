"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { refreshHoldingPrices } from "@/lib/actions/portfolio";
import { buttonStyles } from "@/components/ui/button";

export function RefreshPricesButton({ portfolioId }: { portfolioId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    await refreshHoldingPrices(portfolioId);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      className={buttonStyles({
        variant: "secondary",
        className: "disabled:opacity-70",
      })}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Refreshing…" : "Refresh prices"}
    </button>
  );
}
