import type { INewsProvider, RawNewsItem } from "./types";

const seedStories: RawNewsItem[] = [
  {
    headline:
      "U.S. cloud spending accelerates as enterprise AI budgets expand into 2026",
    source: "Reuters",
    url: "https://example.com/cloud-ai-2026",
    publishedAt: new Date(Date.now() - 22 * 60 * 1000),
    angle: "Demand signal",
    rawContent:
      "Enterprise cloud and AI infrastructure spending continues to accelerate into 2026, with major hyperscalers expanding capacity.",
  },
  {
    headline:
      "Oil holds gains after supply curbs, keeping inflation pressure in focus",
    source: "Yahoo Finance",
    url: "https://example.com/oil-inflation",
    publishedAt: new Date(Date.now() - 41 * 60 * 1000),
    angle: "Macro cross-current",
    rawContent:
      "Oil prices hold gains following supply curbs; inflation expectations remain in focus for central banks.",
  },
  {
    headline: "New obesity treatment data sharpens focus on pharma winners",
    source: "New York Times",
    url: "https://example.com/obesity-pharma",
    publishedAt: new Date(Date.now() - 60 * 60 * 1000),
    angle: "Company catalyst",
    rawContent:
      "Latest clinical data on obesity treatments reinforces demand for leading pharma names in the space.",
  },
  {
    headline: "Treasury yields rise as investors reprice the timing of rate cuts",
    source: "Federal Reserve Watch",
    url: "https://example.com/treasury-yields",
    publishedAt: new Date(Date.now() - 120 * 60 * 1000),
    angle: "Risk regime",
    rawContent:
      "Long-duration assets face pressure as Treasury yields move higher and rate-cut expectations shift.",
  },
  {
    headline:
      "Chip supply chain bottlenecks ease as data center projects expand",
    source: "Bloomberg Markets",
    url: "https://example.com/chip-supply",
    publishedAt: new Date(Date.now() - 180 * 60 * 1000),
    angle: "Execution tailwind",
    rawContent:
      "Semiconductor supply constraints ease amid strong data center and AI buildout demand.",
  },
];

export const seedNewsProvider: INewsProvider = {
  id: "seed",
  async fetch(_options) {
    return [...seedStories];
  },
};
