import { redirect } from "next/navigation";
import { completeProfileAction, getCurrentUserProfile } from "@/lib/actions/profile";
import { getTranslations } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

import { AppLogo } from "@/components/brand/app-logo";
import { ProfileForm } from "@/components/app/profile-form";
import { isProfileComplete } from "@/lib/profile/utils";
import { sanitizeRedirect } from "@/lib/security/redirect";

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const redirectTo = sanitizeRedirect(params.redirectTo, "/portfolio");
  const profile = await getCurrentUserProfile();
  const { t } = await getTranslations();

  if (isProfileComplete(profile)) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-3 text-primary no-underline">
        <AppLogo size="lg" priority />
        <span className="text-sm font-semibold uppercase tracking-[0.18em]">Pulsefolio</span>
      </Link>
      <ProfileForm
        initialProfile={
          profile ?? {
            firstName: "",
            lastName: "",
            handle: "",
          }
        }
        title={t("profile.completeTitle")}
        description={t("profile.completeDescription")}
        submitLabel={t("profile.continue")}
        redirectTo={redirectTo}
        onSubmit={completeProfileAction}
        requireTerms
      />
    </div>
  );
}
