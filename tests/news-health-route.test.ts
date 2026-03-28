import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
const ORIGINAL_ADMIN_USER_IDS = process.env.ADMIN_USER_IDS;

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => spawnMock(...args),
  };
});

const supabaseMock = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock,
}));

import { GET } from "@/app/api/news/health/route";

function createSpawnProcess(stdoutPayload: string) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const proc = {
    stdout: {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        const handlers = listeners.get(`stdout:${event}`) ?? [];
        handlers.push(handler);
        listeners.set(`stdout:${event}`, handlers);
      },
    },
    stderr: {
      on: vi.fn(),
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const handlers = listeners.get(event) ?? [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
  };

  queueMicrotask(() => {
    for (const handler of listeners.get("stdout:data") ?? []) {
      handler(Buffer.from(stdoutPayload));
    }
    for (const handler of listeners.get("close") ?? []) {
      handler(0);
    }
  });

  return proc;
}

describe("GET /api/news/health", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = "user-1";
    supabaseMock.auth.getUser.mockReset();
    spawnMock.mockReset();
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
      error: null,
    });
  });

  afterAll(() => {
    process.env.ADMIN_USER_IDS = ORIGINAL_ADMIN_USER_IDS;
  });

  it("returns 401 when unauthenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await GET(new Request("http://localhost/api/news/health"));

    expect(res.status).toBe(401);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin callers", async () => {
    process.env.ADMIN_USER_IDS = "different-user";

    const res = await GET(new Request("http://localhost/api/news/health"));

    expect(res.status).toBe(403);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns preflight data for allowlisted admins", async () => {
    spawnMock.mockImplementation(() =>
      createSpawnProcess(JSON.stringify({
        ok: true,
        checks: [{ name: "service-role", ok: true }],
      }))
    );

    const res = await GET(new Request("http://localhost/api/news/health"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks[0]).toEqual({ name: "python", ok: true });
    expect(body.checks.length).toBeGreaterThan(1);
  });
});
