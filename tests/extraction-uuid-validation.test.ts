import { describe, it, expect, vi } from "vitest";
import { spawnArticleExtractionWorker } from "@/lib/services/news/extraction-trigger";

// Mock child_process so spawn never actually runs
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    spawn: vi.fn(() => ({
      on: vi.fn(),
      unref: vi.fn(),
    })),
  };
});

describe("spawnArticleExtractionWorker — UUID validation", () => {
  it("accepts valid UUIDs", () => {
    expect(() =>
      spawnArticleExtractionWorker([
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      ]),
    ).not.toThrow();
  });

  it("rejects non-UUID strings", () => {
    expect(() =>
      spawnArticleExtractionWorker(["not-a-uuid", "also-bad"]),
    ).toThrow("Invalid article ID format");
  });

  it("rejects command injection payloads", () => {
    expect(() =>
      spawnArticleExtractionWorker(["550e8400-e29b-41d4-a716-446655440000; rm -rf /"]),
    ).toThrow("Invalid article ID format");
  });

  it("does not throw for empty array", () => {
    expect(() => spawnArticleExtractionWorker([])).not.toThrow();
  });
});
