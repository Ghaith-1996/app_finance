import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// D04 (measured): unlayered element rules beat every Tailwind utility regardless of specificity.
// An unlayered `a { color: inherit }` turned primary link-buttons light-on-green (≈2.1:1) in the
// dark theme, and `* { border-color }` erased border utilities such as error borders.

/** Selectors of rules declared at the top level of the stylesheet (outside any @layer/@media). */
function topLevelSelectors(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const char of stripped) {
    if (char === "{") {
      if (depth === 0) selectors.push(buffer.trim());
      depth += 1;
      buffer = "";
    } else if (char === "}") {
      depth -= 1;
      buffer = "";
    } else if (char === ";" && depth === 0) {
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return selectors;
}

describe("globals.css cascade layers", () => {
  const selectors = topLevelSelectors(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"));

  it("keeps element defaults that utilities must override inside @layer base", () => {
    const offenders = selectors.filter((selector) =>
      selector.split(",").some((part) => /^(\*|a|img|video|canvas|button|input|select|textarea)$/.test(part.trim())),
    );
    expect(offenders).toEqual([]);
  });

  it("the parser sees the layered block", () => {
    expect(selectors).toContain("@layer base");
  });
});
