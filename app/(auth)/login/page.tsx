"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppLogo } from "@/components/brand/app-logo";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { usePreferences } from "@/components/providers/preferences-provider";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/portfolio";
  const error = searchParams.get("error");
  const [loading, setLoading] = useState<string | null>(null);
  const { t } = usePreferences();

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
        <div className="flex justify-center gap-3">
          <ThemeToggle />
        </div>

        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-3 text-primary no-underline">
            <AppLogo size="lg" priority />
            <div className="text-left">
              <p className="text-xs uppercase tracking-[0.22em] text-secondary">Pulsefolio</p>
              <p className="text-base font-semibold text-primary">{t("login.tagline")}</p>
            </div>
          </Link>
        </div>

        <Panel className="space-y-6 p-8">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-primary">{t("login.title")}</h1>
            <p className="text-sm text-secondary">{t("login.description")}</p>
          </div>
          {error ? (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {t("login.failed")}
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => signInWith("google")}
              disabled={!!loading}
              className={buttonStyles({
                size: "lg",
                className: "w-full disabled:opacity-70",
              })}
            >
              {loading === "google" ? t("login.redirecting") : t("login.google")}
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
              {loading === "github" ? t("login.redirecting") : t("login.github")}
            </button>
          </div>
          <p className="text-center text-xs leading-6 text-secondary">
            {t("login.legalNoticeStart")}{" "}
            <Link href="/terms" className="text-brand underline underline-offset-2 hover:text-brand-strong">
              {t("common.termsOfService")}
            </Link>{" "}
            {t("login.legalNoticeMiddle")}{" "}
            <Link href="/privacy" className="text-brand underline underline-offset-2 hover:text-brand-strong">
              {t("common.privacyPolicy")}
            </Link>
            .
          </p>
        </Panel>

        <p className="text-center text-sm text-muted">
          <Link href="/" className="text-secondary hover:text-primary">
            {t("login.backHome")}
          </Link>
        </p>
      </div>
    </div>
  );
}
