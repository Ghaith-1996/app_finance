import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Controllable Turnstile mock — tracks reset calls without actually flipping
// state so tests can keep the Send button enabled across interactions.
// ---------------------------------------------------------------------------

type TurnstileState = {
  status: "idle" | "verified" | "error" | "expired";
  token: string | null;
  canSubmit: boolean;
  statusMessage: string | null;
};

const turnstileState: TurnstileState = {
  status: "verified",
  token: "tok-xyz",
  canSubmit: true,
  statusMessage: null,
};

const resetSpy = vi.fn(() => {
  /* intentionally no-op — spy counts calls only */
});

function setTurnstileVerified(token: string | null = "tok-xyz") {
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

import { PortfolioCopilotPanel } from "@/components/app/portfolio-copilot-panel";

function renderPanel(
  overrides: Partial<ComponentProps<typeof PortfolioCopilotPanel>> = {},
) {
  const props: ComponentProps<typeof PortfolioCopilotPanel> = {
    portfolioId: "p1",
    ...overrides,
  };
  return render(<PortfolioCopilotPanel {...props} />);
}

describe("PortfolioCopilotPanel (Turnstile grant behavior)", () => {
  beforeEach(() => {
    resetSpy.mockClear();
    setTurnstileVerified("tok-xyz");
  });

  it("hides the Turnstile widget when hydrated as verified from the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ initialTurnstileVerified: true });

    expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();
  });

  it("shows the Turnstile widget when no grant is hydrated, then hides it after the first successful POST without resetting", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ answer: "Your biggest risk is X." }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      throw new Error("unexpected fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ initialTurnstileVerified: false });

    // Widget visible pre-send.
    expect(screen.getByTestId("turnstile-block")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/ask anything about your portfolio/i);
    fireEvent.change(input, { target: { value: "What is my biggest risk?" } });

    const resetCallsBefore = resetSpy.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask copilot/i }));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();
    });
    // First successful send must NOT reset — only scope changes / turnstile_failed do.
    expect(resetSpy.mock.calls.length).toBe(resetCallsBefore);
    // Outbound request carried a turnstileToken (because we were not yet verified).
    const postCall = fetchMock.mock.calls.find((call) => {
      const opts = call[1] as RequestInit | undefined;
      return opts?.method === "POST";
    });
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string) as { turnstileToken?: string };
    expect(body.turnstileToken).toBe("tok-xyz");
  });

  it("does NOT reset Turnstile on a non-Turnstile server error (e.g. 503)", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "Portfolio copilot is temporarily unavailable.",
              code: "provider_unavailable",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      throw new Error("unexpected fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ initialTurnstileVerified: false });

    const input = screen.getByPlaceholderText(/ask anything about your portfolio/i);
    fireEvent.change(input, { target: { value: "Help" } });

    const resetCallsBefore = resetSpy.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask copilot/i }));
    });

    await screen.findByText(/temporarily unavailable/i);

    // Widget must still be shown and reset must NOT have been called for a
    // provider hiccup.
    expect(screen.getByTestId("turnstile-block")).toBeInTheDocument();
    expect(resetSpy.mock.calls.length).toBe(resetCallsBefore);
  });

  it("resets Turnstile and keeps the widget visible when the server returns turnstile_failed", async () => {
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
      throw new Error("unexpected fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ initialTurnstileVerified: false });

    const input = screen.getByPlaceholderText(/ask anything about your portfolio/i);
    fireEvent.change(input, { target: { value: "Trigger bad challenge" } });

    const resetCallsBefore = resetSpy.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask copilot/i }));
    });

    await screen.findByText(/turnstile verification failed/i);

    expect(screen.getByTestId("turnstile-block")).toBeInTheDocument();
    expect(resetSpy.mock.calls.length).toBe(resetCallsBefore + 1);
  });

  it("re-arms the widget when the portfolioId changes, even if the previous scope was verified", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderPanel({
      portfolioId: "p1",
      initialTurnstileVerified: true,
    });

    // Already verified -> widget hidden.
    expect(screen.queryByTestId("turnstile-block")).not.toBeInTheDocument();

    rerender(
      <PortfolioCopilotPanel
        portfolioId="p2"
        initialTurnstileVerified={false}
      />,
    );

    // New scope is not verified server-side -> widget re-appears.
    expect(screen.getByTestId("turnstile-block")).toBeInTheDocument();
  });
});
