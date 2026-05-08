import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/logger";
import {
  assertSafePublicUrl,
  validatePublisherUrl,
  type PublisherHostnameLookup,
} from "@/lib/security/publisher-url";
import { getCompanyWebsiteSeed } from "@/lib/services/twelvedata";
import type {
  LatestEarningsReportFields,
  LatestEarningsReportSource,
} from "@/lib/types";

const log = createLogger("earnings-reports");

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 250_000;
const MAX_LANDING_PAGES = 3;
const MAX_REDIRECT_HOPS = 5;
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_BASE_URL = "https://data.sec.gov/submissions";
const SEC_ARCHIVES_BASE_URL = "https://www.sec.gov/Archives/edgar/data";

const LANDING_KEYWORDS = [
  "investor",
  "investor-relations",
  "press",
  "news",
  "media",
];

const EARNINGS_KEYWORDS = [
  "earnings",
  "result",
  "results",
  "quarter",
  "release",
  "fiscal",
  "annual",
  "q1",
  "q2",
  "q3",
  "q4",
];

const SEC_INHERENT_EARNINGS_FORMS = new Set([
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  "20-F",
  "20-F/A",
]);

const SEC_CURRENT_REPORT_FORMS = new Set([
  "6-K",
  "6-K/A",
  "8-K",
  "8-K/A",
]);

type SupabaseLike = {
  from: SupabaseClient["from"];
};

type TickerSymbolRow = {
  symbol: string | null;
};

type EarningsReportRow = {
  symbol: string;
  preferred_url: string | null;
  url_source: LatestEarningsReportSource | null;
  company_url: string | null;
  sec_url: string | null;
  report_date: string | null;
  filing_form: string | null;
  title: string | null;
  is_active?: boolean;
  error: string | null;
};

type CompanyDiscoveryCandidate = {
  url: string;
  label: string | null;
  score: number;
  isLandingPage: boolean;
};

type SecTickerMapEntry = {
  cik_str?: number | string;
  ticker?: string;
};

type SecSubmissionsPayload = {
  filings?: {
    recent?: {
      form?: Array<string | null>;
      filingDate?: Array<string | null>;
      reportDate?: Array<string | null>;
      accessionNumber?: Array<string | null>;
      primaryDocument?: Array<string | null>;
      primaryDocDescription?: Array<string | null>;
      items?: Array<string | null>;
      acceptanceDateTime?: Array<string | null>;
    };
  };
};

type SecEarningsReport = {
  url: string;
  reportDate: string | null;
  filingDate: string | null;
  filingForm: string;
  title: string;
  sortDate: string;
  score: number;
  acceptedAt: string | null;
};

type CompanyDiscoveryOptions = {
  fetchImpl?: typeof fetch;
  reportDateHint?: string | null;
  lookupImpl?: PublisherHostnameLookup;
};

export type ActiveEarningsReportRecord = {
  symbol: string;
  preferredUrl: string | null;
  urlSource: LatestEarningsReportSource | null;
  companyUrl: string | null;
  secUrl: string | null;
  reportDate: string | null;
  filingForm: string | null;
  title: string | null;
  error: string | null;
};

export type EarningsReportSyncResult = {
  processed: number;
  resolved: number;
  companyLinks: number;
  secFallbacks: number;
  missing: number;
  inactivated: number;
};

type EarningsReportSyncDeps = {
  now?: () => Date;
  fetchImpl?: typeof fetch;
  getCompanyWebsiteSeed?: typeof getCompanyWebsiteSeed;
  resolveLatestSecEarningsReport?: (
    symbol: string,
    options?: {
      fetchImpl?: typeof fetch;
      tickerMap?: Map<string, string>;
    },
  ) => Promise<SecEarningsReport | null>;
  discoverCompanyEarningsLink?: (
    websiteUrl: string | null | undefined,
    options?: CompanyDiscoveryOptions,
  ) => Promise<{ url: string; title: string | null } | null>;
};

class EarningsReportPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EarningsReportPersistenceError";
  }
}

function normalizeSymbol(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  return value ? value : null;
}

function emptyLatestEarningsReportFields(): LatestEarningsReportFields {
  return {
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
  };
}

