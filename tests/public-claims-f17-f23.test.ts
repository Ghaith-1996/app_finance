import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  holdings,
  portfolioInsights,
  productFeatures,
  siteStats,
  useCases,
  workflowSteps,
} from "@/lib/mock-data";

// Audit F17: public copy must not claim live broker linking, which is not shipped.
// Audit F23: demo allocation claims must follow from the sample allocations shown beside them.

const OVERCLAIM = /link a broker|broker connection|connect (your|a) broker|custody|custodian|your own Supabase project|reads your\s+file locally/i;

const allocation = (symbol: string) => holdings.find((holding) => holding.symbol === symbol)?.allocation ?? NaN;

describe("F23 demo allocation math", () => {
  it("sample allocations add up to 100%", () => {
    expect(holdings.reduce((sum, holding) => sum + holding.allocation, 0)).toBe(100);
  });

  it("the exposure insight equals NVDA + MSFT weight", () => {
    const theme = portfolioInsights.find((insight) => insight.title === "Most exposed theme");
    expect(theme?.detail).toContain(`${allocation("NVDA") + allocation("MSFT")}%`);
  });

  it("the story-chat answer quotes MSFT's actual sample weight", () => {
    const bubbles = useCases.flatMap((useCase) => useCase.preview.chatBubbles ?? []);
    const answer = bubbles.find((bubble) => bubble.text.includes("in MSFT"));
    expect(answer?.text).toContain(`${allocation("MSFT")}% of your portfolio`);
  });
});

describe("F17 public integration claims", () => {
  it("sample holdings come from CSV import or manual entry", () => {
    for (const holding of holdings) expect(["csv", "manual"]).toContain(holding.importSource);
  });

  it("marketing data does not promise live broker linking", () => {
    const text = JSON.stringify({ productFeatures, siteStats, workflowSteps });
    expect(text).not.toMatch(OVERCLAIM);
    expect(text).not.toMatch(/Wealthsimple|Interactive Brokers/);
  });

  it.each([
    "components/marketing/hero.tsx",
    "app/page.tsx",
    "components/app/onboarding-page-client.tsx",
    "app/portfolio/full/page.tsx",
  ])("%s does not overstate integrations or custody", (file) => {
    expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(OVERCLAIM);
  });
});
