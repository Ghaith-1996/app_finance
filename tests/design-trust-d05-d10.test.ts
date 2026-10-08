import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { testimonials } from "@/lib/mock-data";

// Audit D05: no meter whose width is a hash of text (or a guess parsed from a label) is shown as
// if it measured something. Audit D10: no fabricated customer endorsement; no build-note copy.

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("D05 meters reflect data", () => {
  it("feed momentum has no text-hash meter", () => {
    const source = read("components/app/feed-view.tsx");
    expect(source).not.toMatch(/charCodeAt/);
    expect(source).not.toMatch(/themeMeterPercent|themePct/);
  });

  it("analysis pulse has no bar derived from parsing the relative-time label", () => {
    expect(read("app/feed/page.tsx")).not.toMatch(/analysisPulseFill|pulsePct/);
  });
});

describe("D10 public copy", () => {
  it("scenarios carry no invented customer names", () => {
    for (const testimonial of testimonials) {
      expect(Object.keys(testimonial).sort()).toEqual(["quote", "role"]);
    }
    const page = read("app/page.tsx");
    expect(page).toContain("Illustrative scenario");
    expect(page).not.toContain("Product sentiment");
  });

  it.each(["app/page.tsx", "components/marketing/how-it-works.tsx"])("%s has no build-note phrasing", (file) => {
    expect(read(file)).not.toMatch(/This first pass|Next phase ready|Trust story|should feel/);
  });
});