function mapRowToActiveRecord(row: EarningsReportRow): ActiveEarningsReportRecord {
  return {
    symbol: row.symbol,
    preferredUrl: row.preferred_url,
    urlSource: row.url_source,
    companyUrl: row.company_url,
    secUrl: row.sec_url,
    reportDate: row.report_date,
    filingForm: row.filing_form,
    title: row.title,
    error: row.error,
  };
}

function compareIsoDatesDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftMs = left ? Date.parse(left) : Number.NaN;
  const rightMs = right ? Date.parse(right) : Number.NaN;
  const safeLeft = Number.isFinite(leftMs) ? leftMs : -1;
  const safeRight = Number.isFinite(rightMs) ? rightMs : -1;
  return safeRight - safeLeft;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x2F;/gi, "/");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function baseHostname(hostname: string): string {
  const clean = hostname.trim().toLowerCase();
  if (!clean) return clean;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(clean)) return clean;
  if (clean.includes(":")) return clean;

  const parts = clean.split(".");
  if (parts.length <= 2) return clean;

  const last = parts[parts.length - 1] ?? "";
  const second = parts[parts.length - 2] ?? "";
  if (last.length === 2 && second.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

function isSameBaseDomain(candidateUrl: URL, seedUrl: URL) {
  return baseHostname(candidateUrl.hostname) === baseHostname(seedUrl.hostname);
}

function includesAnyKeyword(value: string, keywords: string[]) {
  const haystack = value.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function isRedirectStatus(status: number) {
  return status === 301
    || status === 302
    || status === 303
    || status === 307
    || status === 308;
}

function companyCandidateScore(
  candidateUrl: URL,
  label: string | null,
  options?: { reportDateHint?: string | null },
): number {
  const combined = `${candidateUrl.pathname} ${candidateUrl.search} ${label ?? ""}`.toLowerCase();
  let score = 0;

  if (combined.includes("investor-relations")) score += 80;
  else if (combined.includes("investor")) score += 40;

  if (combined.includes("press")) score += 25;
  if (combined.includes("news")) score += 20;
  if (combined.includes("media")) score += 15;

  if (combined.includes("earnings")) score += 140;
  if (combined.includes("results")) score += 95;
  if (combined.includes("quarter")) score += 70;
  if (combined.includes("release")) score += 35;
  if (combined.includes("annual")) score += 30;
  if (combined.includes("fiscal")) score += 25;
  if (/(^|[^a-z])q[1-4]([^a-z]|$)/.test(combined)) score += 55;
  if (candidateUrl.pathname.toLowerCase().endsWith(".pdf")) score += 10;

  const yearHint = options?.reportDateHint?.slice(0, 4) ?? "";
  if (yearHint && combined.includes(yearHint)) {
    score += 25;
  }

  return score;
}

function isLandingPageCandidate(candidateUrl: URL, label: string | null) {
  const combined = `${candidateUrl.pathname} ${candidateUrl.search} ${label ?? ""}`.toLowerCase();
  return includesAnyKeyword(combined, LANDING_KEYWORDS)
    && !includesAnyKeyword(combined, EARNINGS_KEYWORDS);
}

function isEarningsCandidate(candidateUrl: URL, label: string | null) {
  const combined = `${candidateUrl.pathname} ${candidateUrl.search} ${label ?? ""}`.toLowerCase();
  return includesAnyKeyword(combined, EARNINGS_KEYWORDS);
}

async function fetchTextPage(
  url: string,
  fetchImpl: typeof fetch,
  options?: { lookupImpl?: PublisherHostnameLookup },
): Promise<string | null> {
  const safety = await assertSafePublicUrl(url, {
    lookupImpl: options?.lookupImpl,
  });
  if (!safety.ok) {
    return null;
  }

  let currentUrl = new URL(url).toString();

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "portfolio-signal/earnings-report-sync",
        },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return null;
        }

        const nextUrl = new URL(location, currentUrl).toString();
        const nextSafety = await assertSafePublicUrl(nextUrl, {
          lookupImpl: options?.lookupImpl,
        });
        if (!nextSafety.ok) {
          return null;
        }

        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !contentType.toLowerCase().includes("text/html")) {
        return null;
      }

      const text = await response.text();
      return text.slice(0, MAX_HTML_BYTES);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function extractCompanyCandidates(
  html: string,
  pageUrl: string,
  seedUrl: string,
  options?: { reportDateHint?: string | null },
): CompanyDiscoveryCandidate[] {
  const results: CompanyDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const resolvedPageUrl = new URL(pageUrl);
  const resolvedSeedUrl = new URL(seedUrl);

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = (match[2] ?? "").trim();
    if (!rawHref || rawHref.startsWith("#")) continue;

    let resolved: URL;
    try {
      resolved = new URL(rawHref, resolvedPageUrl);
    } catch {
      continue;
    }

    const resolvedHref = resolved.toString();
    if (seen.has(resolvedHref)) continue;
    seen.add(resolvedHref);

    if (!validatePublisherUrl(resolvedHref).ok) continue;
    if (!isSameBaseDomain(resolved, resolvedSeedUrl)) continue;

    const label = stripHtml(match[3] ?? "");
    const score = companyCandidateScore(resolved, label || null, options);
    const earningsCandidate = isEarningsCandidate(resolved, label || null);
    const landingPage = isLandingPageCandidate(resolved, label || null);

    if (!earningsCandidate && !landingPage) continue;

    results.push({
      url: resolvedHref,
      label: label || null,
      score,
      isLandingPage: landingPage,
    });
  }

  return results.sort((left, right) => right.score - left.score);
}

