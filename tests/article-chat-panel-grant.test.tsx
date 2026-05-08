import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Controllable Turnstile mock: the helpers below can flip verification state
// so tests can assert widget disappearance, no-reset on provider errors, and
// reset on scope change / turnstile_failed.
// ---------------------------------------------------------------------------

type TurnstileState = {
  status: "idle" | "verified" | "error" | "expired";
  token: string | null;
  canSubmit: boolean;
  statusMessage: string | null;
};

const turnstileState: TurnstileState = {
  status: "verified",
  token: "tok-123",
  canSubmit: true,
  statusMessage: null,
};

// IMPORTANT: the reset spy does NOT mutate the visible Turnstile state on
// purpose — the panel mounts with a scope-change effect that calls
// `turnstile.reset()` once. We want the widget to still look "verified" to
// the panel so the Send button stays enabled and we can drive the tests.
// The spy's job is only to COUNT calls.
const resetSpy = vi.fn(() => {
  /* intentionally no-op */
});

function setTurnstileVerified(token: string | null = "tok-123") {
  turnstileState.status = token ? "verified" : "idle";
  turnstileState.token = token;
  turnstileState.canSubmit = !!token;
  turnstileState.statusMessage = null;
}

vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileWidget: () => (
    <div data-testid="turnstile-widget" aria-label="turnstile-widget" />
  ),
  TurnstileBlock: () => (
    <div data-testid="turnstile-block" aria-label="turnstile-block" />
  ),
  useTurnstile: () => ({
    status: turnstileState.status,
    token: turnstileState.token,
    canSubmit: turnstileState.canSubmit,
    statusMessage: turnstileState.statusMessage,
    reset: resetSpy,
    widgetRef: { current: null },
    widgetProps: {
      onSuccess: vi.fn(),
      onExpire: vi.fn(),
      onError: vi.fn(),
      onReady: vi.fn(),
    },
  }),
}));

import { ArticleChatPanel } from "@/components/app/article-chat-panel";

function renderPanel(overrides: Partial<ComponentProps<typeof ArticleChatPanel>> = {}) {
  const props: ComponentProps<typeof ArticleChatPanel> = {
    portfolioId: "p1",
    newsItemId: "n1",
    headline: "Test headline",
    selectedTier: "free",
    onSelectedTierChange: vi.fn(),
    ...overrides,
  };

  return render(<ArticleChatPanel {...props} />);
}

function threadResponse(overrides?: { turnstileVerified?: boolean; messages?: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }> }) {
  return new Response(
    JSON.stringify({
      threadId: "t1",
      messages: overrides?.messages ?? [],
      turnstileVerified: overrides?.turnstileVerified ?? false,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("ArticleChatPanel (Turnstile grant behavior)", () => {
  beforeEach(() => {
    resetSpy.mockClear();
    setTurnstileVerified("tok-123");
  });

  it("hides the Turnstile widget when the server already reports the chat as verified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(threadResponse({ turnstileVerified: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    await screen.findByLabelText(/ask a follow-up/i);

    expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();
  });

  it("shows the Turnstile widget until the first successful POST, then hides it and does not reset", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              threadId: "t1",
              messages: [
                { id: "u1", role: "user", content: "why?", createdAt: new Date().toISOString() },
                { id: "a1", role: "assistant", content: "Because...", createdAt: new Date().toISOString() },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/api/article-chat")) {
        return Promise.resolve(threadResponse({ turnstileVerified: false }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    // Widget is visible on first render because server did not yet grant.
    expect(await screen.findByTestId("turnstile-block")).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "why?" } });

    const resetCallsBefore = resetSpy.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    // After a successful send, the widget must disappear and stay hidden.
    await waitFor(() => {
      expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();
    });

    // The first successful send should NOT reset the widget (only scope change
    // or a `turnstile_failed` error should). Subtract the mount-time scope
    // reset from the count before the send.
    expect(resetSpy.mock.calls.length).toBe(resetCallsBefore);
  });

  it("does NOT reset Turnstile when the server returns a non-Turnstile error (e.g. 503)", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "Article chat is temporarily unavailable.",
              code: "provider_unavailable",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(threadResponse({ turnstileVerified: false }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "why?" } });

    const resetCallsBefore = resetSpy.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    await screen.findByText(/temporarily unavailable/i);

    // Widget must still be visible (not verified yet).
    expect(screen.getByTestId("turnstile-block")).toBeInTheDocument();
    // And Turnstile MUST NOT have been reset — that would force the user to
    // re-validate on every provider hiccup.
    expect(resetSpy.mock.calls.length).toBe(resetCallsBefore);
  });

  it("resets Turnstile and re-shows the widget when the POST returns turnstile_failed", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "Turnstile verification failed.",
              code: "turnstile_failed",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(threadResponse({ turnstileVerified: false }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "why?" } });

    const resetCallsBefore = resetSpy.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    await screen.findByText(/turnstile verification failed/i);

    // Widget must still be visible AND reset must have been invoked exactly
    // once as a consequence of the turnstile_failed response.
    expect(screen.getByTestId("turnstile-block")).toBeInTheDocument();
    expect(resetSpy.mock.calls.length).toBe(resetCallsBefore + 1);
  });

  it("re-shows the widget when switching to a different article even if the previous one was verified", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("newsItemId=n2")) {
        return Promise.resolve(threadResponse({ turnstileVerified: false }));
      }
      return Promise.resolve(threadResponse({ turnstileVerified: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderPanel();

    await screen.findByLabelText(/ask a follow-up/i);
    // First story is server-verified, widget hidden.
    expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();

    rerender(
      <ArticleChatPanel
        portfolioId="p1"
        newsItemId="n2"
        headline="Another story"
        selectedTier="free"
        onSelectedTierChange={vi.fn()}
      />,
    );

    // New scope => widget should re-appear because the server reports it as
    // not yet verified, and the scope-change effect has reset local state.
    expect(await screen.findByTestId("turnstile-block")).toBeInTheDocument();
  });

  it("skips the Turnstile widget in general-chat mode when hydrated as verified from the parent page", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({
      newsItemId: undefined,
      headline: undefined,
      contextMode: "general",
      initialTurnstileVerified: true,
    });

    // Widget stays hidden and no GET /api/article-chat is fired in general
    // mode without a newsItemId.
    expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the Turnstile widget in general-chat mode when not yet verified", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({
      newsItemId: undefined,
      headline: undefined,
      contextMode: "general",
      initialTurnstileVerified: false,
    });

    expect(await screen.findByTestId("turnstile-block")).toBeInTheDocument();
  });
});
