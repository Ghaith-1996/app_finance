import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ArticleChatPanel } from "@/components/app/article-chat-panel";

function makeMessage(overrides: Partial<{ id: string; role: "user" | "assistant"; content: string }> = {}) {
  return {
    id: "m-1",
    role: "assistant" as const,
    content: "Initial assistant reply",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
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

    render(
      <ArticleChatPanel
        portfolioId="p1"
        newsItemId="n1"
        headline="Test headline"
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

    render(
      <ArticleChatPanel
        portfolioId="p1"
        newsItemId="n1"
        headline="Test headline"
        onActivityChange={onActivityChange}
      />,
    );

    await screen.findByText(/initial assistant reply/i);

    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: true,
        hasDraft: false,
      });
    });
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

    render(
      <ArticleChatPanel
        portfolioId="p1"
        newsItemId="n1"
        headline="Test headline"
        onActivityChange={onActivityChange}
      />,
    );

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await waitFor(() => {
      expect(onActivityChange).toHaveBeenLastCalledWith({
        hasMessages: false,
        hasDraft: true,
      });
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

    const { rerender } = render(
      <ArticleChatPanel
        portfolioId="p1"
        newsItemId="n1"
        headline="Story one"
        onActivityChange={onActivityChange}
      />,
    );

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

    render(
      <ArticleChatPanel portfolioId="p1" newsItemId="n1" headline="Test headline" />,
    );

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
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

    render(
      <ArticleChatPanel portfolioId="p1" newsItemId="n1" headline="Test headline" />,
    );

    const input = await screen.findByPlaceholderText(/ask how this article/i);
    fireEvent.change(input, { target: { value: "Second question" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });

    await screen.findByText(/temporarily unavailable/i);
    expect(screen.getByRole("button", { name: /send/i })).not.toBeDisabled();
  });
});
