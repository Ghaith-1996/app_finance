import type { MatchSource, NewsCategory, StockEffect } from "@/lib/types";

export const DAILY_DIGEST_TIME_ZONE = "America/New_York";

export type DeliveryChannel = "email" | "sms";
export type DeliveryStatus = "pending" | "sent" | "skipped" | "failed" | "uncertain";
export type DigestSourceMode = "portfolio" | "watchlist";

export interface NotificationPreferences {
  emailDigestEnabled: boolean;
  smsDigestEnabled: boolean;
  phoneNumber: string;
  criticalNewsAlertsEnabled: boolean;
  earningsReportAlertsEnabled: boolean;
  priceMoveAlertsEnabled: boolean;
  priceMoveThresholdPercent: number;
  concentrationAlertsEnabled: boolean;
  concentrationThresholdPercent: number;
}

export interface NotificationPreferenceInput {
  emailDigestEnabled: boolean;
  smsDigestEnabled: boolean;
  phoneNumber: string;
  criticalNewsAlertsEnabled: boolean;
  earningsReportAlertsEnabled: boolean;
  priceMoveAlertsEnabled: boolean;
  priceMoveThresholdPercent: number;
  concentrationAlertsEnabled: boolean;
  concentrationThresholdPercent: number;
}

export interface DigestSnapshotStory {
  newsItemId: string;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  category: NewsCategory;
  relevanceScore: number | null;
  aiSummary: string;
  whyItMatters: string;
  matchedSymbols: string[];
  symbolEffects: Record<string, StockEffect>;
  matchSources: MatchSource[];
  displayEffect: StockEffect;
}

export interface DailyDigestSnapshot {
  id: string;
  userId: string;
  digestDate: string;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  sourceMode: DigestSourceMode;
  portfolioId: string | null;
  portfolioName: string | null;
  summaryLine: string;
  bullishSymbols: string[];
  bearishSymbols: string[];
  topStories: DigestSnapshotStory[];
  createdAt: string;
}

export interface DailyDigestBuildResult {
  kind: "ready" | "empty";
  digest?: DailyDigestSnapshot;
  created?: boolean;
  reason?: string;
}

export interface DailyDigestDeliveryResult {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  digestId: string;
  providerMessageId: string | null;
  errorText: string | null;
}

export interface DailyDigestCronRunResult {
  ran: boolean;
  skipped: boolean;
  reason: string | null;
  digestDate: string;
  timeZone: string;
  processedUsers: number;
  createdDigests: number;
  sentEmail: number;
  sentSms: number;
  skippedDeliveries: number;
  failedDeliveries: number;
  uncertainDeliveries: number;
}
