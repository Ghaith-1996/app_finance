import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ArticleChatPanel } from "@/components/app/article-chat-panel";

describe("ArticleChatPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows provider error when POST returns 503", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/api/article-chat") && init?.method === "POST") {
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

    await act(async () => {
      await Promise.resolve();
    });

    const input = await screen.findByPlaceholderText(/Ask how this article/i);
    fireEvent.change(input, { target: { value: "Why does this matter?" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("clears sending state after failed request", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/api/article-chat") && init?.method === "POST") {
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

    await act(async () => {
      await Promise.resolve();
    });

    const input = await screen.findByPlaceholderText(/Ask how this article/i);
    fireEvent.change(input, { target: { value: "Second question" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });

    await screen.findByText(/temporarily unavailable/i);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).not.toBeDisabled();
  });
});
