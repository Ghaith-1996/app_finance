import { spawn } from "child_process";
import { requireAdminRouteAccess } from "@/lib/security/admin";

interface HealthCheck {
  name: string;
  ok: boolean;
  error?: string;
}

interface HealthResult {
  ok: boolean;
  checks: HealthCheck[];
}

/**
 * Run the Python worker's `--check` flag to verify dependencies and config.
 */
function runWorkerPreflight(): Promise<HealthResult> {
  return new Promise((resolve) => {
    const args = ["-m", "workers.news_ingestion.main", "--check"];

    const trySpawn = (cmd: string): Promise<HealthResult> =>
      new Promise((res) => {
        let stdout = "";
        const proc = spawn(cmd, args, {
          env: { ...process.env },
          cwd: process.cwd(),
        });

        proc.stdout.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", () => {
          /* logs go to stderr, ignore for health check */
        });

        proc.on("error", (err) => {
          res({
            ok: false,
            checks: [
              { name: "python", ok: false, error: `Cannot spawn: ${err.message}` },
            ],
          });
        });

        proc.on("close", (code) => {
          try {
            const parsed = JSON.parse(stdout) as HealthResult;
            // Prepend a passing python check since the process ran
            parsed.checks.unshift({ name: "python", ok: true });
            parsed.ok = parsed.checks.every((c) => c.ok);
            res(parsed);
          } catch {
            res({
              ok: false,
              checks: [
                {
                  name: "python",
                  ok: code === 0,
                  error: code !== 0
                    ? `Worker check exited ${code}. Is Python installed with the venv active?`
                    : undefined,
                },
              ],
            });
          }
        });
      });

    trySpawn("python")
      .then((result) => {
        const pythonCheck = result.checks.find((c) => c.name === "python");
        if (pythonCheck && !pythonCheck.ok && pythonCheck.error?.includes("Cannot spawn")) {
          return trySpawn("python3");
        }
        return result;
      })
      .then(resolve);
  });
}

/**
 * GET /api/news/health
 *
 * Returns per-check diagnostics for the news ingestion pipeline:
 *   - python available
 *   - EDGAR_LOCAL_DATA_DIR (writable workspace cache)
 *   - edgartools import OK
 *   - supabase-py import OK
 *   - SUPABASE_SERVICE_ROLE_KEY set
 *   - EDGAR_IDENTITY set
 *   - NEWSAPI_KEY set
 *   - gnews package import OK
 */
export async function GET(_request: Request) {
  const { errorResponse } = await requireAdminRouteAccess();
  if (errorResponse) return errorResponse;

  const health = await runWorkerPreflight();

  return Response.json(health, { status: health.ok ? 200 : 503 });
}
