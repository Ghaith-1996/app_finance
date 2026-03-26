import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Env setup — must come before any import of the widget module
// ---------------------------------------------------------------------------
const SITE_KEY = "1x00000000000000000000AA";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", SITE_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Import the hook (widget component needs DOM so we only test the hook here)
// ---------------------------------------------------------------------------
import {
  useTurnstile,
  type TurnstileStatus,
} from "@/components/security/turnstile-widget";

// ---------------------------------------------------------------------------
// useTurnstile state machine tests
// ---------------------------------------------------------------------------
describe("useTurnstile state machine", () => {
  it("starts in loading state with no token", () => {
    const { result } = renderHook(() => useTurnstile());
    expect(result.current.status).toBe("loading");
    expect(result.current.token).toBeNull();
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.statusMessage).toBe("Loading verification\u2026");
  });

  it("transitions to verified on success callback", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onSuccess("test-token-abc");
    });
    expect(result.current.status).toBe("verified");
    expect(result.current.token).toBe("test-token-abc");
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.statusMessage).toBeNull();
  });

  it("transitions to ready on widget ready callback", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onReady!();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.statusMessage).toBe(
      "Completing verification\u2026",
    );
  });

  it("onReady does not regress from verified back to ready", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onSuccess("tok");
    });
    expect(result.current.status).toBe("verified");
    act(() => {
      result.current.widgetProps.onReady!();
    });
    expect(result.current.status).toBe("verified");
  });

  it("transitions to error on error callback", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onError!("widget_error");
    });
    expect(result.current.status).toBe("error");
    expect(result.current.token).toBeNull();
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.statusMessage).toBe("Verification failed.");
  });

  it("auto-retries on expiry — clears token and sets ready", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onSuccess("tok");
    });
    expect(result.current.status).toBe("verified");
    act(() => {
      result.current.widgetProps.onExpire!();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.token).toBeNull();
    expect(result.current.canSubmit).toBe(false);
  });

  it("reset() clears token and sets ready", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onSuccess("tok");
    });
    expect(result.current.canSubmit).toBe(true);
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.token).toBeNull();
    expect(result.current.canSubmit).toBe(false);
  });

  it("can re-verify after reset", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onSuccess("tok-1");
    });
    act(() => {
      result.current.reset();
    });
    act(() => {
      result.current.widgetProps.onSuccess("tok-2");
    });
    expect(result.current.status).toBe("verified");
    expect(result.current.token).toBe("tok-2");
    expect(result.current.canSubmit).toBe(true);
  });

  it("can recover from error via reset + new success", () => {
    const { result } = renderHook(() => useTurnstile());
    act(() => {
      result.current.widgetProps.onError!("e");
    });
    expect(result.current.status).toBe("error");
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("ready");
    act(() => {
      result.current.widgetProps.onSuccess("tok");
    });
    expect(result.current.status).toBe("verified");
    expect(result.current.canSubmit).toBe(true);
  });
});

describe("useTurnstile unavailable state", () => {
  it("starts in unavailable when site key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const { result } = renderHook(() => useTurnstile());
    expect(result.current.status).toBe("unavailable");
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.statusMessage).toBe(
      "Bot protection unavailable.",
    );
  });
});

describe("useTurnstile statusMessage mapping", () => {
  const expectedMessages: Array<{
    status: TurnstileStatus;
    message: string | null;
  }> = [
    { status: "loading", message: "Loading verification\u2026" },
    { status: "ready", message: "Completing verification\u2026" },
    { status: "verified", message: null },
    { status: "error", message: "Verification failed." },
    { status: "unavailable", message: "Bot protection unavailable." },
  ];

  for (const { status, message } of expectedMessages) {
    it(`status=${status} → ${message ?? "null"}`, () => {
      const { result } = renderHook(() => useTurnstile());
      // Drive the hook to the target status via the appropriate callback
      act(() => {
        switch (status) {
          case "ready":
            result.current.widgetProps.onReady!();
            break;
          case "verified":
            result.current.widgetProps.onSuccess("t");
            break;
          case "error":
            result.current.widgetProps.onError!("e");
            break;
          case "loading":
            // initial state
            break;
          case "unavailable":
            // handled by env var — skip here
            break;
        }
      });
      if (status !== "unavailable") {
        expect(result.current.statusMessage).toBe(message);
      }
    });
  }
});
