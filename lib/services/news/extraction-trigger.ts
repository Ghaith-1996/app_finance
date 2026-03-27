import { spawn } from "child_process";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fire-and-forget: run Python newspaper4k extraction in a separate process.
 * Does not block the request — extraction updates news_items asynchronously.
 */
export function spawnArticleExtractionWorker(articleIds: string[]): void {
  if (articleIds.length === 0) return;

  // Validate all IDs are UUIDs to prevent command injection
  if (!articleIds.every((id) => UUID_RE.test(id))) {
    throw new Error("Invalid article ID format — expected UUIDs");
  }

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
