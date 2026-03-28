import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CommunityPostCard } from "@/components/app/community-post-card";

describe("CommunityPostCard", () => {
  it("falls back to initials when the avatar URL is unsafe", () => {
    render(
      <CommunityPostCard
        post={{
          id: "post-1",
          body: "Watching $AAPL",
          tickers: ["AAPL"],
          createdAt: new Date().toISOString(),
          commentCount: 0,
          author: {
            userId: "user-1",
            displayName: "Ada Lovelace",
            handle: "ada",
            avatarUrl: "javascript:alert(1)",
          },
        }}
        onOpenComments={vi.fn()}
      />,
    );

    expect(screen.getByText("AL")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});
