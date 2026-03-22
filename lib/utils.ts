import { twMerge } from "tailwind-merge";

import type {
  ImpactLevel,
  MatchReasonCode,
  Sentiment,
  StockEffect,
} from "@/lib/types";

export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function sentimentTone(sentiment: Sentiment) {
  switch (sentiment) {
    case "positive":
      return "success";
    case "negative":
      return "danger";
    case "watch":
      return "warning";
    default:
      return "neutral";
  }
}

export function impactTone(impact: ImpactLevel) {
  switch (impact) {
    case "High":
      return "brand";
    case "Medium":
      return "warning";
    default:
      return "neutral";
  }
}

export function effectTone(effect: StockEffect): "success" | "danger" | "neutral" {
  if (effect === "bullish") return "success";
  if (effect === "bearish") return "danger";
  return "neutral";
}

export function effectLabel(effect: StockEffect): string {
  if (effect === "bullish") return "Bullish";
  if (effect === "bearish") return "Bearish";
  return "Neutral";
}

export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function matchReasonLabel(reason: MatchReasonCode): string {
  switch (reason) {
    case "held_ticker_tag":
      return "Held ticker";
    case "held_ticker_impact":
      return "Ticker impact";
    case "held_company_mention":
      return "Company mention";
    case "sector_exposure_explicit":
      return "Sector exposure";
    default:
      return reason;
  }
}
