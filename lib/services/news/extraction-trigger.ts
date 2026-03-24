import { spawn } from "child_process";

/**
 * Fire-and-forget: run Python newspaper4k extraction in a separate process.
 * Does not block the request — extraction updates news_items asynchronously.
 */
export function spawnArticleExtractionWorker(articleIds: string[]): void {
  if (articleIds.length === 0) return;

  const args = ["-m", "workers.news_ingestion.extract_full_text", "--ids", articleIds.join(",")];
  const opts = {
    cwd: process.cwd(),
    env: { ...process.env },
    detached: true,
    stdio: "ignore" as const,
  };

  const proc = spawn("python", args, opts);
  proc.on("error", () => {
    spawn("python3", args, opts).unref();
  });
  proc.unref();
}
