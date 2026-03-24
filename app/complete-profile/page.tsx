import { redirect } from "next/navigation";
import { completeProfileAction, getCurrentUserProfile } from "@/lib/actions/profile";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/app/profile-form";
import { isProfileComplete } from "@/lib/profile/utils";

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
  const redirectTo = params.redirectTo ?? "/portfolio";
  const profile = await getCurrentUserProfile();

  if (isProfileComplete(profile)) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
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
        title="Complete your profile"
        description="Tell us your first name, last name, and username before entering the app."
        submitLabel="Continue"
        redirectTo={redirectTo}
        onSubmit={completeProfileAction}
      />
    </div>
  );
}
