import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadMarketStoryCount24h,
  loadMatchedStoryCount24hForRun,
} from "@/lib/server/page-loaders";

function createCountBuilder(count: number) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(async () => ({ count, error: null })),
  };

  return builder;
}

describe("feed page coverage counts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T16:00:00.000Z"));
  });

  it("counts market stories from news_items in the rolling last 24 hours", async () => {
    const builder = createCountBuilder(330);
    const supabase = {
      from: vi.fn(() => builder),
    };

    const count = await loadMarketStoryCount24h(supabase as never);

    expect(count).toBe(330);
    expect(supabase.from).toHaveBeenCalledWith("news_items");
    expect(builder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(builder.gte).toHaveBeenCalledWith(
      "published_at",
      "2026-03-30T16:00:00.000Z",
    );
  });

  it("counts matched stories only from the latest run and same 24-hour window", async () => {
    const builder = createCountBuilder(30);
    const supabase = {
      from: vi.fn(() => builder),
    };

    const count = await loadMatchedStoryCount24hForRun(
      supabase as never,
      "portfolio-1",
      "run-1",
    );

    expect(count).toBe(30);
    expect(supabase.from).toHaveBeenCalledWith("feed_items");
    expect(builder.select).toHaveBeenCalledWith(
      "id, news_items!inner(published_at)",
      { count: "exact", head: true },
    );
    expect(builder.eq).toHaveBeenNthCalledWith(1, "portfolio_id", "portfolio-1");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "analysis_run_id", "run-1");
    expect(builder.gte).toHaveBeenCalledWith(
      "news_items.published_at",
      "2026-03-30T16:00:00.000Z",
    );
  });

  it("returns zero matched stories when there is no completed run", async () => {
    const supabase = {
      from: vi.fn(),
    };

    const count = await loadMatchedStoryCount24hForRun(
      supabase as never,
      "portfolio-1",
      null,
    );

    expect(count).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
