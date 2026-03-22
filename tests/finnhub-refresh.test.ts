import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestFinnhubPortfolioNews } from "@/lib/services/news/finnhub-refresh";

function createSupabaseMock(existingRows?: Array<Record<string, unknown>>) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  return {
    inserts,
    updates,
    from(table: string) {
      if (table !== "news_items") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: () => ({
          gte: () => ({
            limit: async () => ({
              data: existingRows ?? [],
              error: null,
            }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              inserts.push(payload);
              return {
                data: { id: `inserted-${inserts.length}` },
                error: null,
              };
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ id, payload });
            return { error: null };
          },
        }),
      };
    },
  };
}

describe("ingestFinnhubPortfolioNews", () => {
  const originalKey = process.env.FINNHUB_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.FINNHUB_API_KEY = "test-key";
  });

  it("inserts new Finnhub articles as raw news_items with source_type=finnhub", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 101,
          headline: "Amazon expands AI device push",
          datetime: 1760000000,
          source: "Finnhub",
          summary: "Amazon is revisiting a hardware push.",
          url: "https://example.com/amazon-ai",
          related: "AMZN,NVDA",
          category: "company news",
        },
      ]),
    }) as never;

    const supabase = createSupabaseMock();
    const result = await ingestFinnhubPortfolioNews(
      supabase as never,
      [{ symbol: "AMZN", company: "Amazon.com, Inc." }],
      24,
      20,
    );

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(supabase.inserts[0].source_type).toBe("finnhub");
    expect(supabase.inserts[0].stock_tags).toEqual(["AMZN", "NVDA"]);
  });

  it("merges duplicate Finnhub articles into existing pool rows instead of inserting duplicates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 202,
          headline: "Amazon expands AI device push",
          datetime: 1760000000,
          source: "Finnhub",
          summary: "Amazon is revisiting a hardware push.",
          url: "https://example.com/amazon-ai",
          related: "AMZN",
          category: "company news",
        },
      ]),
    }) as never;

    const supabase = createSupabaseMock([
      {
        id: "existing-1",
        headline: "Amazon expands AI device push",
        url: "https://example.com/amazon-ai",
        stock_tags: [],
        raw_content: null,
        category_hint: "other",
        metadata: {},
      },
    ]);

    const result = await ingestFinnhubPortfolioNews(
      supabase as never,
      [{ symbol: "AMZN", company: "Amazon.com, Inc." }],
      24,
      20,
    );

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates).toHaveLength(1);
    expect(supabase.updates[0].payload.stock_tags).toEqual(["AMZN"]);
  });

  it("skips cleanly when FINNHUB_API_KEY is missing", async () => {
    delete process.env.FINNHUB_API_KEY;

    const supabase = createSupabaseMock();
    const result = await ingestFinnhubPortfolioNews(
      supabase as never,
      [{ symbol: "AMZN", company: "Amazon.com, Inc." }],
      24,
      20,
    );

    expect(result.inserted).toBe(0);
    expect(result.fetch_outcome).toBe("skipped");
    expect(result.fetch_warnings).toContain("FINNHUB_API_KEY not configured");
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.FINNHUB_API_KEY;
    } else {
      process.env.FINNHUB_API_KEY = originalKey;
    }
  });
});
