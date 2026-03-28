import { describe, expect, it } from "vitest";

/**
 * Verify that `newsapi_ai` and `newscatcher` are registered in key
 * source-config arrays and in the EXTRACTABLE_SOURCE_TYPES constant
 * in publisher-extract.ts. These are simple import-and-assert tests
 * that act as a regression guard for the Phase 1 candidate pipeline.
 */

describe("source-config candidate registrations", () => {
  it("CANDIDATE_INGEST_SOURCE_KEYS includes all four candidate sources", async () => {
    const { CANDIDATE_INGEST_SOURCE_KEYS } = await import(
      "@/lib/services/news/source-config"
    );
    expect(CANDIDATE_INGEST_SOURCE_KEYS).toContain("edgar");
    expect(CANDIDATE_INGEST_SOURCE_KEYS).toContain("newsapi_ai");
    expect(CANDIDATE_INGEST_SOURCE_KEYS).toContain("gnews");
    expect(CANDIDATE_INGEST_SOURCE_KEYS).toContain("newscatcher");
  });

  it("CANDIDATE_INGEST_SOURCE_LABELS has display names for all candidate sources", async () => {
    const { CANDIDATE_INGEST_SOURCE_LABELS } = await import(
      "@/lib/services/news/source-config"
    );
    expect(CANDIDATE_INGEST_SOURCE_LABELS.edgar).toBe("EDGAR");
    expect(CANDIDATE_INGEST_SOURCE_LABELS.newsapi_ai).toBe("NewsAPI.ai");
    expect(CANDIDATE_INGEST_SOURCE_LABELS.gnews).toBe("GNews");
    expect(CANDIDATE_INGEST_SOURCE_LABELS.newscatcher).toBe("NewsCatcher");
  });

  it("ENRICHABLE_SOURCE_TYPES includes newsapi_ai and newscatcher", async () => {
    const { ENRICHABLE_SOURCE_TYPES } = await import(
      "@/lib/services/news/source-config"
    );
    const types = [...ENRICHABLE_SOURCE_TYPES] as string[];
    expect(types).toContain("newsapi_ai");
    expect(types).toContain("newscatcher");
    // Also retains the existing sources
    expect(types).toContain("edgar");
    expect(types).toContain("newsapi");
    expect(types).toContain("gnews");
    expect(types).toContain("finnhub");
  });

  it("MARKET_HEADLINE_SOURCE_TYPES includes newsapi_ai and newscatcher", async () => {
    const { MARKET_HEADLINE_SOURCE_TYPES } = await import(
      "@/lib/services/news/source-config"
    );
    const types = [...MARKET_HEADLINE_SOURCE_TYPES] as string[];
    expect(types).toContain("newsapi_ai");
    expect(types).toContain("newscatcher");
  });

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

describe("root NewsSourceType alignment", () => {
  it("lib/types.ts NewsSourceType union includes newsapi_ai and newscatcher", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve("lib/types.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract the NewsSourceType union definition
    const match = content.match(
      /export\s+type\s+NewsSourceType\s*=\s*([\s\S]*?);/
    );
    expect(match).not.toBeNull();
    const unionBody = match![1];

    // Must include the two candidate sources
    expect(unionBody).toContain('"newsapi_ai"');
    expect(unionBody).toContain('"newscatcher"');

    // Also retains the original sources
    for (const src of ["edgar", "finnhub", "newsapi", "gnews", "seed", "other"]) {
      expect(unionBody).toContain(`"${src}"`);
    }
  });

  it("lib/services/news/types.ts NewsSourceType stays in sync with root", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const rootContent = fs.readFileSync(path.resolve("lib/types.ts"), "utf-8");
    const newsContent = fs.readFileSync(
      path.resolve("lib/services/news/types.ts"),
      "utf-8"
    );

    // Extract union members from both files
    const extractMembers = (src: string) => {
      const match = src.match(
        /export\s+type\s+NewsSourceType\s*=\s*([\s\S]*?);/
      );
      if (!match) return new Set<string>();
      const members = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      return new Set(members);
    };

    const rootMembers = extractMembers(rootContent);
    const newsMembers = extractMembers(newsContent);

    // The news-service type may be a subset or superset — but the two
    // candidate sources must appear in BOTH files.
    for (const src of ["newsapi_ai", "newscatcher"]) {
      expect(rootMembers.has(src)).toBe(true);
      expect(newsMembers.has(src)).toBe(true);
    }
  });
});
