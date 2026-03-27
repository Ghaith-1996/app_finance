"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BillingActionMode = "checkout" | "portal";

export function BillingActionButton({
  mode,
  plan,
  children,
  variant = "primary",
  size = "md",
  className,
  loginRedirectTo = "/pricing",
}: {
  mode: BillingActionMode;
  plan?: "premium" | "ultimate";
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  className?: string;
  loginRedirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        mode === "portal" ? "/api/billing/portal" : "/api/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...(mode === "checkout" ? { body: JSON.stringify({ plan }) } : {}),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };

      if (res.status === 401) {
        router.push(`/login?redirectTo=${encodeURIComponent(loginRedirectTo)}`);
        return;
      }

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Billing action failed.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        disabled={loading}
        onClick={() => void handleClick()}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {children}
      </Button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
