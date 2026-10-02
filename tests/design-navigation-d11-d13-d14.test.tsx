import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D11: pricing, sign-in, legal and contact are reachable from the public footer.
// D13: the comments view shows the original post and a named way back.
// D14: each route has its own document title.

vi.mock("@/lib/actions/community", () => ({
  getPostComments: vi.fn().mockResolvedValue([]),
  createComment: vi.fn(),
}));
vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileBlock: () => null,
  useTurnstile: () => ({ canSubmit: true, token: null, reset: vi.fn() }),
}));

import { PostCommentsPanel } from "@/components/app/post-comments-panel";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("D11 public footer", () => {
  it.each(["/pricing", "/login", "/terms", "/privacy"])("links to %s", (href) => {
    expect(read("app/page.tsx")).toContain(`href="${href}"`);
  });

  it("offers a contact address", () => {
    expect(read("app/page.tsx")).toContain("mailto:${LEGAL_CONTACT_EMAIL}");
  });
});

describe("D13 comment context", () => {
  it("shows the original post and a visible Back to community button", () => {
    render(
      <PostCommentsPanel
        postId="post-1"
        source={{ authorName: "Sam", body: "Watching $NVDA into earnings." }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Original post by Sam")).toBeTruthy();
    expect(screen.getByText("Watching $NVDA into earnings.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to community" })).toBeTruthy();
  });
});

describe("D14 route titles", () => {
  it("the root layout applies a product-name template", () => {
    expect(read("app/layout.tsx")).toContain(`template: "%s - Pulsefolio"`);
  });

  it.each([
    ["app/(auth)/login/layout.tsx", "Sign in"],
    ["app/feed/page.tsx", "Feed"],
    ["app/portfolio/page.tsx", "Portfolio"],
    ["app/portfolio/full/page.tsx", "Full portfolio"],
    ["app/watchlist/page.tsx", "Watchlist"],
    ["app/settings/page.tsx", "Settings"],
    ["app/analysis/page.tsx", "Analysis"],
    ["app/pricing/page.tsx", "Pricing"],
    ["app/terms/page.tsx", "Terms of Service"],
  ])("%s is titled %s", (file, title) => {
    expect(read(file)).toMatch(new RegExp(`title: "${title}"`));
  });
});
