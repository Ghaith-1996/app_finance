"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/portfolio";
  const error = searchParams.get("error");
  const [loading, setLoading] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setLoading(null);
    });
    return () => subscription.unsubscribe();
  }, []);

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
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(circle_at_top_left,rgba(23,182,122,0.08),transparent_28%),linear-gradient(180deg,#ffffff_0%,#ffffff_100%)]" />
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-slate-950 no-underline"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/20 bg-white/80 text-lg font-semibold text-brand shadow-sm">
              PS
            </span>
            <div className="text-left">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                PortfolioSignal
              </p>
              <p className="text-base font-semibold text-slate-950">
                Personal AI finance
              </p>
            </div>
          </Link>
        </div>
        <Panel className="space-y-6 border-black/6 bg-white/84 p-8 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Sign in
            </h1>
            <p className="text-sm text-slate-600">
              Use your Google or GitHub account to continue.
            </p>
          </div>
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
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
                  "w-full border-brand bg-brand text-slate-950 hover:border-brand-strong hover:bg-brand-strong disabled:opacity-70",
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
        <p className="text-center text-sm text-slate-500">
          <Link href="/" className="text-slate-600 hover:text-slate-950">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
