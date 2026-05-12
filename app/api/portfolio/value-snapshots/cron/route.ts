import { createLogger } from "@/lib/logger";
import { recordPortfolioValueSnapshots } from "@/lib/services/portfolio-value-snapshots";

export const runtime = "nodejs";

const log = createLogger("portfolio-value-snapshots-cron");

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function parseNowOverride(request: Request): Date | null {
  const raw = new URL(request.url).searchParams.get("now")?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.PORTFOLIO_SNAPSHOT_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization") ?? "";
  const { isTimingSafeEqual } = await import("@/lib/security/timing");
  return isTimingSafeEqual(auth, `Bearer ${secret}`);
}

export async function GET() {
  return json(
    { error: "Use POST /api/portfolio/value-snapshots/cron." },
    405,
  );
}

export async function POST(request: Request) {
  const secret = process.env.PORTFOLIO_SNAPSHOT_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return json(
      { error: "PORTFOLIO_SNAPSHOT_CRON_SECRET or CRON_SECRET not configured" },
      500,
    );
  }

  if (!(await isAuthorized(request))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const now = parseNowOverride(request) ?? new Date();
  log.info("Portfolio value snapshot cron started", { now: now.toISOString() });

  const result = await recordPortfolioValueSnapshots({ now });
  log.info("Portfolio value snapshot cron completed", result as unknown as Record<string, unknown>);

  const hasFatalFailure =
    result.errors.length > 0 && result.portfoliosSnapshotted === 0;
  return json(result, hasFatalFailure ? 500 : 200);
}
