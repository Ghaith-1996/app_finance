import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: authGetUser,
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc,
  }),
}));

import { POST } from "@/app/api/feed/open/route";

describe("POST /api/feed/open", () => {
  beforeEach(() => {
    authGetUser.mockReset();
    rpc.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    authGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Unauthorized" },
    });

    const res = await POST(
      new Request("http://localhost/api/feed/open", {
        method: "POST",
        body: JSON.stringify({ newsItemId: "news-1" }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("requires a newsItemId", async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const res = await POST(
      new Request("http://localhost/api/feed/open", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "newsItemId is required",
    });
  });

  it("increments the detail open count through the RPC", async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValue({
      data: 7,
      error: null,
    });

    const res = await POST(
      new Request("http://localhost/api/feed/open", {
        method: "POST",
        body: JSON.stringify({ newsItemId: "news-1" }),
      }),
    );

    expect(rpc).toHaveBeenCalledWith("increment_news_item_detail_open_count", {
      target_news_item_id: "news-1",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      detailOpenCount: 7,
    });
  });
});
