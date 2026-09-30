export type InvestmentThesisScope = "holding" | "watchlist";

export type InvestmentThesisHorizon = "watch" | "short" | "medium" | "long";

export type InvestmentThesisConviction = "low" | "medium" | "high";

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
