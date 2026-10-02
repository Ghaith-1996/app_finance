import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Audit F22: labelled inputs, linked field errors, focus on the first invalid field.

const addPortfolioPosition = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/portfolio", () => ({ addPortfolioPosition }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AddPositionForm } from "@/components/app/add-position-form";

describe("AddPositionForm accessibility", () => {
  it("binds labels, links errors to invalid fields and focuses the first one", async () => {
    render(<AddPositionForm portfolioId="p1" />);
    const toggle = screen.getByRole("button", { name: /add position/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const symbol = screen.getByLabelText("Symbol");
    const quantity = screen.getByLabelText("Quantity");
    const cost = screen.getByLabelText("Avg cost / share");

    fireEvent.change(symbol, { target: { value: "AAPL" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add to portfolio/i }));
    });

    expect(symbol).not.toHaveAttribute("aria-invalid");
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(cost).toHaveAttribute("aria-invalid", "true");
    expect(quantity).toHaveAccessibleDescription("Quantity must be greater than zero.");
    expect(cost).toHaveAccessibleDescription("Average cost must be zero or positive.");
    expect(document.activeElement).toBe(quantity);
    expect(addPortfolioPosition).not.toHaveBeenCalled();
  });

  it("announces a server error", async () => {
    addPortfolioPosition.mockResolvedValue({ error: "Could not resolve that symbol." });
    render(<AddPositionForm portfolioId="p1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add position/i }));
    });
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "ZZZZ" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Avg cost / share"), { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add to portfolio/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not resolve that symbol.");
  });
});
