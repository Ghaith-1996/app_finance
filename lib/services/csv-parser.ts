import type { HoldingDraft, HoldingIssue } from "@/lib/types";

const SYMBOL_ALIASES = ["symbol", "ticker", "stock", "instrument", "sym"];
const COMPANY_ALIASES = ["company", "name", "description", "security", "security name"];
const QUANTITY_ALIASES = ["quantity", "shares", "qty", "units", "amount", "position"];
const AVG_COST_ALIASES = [
  "avg cost", "average cost", "avg price", "average price",
  "book cost", "cost per share", "purchase price", "unit cost",
  "price paid", "avg. cost",
];
const COST_BASIS_ALIASES = ["cost basis", "book value", "total cost", "market value at cost"];
const SIDE_ALIASES = ["side", "type", "action", "transaction type", "activity", "trade type"];
const DATE_ALIASES = ["date", "trade date", "settlement date", "transaction date"];
const SECTOR_ALIASES = ["sector", "industry", "asset class", "category"];
const MARKET_ALIASES = ["market", "exchange", "listing"];

type FieldKey =
  | "symbol" | "company" | "quantity" | "avgCost"
  | "costBasis" | "side" | "date" | "sector" | "market";

const ALIAS_MAP: Record<FieldKey, string[]> = {
  symbol: SYMBOL_ALIASES,
  company: COMPANY_ALIASES,
  quantity: QUANTITY_ALIASES,
  avgCost: AVG_COST_ALIASES,
  costBasis: COST_BASIS_ALIASES,
  side: SIDE_ALIASES,
  date: DATE_ALIASES,
  sector: SECTOR_ALIASES,
  market: MARKET_ALIASES,
};

export interface ColumnMapping {
  mapping: Partial<Record<FieldKey, number>>;
  unmapped: string[];
  isTransactionFile: boolean;
  needsManualMapping: boolean;
  headers: string[];
}

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas && semicolons > 0) return ";";
  return ",";
}

function splitCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(text);
  const headers = splitCSVLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => splitCSVLine(line, delimiter));

  return { headers, rows };
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const mapping: Partial<Record<FieldKey, number>> = {};
  const matched = new Set<number>();

  for (const [field, aliases] of Object.entries(ALIAS_MAP) as [FieldKey, string[]][]) {
    for (let i = 0; i < normalized.length; i++) {
      if (matched.has(i)) continue;
      if (aliases.some((alias) => normalized[i] === alias || normalized[i].includes(alias))) {
        mapping[field] = i;
        matched.add(i);
        break;
      }
    }
  }

  const unmapped = headers.filter((_, i) => !matched.has(i));
  const isTransactionFile = mapping.side != null || mapping.date != null;
  const hasSymbol = mapping.symbol != null;
  const hasQuantity = mapping.quantity != null;
  const needsManualMapping = !hasSymbol || (!hasQuantity && !isTransactionFile);

  return { mapping, unmapped, isTransactionFile, needsManualMapping, headers };
}

