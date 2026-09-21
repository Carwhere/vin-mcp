/**
 * Thin fetch wrappers around the public CarWhere API.
 * No auth, CORS-enabled, cached server-side.
 */

const DEFAULT_BASE_URL = 'https://www.carwhere.com';
const USER_AGENT = 'carwhere-vin-mcp/0.1';

export function getBaseUrl(): string {
  return process.env.CARWHERE_API_URL || DEFAULT_BASE_URL;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CarWhere API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface VinDecodeResponse {
  source: string;
  vin: string;
  permalink: string;
  decoded: {
    year: string;
    make: string;
    model: string;
    trim: string | null;
    bodyStyle: string | null;
    driveType: string | null;
    fuelType: string | null;
    engine: { cylinders: number | string | null; displacementLiters: string | null };
    transmission: string | null;
    plant: { city: string | null; state: string | null; country: string | null };
    vehicleType: string | null;
    manufacturer: string | null;
  };
  pricing:
    | {
        available: true;
        sampleSize: number;
        dataStatus: string;
        averageSellingPrice: number | null;
        averageDiscountPercent: number | null;
        priceBand: { low: number; typical: number; high: number } | null;
        url: string;
        citation: string;
      }
    | { available: false; reason: string };
  recalls: {
    count: number;
    items: Array<{
      campaignNumber: string;
      component: string;
      summary: string;
      consequence: string;
      remedy: string;
      reportReceivedDate: string;
      parkIt: boolean;
      parkOutside: boolean;
      overTheAirUpdate: boolean;
    }>;
    url: string;
  };
  insight: { text: string; model: string; generatedAt: string } | null;
  citation: string;
}

export interface RecallsResponse {
  decoded: { make: string; model: string; year: string };
  recalls: VinDecodeResponse['recalls']['items'];
}

export interface PricingResponse {
  source: string;
  url: string;
  make: string;
  model: string;
  year: number;
  state: string | null;
  sampleSize: number;
  dataStatus: 'sufficient' | 'limited' | 'insufficient' | 'none';
  averageMsrp: number | null;
  averageSellingPrice: number | null;
  averageDiscountAmount: number | null;
  averageDiscountPercent: number | null;
  priceBand: { low: number; typical: number; high: number } | null;
  rebatesIncluded: boolean;
  lastUpdated: string;
  dealTypeSplit: { lease: number; cashFinance: number };
  topTrims: Array<{ trim: string; dealCount: number; avgPrice: number; avgDiscount: number }>;
  citation: string;
}

export async function decodeVin(
  vin: string,
  opts: { pricing?: boolean; recalls?: boolean; insight?: boolean } = {}
): Promise<VinDecodeResponse> {
  const params = new URLSearchParams();
  if (opts.pricing === false) params.set('pricing', 'false');
  if (opts.recalls === false) params.set('recalls', 'false');
  if (opts.insight === false) params.set('insight', 'false');
  const qs = params.toString();
  const url = `${getBaseUrl()}/api/public/vin/${encodeURIComponent(vin.toUpperCase())}${qs ? `?${qs}` : ''}`;
  return fetchJson<VinDecodeResponse>(url);
}

export async function getRecalls(args: { vin?: string; make?: string; model?: string; year?: number | string }): Promise<RecallsResponse> {
  const params = new URLSearchParams();
  if (args.vin) params.set('vin', args.vin.toUpperCase());
  else {
    if (args.make) params.set('make', args.make);
    if (args.model) params.set('model', args.model);
    if (args.year) params.set('year', String(args.year));
  }
  const url = `${getBaseUrl()}/api/recalls?${params.toString()}`;
  return fetchJson<RecallsResponse>(url);
}

export async function getPricing(make: string, model: string, year: number, state?: string): Promise<PricingResponse> {
  const path = state
    ? `/api/public/pricing/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${year}/${encodeURIComponent(state.toLowerCase())}`
    : `/api/public/pricing/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${year}`;
  return fetchJson<PricingResponse>(`${getBaseUrl()}${path}`);
}

// Local check-digit validator. No network.
const CD_VALUES: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const CD_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export interface CheckDigitResult {
  vin: string;
  status: 'valid' | 'check-fail' | 'illegal-char' | 'invalid-format';
  expectedDigit?: string;
  actualDigit?: string;
  weightedSum?: number;
  message: string;
}

export function validateVinCheckDigit(rawVin: string): CheckDigitResult {
  const vin = rawVin.toUpperCase();
  if (vin.length !== 17) {
    return { vin, status: 'invalid-format', message: 'VIN must be exactly 17 characters.' };
  }
  if (/[IOQ]/.test(vin)) {
    return { vin, status: 'illegal-char', message: 'VIN cannot contain the letters I, O, or Q.' };
  }
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(vin)) {
    return { vin, status: 'invalid-format', message: 'VIN contains characters outside the legal A-Z (excluding I, O, Q) / 0-9 set.' };
  }
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CD_VALUES[vin[i]] * CD_WEIGHTS[i];
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  const actual = vin[8];
  if (expected === actual) {
    return {
      vin,
      status: 'valid',
      expectedDigit: expected,
      actualDigit: actual,
      weightedSum: sum,
      message: 'VIN passes the ISO 3779 / 49 CFR §565.15 check-digit checksum.',
    };
  }
  return {
    vin,
    status: 'check-fail',
    expectedDigit: expected,
    actualDigit: actual,
    weightedSum: sum,
    message: `Check digit mismatch — position 9 has '${actual}' but the math computes '${expected}'. VIN is likely a typo or fabricated.`,
  };
}

// ── Agentic checkout — $9.99 Full VIN Report / $19.99 Compare 3 ──

export interface PrecheckResponse {
  vehicle: { year: string; make: string; model: string; trim: string | null } | null;
  sticker: {
    status: 'available' | 'fallback' | 'unknown';
    brand: string | null;
    manufacturer: string | null;
  };
}

export interface CheckoutResponse {
  checkoutUrl?: string;
  redirectTo?: string;
  alreadyPurchased?: boolean;
  reportId?: string;
  reportIds?: string[];
  error?: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `CarWhere API ${res.status}`);
  }
  return json;
}

/** Free pre-purchase check: decodes the VIN and confirms sticker availability. */
export async function precheckVinReport(vin: string): Promise<PrecheckResponse> {
  return postJson<PrecheckResponse>(`${getBaseUrl()}/api/vin-report/precheck`, {
    vin: vin.toUpperCase(),
  });
}

/**
 * Create a Stripe Checkout session for the Full VIN Report ($9.99) or the
 * Compare 3 VINs bundle ($19.99). Returns a secure stripe-hosted payment URL
 * the human must open to complete payment — no card data flows through here.
 */
export async function createVinReportCheckout(input: {
  vin: string;
  email: string;
  vins?: string[];
  productType?: 'full_report' | 'compare_3';
}): Promise<CheckoutResponse> {
  return postJson<CheckoutResponse>(`${getBaseUrl()}/api/vin-report/checkout`, {
    ...input,
    source_url: 'mcp',
    utm_source: 'ai-mcp',
  });
}
