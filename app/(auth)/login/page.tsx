"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/portfolio";
  const error = searchParams.get("error");
  const [loading, setLoading] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setLoading(null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signInWith(provider: "google" | "github") {
    setLoading(provider);
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-white no-underline"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-lg font-semibold text-brand">
              PS
            </span>
            <div className="text-left">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                PortfolioSignal
              </p>
              <p className="text-base font-semibold text-white">
                Personal AI finance
              </p>
            </div>
          </Link>
        </div>
        <Panel className="space-y-6 p-8">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Sign in
            </h1>
            <p className="text-sm text-slate-400">
              Use your Google or GitHub account to continue.
            </p>
          </div>
          {error ? (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              Sign-in failed. Please try again.
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => signInWith("google")}
              disabled={!!loading}
              className={buttonStyles({
                size: "lg",
                className:
                  "w-full disabled:opacity-70",
              })}
            >
              {loading === "google" ? "Redirecting…" : "Sign in with Google"}
            </button>
            <button
              type="button"
              onClick={() => signInWith("github")}
              disabled={!!loading}
              className={buttonStyles({
                variant: "secondary",
                size: "lg",
                className: "w-full disabled:opacity-70",
              })}
            >
              {loading === "github" ? "Redirecting…" : "Sign in with GitHub"}
            </button>
          </div>
        </Panel>
        <p className="text-center text-sm text-slate-600">
          <Link href="/" className="text-slate-500 hover:text-slate-300">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
