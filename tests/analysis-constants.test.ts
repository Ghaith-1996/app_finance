import { describe, it, expect } from "vitest";
import {
  ANALYSIS_NEWS_POOL_LIMIT,
  ANALYSIS_RELEVANCE_MIN,
} from "@/lib/services/analysis";

describe("analysis pool policy", () => {
  it("scores the newest 500 global articles from the implementation constants", () => {
    expect(ANALYSIS_NEWS_POOL_LIMIT).toBe(500);
    expect(ANALYSIS_RELEVANCE_MIN).toBe(60);
  });
});
