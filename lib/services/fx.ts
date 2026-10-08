import { cached } from "@/lib/services/cache";
import { BASE_CURRENCY, MINOR_UNITS, normalizeCurrencyCode } from "@/lib/services/valuation";
import { getQuote } from "@/lib/services/yahoo-finance";

/**
 * FX policy (audit B2): quote-currency → USD rates from Yahoo `XXXUSD=X` pairs, cached for
 * FX_CACHE_TTL_MS and stamped with the time they were fetched. Minor-unit quote currencies
 * (GBp/GBX pence, ZAc cents, ILA agorot) are converted through their major currency.
 * A currency whose rate cannot be fetched gets no entry, so its positions are reported as
 * unavailable instead of being summed unconverted.
 */

export const FX_CACHE_TTL_MS = 15 * 60_000;

export type FxRate = { rateToBase: number; asOf: string };

async function fetchMajorRate(major: string): Promise<FxRate | null> {
  const quote = await getQuote(`${major}${BASE_CURRENCY}=X`);
  if (!quote || !(quote.price > 0)) return null;
  return { rateToBase: quote.price, asOf: new Date().toISOString() };
}

export async function getFxRatesToBase(
  currencies: Iterable<string | null | undefined>,
): Promise<Map<string, FxRate>> {
  const rates = new Map<string, FxRate>();
  const codes = new Set([...currencies].map(normalizeCurrencyCode));

  await Promise.all(
    [...codes].map(async (code) => {
      if (code === BASE_CURRENCY) {
        rates.set(code, { rateToBase: 1, asOf: new Date().toISOString() });
        return;
      }
      const minor = MINOR_UNITS[code];
      const major = minor?.major ?? code.toUpperCase();
      if (major === BASE_CURRENCY && minor) {
        rates.set(code, { rateToBase: 1 / minor.divisor, asOf: new Date().toISOString() });
        return;
      }
      try {
        const rate = await cached(`fx:${major}`, async () => {
          const next = await fetchMajorRate(major);
          if (!next) throw new Error(`No FX rate for ${major}`);
          return next;
        }, FX_CACHE_TTL_MS);
        rates.set(code, {
          rateToBase: minor ? rate.rateToBase / minor.divisor : rate.rateToBase,
          asOf: rate.asOf,
        });
      } catch {
        // Missing rate: the caller must treat positions in this currency as unavailable.
      }
    }),
  );

  return rates;
}
