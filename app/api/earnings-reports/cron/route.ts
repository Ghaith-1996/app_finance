import { createLogger } from "@/lib/logger";
import { syncTrackedEarningsReports } from "@/lib/services/earnings-reports";
import { createServiceClient } from "@/lib/supabase/service";

const log = createLogger("earnings-reports-cron");

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "CRON_SECRET not configured" }, 500);
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
    { error: "Use POST /api/earnings-reports/cron to sync tracked earnings report links." },
    405,
  );
}

export async function POST(request: Request) {
  const authError = await authorizeCron(request);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    const supabase = createServiceClient();
    const result = await syncTrackedEarningsReports(supabase);

    log.info("Earnings report sync completed", {
      durationMs: Date.now() - startedAt,
      ...result,
    });

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Earnings report sync failed", {
      durationMs: Date.now() - startedAt,
      error: message,
    });
    return json({ error: "Earnings report sync failed", detail: message }, 500);
  }
}
