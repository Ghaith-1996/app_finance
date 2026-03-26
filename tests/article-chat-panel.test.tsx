import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArticleChatPanel } from "@/components/app/article-chat-panel";
import type { ArticleChatModelTier } from "@/lib/types";

function makeMessage(overrides: Partial<{ id: string; role: "user" | "assistant"; content: string }> = {}) {
  return {
    id: "m-1",
    role: "assistant" as const,
    content: "Initial assistant reply",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

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

function ControlledPanel({ initialTier = "free" }: { initialTier?: ArticleChatModelTier }) {
  const [selectedTier, setSelectedTier] = useState<ArticleChatModelTier>(initialTier);

  return (
    <ArticleChatPanel
      portfolioId="p1"
      newsItemId="n1"
      headline="Test headline"
      selectedTier={selectedTier}
      onSelectedTierChange={setSelectedTier}
    />
  );
}

describe("ArticleChatPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports inactive activity when the thread and draft are empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onActivityChange = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ onActivityChange });

    await screen.findByLabelText(/ask a follow-up/i);

    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: false,
        hasDraft: false,
      });
    });
  });

  it("reports active activity after messages load", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          threadId: "t1",
          messages: [makeMessage()],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const onActivityChange = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ onActivityChange });

    await screen.findByText(/initial assistant reply/i);

    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: true,
        hasDraft: false,
      });
    });
  });

  it("renders Free, Premium, and Ultimate controls with Free selected by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    await screen.findByLabelText(/ask a follow-up/i);

    expect(screen.getByRole("button", { name: /^free$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^premium$/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^ultimate$/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports draft activity when the user types without sending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onActivityChange = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({ onActivityChange });

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: false,
        hasDraft: true,
      });
    });
  });

  it("supports the generic no-article mode without loading a story thread", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              threadId: null,
              messages: [
                makeMessage({ id: "user-1", role: "user", content: "How should I think about my portfolio today?" }),
                makeMessage({ id: "assistant-1", content: "Start with your biggest positions and market risk." }),
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      throw new Error(`Unexpected fetch: ${resolvedUrl}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel({
      newsItemId: undefined,
      headline: undefined,
      contextMode: "general",
    });

    expect(screen.getAllByText(/no article selected/i).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/ask about the market or your portfolio/i), {
      target: { value: "How should I think about my portfolio today?" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.not.stringContaining('"newsItemId"'),
      }),
    );
    expect(await screen.findByText(/biggest positions and market risk/i)).toBeInTheDocument();
  });

  it("sends the selected premium tier in the next POST body", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              threadId: "t1",
              messages: [
                makeMessage({ id: "user-1", role: "user", content: "Why does this matter?" }),
                makeMessage({ id: "assistant-1", content: "Premium answer" }),
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPanel />);

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^premium$/i }));
    });

    expect(screen.getByRole("button", { name: /^premium$/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"modelTier":"premium"'),
      }),
    );
  });

  it("sends the selected ultimate tier in the next POST body", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              threadId: "t1",
              messages: [
                makeMessage({ id: "user-1", role: "user", content: "Why does this matter?" }),
                makeMessage({ id: "assistant-1", content: "Ultimate answer" }),
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPanel />);

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^ultimate$/i }));
    });

    expect(screen.getByRole("button", { name: /^ultimate$/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"modelTier":"ultimate"'),
      }),
    );
  });

  it("uses the selected tier for starter-question sends", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ threadId: "t1", messages: [makeMessage({ content: "Starter reply" })] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPanel initialTier="premium" />);

    await screen.findByText(/start a conversation about this story/i);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /what follow-up should i watch next\?/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"modelTier":"premium"'),
      }),
    );
  });

  it("disables and re-enables the selector while a message is sending", async () => {
    const postResolver: { current?: (value: Response) => void } = {};
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          postResolver.current = resolve;
        });
      }

      return Promise.resolve(
        new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPanel initialTier="premium" />);

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    const freeButton = screen.getByRole("button", { name: /^free$/i });
    const premiumButton = screen.getByRole("button", { name: /^premium$/i });
    const ultimateButton = screen.getByRole("button", { name: /^ultimate$/i });

    fireEvent.change(input, { target: { value: "Hold on while this sends" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    await waitFor(() => {
      expect(freeButton).toBeDisabled();
      expect(premiumButton).toBeDisabled();
      expect(ultimateButton).toBeDisabled();
    });

    if (postResolver.current) {
      postResolver.current(
        new Response(JSON.stringify({ threadId: "t1", messages: [makeMessage({ content: "Done" })] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    await waitFor(() => {
      expect(freeButton).not.toBeDisabled();
      expect(premiumButton).not.toBeDisabled();
      expect(ultimateButton).not.toBeDisabled();
    });
  });

  it("resets activity when the active story changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threadId: "t1",
            messages: [makeMessage({ content: "Story one reply" })],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ threadId: "t2", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const onActivityChange = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderPanel({ onActivityChange });

    await screen.findByText(/story one reply/i);
    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: true,
        hasDraft: false,
      });
    });

    rerender(
      <ArticleChatPanel
        portfolioId="p1"
        newsItemId="n2"
        headline="Story two"
        selectedTier="free"
        onSelectedTierChange={vi.fn()}
        onActivityChange={onActivityChange}
      />,
    );

    await screen.findByLabelText(/ask a follow-up/i);
    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: false,
        hasDraft: false,
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=n2"),
    );
  });

  it("shows provider error when POST returns 503", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "Article chat is temporarily unavailable. Please try again later.",
              code: "provider_unavailable",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("clears sending state after a failed request", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      if (resolvedUrl.includes("/api/article-chat") && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Article chat is temporarily unavailable." }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ threadId: "t1", messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "Second question" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    await screen.findByText(/temporarily unavailable/i);
    expect(screen.getByRole("button", { name: /^send$/i })).not.toBeDisabled();
  });
});
