import { requireAdminRouteAccess } from "@/lib/security/admin";
import { loadJobHealth } from "@/lib/services/job-health";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Admin-only job health (audit H8): backlog, freshness, failed/uncertain work and missing runs,
 * read from durable state rather than from cron HTTP status codes.
 */
export async function GET() {
  const access = await requireAdminRouteAccess();
  if (access.errorResponse) return access.errorResponse;

  const report = await loadJobHealth(createServiceClient());
  return Response.json(report, { status: report.status === "ok" ? 200 : 503 });
}
