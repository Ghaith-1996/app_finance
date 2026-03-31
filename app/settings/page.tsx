import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { BillingSettingsPanel } from "@/components/app/billing-settings-panel";
import { ProfileForm } from "@/components/app/profile-form";
import { Badge } from "@/components/ui/badge";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { getCurrentUserProfile, saveCurrentUserProfile } from "@/lib/actions/profile";
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
  const showOnboardingNav = await loadOnboardingNavState();
  const showAdminLink = isAdminUser(user);
  const billingSummary = await getBillingSummaryForUser(user.id, user.email);
  const sp = searchParams ? await searchParams : {};
  const billingMessage =
    typeof sp.billing === "string" ? sp.billing : Array.isArray(sp.billing) ? sp.billing[0] : null;

  return (
    <AppShell
      eyebrow=""
      title="Settings"
      description="Update the profile information shown around the app."
      activePath="/settings"
      backHref="/home"
      backLabel="Back to home"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <div className="space-y-6">
        {billingMessage === "success" ? (
          <Badge tone="success" className="w-fit">
            Stripe checkout completed. Billing access will unlock after the webhook sync finishes.
          </Badge>
        ) : null}

        <BillingSettingsPanel billingSummary={billingSummary} />

        <ProfileForm
          initialProfile={
            profile ?? {
              firstName: "",
              lastName: "",
              handle: "",
            }
          }
          title="Profile settings"
          description="Manage your name and username."
          submitLabel="Save changes"
          successMessage="Profile updated."
          onSubmit={saveCurrentUserProfile}
        />
      </div>
    </AppShell>
  );
}