function parseNumber(val: string): number {
  const cleaned = val.replace(/[$€£,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function normalizeRows(
  rows: string[][],
  mapping: Partial<Record<FieldKey, number>>,
  isTransactionFile: boolean,
): HoldingDraft[] {
  if (isTransactionFile) {
    return aggregateTransactions(rows, mapping);
  }

  return rows
    .filter((row) => {
      const sym = mapping.symbol != null ? row[mapping.symbol]?.trim() : "";
      return sym && sym.length > 0;
    })
    .map((row, i) => {
      const symbol = (mapping.symbol != null ? row[mapping.symbol] : "").trim().toUpperCase();
      const company = (mapping.company != null ? row[mapping.company] : "").trim();
      const quantity = mapping.quantity != null ? parseNumber(row[mapping.quantity] ?? "0") : 0;
      const sector = (mapping.sector != null ? row[mapping.sector] : "").trim();
      const market = (mapping.market != null ? row[mapping.market] : "").trim();

      let avgCost = mapping.avgCost != null ? parseNumber(row[mapping.avgCost] ?? "0") : 0;
      if (avgCost === 0 && mapping.costBasis != null && quantity > 0) {
        avgCost = parseNumber(row[mapping.costBasis] ?? "0") / quantity;
      }

      const issues: HoldingIssue[] = [];
      if (quantity <= 0) issues.push({ field: "quantity", message: "Missing or zero quantity" });
      if (avgCost <= 0) issues.push({ field: "averageCost", message: "Missing or zero average cost" });

      return {
        tempId: `csv-${i}-${symbol}`,
        symbol,
        company,
        quantity,
        averageCost: Math.round(avgCost * 10000) / 10000,
        sector,
        market,
        exchange: "",
        currency: "USD",
        thesis: "",
        importSource: "csv" as const,
        status: issues.length > 0 ? ("unresolved" as const) : ("confirmed" as const),
        issues,
        candidates: [],
      };
    });
}

interface Transaction {
  symbol: string;
  company: string;
  quantity: number;
  price: number;
  side: "buy" | "sell" | "unknown";
  date: string;
  sector: string;
  market: string;
}

function aggregateTransactions(
  rows: string[][],
  mapping: Partial<Record<FieldKey, number>>,
): HoldingDraft[] {
  const transactions: Transaction[] = [];

  for (const row of rows) {
    const symbol = (mapping.symbol != null ? row[mapping.symbol] : "").trim().toUpperCase();
    if (!symbol) continue;

    const company = (mapping.company != null ? row[mapping.company] : "").trim();
    const quantity = mapping.quantity != null ? parseNumber(row[mapping.quantity] ?? "0") : 0;
    const price = mapping.avgCost != null ? parseNumber(row[mapping.avgCost] ?? "0") : 0;
    const sideRaw = (mapping.side != null ? row[mapping.side] : "").trim().toLowerCase();
    const date = (mapping.date != null ? row[mapping.date] : "").trim();
    const sector = (mapping.sector != null ? row[mapping.sector] : "").trim();
    const market = (mapping.market != null ? row[mapping.market] : "").trim();

    let side: "buy" | "sell" | "unknown" = "unknown";
    if (sideRaw.includes("buy") || sideRaw.includes("purchase")) side = "buy";
    else if (sideRaw.includes("sell") || sideRaw.includes("sale")) side = "sell";

    if (side === "unknown") {
      continue;
    }

    transactions.push({ symbol, company, quantity: Math.abs(quantity), price, side, date, sector, market });
  }

  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const positions = new Map<string, {
    company: string; shares: number; totalCost: number;
    sector: string; market: string;
    warnings: HoldingIssue[];
  }>();

  for (const txn of transactions) {
    const pos = positions.get(txn.symbol) ?? {
      company: txn.company, shares: 0, totalCost: 0,
      sector: txn.sector, market: txn.market, warnings: [],
    };

    if (txn.side === "buy") {
      pos.totalCost += txn.quantity * txn.price;
      pos.shares += txn.quantity;
    } else {
      if (txn.quantity > pos.shares) {
        pos.warnings.push({ field: "quantity", message: "Sell exceeds position; clamped to available shares" });
        const ratio = pos.shares > 0 ? (pos.shares - pos.shares) / pos.shares : 0;
        pos.totalCost *= ratio;
        pos.shares = 0;
      } else {
        const avgBefore = pos.shares > 0 ? pos.totalCost / pos.shares : 0;
        pos.shares -= txn.quantity;
        pos.totalCost = pos.shares * avgBefore;
      }
    }

    if (!pos.company && txn.company) pos.company = txn.company;
    positions.set(txn.symbol, pos);
  }

  const drafts: HoldingDraft[] = [];
  let idx = 0;

  for (const [symbol, pos] of positions) {
    if (pos.shares <= 0) continue;
    const avgCost = pos.shares > 0 ? pos.totalCost / pos.shares : 0;
    const issues: HoldingIssue[] = [...pos.warnings];
    if (avgCost <= 0) issues.push({ field: "averageCost", message: "Could not determine average cost from transactions" });

    drafts.push({
      tempId: `txn-${idx++}-${symbol}`,
      symbol,
      company: pos.company,
      quantity: Math.round(pos.shares * 1000000) / 1000000,
      averageCost: Math.round(avgCost * 10000) / 10000,
      sector: pos.sector,
      market: pos.market,
      exchange: "",
      currency: "USD",
      thesis: "",
      importSource: "csv",
      status: issues.length > 0 ? "unresolved" : "confirmed",
      issues,
      candidates: [],
    });
  }

  return drafts;
}
