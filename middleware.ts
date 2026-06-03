import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeRedirect } from "@/lib/security/redirect";

const protectedPaths = ["/onboarding", "/analysis", "/feed", "/portfolio", "/home", "/alerts", "/search", "/saved", "/watchlist", "/settings", "/admin", "/complete-profile", "/digest"];

/** Paths where an incomplete profile is acceptable (the user is actively completing it, or reading ToS). */
const profileExemptPaths = ["/complete-profile", "/terms"];

function isProtectedPath(pathname: string) {
  return protectedPaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
}

function isProfileExemptPath(pathname: string) {
  return profileExemptPaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const redirectTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const authenticatedUser = userError ? null : user;

  if (!authenticatedUser && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", redirectTarget);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  if (authenticatedUser && request.nextUrl.pathname === "/login") {
    const redirectTo = sanitizeRedirect(request.nextUrl.searchParams.get("redirectTo"), "/portfolio");
    const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url));
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  // Gate: authenticated users on protected paths must have a complete profile (name + ToS)
  if (
    authenticatedUser &&
    isProtectedPath(request.nextUrl.pathname) &&
    !isProfileExemptPath(request.nextUrl.pathname)
  ) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("first_name, last_name, handle, accepted_terms_at")
      .eq("user_id", authenticatedUser.id)
      .maybeSingle();

    const isComplete =
      !!profile?.first_name?.trim() &&
      !!profile?.last_name?.trim() &&
      !!profile?.handle?.trim() &&
      !!profile?.accepted_terms_at;

    if (!isComplete) {
      const completeUrl = new URL("/complete-profile", request.url);
      completeUrl.searchParams.set("redirectTo", redirectTarget);
      const redirectResponse = NextResponse.redirect(completeUrl);
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
