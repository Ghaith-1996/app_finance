export type ProfileFormValues = {
  firstName: string;
  lastName: string;
  handle: string;
};

export type UserProfileData = ProfileFormValues & {
  displayName: string;
  avatarUrl: string | null;
  acceptedTermsAt: string | null;
};

export type UserProfileValidationResult =
  | {
      ok: true;
      value: {
        firstName: string;
        lastName: string;
        handle: string;
        displayName: string;
      };
    }
  | { ok: false; error: string };

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

const RESERVED_HANDLES = new Set([
  "admin", "root", "api", "system", "billing", "stripe",
  "support", "help", "mod", "moderator", "staff", "official",
  "null", "undefined", "test", "user", "settings", "home",
]);

export function validateProfileInput(input: {
  firstName?: string;
  lastName?: string;
  handle?: string;
}): UserProfileValidationResult {
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const handle = normalizeHandle(input.handle ?? "");

  if (!firstName) return { ok: false, error: "First name is required." };
  if (!lastName) return { ok: false, error: "Last name is required." };
  if (!handle) return { ok: false, error: "Username is required." };
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
    return {
      ok: false,
      error:
        "Username must be 3-20 characters and use only lowercase letters, numbers, or underscores.",
    };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, error: "Username not available." };
  }
  if (/^_+$/.test(handle) || /^(.)\1+$/.test(handle)) {
    return { ok: false, error: "Username must contain a mix of characters." };
  }

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      handle,
      displayName: `${firstName} ${lastName}`.trim(),
    },
  };
}

export function deriveNamesFromMetadata(meta: Record<string, unknown>) {
  const given =
    (meta.given_name as string | undefined)?.trim() ||
    (meta.first_name as string | undefined)?.trim() ||
    "";
  const family =
    (meta.family_name as string | undefined)?.trim() ||
    (meta.last_name as string | undefined)?.trim() ||
    "";

  if (given || family) {
    return { firstName: given, lastName: family };
  }

  const fullName =
    (meta.full_name as string | undefined)?.trim() ||
    (meta.name as string | undefined)?.trim() ||
    "";
  if (!fullName) return { firstName: "", lastName: "" };

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function defaultHandle(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const meta = user.user_metadata ?? {};
  const preferred =
    (meta.preferred_username as string | undefined)?.trim() ||
    (meta.user_name as string | undefined)?.trim() ||
    (meta.login as string | undefined)?.trim() ||
    "";
  if (preferred) return normalizeHandle(preferred);
  const emailName = user.email?.split("@")[0] ?? "";
  return normalizeHandle(emailName);
}

export function isProfileComplete(
  profile: Pick<UserProfileData, "firstName" | "lastName" | "handle" | "acceptedTermsAt"> | null,
): boolean {
  if (!profile) return false;
  return (
    !!profile.firstName.trim() &&
    !!profile.lastName.trim() &&
    !!profile.handle.trim() &&
    !!profile.acceptedTermsAt
  );
}
