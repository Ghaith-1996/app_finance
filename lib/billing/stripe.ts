import "server-only";

import Stripe from "stripe";

import { type PaidPlanKey } from "@/lib/billing/plans";

const STRIPE_API_VERSION = "2026-03-25.dahlia";

let stripeClient: Stripe | null = null;

const DEFAULT_LOCALHOST_APP_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function requireStripeEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Stripe environment variable: ${name}`);
  }
  return value;
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeEnv("STRIPE_SECRET_KEY"), {
      apiVersion: STRIPE_API_VERSION,
      appInfo: {
        name: "pulsefolio",
      },
    });
  }

  return stripeClient;
}

export function requireStripeWebhookSecret(): string {
  return requireStripeEnv("STRIPE_WEBHOOK_SECRET");
}

export function getStripePriceIdForPlan(planKey: PaidPlanKey): string {
  if (planKey === "premium") {
    return requireStripeEnv("STRIPE_PREMIUM_PRICE_ID");
  }

  return requireStripeEnv("STRIPE_ULTIMATE_PRICE_ID");
}

export function planFromStripePriceId(priceId: string | null | undefined): PaidPlanKey | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID?.trim()) return "premium";
  if (priceId === process.env.STRIPE_ULTIMATE_PRICE_ID?.trim()) return "ultimate";
  return null;
}

function normalizeAbsoluteHttpUrl(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const pathname = parsed.pathname.replace(/\/+$/, "");
    const pathSuffix = pathname && pathname !== "/" ? pathname : "";
    return `${parsed.origin}${pathSuffix}`;
  } catch {
    return null;
  }
}

function parseTrustedOriginAllowlist(): Set<string> {
  const fromEnv = (process.env.APP_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => normalizeAbsoluteHttpUrl(value))
    .filter((value): value is string => !!value);

  const defaults = process.env.NODE_ENV === "production" ? [] : DEFAULT_LOCALHOST_APP_ORIGINS;
  return new Set([...fromEnv, ...defaults]);
}

function getTrustedConfiguredBaseUrl(): string | null {
  return (
    normalizeAbsoluteHttpUrl(process.env.APP_BASE_URL) ??
    normalizeAbsoluteHttpUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeAbsoluteHttpUrl(process.env.NEXT_PUBLIC_APP_URL)
  );
}

function getTrustedRequestOrigin(request: Request | undefined): string | null {
  if (!request) return null;
  const origin = normalizeAbsoluteHttpUrl(new URL(request.url).origin);
  if (!origin) return null;
  return parseTrustedOriginAllowlist().has(origin) ? origin : null;
}

export function getAppBaseUrl(request?: Request): string {
  const configured = getTrustedConfiguredBaseUrl();
  if (configured) return configured;

  const trustedRequestOrigin = getTrustedRequestOrigin(request);
  if (trustedRequestOrigin) return trustedRequestOrigin;

  return "http://localhost:3000";
}
