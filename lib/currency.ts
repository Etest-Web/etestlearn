/**
 * Currency conversion and formatting utility.
 * Base currency is usually NGN as per current system.
 */

export type CurrencyCode = string;

const API_URL = 'https://open.er-api.com/v6/latest'; // Free, no key required for basic use
const CACHE_KEY = 'glypha_currency_rates';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface RateCache {
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

/**
 * Fetches latest rates for a base currency and caches them locally.
 */
export async function getExchangeRates(base: CurrencyCode = 'NGN'): Promise<Record<string, number>> {
  if (typeof window === 'undefined') return {};

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const data: RateCache = JSON.parse(cached);
    if (data.base === base && Date.now() - data.timestamp < CACHE_TTL) {
      return data.rates;
    }
  }

  try {
    const response = await fetch(`${API_URL}/${base}`);
    const data = await response.json();

    if (data.result === 'success') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        base,
        rates: data.rates,
        timestamp: Date.now(),
      }));
      return data.rates;
    }
    throw new Error('Failed to fetch rates');
  } catch (e) {
    console.error('Currency fetch error:', e);
    return { 'NGN': 1 }; // Fallback
  }
}

/**
 * Converts an amount from one currency to another.
 * @param amount Amount in the source currency (e.g. kobo if NGN)
 * @param from Base currency (e.g. 'NGN')
 * @param to Target currency (e.g. 'USD')
 * @param isKobo If true, divides by 100 first.
 */
export async function convertPrice(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  isKobo = true
): Promise<number> {
  if (from === to) return amount;

  const rates = await getExchangeRates(from);
  const rate = rates[to];

  if (!rate) return amount;

  const baseAmount = isKobo ? amount / 100 : amount;
  return baseAmount * rate;
}

/**
 * Formats a number as a currency string based on locale and currency code.
 */
export function formatCurrency(
  amount: number, 
  currency: CurrencyCode, 
  locale: string = 'en-NG'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
