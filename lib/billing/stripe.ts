import "server-only";

import Stripe from "stripe";

import { type PaidPlanKey } from "@/lib/billing/plans";

const STRIPE_API_VERSION = "2026-03-25.dahlia";

let stripeClient: Stripe | null = null;

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

export function getAppBaseUrl(request?: Request): string {
  if (request) {
    const origin = new URL(request.url).origin;
    if (origin) {
      return origin.replace(/\/+$/, "");
    }
  }

  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}
