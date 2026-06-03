import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInvestmentThesisState = vi.fn();
const saveInvestmentThesis = vi.fn();
const deleteInvestmentThesis = vi.fn();

vi.mock("@/lib/actions/investment-thesis", () => ({
  getInvestmentThesisState: (...args: unknown[]) => getInvestmentThesisState(...args),
  saveInvestmentThesis: (...args: unknown[]) => saveInvestmentThesis(...args),
  deleteInvestmentThesis: (...args: unknown[]) => deleteInvestmentThesis(...args),
}));

import { InvestmentThesisPanel } from "@/components/app/investment-thesis-panel";

describe("InvestmentThesisPanel", () => {
  beforeEach(() => {
    getInvestmentThesisState.mockReset();
    saveInvestmentThesis.mockReset();
    deleteInvestmentThesis.mockReset();
  });

  it("loads an empty state and saves thesis fields", async () => {
    getInvestmentThesisState.mockResolvedValue({ ok: true, thesis: null });
    saveInvestmentThesis.mockResolvedValue({
      ok: true,
      thesis: {
        id: "thesis-1",
        symbol: "AAPL",
        portfolioId: "portfolio-1",
        scope: "holding",
        thesis: "Services growth can support margins.",
        risks: ["margin pressure"],
        invalidationNotes: "Revisit if services slows.",
        horizon: "long",
        conviction: "high",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    render(
      <InvestmentThesisPanel
        symbol="AAPL"
        portfolioId="portfolio-1"
        scope="holding"
      />,
    );

    expect(await screen.findByText("Draft")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Thesis$/i), {
      target: { value: "Services growth can support margins." },
    });
    fireEvent.change(screen.getByLabelText(/^Risks$/i), {
      target: { value: "margin pressure" },
    });
    fireEvent.change(screen.getByLabelText(/^Review trigger$/i), {
      target: { value: "Revisit if services slows." },
    });
    fireEvent.change(screen.getByLabelText(/^Horizon$/i), {
      target: { value: "long" },
    });
    fireEvent.change(screen.getByLabelText(/^Conviction$/i), {
      target: { value: "high" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save thesis/i }));

    await waitFor(() => {
      expect(saveInvestmentThesis).toHaveBeenCalledWith({
        symbol: "AAPL",
        portfolioId: "portfolio-1",
        scope: "holding",
        thesis: "Services growth can support margins.",
        risks: "margin pressure",
        invalidationNotes: "Revisit if services slows.",
        horizon: "long",
        conviction: "high",
      });
    });
    expect(await screen.findByText("Thesis saved.")).toBeInTheDocument();
  });

  it("clears an existing thesis", async () => {
    getInvestmentThesisState.mockResolvedValue({
      ok: true,
      thesis: {
        id: "thesis-1",
        symbol: "MSFT",
        portfolioId: null,
        scope: "watchlist",
        thesis: "Cloud durability.",
        risks: ["cloud slowdown"],
        invalidationNotes: "",
        horizon: "medium",
        conviction: "medium",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    deleteInvestmentThesis.mockResolvedValue({ ok: true, thesis: null });

    render(<InvestmentThesisPanel symbol="MSFT" scope="watchlist" compact />);

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(deleteInvestmentThesis).toHaveBeenCalledWith({
        symbol: "MSFT",
        portfolioId: null,
        scope: "watchlist",
      });
    });
    expect(await screen.findByText("Thesis cleared.")).toBeInTheDocument();
  });
});
