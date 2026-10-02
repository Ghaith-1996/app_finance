import { describe, expect, it } from "vitest";

import { detectColumnMapping, normalizeRowsWithReport, parseCSV } from "@/lib/services/csv-parser";

// Audit B6: dated position snapshots import; non-empty files never silently become zero holdings.

function importCsv(text: string) {
  const { headers, rows } = parseCSV(text);
  const detected = detectColumnMapping(headers);
  return { detected, result: normalizeRowsWithReport(rows, detected.mapping, detected.isTransactionFile) };
}

describe("CSV import (B6)", () => {
  it("imports a dated positions file (the audit reproduction) instead of returning nothing", () => {
    const { detected, result } = importCsv("Symbol,Date,Quantity,Avg Cost\nAAA,2026-09-30,10,20");

    expect(detected.isTransactionFile).toBe(false);
    expect(result.error).toBeNull();
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({ symbol: "AAA", quantity: 10, averageCost: 20 });
  });

  it("still treats files with a buy/sell side as transaction history", () => {
    const { detected, result } = importCsv(
      "Date,Symbol,Action,Quantity,Purchase Price\n2026-01-02,AAA,Buy,10,20\n2026-02-02,AAA,Buy,10,30\n2026-03-02,AAA,Sell,5,40",
    );

    expect(detected.isTransactionFile).toBe(true);
    expect(result.error).toBeNull();
    expect(result.drafts[0]).toMatchObject({ symbol: "AAA", quantity: 15, averageCost: 25 });
  });

  it("reports why a non-empty transaction file produced no holdings", () => {
    const { result } = importCsv("Date,Symbol,Action,Quantity,Price\n2026-01-02,AAA,Dividend,10,20\n2026-01-03,BBB,Split,2,0");

    expect(result.drafts).toEqual([]);
    expect(result.error).toMatch(/2 row\(s\) without a recognizable buy\/sell side/);
    expect(result.skippedRows.map((row) => row.rowNumber)).toEqual([2, 3]);
  });

  it("reports rows without a symbol and still imports the valid ones", () => {
    const { result } = importCsv("Symbol,Quantity,Avg Cost\n,5,10\nBBB,3,7\n\n");

    expect(result.drafts.map((draft) => draft.symbol)).toEqual(["BBB"]);
    expect(result.skippedRows).toEqual([{ rowNumber: 2, reason: "row(s) without a symbol" }]);
    expect(result.error).toBeNull();
  });

  it("errors when every position row is unusable", () => {
    const { result } = importCsv("Symbol,Quantity,Avg Cost\n,5,10\n,3,7");
    expect(result.drafts).toEqual([]);
    expect(result.error).toMatch(/No holdings could be read from 2 row/);
  });

  it("an empty file is not an error from normalization (handled earlier as empty CSV)", () => {
    const { result } = importCsv("Symbol,Quantity,Avg Cost\n");
    expect(result).toEqual({ drafts: [], skippedRows: [], error: null });
  });
});
