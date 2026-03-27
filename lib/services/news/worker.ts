import { spawn } from "child_process";
import { INGEST_SOURCE_KEYS } from "@/lib/services/news/source-config";

/** One source row from the Python worker (post-upsert). */
export interface WorkerSourceRow {
  fetched: number;
  inserted: number;
  skipped: number;
  failed: number;
  inserted_ids: string[];
  fetch_outcome?: string;
  fetch_error?: string | null;
  fetch_warnings?: string[];
}

export interface WorkerResult {
  ingest_status?: "failed" | "partial" | "success" | "empty" | "probe";
  ingest_detail?: string;
  edgar: WorkerSourceRow;
  newsapi: WorkerSourceRow;
  gnews: WorkerSourceRow;
  total_inserted: number;
  error?: string;
  checks?: Array<{ name: string; ok: boolean; error?: string }>;
  probe_only?: boolean;
}

function emptyRow(): WorkerSourceRow {
  return {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    inserted_ids: [],
  };
}

function emptyWorkerResult(error?: string, checks?: WorkerResult["checks"]): WorkerResult {
  return {
    edgar: emptyRow(),
    newsapi: emptyRow(),
    gnews: emptyRow(),
    total_inserted: 0,
    ...(error ? { error } : {}),
    ...(checks ? { checks } : {}),
  };
}

const TICKER_RE = /^[A-Z0-9.\-]{1,10}$/;

export function runPythonWorker(
  tickers: string[],
  lookbackHours: number,
  maxArticles: number,
  options?: { sources?: string[]; gnewsQueries?: string[] },
): Promise<WorkerResult> {
  // Validate ticker format before spawning a child process
  if (!tickers.every((t) => TICKER_RE.test(t))) {
    return Promise.resolve(emptyWorkerResult("Invalid ticker format"));
  }

  return new Promise((resolve) => {
    const args = [
      "-m", "workers.news_ingestion.main",
      "--tickers", tickers.join(","),
      "--lookback-hours", String(lookbackHours),
      "--max-articles", String(maxArticles),
    ];

    if (options?.sources?.length) {
      args.push("--sources", options.sources.join(","));
    }
    if (options?.gnewsQueries?.length) {
      args.push("--gnews-queries-json", JSON.stringify(options.gnewsQueries));
    }

    const trySpawn = (cmd: string): Promise<WorkerResult> =>
      new Promise((res) => {
        let stdout = "";
        let stderr = "";

        const proc = spawn(cmd, args, {
          env: { ...process.env },
          cwd: process.cwd(),
        });

        proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

        const failBoth = (err: string): void => {
          res(emptyWorkerResult(err));
        };

        proc.on("error", (err) => {
          failBoth(err.message);
        });

        proc.on("close", (code) => {
          if (code !== 0) {
            try {
              const parsed = JSON.parse(stdout) as {
                error?: string;
                checks?: WorkerResult["checks"];
              };
              if (parsed.error) {
                res(emptyWorkerResult(parsed.error, parsed.checks));
                return;
              }
            } catch { /* not JSON */ }

            failBoth(`Worker exited ${code}: ${stderr.slice(0, 500)}`);
            return;
          }
          try {
            const raw = JSON.parse(stdout);
            const sourceRows = Object.fromEntries(
              INGEST_SOURCE_KEYS.map((key) => [key, raw[key] ?? emptyRow()]),
            ) as Record<(typeof INGEST_SOURCE_KEYS)[number], WorkerSourceRow>;
            res({
              ingest_status: raw.ingest_status,
              ingest_detail: raw.ingest_detail,
              ...sourceRows,
              total_inserted: raw.total_inserted ?? 0,
              error: raw.error,
              checks: raw.checks,
              probe_only: raw.probe_only,
            });
          } catch {
            failBoth(`Worker output parse failed: ${stdout.slice(0, 200)}`);
          }
        });
      });

    trySpawn("python").then((result) => {
      if (result.error?.startsWith("spawn python ENOENT")) {
        return trySpawn("python3");
      }
      return result;
    }).then(resolve);
  });
}
