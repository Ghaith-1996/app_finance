/**
 * Runtime validation for holdings submitted to saveHoldings (audit B1). Mirrors the checks in
 * the save_portfolio_holdings RPC so users get a specific message before any write; the RPC
 * remains the authoritative boundary.
 */

export const MAX_HOLDINGS_PER_SAVE = 1000;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.\-^=:/]*$/;
const MAX_NUMERIC = 1e12;

export type ValidatedHolding = {
  symbol: string;
  company: string;
  quantity: number;
  averageCost: number;
  sector: string;
  market: string;
  thesis: string | null;
  importSource: "csv" | "manual";
};

export type HoldingsValidationResult =
  | { ok: true; holdings: ValidatedHolding[] }
  | { ok: false; error: string };

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed;
}

export function validateHoldingsPayload(raw: unknown): HoldingsValidationResult {
  if (!Array.isArray(raw)) return { ok: false, error: "Holdings must be a list." };
  if (raw.length === 0) return { ok: false, error: "Add at least one holding before saving." };
  if (raw.length > MAX_HOLDINGS_PER_SAVE) {
    return { ok: false, error: `You can save at most ${MAX_HOLDINGS_PER_SAVE} holdings at once.` };
  }

  const seen = new Set<string>();
  const holdings: ValidatedHolding[] = [];

  for (const [index, item] of raw.entries()) {
    const row = `Row ${index + 1}`;
    if (!item || typeof item !== "object") return { ok: false, error: `${row} is not a valid holding.` };
    const record = item as Record<string, unknown>;

    const symbol = typeof record.symbol === "string" ? record.symbol.trim().toUpperCase() : "";
    if (!symbol || symbol.length > 32 || !SYMBOL_PATTERN.test(symbol)) {
      return { ok: false, error: `${row} has an invalid ticker symbol.` };
    }
    if (seen.has(symbol)) {
      return { ok: false, error: `${symbol} appears more than once. Combine duplicate rows before saving.` };
    }
    seen.add(symbol);

    const quantity = record.quantity;
    const averageCost = record.averageCost;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity >= MAX_NUMERIC) {
      return { ok: false, error: `${symbol}: quantity must be a number greater than zero.` };
    }
    if (
      typeof averageCost !== "number" ||
      !Number.isFinite(averageCost) ||
      averageCost < 0 ||
      averageCost >= MAX_NUMERIC
    ) {
      return { ok: false, error: `${symbol}: average cost must be zero or a positive number.` };
    }

    const importSource = record.importSource === undefined ? "manual" : record.importSource;
    if (importSource !== "csv" && importSource !== "manual") {
      return { ok: false, error: `${symbol}: unknown import source.` };
    }

    const company = text(record.company, 200);
    const sector = text(record.sector, 100);
    const market = text(record.market, 100);
    const thesis = text(record.thesis, 4000);
    if (company === null || sector === null || market === null || thesis === null) {
      return { ok: false, error: `${symbol}: a text field is too long or not text.` };
    }

    holdings.push({
      symbol,
      company,
      quantity,
      averageCost,
      sector,
      market,
      thesis: thesis || null,
      importSource,
    });
  }

  return { ok: true, holdings };
}
