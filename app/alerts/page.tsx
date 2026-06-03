import { AlertsCenter } from "@/components/app/alerts-center";
import { AppShell } from "@/components/app/app-shell";
import { loadAlertsPageData } from "@/lib/server/alerts";

export default async function AlertsPage() {
  const { showOnboardingNav, showAdminLink, alerts, summary } =
    await loadAlertsPageData();

  return (
    <AppShell
      eyebrow="Signals"
      title="Alert Center"
      description="Review smart alerts generated from critical news, earnings reports, price moves, and concentration rules."
      activePath="/alerts"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <AlertsCenter initialAlerts={alerts} summary={summary} />
    </AppShell>
  );
}