async function scanCompanyPage(
  pageUrl: string,
  seedUrl: string,
  options?: CompanyDiscoveryOptions,
) {
  const html = await fetchTextPage(pageUrl, options?.fetchImpl ?? fetch, {
    lookupImpl: options?.lookupImpl,
  });
  if (!html) return [];

  return extractCompanyCandidates(html, pageUrl, seedUrl, {
    reportDateHint: options?.reportDateHint ?? null,
  });
}

export async function discoverCompanyEarningsLink(
  websiteUrl: string | null | undefined,
  options?: CompanyDiscoveryOptions,
): Promise<{ url: string; title: string | null } | null> {
  if (!websiteUrl || !validatePublisherUrl(websiteUrl).ok) {
    return null;
  }

  const websiteSafety = await assertSafePublicUrl(websiteUrl, {
    lookupImpl: options?.lookupImpl,
  });
  if (!websiteSafety.ok) {
    return null;
  }

  const candidates = new Map<string, CompanyDiscoveryCandidate>();
  const seedUrl = new URL(websiteUrl).toString();

  const initialCandidates = await scanCompanyPage(seedUrl, seedUrl, options);
  for (const candidate of initialCandidates) {
    candidates.set(candidate.url, candidate);
  }

  const landingPages = initialCandidates
    .filter((candidate) => candidate.isLandingPage)
    .slice(0, MAX_LANDING_PAGES);

  for (const landingPage of landingPages) {
    const nestedCandidates = await scanCompanyPage(landingPage.url, seedUrl, options);
    for (const candidate of nestedCandidates) {
      const existing = candidates.get(candidate.url);
      if (!existing || candidate.score > existing.score) {
        candidates.set(candidate.url, candidate);
      }
    }
  }

  const best = [...candidates.values()]
    .filter((candidate) => isEarningsCandidate(new URL(candidate.url), candidate.label))
    .sort((left, right) => right.score - left.score)[0];

  if (!best) {
    return null;
  }

  const bestSafety = await assertSafePublicUrl(best.url, {
    lookupImpl: options?.lookupImpl,
  });
  if (!bestSafety.ok) {
    return null;
  }

  return {
    url: best.url,
    title: best.label,
  };
}

