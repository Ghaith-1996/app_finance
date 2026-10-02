import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";

// Audit H12: SECURITY.md names a real reporting channel instead of GitHub's template text.

describe("SECURITY.md", () => {
  const policy = readFileSync(join(process.cwd(), "SECURITY.md"), "utf8");

  it("names the same contact as the legal pages", () => {
    expect(policy).toContain(LEGAL_CONTACT_EMAIL);
  });

  it("contains no template placeholders", () => {
    expect(policy).not.toMatch(/Use this section|5\.1\.x|Tell them where to go/);
  });
});
