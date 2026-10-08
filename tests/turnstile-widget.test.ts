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
import { useTurnstile } from "@/components/security/turnstile-widget";

// ---------------------------------------------------------------------------
// useTurnstile state machine tests
// ---------------------------------------------------------------------------
describe("useTurnstile state machine", () => {
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
