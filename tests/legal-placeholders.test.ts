import { describe, expect, it } from "vitest";

import * as legal from "@/lib/legal/constants";

// Audit F16: public legal pages must not ship template placeholders.
// Values still awaiting operator input are listed here explicitly; remove each one as it is filled in.
const AWAITING_OPERATOR_INPUT = new Set(["LEGAL_MAILING_ADDRESS", "LEGAL_GOVERNING_JURISDICTION"]);

describe("legal constants", () => {
  it("contain no template placeholders other than the known pending values", () => {
    const unexpected = Object.entries(legal)
      .filter(([, value]) => typeof value === "string" && /\[INSERT/i.test(value))
      .map(([name]) => name)
      .filter((name) => !AWAITING_OPERATOR_INPUT.has(name));

    expect(unexpected).toEqual([]);
  });

  it("still reports which values block launch", () => {
    const pending = Object.entries(legal)
      .filter(([, value]) => typeof value === "string" && /\[INSERT/i.test(value))
      .map(([name]) => name)
      .sort();

    expect(pending).toEqual([...AWAITING_OPERATOR_INPUT].sort());
  });
});
