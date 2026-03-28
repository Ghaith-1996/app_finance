import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminConsolePanel } from "@/components/app/admin-console-panel";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { isAdminUser } from "@/lib/security/admin";
import { loadOnboardingNavState } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin");
  }

  if (!isAdminUser(user)) {
    redirect("/settings");
  }

  const showOnboardingNav = await loadOnboardingNavState();
  const billingSummary = await getBillingSummaryForUser(user.id, user.email);

  return (
    <AppShell
      eyebrow="Admin"
      title="Admin Console"
      description="Allowlist-only controls for model access and manual news operations. Stripe plan state remains unchanged; admin status only overrides AI model tier access."
      activePath="/admin"
      backHref="/settings"
      backLabel="Back to settings"
      showOnboardingNav={showOnboardingNav}
      showAdminLink
      actions={
        <Link
          href="/settings"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
        >
          Open settings
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Badge tone="brand">Allowlist-matched admin</Badge>
          <Badge tone="neutral">Plan: {billingSummary.planKey}</Badge>
          {billingSummary.hasAdminModelAccess ? (
            <Badge tone="brand">All AI tiers unlocked</Badge>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel className="space-y-5 rounded-[2rem] p-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Model access
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Admin access now bypasses billing tier gates
              </h2>
              <p className="text-sm leading-7 text-slate-400">
                Your current Stripe plan is still tracked as <span className="font-semibold text-slate-200">{billingSummary.planKey}</span>, but admin status now unlocks free, premium, and ultimate model tiers across feed chat and portfolio copilot.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Allowed tiers
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {billingSummary.allowedModelTiers.join(", ")}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Default tier: {billingSummary.defaultModelTier}
              </p>
            </div>
          </Panel>

          <Panel className="space-y-5 rounded-[2rem] p-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Operational shortcuts
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Manual news controls
              </h2>
              <p className="text-sm leading-7 text-slate-400">
                These actions hit the existing admin-only routes using your current session cookie. Use them for diagnostics and manual refreshes without exposing the old debug endpoints in the public UI.
              </p>
            </div>
          </Panel>
        </div>

        <AdminConsolePanel />
      </div>
    </AppShell>
  );
}
