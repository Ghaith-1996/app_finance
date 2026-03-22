/**
 * Pure formatter that turns a worker result into a human-readable ingest
 * stage status + detail string. Extracted from route.ts so it can be
 * unit-tested without exercising the full HTTP route.
 */
import {
  INGEST_SOURCE_KEYS,
  INGEST_SOURCE_LABELS,
  type IngestSourceKey,
} from "@/lib/services/news/source-config";

export interface SourceStats {
  fetched: number;
  inserted: number;
  skipped: number;
  failed: number;
  fetch_outcome?: string;
  fetch_error?: string | null;
  fetch_warnings?: string[];
}

export interface IngestInput {
  ingest_status?: "failed" | "partial" | "success" | "empty" | "probe";
  ingest_detail?: string;
  edgar: SourceStats;
  newsapi?: SourceStats;
  gnews?: SourceStats;
  total_inserted: number;
  error?: string;
}

export type IngestStageStatus =
  | "success"
  | "failed"
  | "skipped"
  | "partial"
  | "empty";

export interface IngestStageResult {
  status: IngestStageStatus;
  detail: string;
}

function sourceLabel(key: string): string {
  return INGEST_SOURCE_LABELS[key as IngestSourceKey] ?? key;
}

function sourceEntries(input: IngestInput): Array<[IngestSourceKey, SourceStats]> {
  return INGEST_SOURCE_KEYS
    .map((key) => [key, input[key]] as const)
    .filter((entry): entry is [IngestSourceKey, SourceStats] => Boolean(entry[1]));
}

function joinSourceLabels(keys: string[]): string {
  const labels = keys.map((key) => sourceLabel(key));
  if (labels.length <= 1) return labels[0] ?? "sources";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

/**
 * Build unambiguous ingest detail text based on per-source stats.
 */
export function formatIngestStage(input: IngestInput): IngestStageResult {
  if (input.error && input.ingest_status === undefined) {
    return { status: "failed", detail: input.error };
  }

  const st = input.ingest_status;
  const detail = input.ingest_detail ?? buildDetail(input);

  if (st === "failed") return { status: "failed", detail };
  if (st === "partial") return { status: "partial", detail };
  if (st === "empty") return { status: "empty", detail };
  if (st === "success") return { status: "success", detail };

  return inferLegacy(input, detail);
}

function buildDetail(input: IngestInput): string {
  const sources = sourceEntries(input);
  const totalFetched = sources.reduce((sum, [, src]) => sum + (src.fetched ?? 0), 0);
  const failedSources = sources.filter(([, src]) => src.fetch_outcome === "failed");
  const emptySources = sources.filter(([, src]) =>
    src.fetch_outcome === "empty_window" ||
    src.fetch_outcome === "skipped" ||
    (src.fetch_outcome !== "failed" && (src.fetched ?? 0) === 0),
  );

  if (failedSources.length === sources.length) {
    return failedSources
      .map(([key, src]) => failedSourceLine(key, src))
      .join("; ");
  }

  if (failedSources.length > 0) {
    const parts = failedSources.map(([key, src]) => failedSourceLine(key, src));
    for (const [key, src] of sources) {
      if (src.fetch_outcome === "failed") continue;
      if ((src.fetched ?? 0) === 0) {
        parts.push(`${sourceLabel(key)} returned 0 articles`);
      } else if ((src.inserted ?? 0) === 0) {
        parts.push(
          `${sourceLabel(key)} fetched ${src.fetched} but all were already ingested`,
        );
      } else {
        parts.push(`${sourceLabel(key)}: ${src.inserted} new of ${src.fetched} fetched`);
      }
    }
    return `${parts.join(". ")}.`;
  }

  if (totalFetched === 0 || emptySources.length === sources.length) {
    return `No articles were returned by ${joinSourceLabels(
      sources.map(([key]) => key),
    )} in the lookback window.`;
  }

  if (input.total_inserted === 0) {
    const totalSkipped = sources.reduce((sum, [, src]) => sum + (src.skipped ?? 0), 0);
    return (
      `Fetched ${totalFetched} article${totalFetched === 1 ? "" : "s"} ` +
      `but ${totalSkipped === totalFetched ? "all" : totalSkipped} ` +
      `already ingested - nothing new to add.`
    );
  }

  const insertedSummary = sources
    .filter(([, src]) => (src.inserted ?? 0) > 0)
    .map(([key, src]) => `${src.inserted} ${sourceLabel(key)}`)
    .join(", ");

  return (
    `${input.total_inserted} new article${input.total_inserted === 1 ? "" : "s"} inserted` +
    (insertedSummary ? ` (${insertedSummary}).` : ".")
  );
}

function failedSourceLine(key: string, src: SourceStats): string {
  const label = sourceLabel(key);
  return src.fetch_error
    ? `${label} failed: ${src.fetch_error}`
    : `${label} failed`;
}

function inferLegacy(input: IngestInput, detail: string): IngestStageResult {
  const outcomes = sourceEntries(input).map(([, src]) => src.fetch_outcome);

  if (outcomes.length > 0 && outcomes.every((outcome) => outcome === "failed")) {
    return { status: "failed", detail };
  }
  if (input.total_inserted > 0) {
    return {
      status: outcomes.some((outcome) => outcome === "failed") ? "partial" : "success",
      detail,
    };
  }
  if (outcomes.length > 0 && outcomes.every((outcome) => outcome === "empty_window")) {
    return { status: "empty", detail };
  }
  return { status: "partial", detail };
}
