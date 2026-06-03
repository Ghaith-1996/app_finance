export const INVESTMENT_THESIS_SCOPES = ["holding", "watchlist"] as const;
export type InvestmentThesisScope = (typeof INVESTMENT_THESIS_SCOPES)[number];

export const INVESTMENT_THESIS_HORIZONS = ["watch", "short", "medium", "long"] as const;
export type InvestmentThesisHorizon = (typeof INVESTMENT_THESIS_HORIZONS)[number];

export const INVESTMENT_THESIS_CONVICTIONS = ["low", "medium", "high"] as const;
export type InvestmentThesisConviction = (typeof INVESTMENT_THESIS_CONVICTIONS)[number];

export type InvestmentThesis = {
  id: string;
  symbol: string;
  portfolioId: string | null;
  scope: InvestmentThesisScope;
  thesis: string;
  risks: string[];
  invalidationNotes: string;
  horizon: InvestmentThesisHorizon;
  conviction: InvestmentThesisConviction;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentThesisHistoryItem = {
  id: string;
  thesisId: string;
  symbol: string;
  portfolioId: string | null;
  scope: InvestmentThesisScope;
  thesis: string;
  risks: string[];
  invalidationNotes: string;
  horizon: InvestmentThesisHorizon;
  conviction: InvestmentThesisConviction;
  changeType: "created" | "updated" | "deleted";
  capturedAt: string;
};

export type InvestmentThesisMatch = {
  symbol: string;
  label: string;
  detail: string;
  tone: "neutral" | "watch" | "risk";
};

export type InvestmentThesisRow = {
  id: string;
  symbol: string;
  portfolio_id: string | null;
  scope: string;
  thesis: string | null;
  risks: string[] | null;
  invalidation_notes: string | null;
  horizon: string | null;
  conviction: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentThesisHistoryRow = {
  id: string;
  thesis_id: string;
  symbol: string;
  portfolio_id: string | null;
  scope: string;
  thesis: string | null;
  risks: string[] | null;
  invalidation_notes: string | null;
  horizon: string | null;
  conviction: string | null;
  change_type: string | null;
  captured_at: string;
};
