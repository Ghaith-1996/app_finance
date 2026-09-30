import { describe, expect, it } from "vitest";

describe("source-config candidate registrations", () => {
  it("isMarketHeadlineSource returns true for candidate sources", async () => {
    const { isMarketHeadlineSource } = await import(
      "@/lib/services/news/source-config"
    );
    expect(isMarketHeadlineSource("newsapi_ai")).toBe(true);
    expect(isMarketHeadlineSource("newscatcher")).toBe(true);
  });
});

describe("publisher-extract EXTRACTABLE_SOURCE_TYPES", () => {
  it("includes newsapi_ai and newscatcher", async () => {
    // EXTRACTABLE_SOURCE_TYPES is not exported, so we verify indirectly
    // by importing the module and checking that the constant is defined
    // in the source file. Since we can't import a non-exported const,
    // we read the module text instead.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve("lib/services/news/publisher-extract.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify the source types array contains our candidate sources
    expect(content).toContain('"newsapi_ai"');
    expect(content).toContain('"newscatcher"');

    // Quick structural sanity: both appear inside the EXTRACTABLE_SOURCE_TYPES definition
    const match = content.match(/EXTRACTABLE_SOURCE_TYPES\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const arrayBody = match![1];
    expect(arrayBody).toContain('"newsapi_ai"');
    expect(arrayBody).toContain('"newscatcher"');
  });
});

describe("pool-snapshot source coverage", () => {
  it("pool snapshot query includes newsapi_ai and newscatcher source types", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve("lib/services/news/pool-snapshot.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify both candidate source types appear in the file
    // (they appear in the sourceTypes array used by the query)
    expect(content).toContain('"newsapi_ai"');
    expect(content).toContain('"newscatcher"');

    // Verify they appear in a sourceTypes-like array context
    const match = content.match(/sourceTypes\b[^;]*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const arrayBody = match![1];
    expect(arrayBody).toContain('"newsapi_ai"');
    expect(arrayBody).toContain('"newscatcher"');
  });
});
