const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  try {
    const parsed = new URL(raw.trim());
    if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
