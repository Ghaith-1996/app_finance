import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const savedState = vi.hoisted(() => {
  let value = false;
  return {
    get value() {
      return value;
    },
    set value(next: boolean) {
      value = next;
    },
    setSavedArticleState: vi.fn(async (_newsItemId: string, saved: boolean) => {
      value = saved;
      return { ok: true, saved };
    }),
  };
});

vi.mock("@/lib/actions/saved-articles", () => ({
  getSavedArticleState: vi.fn(async () => savedState.value),
  setSavedArticleState: savedState.setSavedArticleState,
}));

import { SaveArticleButton } from "@/components/app/save-article-button";

describe("SaveArticleButton", () => {
  it("loads saved state and toggles the reading list", async () => {
    savedState.value = false;
    render(<SaveArticleButton newsItemId="news-1" />);

    await screen.findByRole("button", { name: /Save article/i });
    fireEvent.click(screen.getByRole("button", { name: /Save article/i }));

    await waitFor(() => {
      expect(savedState.setSavedArticleState).toHaveBeenCalledWith("news-1", true);
    });
    expect(screen.getByRole("button", { name: /Saved/i })).toBeInTheDocument();
  });
});
