// @vitest-environment node

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

// Mock child_process so spawn never actually runs
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    spawn: spawnMock,
  };
});

import { spawnArticleExtractionWorker } from "@/lib/services/news/extraction-trigger";

function createSpawnProcess() {
  const process = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
  process.unref = vi.fn();
  return process;
}

describe("spawnArticleExtractionWorker — UUID validation", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => createSpawnProcess());
  });

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

  it("handles errors when neither Python executable can be spawned", () => {
    const primary = createSpawnProcess();
    const fallback = createSpawnProcess();
    spawnMock.mockReturnValueOnce(primary).mockReturnValueOnce(fallback);

    spawnArticleExtractionWorker(["550e8400-e29b-41d4-a716-446655440000"]);

    expect(() => primary.emit("error", new Error("spawn python ENOENT"))).not.toThrow();
    expect(() => fallback.emit("error", new Error("spawn python3 ENOENT"))).not.toThrow();
  });
});
