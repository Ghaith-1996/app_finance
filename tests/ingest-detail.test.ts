import { describe, it, expect } from "vitest";
import { formatIngestStage, type IngestInput, type SourceStats } from "@/lib/ingest-detail";

function emptySource(overrides: Partial<SourceStats> = {}): SourceStats {
  return { fetched: 0, inserted: 0, skipped: 0, failed: 0, ...overrides };
}

function baseInput(overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    edgar: emptySource(),
    total_inserted: 0,
    ...overrides,
  };
}

describe("formatIngestStage", () => {
  it("both sources empty_window → status empty, mentions lookback", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "empty",
        edgar: emptySource({ fetch_outcome: "empty_window" }),
        newsapi: emptySource({ fetch_outcome: "empty_window" }),
      }),
    );
    expect(result.status).toBe("empty");
    expect(result.detail).toContain("No articles were returned");
    expect(result.detail).toContain("lookback window");
  });

  it("fetched items but all skipped as duplicates → mentions already ingested", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "empty",
        edgar: emptySource({ fetched: 5, skipped: 5, fetch_outcome: "ok" }),
        newsapi: emptySource({ fetched: 3, skipped: 3, fetch_outcome: "ok" }),
        total_inserted: 0,
      }),
    );
    expect(result.status).toBe("empty");
    expect(result.detail).toContain("Fetched 8");
    expect(result.detail).toContain("already ingested");
  });

  it("one source failed, one source empty → partial with failing source name", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "partial",
        edgar: emptySource({ fetch_outcome: "failed", fetch_error: "timeout" }),
        newsapi: emptySource({ fetch_outcome: "empty_window" }),
        total_inserted: 0,
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.detail).toContain("EDGAR failed");
    expect(result.detail).toContain("timeout");
    expect(result.detail).toContain("NewsAPI");
  });

  it("inserted items with partial source failure → shows new count and error", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "partial",
        edgar: emptySource({ fetch_outcome: "failed", fetch_error: "403" }),
        newsapi: emptySource({ fetched: 10, inserted: 7, skipped: 3, fetch_outcome: "ok" }),
        total_inserted: 7,
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.detail).toContain("EDGAR failed: 403");
    expect(result.detail).toContain("NewsAPI: 7 new of 10 fetched");
  });

  it("top-level worker error without ingest_status → failed", () => {
    const result = formatIngestStage(
      baseInput({ error: "spawn python ENOENT" }),
    );
    expect(result.status).toBe("failed");
    expect(result.detail).toBe("spawn python ENOENT");
  });

  it("successful run → uses worker detail text when provided", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "success",
        ingest_detail: "12 articles ingested",
        edgar: emptySource({ fetched: 7, inserted: 7 }),
        newsapi: emptySource({ fetched: 5, inserted: 5 }),
        total_inserted: 12,
      }),
    );
    expect(result.status).toBe("success");
    expect(result.detail).toBe("12 articles ingested");
  });

  it("successful run without worker detail → builds detail from stats", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "success",
        edgar: emptySource({ fetched: 4, inserted: 4 }),
        newsapi: emptySource({ fetched: 6, inserted: 6 }),
        total_inserted: 10,
      }),
    );
    expect(result.status).toBe("success");
    expect(result.detail).toContain("10 new");
    expect(result.detail).toContain("4 EDGAR");
    expect(result.detail).toContain("6 NewsAPI");
  });

  it("legacy: both sources failed without ingest_status → failed", () => {
    const result = formatIngestStage(
      baseInput({
        edgar: emptySource({ fetch_outcome: "failed", fetch_error: "DNS" }),
        newsapi: emptySource({ fetch_outcome: "failed", fetch_error: "503" }),
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.detail).toContain("EDGAR failed: DNS");
    expect(result.detail).toContain("NewsAPI failed: 503");
  });

  it("legacy: both sources empty_window without ingest_status → empty", () => {
    const result = formatIngestStage(
      baseInput({
        edgar: emptySource({ fetch_outcome: "empty_window" }),
        newsapi: emptySource({ fetch_outcome: "empty_window" }),
      }),
    );
    expect(result.status).toBe("empty");
  });

  it("one source failed other inserted without ingest_status → partial", () => {
    const result = formatIngestStage(
      baseInput({
        edgar: emptySource({ fetch_outcome: "failed" }),
        newsapi: emptySource({ fetched: 5, inserted: 3, skipped: 2 }),
        total_inserted: 3,
      }),
    );
    expect(result.status).toBe("partial");
  });

  it("edgar-only input (no newsapi) still works", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "success",
        edgar: emptySource({ fetched: 3, inserted: 3 }),
        total_inserted: 3,
      }),
    );
    expect(result.status).toBe("success");
    expect(result.detail).toContain("3 new");
  });

  it("includes gnews in multi-source summaries", () => {
    const result = formatIngestStage(
      baseInput({
        ingest_status: "success",
        edgar: emptySource({ fetched: 2, inserted: 1 }),
        newsapi: emptySource({ fetched: 4, inserted: 2 }),
        gnews: emptySource({ fetched: 3, inserted: 1 }),
        total_inserted: 4,
      }),
    );
    expect(result.status).toBe("success");
    expect(result.detail).toContain("1 EDGAR");
    expect(result.detail).toContain("2 NewsAPI");
    expect(result.detail).toContain("1 GNews");
  });
});
