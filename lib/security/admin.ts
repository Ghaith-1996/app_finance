import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function getAdminUserIds(): Set<string> {
  return parseAllowlist(process.env.ADMIN_USER_IDS);
}

function getAdminEmails(): Set<string> {
  return new Set(
    [...parseAllowlist(process.env.ADMIN_USER_EMAILS)].map((email) =>
      email.toLowerCase()
    ),
  );
}

export function isAdminUser(user: Pick<User, "id" | "email"> | null | undefined): boolean {
  if (!user) return false;

  const adminUserIds = getAdminUserIds();
  if (adminUserIds.has(user.id)) return true;

  const email = user.email?.trim().toLowerCase();
  if (!email) return false;

  return getAdminEmails().has(email);
}

export async function requireAdminRouteAccess(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
  errorResponse: Response | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      errorResponse: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminUser(user)) {
    return {
      supabase,
      user: null,
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    supabase,
    user,
    errorResponse: null,
  };
}
