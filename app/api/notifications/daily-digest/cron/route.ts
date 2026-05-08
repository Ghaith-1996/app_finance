import { requireDigestCronSecret } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { runDailyDigestCron } from "@/lib/notifications/daily-digest";

export const runtime = "nodejs";

const log = createLogger("daily-digest-cron");

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function parseNowOverride(request: Request): Date | null {
  const raw = new URL(request.url).searchParams.get("now")?.trim();
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function GET() {
  return json(
    { error: "Use POST /api/notifications/daily-digest/cron." },
    405,
  );
}

export async function POST(request: Request) {
  const secret = requireDigestCronSecret();
  const auth = request.headers.get("authorization") ?? "";
  const { isTimingSafeEqual } = await import("@/lib/security/timing");

  if (!isTimingSafeEqual(auth, `Bearer ${secret}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const now = parseNowOverride(request) ?? new Date();
  log.info("Daily digest cron started", { now: now.toISOString() });

  const result = await runDailyDigestCron({
    now,
    request,
  });

  log.info("Daily digest cron completed", result as unknown as Record<string, unknown>);

  return json(
    result,
    result.failedDeliveries > 0 || result.uncertainDeliveries > 0 ? 500 : 200,
  );
}
