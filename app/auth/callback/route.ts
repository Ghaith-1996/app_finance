import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { validateProfileInput } from "@/lib/profile/utils";
import { sanitizeRedirect } from "@/lib/security/redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = sanitizeRedirect(searchParams.get("redirectTo"), "/portfolio");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, handle")
          .eq("user_id", user.id)
          .maybeSingle();

        const validation = validateProfileInput({
          firstName: (profile?.first_name as string | undefined) ?? "",
          lastName: (profile?.last_name as string | undefined) ?? "",
          handle: (profile?.handle as string | undefined) ?? "",
        });

        if (!validation.ok) {
          return NextResponse.redirect(
            `${origin}/complete-profile?redirectTo=${encodeURIComponent(redirectTo)}`,
          );
        }
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
