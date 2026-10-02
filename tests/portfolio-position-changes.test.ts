import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit B4 (application side). Locking, exactly-once and oversell prevention are proven against
// Postgres with two concurrent sessions in supabase/tests/036_atomic_position_changes.test.sql.

const mocked = vi.hoisted(() => ({ rpc: vi.fn(), getQuotes: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: mocked.rpc,
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: { id: "portfolio-1" }, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/yahoo-finance", () => ({
  getQuotes: mocked.getQuotes,
  getQuote: vi.fn(),
  searchSymbol: vi.fn(),
}));

import { recordHoldingAdd, recordHoldingSale } from "@/lib/actions/portfolio";

const OP = "5f0c6a9e-1c2b-4d3e-8f4a-1b2c3d4e5f60";

describe("position changes (B4)", () => {
  beforeEach(() => {
    mocked.rpc.mockReset();
    mocked.getQuotes.mockReset().mockResolvedValue(new Map());
  });

  it("applies an addition through the atomic RPC with the caller's operation id", async () => {
    mocked.rpc.mockResolvedValue({ data: { status: "applied", quantityAfter: 15 }, error: null });

    const result = await recordHoldingAdd("portfolio-1", "holding-1", 5, 10, OP);

    expect(result).toEqual({ error: null, duplicate: false });
    expect(mocked.rpc).toHaveBeenCalledWith("apply_holding_transaction", {
      p_operation_id: OP,
      p_portfolio_id: "portfolio-1",
      p_holding_id: "holding-1",
      p_kind: "add",
      p_quantity: 5,
      p_price: 10,
    });
  });

  it("reports a retried submission as already applied without refreshing again", async () => {
    mocked.rpc.mockResolvedValue({ data: { status: "duplicate", quantityAfter: 15 }, error: null });

    const result = await recordHoldingSale("portfolio-1", "holding-1", 5, OP);

    expect(result).toEqual({ error: null, duplicate: true });
    expect(mocked.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversell with the database's reason and no false success", async () => {
    mocked.rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "invalid_transaction: you cannot sell more shares than you currently hold" },
    });

    const result = await recordHoldingSale("portfolio-1", "holding-1", 999, OP);

    expect(result.error).toBe("You cannot sell more shares than you currently hold.");
  });

  it("never exposes raw database errors", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "deadlock detected" } });

    const result = await recordHoldingAdd("portfolio-1", "holding-1", 1, 1, OP);

    expect(result.error).toMatch(/could not be saved/);
    expect(result.error).not.toMatch(/deadlock/);
  });

  it("validates input before calling the database and generates an id when none is given", async () => {
    expect((await recordHoldingSale("portfolio-1", "holding-1", 0)).error).toMatch(/positive number/);
    expect((await recordHoldingAdd("portfolio-1", "holding-1", 1, -1)).error).toMatch(/zero or positive/);
    expect(mocked.rpc).not.toHaveBeenCalled();

    mocked.rpc.mockResolvedValue({ data: { status: "applied" }, error: null });
    await recordHoldingSale("portfolio-1", "holding-1", 1);
    const call = mocked.rpc.mock.calls[0][1] as { p_operation_id: string };
    expect(call.p_operation_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
