import { twMerge } from "tailwind-merge";

import type { ImpactLevel, Sentiment } from "@/lib/types";

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
