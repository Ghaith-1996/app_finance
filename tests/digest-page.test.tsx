import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUser = vi.fn();
const digestMaybeSingle = vi.fn();
const loadShellChromeStateMock = vi.fn();

vi.mock("@/components/app/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/server/page-loaders", () => ({
  loadShellChromeState: () => loadShellChromeStateMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: authGetUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: digestMaybeSingle,
          }),
        }),
      }),
    }),
  }),
}));

import DigestPage from "@/app/digest/[digestId]/page";

describe("DigestPage", () => {
  beforeEach(() => {
    authGetUser.mockReset();
    digestMaybeSingle.mockReset();
    loadShellChromeStateMock.mockReset();

    authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    loadShellChromeStateMock.mockResolvedValue({
      showOnboardingNav: false,
      showAdminLink: false,
    });
    digestMaybeSingle.mockResolvedValue({
      data: {
        id: "digest-1",
        user_id: "user-1",
        digest_date: "2026-01-15",
        time_zone: "America/New_York",
        window_start: "2026-01-14T22:00:00.000Z",
        window_end: "2026-01-15T14:00:00.000Z",
        source_mode: "portfolio",
        portfolio_id: "portfolio-1",
        portfolio_name: "Main",
        summary_line: "Bullish leaders: AAPL. Bearish leaders: TSLA.",
        bullish_symbols: ["AAPL"],
        bearish_symbols: ["TSLA"],
        top_stories: [
          {
            newsItemId: "news-1",
            headline: "Apple overnight move",
            source: "Wire",
            url: "https://example.com/story",
            publishedAt: "2026-01-15T13:30:00.000Z",
            category: "technology",
            relevanceScore: 91,
            aiSummary: "Summary",
            whyItMatters: "Why it matters",
            matchedSymbols: ["AAPL"],
            symbolEffects: { AAPL: "bullish" },
            matchSources: ["portfolio"],
            displayEffect: "bullish",
          },
        ],
        created_at: "2026-01-15T14:00:00.000Z",
      },
    });
  });

  it("renders the stored digest snapshot and story links", async () => {
    render(
      await DigestPage({
        params: Promise.resolve({ digestId: "digest-1" }),
        searchParams: Promise.resolve({ story: "news-1" }),
      }),
    );

    expect(screen.getByText("Bullish leaders: AAPL. Bearish leaders: TSLA.")).toBeInTheDocument();
    expect(screen.getByText("Apple overnight move")).toBeInTheDocument();
    expect(screen.getByText(/Matched: AAPL/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source article" })).toHaveAttribute(
      "href",
      "https://example.com/story",
    );
  });

  it("does not render a source link when the stored story URL is unsafe", async () => {
    digestMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "digest-1",
        user_id: "user-1",
        digest_date: "2026-01-15",
        time_zone: "America/New_York",
        window_start: "2026-01-14T22:00:00.000Z",
        window_end: "2026-01-15T14:00:00.000Z",
        source_mode: "portfolio",
        portfolio_id: "portfolio-1",
        portfolio_name: "Main",
        summary_line: "Bullish leaders: AAPL. Bearish leaders: TSLA.",
        bullish_symbols: ["AAPL"],
        bearish_symbols: ["TSLA"],
        top_stories: [
          {
            newsItemId: "news-1",
            headline: "Apple overnight move",
            source: "Wire",
            url: "javascript:alert(1)",
            publishedAt: "2026-01-15T13:30:00.000Z",
            category: "technology",
            relevanceScore: 91,
            aiSummary: "Summary",
            whyItMatters: "Why it matters",
            matchedSymbols: ["AAPL"],
            symbolEffects: { AAPL: "bullish" },
            matchSources: ["portfolio"],
            displayEffect: "bullish",
          },
        ],
        created_at: "2026-01-15T14:00:00.000Z",
      },
    });

    render(
      await DigestPage({
        params: Promise.resolve({ digestId: "digest-1" }),
        searchParams: Promise.resolve({ story: "news-1" }),
      }),
    );

    expect(screen.queryByRole("link", { name: "Open source article" })).not.toBeInTheDocument();
  });
});
