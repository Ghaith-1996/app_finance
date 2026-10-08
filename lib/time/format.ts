/**
 * One timestamp policy for every surface (audit F15).
 *
 * - Absolute times render in the product time zone (Eastern, the same zone the 9 AM digest and
 *   the quota windows use) with an explicit zone label, so server-rendered and browser-rendered
 *   pages show the same text for the same event.
 * - Relative times share one set of thresholds; "Just now" means under a minute, never "under an
 *   hour".
 */

export const APP_TIME_ZONE = "America/Toronto";

const absoluteFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatAppDateTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return absoluteFormatter.format(date);
}

export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date(), fallback = "—"): string {
  if (!iso) return fallback;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return fallback;
  const minutes = Math.max(0, Math.floor((now.getTime() - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