function secUserAgent() {
  return process.env.EDGAR_IDENTITY?.trim() || "portfolio-signal/earnings-report-sync";
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
        "User-Agent": secUserAgent(),
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadSecTickerMap(fetchImpl: typeof fetch) {
  const payload = await fetchJson<Record<string, SecTickerMapEntry>>(SEC_TICKERS_URL, fetchImpl);
  const entries = Object.values(payload ?? {});
  const map = new Map<string, string>();

  for (const entry of entries) {
    const symbol = normalizeSymbol(entry.ticker);
    const cikValue = entry.cik_str == null ? "" : String(entry.cik_str).trim();
    if (!symbol || !cikValue) continue;
    map.set(symbol, cikValue.padStart(10, "0"));
  }

  return map;
}

function buildSecTitle(form: string, description: string | null) {
  const normalizedDescription = String(description ?? "").trim();
  if (normalizedDescription) {
    return normalizedDescription;
  }

  switch (form) {
    case "10-Q":
    case "10-Q/A":
      return "Quarterly report";
    case "10-K":
    case "10-K/A":
      return "Annual report";
    case "20-F":
    case "20-F/A":
      return "Annual report";
    case "6-K":
    case "6-K/A":
    case "8-K":
    case "8-K/A":
      return "Current report";
    default:
      return `${form} filing`;
  }
}

function secCandidateScore(
  form: string,
  items: string | null,
  description: string | null,
  primaryDocument: string,
) {
  const combined = `${items ?? ""} ${description ?? ""} ${primaryDocument}`.toLowerCase();
  let score = 0;

  if ((form === "8-K" || form === "8-K/A" || form === "6-K" || form === "6-K/A")
    && combined.includes("2.02")) {
    score += 100;
  }

  if (combined.includes("earnings")) score += 90;
  if (combined.includes("results")) score += 65;
  if (combined.includes("quarter")) score += 40;
  if (combined.includes("release")) score += 30;
  if (combined.includes("exhibit 99")) score += 15;

  if (form.startsWith("8-K") || form.startsWith("6-K")) score += 40;
  if (form.startsWith("10-Q")) score += 25;
  if (form.startsWith("10-K") || form.startsWith("20-F")) score += 20;

  if (form.endsWith("/A") || form.endsWith("-A")) score -= 5;

  return score;
}

function isSecCurrentReportWithEarningsMarkers(
  items: string | null,
  description: string | null,
  primaryDocument: string,
) {
  const combined = `${items ?? ""} ${description ?? ""} ${primaryDocument}`.toLowerCase();
  return combined.includes("2.02")
    || combined.includes("earnings")
    || combined.includes("results")
    || combined.includes("quarter")
    || combined.includes("release");
}

function isEligibleSecEarningsFiling(
  form: string,
  items: string | null,
  description: string | null,
  primaryDocument: string,
) {
  if (SEC_INHERENT_EARNINGS_FORMS.has(form)) {
    return true;
  }

  if (SEC_CURRENT_REPORT_FORMS.has(form)) {
    return isSecCurrentReportWithEarningsMarkers(items, description, primaryDocument);
  }

  return false;
}

export async function resolveLatestSecEarningsReport(
  symbol: string,
  options?: {
    fetchImpl?: typeof fetch;
    tickerMap?: Map<string, string>;
  },
): Promise<SecEarningsReport | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) return null;

  const fetchImpl = options?.fetchImpl ?? fetch;
  const tickerMap = options?.tickerMap ?? await loadSecTickerMap(fetchImpl);
  const cik = tickerMap.get(normalizedSymbol);
  if (!cik) return null;

  const payload = await fetchJson<SecSubmissionsPayload>(
    `${SEC_SUBMISSIONS_BASE_URL}/CIK${cik}.json`,
    fetchImpl,
  );

  const recent = payload.filings?.recent;
  if (!recent?.form?.length) {
    return null;
  }

  const candidates: SecEarningsReport[] = [];
  for (let index = 0; index < recent.form.length; index += 1) {
    const form = String(recent.form[index] ?? "").trim().toUpperCase();

    const accessionNumber = String(recent.accessionNumber?.[index] ?? "").trim();
    const primaryDocument = String(recent.primaryDocument?.[index] ?? "").trim();
    if (!accessionNumber || !primaryDocument) continue;

    const filingDate = String(recent.filingDate?.[index] ?? "").trim() || null;
    const reportDate = String(recent.reportDate?.[index] ?? "").trim() || filingDate;
    const description = String(recent.primaryDocDescription?.[index] ?? "").trim() || null;
    const items = String(recent.items?.[index] ?? "").trim() || null;
    if (!isEligibleSecEarningsFiling(form, items, description, primaryDocument)) continue;
    const acceptedAt = String(recent.acceptanceDateTime?.[index] ?? "").trim() || null;
    const score = secCandidateScore(form, items, description, primaryDocument);

    const sortDate = reportDate || filingDate;
    if (!sortDate) continue;

    const archiveCik = String(Number.parseInt(cik, 10));
    const accessionPath = accessionNumber.replace(/-/g, "");
    candidates.push({
      url: `${SEC_ARCHIVES_BASE_URL}/${archiveCik}/${accessionPath}/${primaryDocument}`,
      reportDate,
      filingDate,
      filingForm: form,
      title: buildSecTitle(form, description),
      sortDate,
      score,
      acceptedAt,
    });
  }

  return candidates
    .sort((left, right) => (
      compareIsoDatesDesc(left.sortDate, right.sortDate)
      || right.score - left.score
      || compareIsoDatesDesc(left.acceptedAt, right.acceptedAt)
    ))[0] ?? null;
}

