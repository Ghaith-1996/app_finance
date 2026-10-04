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

export type SendPhoneCodeResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      retryAfterSeconds?: number;
      /**
       * A code issued for this number may still be valid (delivery unconfirmed, or a resend refused
       * during the cooldown after an earlier code), so the code field must stay usable (review R9).
       */
      codeMayArrive?: boolean;
    };

export type ConfirmPhoneCodeResult = { ok: true } | { ok: false; error: string };

export type DailyDigestRow = {
  id: string;
  user_id: string;
  digest_date: string;
  time_zone: string;
  window_start: string;
  window_end: string;
  source_mode: DigestSourceMode;
  portfolio_id: string | null;
  portfolio_name: string | null;
  summary_line: string;
  bullish_symbols: string[] | null;
  bearish_symbols: string[] | null;
  top_stories: unknown;
  created_at: string;
};

export function mapDigestRow(row: DailyDigestRow): DailyDigestSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    digestDate: row.digest_date,
    timeZone: row.time_zone,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    sourceMode: row.source_mode,
    portfolioId: row.portfolio_id,
    portfolioName: row.portfolio_name,
    summaryLine: row.summary_line,
    bullishSymbols: row.bullish_symbols ?? [],
    bearishSymbols: row.bearish_symbols ?? [],
    topStories: Array.isArray(row.top_stories)
      ? (row.top_stories as DigestSnapshotStory[])
      : [],
    createdAt: row.created_at,
  };
}
