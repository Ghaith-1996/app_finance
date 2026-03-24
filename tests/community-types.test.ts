import { describe, expect, it } from "vitest";

import {
  extractHashtags,
  extractTickerHashtags,
  extractTickers,
} from "@/lib/community/types";

describe("community tag parsing", () => {
  it("treats cashtags as direct ticker mentions", () => {
    expect(extractTickers("Watching $NVDA while #crypto heats up.")).toEqual(["NVDA"]);
  });

  it("extracts uppercase stock hashtags separately for validation", () => {
    expect(
      extractTickerHashtags("Watching $NVDA, #AAPL, and #MSFT while #crypto heats up."),
    ).toEqual(["AAPL", "MSFT"]);
  });

  it("extracts market hashtags without duplicating stock hashtags", () => {
    expect(
      extractHashtags("Watching $NVDA, #AAPL, #crypto, #Stocks, and #macro."),
    ).toEqual(["crypto", "stocks", "macro"]);
  });
});