export async function resolveTrackedSymbolUniverse(
  supabase: SupabaseLike,
): Promise<string[]> {
  const [{ data: holdings, error: holdingsError }, { data: watchlistItems, error: watchlistError }] = await Promise.all([
    supabase.from("holdings").select("symbol"),
    supabase.from("watchlist_items").select("symbol"),
  ]);

  if (holdingsError) {
    throw new Error(`Failed to load holdings symbols: ${holdingsError.message}`);
  }
  if (watchlistError) {
    throw new Error(`Failed to load watchlist symbols: ${watchlistError.message}`);
  }

  return [
    ...new Set(
      [...(holdings ?? []), ...(watchlistItems ?? [])]
        .map((row) => normalizeSymbol((row as TickerSymbolRow).symbol))
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ].sort();
}

export async function loadActiveEarningsReportsBySymbols(
  supabase: SupabaseLike,
  symbols: string[],
): Promise<Map<string, ActiveEarningsReportRecord>> {
  const normalizedSymbols = [
    ...new Set(
      symbols
        .map((symbol) => normalizeSymbol(symbol))
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ].sort();

  if (normalizedSymbols.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("ticker_earnings_reports")
    .select("symbol, preferred_url, url_source, company_url, sec_url, report_date, filing_form, title, error")
    .eq("is_active", true)
    .in("symbol", normalizedSymbols);

  if (error || !data) {
    log.warn("Failed to load earnings report links", {
      symbols: normalizedSymbols.length,
      error: error?.message ?? "unknown",
    });
    return new Map();
  }

  return new Map(
    (data as EarningsReportRow[]).map((row) => [row.symbol, mapRowToActiveRecord(row)]),
  );
}

export function latestEarningsReportFields(
  row: ActiveEarningsReportRecord | null | undefined,
): LatestEarningsReportFields {
  if (!row) return emptyLatestEarningsReportFields();

  return {
    latestEarningsReportUrl: row.preferredUrl,
    latestEarningsReportSource: row.urlSource,
    latestEarningsReportDate: row.reportDate,
  };
}

export function attachLatestEarningsReportFields<T extends { symbol: string }>(
  items: T[],
  reportsBySymbol: Map<string, ActiveEarningsReportRecord>,
): Array<T & LatestEarningsReportFields> {
  return items.map((item) => ({
    ...item,
    ...latestEarningsReportFields(
      reportsBySymbol.get(normalizeSymbol(item.symbol) ?? ""),
    ),
  }));
}

function getSupabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "unknown Supabase error";
}

function ensureSupabaseSucceeded(
  operation: string,
  result: { error: unknown } | null | undefined,
) {
  if (!result?.error) return;
  throw new EarningsReportPersistenceError(
    `${operation}: ${getSupabaseErrorMessage(result.error)}`,
  );
}

export async function syncTrackedEarningsReports(
  supabase: SupabaseLike,
  deps?: EarningsReportSyncDeps,
): Promise<EarningsReportSyncResult> {
  const now = (deps?.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const getWebsiteSeed = deps?.getCompanyWebsiteSeed ?? getCompanyWebsiteSeed;
  const resolveSecReport = deps?.resolveLatestSecEarningsReport ?? resolveLatestSecEarningsReport;
  const discoverCompanyLink = deps?.discoverCompanyEarningsLink ?? discoverCompanyEarningsLink;

  const trackedSymbols = await resolveTrackedSymbolUniverse(supabase);
  const trackedSymbolSet = new Set(trackedSymbols);
  const existingRowsResult = await supabase
    .from("ticker_earnings_reports")
    .select("symbol, is_active");
  ensureSupabaseSucceeded(
    "Failed to load existing earnings report rows",
    existingRowsResult,
  );
  const existingRows = existingRowsResult.data;

  const activeExistingSymbols = (existingRows ?? [])
    .filter((row) => row.is_active === true)
    .map((row) => normalizeSymbol(String(row.symbol ?? "")))
    .filter((symbol): symbol is string => Boolean(symbol));

  let secTickerMap: Map<string, string> | null = null;
  if (trackedSymbols.length > 0 && !deps?.resolveLatestSecEarningsReport) {
    try {
      secTickerMap = await loadSecTickerMap(fetchImpl);
    } catch (error) {
      log.warn("Failed to load SEC ticker map", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const stats: EarningsReportSyncResult = {
    processed: 0,
    resolved: 0,
    companyLinks: 0,
    secFallbacks: 0,
    missing: 0,
    inactivated: 0,
  };

  for (const symbol of trackedSymbols) {
    stats.processed += 1;

    let secReport: SecEarningsReport | null = null;
    let companySeedUrl: string | null = null;
    let companyReportUrl: string | null = null;
    let companyTitle: string | null = null;
    let preferredUrl: string | null = null;
    let urlSource: LatestEarningsReportSource | null = null;
    let errorMessage: string | null = null;

    try {
      try {
        const [secResult, companySeedResult] = await Promise.allSettled([
          resolveSecReport(symbol, { fetchImpl, tickerMap: secTickerMap ?? undefined }),
          getWebsiteSeed(symbol),
        ]);

        if (secResult.status === "fulfilled") {
          secReport = secResult.value;
        } else {
          errorMessage = secResult.reason instanceof Error
            ? secResult.reason.message
            : String(secResult.reason);
        }

        if (companySeedResult.status === "fulfilled") {
          companySeedUrl = companySeedResult.value;
        }

        if (companySeedUrl) {
          const companyDiscovery = await discoverCompanyLink(companySeedUrl, {
            fetchImpl,
            reportDateHint: secReport?.reportDate ?? secReport?.filingDate ?? null,
          });
          companyReportUrl = companyDiscovery?.url ?? null;
          companyTitle = companyDiscovery?.title ?? null;
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      preferredUrl = companyReportUrl ?? secReport?.url ?? null;
      urlSource = companyReportUrl ? "company" : (secReport?.url ? "sec" : null);

      if (preferredUrl) {
        errorMessage = null;
      } else {
        errorMessage = errorMessage ?? "No earnings report link found.";
      }

      const upsertResult = await supabase
        .from("ticker_earnings_reports")
        .upsert(
          {
            symbol,
            preferred_url: preferredUrl,
            url_source: urlSource,
            company_url: companyReportUrl,
            sec_url: secReport?.url ?? null,
            report_date: secReport?.reportDate ?? secReport?.filingDate ?? null,
            filing_form: secReport?.filingForm ?? null,
            title: companyTitle ?? secReport?.title ?? null,
            is_active: true,
            last_checked_at: nowIso,
            error: errorMessage,
          },
          { onConflict: "symbol" },
        );
      ensureSupabaseSucceeded(
        `Failed to upsert earnings report row for ${symbol}`,
        upsertResult,
      );

      if (preferredUrl) {
        stats.resolved += 1;
        if (urlSource === "company") stats.companyLinks += 1;
        if (urlSource === "sec") stats.secFallbacks += 1;
      } else {
        stats.missing += 1;
      }
    } catch (error) {
      const errorRowUpsertResult = await supabase
        .from("ticker_earnings_reports")
        .upsert(
          {
            symbol,
            preferred_url: null,
            url_source: null,
            company_url: null,
            sec_url: null,
            report_date: null,
            filing_form: null,
            title: null,
            is_active: true,
            last_checked_at: nowIso,
            error: error instanceof Error ? error.message : String(error),
          },
          { onConflict: "symbol" },
        );
      ensureSupabaseSucceeded(
        `Failed to upsert earnings report error row for ${symbol}`,
        errorRowUpsertResult,
      );

      if (error instanceof EarningsReportPersistenceError) {
        throw error;
      }

      stats.missing += 1;
    }
  }

  const toInactivate = activeExistingSymbols.filter((symbol) => !trackedSymbolSet.has(symbol));
  if (toInactivate.length > 0) {
    const inactivateResult = await supabase
      .from("ticker_earnings_reports")
      .update({
        is_active: false,
        last_checked_at: nowIso,
        error: null,
      })
      .in("symbol", toInactivate);
    ensureSupabaseSucceeded(
      "Failed to mark inactive earnings report rows",
      inactivateResult,
    );

    stats.inactivated = toInactivate.length;
  }

  return stats;
}
