import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ProfileForm } from "@/components/app/profile-form";
import { getCurrentUserProfile, saveCurrentUserProfile } from "@/lib/actions/profile";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/settings");
  }

  const profile = await getCurrentUserProfile();

  return (
    <AppShell
      eyebrow=""
      title="Settings"
      description="Update the profile information shown around the app."
      activePath="/settings"
      backHref="/home"
      backLabel="Back to home"
    >
      <ProfileForm
        initialProfile={
          profile ?? {
            firstName: "",
            lastName: "",
            handle: "",
            displayName: "",
            avatarUrl: null,
          }
        }
        title="Profile settings"
        description="Manage your name and username."
        submitLabel="Save changes"
        successMessage="Profile updated."
        onSubmit={saveCurrentUserProfile}
      />
    </AppShell>
  );
}
