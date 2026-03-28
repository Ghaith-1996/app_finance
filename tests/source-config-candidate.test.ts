import { describe, expect, it } from "vitest";
import {
  CANDIDATE_INGEST_SOURCE_KEYS,
  CANDIDATE_INGEST_SOURCE_LABELS,
  ENRICHABLE_SOURCE_TYPES,
  MARKET_HEADLINE_SOURCE_TYPES,
} from "@/lib/services/news/source-config";

describe("Candidate source config exports", () => {
  it("exposes exactly four candidate ingest keys", () => {
    expect(CANDIDATE_INGEST_SOURCE_KEYS).toEqual([
      "edgar",
      "newsapi_ai",
      "gnews",
      "newscatcher",
    ]);
  });

  it("provides labels for every candidate key", () => {
    for (const key of CANDIDATE_INGEST_SOURCE_KEYS) {
      expect(CANDIDATE_INGEST_SOURCE_LABELS[key]).toEqual(expect.any(String));
      expect(CANDIDATE_INGEST_SOURCE_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it("lists newsapi_ai and newscatcher as enrichable sources", () => {
    expect(ENRICHABLE_SOURCE_TYPES).toContain("newsapi_ai");
    expect(ENRICHABLE_SOURCE_TYPES).toContain("newscatcher");
  });

  it("lists newsapi_ai and newscatcher as market headline sources", () => {
    expect(MARKET_HEADLINE_SOURCE_TYPES).toContain("newsapi_ai");
    expect(MARKET_HEADLINE_SOURCE_TYPES).toContain("newscatcher");
  });

  it("still includes original enrichable sources", () => {
    expect(ENRICHABLE_SOURCE_TYPES).toContain("edgar");
    expect(ENRICHABLE_SOURCE_TYPES).toContain("newsapi");
    expect(ENRICHABLE_SOURCE_TYPES).toContain("gnews");
    expect(ENRICHABLE_SOURCE_TYPES).toContain("finnhub");
  });
});
