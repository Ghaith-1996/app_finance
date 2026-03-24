import { beforeEach, describe, expect, it, vi } from "vitest";

const searchSymbols = vi.fn();

vi.mock("@/lib/services/finnhub", () => ({
  FinnhubError: class FinnhubError extends Error {
    code: string;
    status?: number;

    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  searchSymbols,
}));

const insertPost = vi.fn();
const selectPostSingle = vi.fn();
const authGetUser = vi.fn();

const currentSupabase = {
  auth: {
    getUser: authGetUser,
  },
  from(table: string) {
    if (table === "community_posts") {
      return {
        insert: insertPost,
      };
    }
    if (table === "community_post_tickers") {
      return {
        insert: vi.fn(),
      };
    }
    if (table === "user_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

import { createPost } from "@/lib/actions/community";

describe("community post validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "user@example.com",
          user_metadata: {},
        },
      },
    });

    selectPostSingle.mockResolvedValue({
      data: {
        id: "post-1",
        user_id: "user-1",
        body: "Watching #AAPL",
        created_at: new Date().toISOString(),
      },
      error: null,
    });

    insertPost.mockReturnValue({
      select: () => ({
        single: selectPostSingle,
      }),
    });
  });

  it("rejects invalid stock hashtags before inserting the post", async () => {
    searchSymbols.mockResolvedValue([]);

    const result = await createPost("Watching #FAKE and #crypto");

    expect(result).toEqual({
      ok: false,
      error:
        "#FAKE is not a recognized stock symbol. Use a market hashtag like #crypto, or a valid stock tag like #AAPL.",
    });
    expect(insertPost).not.toHaveBeenCalled();
  });

  it("allows recognized stock hashtags to post successfully", async () => {
    searchSymbols.mockResolvedValue([
      {
        symbol: "AAPL",
        company: "Apple Inc.",
        exchange: "",
        type: "Common Stock",
        price: 100,
        dayChange: 1,
        currency: "USD",
      },
    ]);

    const result = await createPost("Watching #AAPL and #crypto");

    expect(result.ok).toBe(true);
    expect(insertPost).toHaveBeenCalledTimes(1);
  });
});
