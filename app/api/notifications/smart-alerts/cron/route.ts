import { createLogger } from "@/lib/logger";
import { runSmartAlertsCron } from "@/lib/notifications/smart-alerts";

export const runtime = "nodejs";

const log = createLogger("smart-alerts-cron");

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function parseNowOverride(request: Request): Date | null {
  const raw = new URL(request.url).searchParams.get("now")?.trim();
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

async function authorizeCron(request: Request) {
  const secret = process.env.SMART_ALERTS_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return json(
      { error: "SMART_ALERTS_CRON_SECRET or CRON_SECRET not configured" },
      500,
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const { isTimingSafeEqual } = await import("@/lib/security/timing");
  if (!isTimingSafeEqual(auth, `Bearer ${secret}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  return null;
}

export async function GET() {
  return json(
    { error: "Use POST /api/notifications/smart-alerts/cron." },
    405,
  );
}

export async function POST(request: Request) {
  const authError = await authorizeCron(request);
  if (authError) return authError;

  const now = parseNowOverride(request) ?? new Date();
  const startedAt = Date.now();
  log.info("Smart alerts cron started", { now: now.toISOString() });

  try {
    const result = await runSmartAlertsCron({ now });
    log.info("Smart alerts cron completed", {
      durationMs: Date.now() - startedAt,
      ...result,
    });

    return json(result, result.errors.length > 0 ? 500 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Smart alerts cron failed", {
      durationMs: Date.now() - startedAt,
      error: message,
    });
    return json({ error: "Smart alerts cron failed", detail: message }, 500);
  }
}
