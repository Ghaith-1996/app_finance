import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { PreferencesPanel } from "@/components/app/preferences-panel";
import { BillingSettingsPanel } from "@/components/app/billing-settings-panel";
import { NotificationSettingsPanel } from "@/components/app/notification-settings-panel";
import { ProfileForm } from "@/components/app/profile-form";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "@/lib/i18n/server";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { getCurrentUserProfile, saveCurrentUserProfile } from "@/lib/actions/profile";
import {
  getCurrentUserNotificationPreferences,
  saveCurrentUserNotificationPreferences,
} from "@/lib/actions/notifications";
import { isAdminUser } from "@/lib/security/admin";
import { loadOnboardingNavState } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ billing?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/settings");
  }

  const profile = await getCurrentUserProfile();
  const notificationPreferences = await getCurrentUserNotificationPreferences();
  const { t } = await getTranslations();
  const showOnboardingNav = await loadOnboardingNavState();
  const showAdminLink = isAdminUser(user);
  const billingSummary = await getBillingSummaryForUser(user.id, user.email);
  const sp = searchParams ? await searchParams : {};
  const billingMessage =
    typeof sp.billing === "string" ? sp.billing : Array.isArray(sp.billing) ? sp.billing[0] : null;

  return (
    <AppShell
      eyebrow=""
      title={t("settingsPage.title")}
      description={t("settingsPage.description")}
      activePath="/settings"
      backHref="/home"
      backLabel={t("common.backToHome")}
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <div className="space-y-6">
        {billingMessage === "success" ? (
          <Badge tone="success" className="w-fit">
            {t("settingsPage.billingSuccess")}
          </Badge>
        ) : null}

        <BillingSettingsPanel billingSummary={billingSummary} />
        <NotificationSettingsPanel
          initialPreferences={notificationPreferences}
          onSubmit={saveCurrentUserNotificationPreferences}
        />
        <PreferencesPanel />

        <ProfileForm
          initialProfile={
            profile ?? {
              firstName: "",
              lastName: "",
              handle: "",
            }
          }
          title={t("settingsPage.profileTitle")}
          description={t("settingsPage.profileDescription")}
          submitLabel={t("common.saveChanges")}
          successMessage={t("settingsPage.profileUpdated")}
          onSubmit={saveCurrentUserProfile}
        />
      </div>
    </AppShell>
  );
}
