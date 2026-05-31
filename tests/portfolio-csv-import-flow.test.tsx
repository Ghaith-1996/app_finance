import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  previewCSVImport: vi.fn(),
  previewCSVWithMapping: vi.fn(),
  saveHoldings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/lib/actions/portfolio", () => ({
  previewCSVImport: mocks.previewCSVImport,
  previewCSVWithMapping: mocks.previewCSVWithMapping,
  saveHoldings: mocks.saveHoldings,
}));

vi.mock("@/components/app/csv-dropzone", () => ({
  CSVDropzone: ({ onFileContent }: { onFileContent: (content: string, fileName: string) => void }) => (
    <button type="button" onClick={() => onFileContent("symbol,quantity,avgCost\nAAPL,1,100", "holdings.csv")}>
      Mock upload
    </button>
  ),
}));

vi.mock("@/components/app/column-mapper", () => ({
  ColumnMapper: () => <div>Column mapper</div>,
}));

vi.mock("@/components/app/holdings-review-table", () => ({
  HoldingsReviewTable: ({ drafts }: { drafts: Array<{ symbol: string }> }) => (
    <div>{drafts.map((draft) => draft.symbol).join(",")}</div>
  ),
}));

import { PortfolioCsvImportFlow } from "@/components/app/portfolio-csv-import-flow";

describe("PortfolioCsvImportFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.previewCSVImport.mockResolvedValue({
      drafts: [
        {
          tempId: "1",
          symbol: "AAPL",
          company: "Apple Inc.",
          quantity: 1,
          averageCost: 100,
          sector: "Technology",
          market: "NASDAQ",
          exchange: "NASDAQ",
          currency: "USD",
          thesis: "",
          importSource: "csv",
          status: "confirmed",
          issues: [],
          candidates: [],
        },
      ],
      needsMapping: false,
      headers: ["symbol", "quantity", "avgCost"],
      suggestedMapping: {},
      error: null,
    });

    mocks.previewCSVWithMapping.mockResolvedValue({
      drafts: [],
      error: null,
    });

    mocks.saveHoldings.mockResolvedValue({
      error: null,
      portfolioId: "p1",
    });
  });

  it("opens the importer and exposes merge/replace options for existing portfolios", async () => {
    render(
      <PortfolioCsvImportFlow
        portfolioId="p1"
        saveBehavior="refresh"
        title="Bulk import holdings"
        description="Import test"
        showEntryButton
        entryLabel="Import CSV"
        defaultOpen={false}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /import csv/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mock upload/i }));
    });

    expect(await screen.findByText(/replace all/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /merge/i })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /merge/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save holdings/i }));
    });

    expect(mocks.saveHoldings).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioId: "p1",
        mode: "merge",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
