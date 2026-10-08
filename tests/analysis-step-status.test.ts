import { describe, expect, it } from "vitest";

import { analysisStepStatus } from "@/components/app/analysis-run-trigger";

const STEPS = [0, 1, 2, 3, 4];

describe("analysisStepStatus", () => {
  it("marks every step complete once a run finishes, including the last step", () => {
    expect(STEPS.map((i) => analysisStepStatus("complete", i))).toEqual(
      Array(5).fill("complete"),
    );
  });

  it("treats a degraded run as finished too", () => {
    expect(STEPS.map((i) => analysisStepStatus("degraded", i))).toEqual(
      Array(5).fill("complete"),
    );
  });

  it("marks steps stopped, not upcoming, when a run failed", () => {
    expect(STEPS.map((i) => analysisStepStatus("failed", i))).toEqual(
      Array(5).fill("stopped"),
    );
  });

  it("shows earlier steps complete, the active step current and later steps upcoming", () => {
    expect(STEPS.map((i) => analysisStepStatus("mapping_news", i))).toEqual([
      "complete",
      "complete",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("shows every step upcoming before any run exists", () => {
    expect(STEPS.map((i) => analysisStepStatus(undefined, i))).toEqual(
      Array(5).fill("upcoming"),
    );
  });
});
