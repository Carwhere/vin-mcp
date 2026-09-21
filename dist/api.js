/**
 * Thin fetch wrappers around the public CarWhere API.
 * No auth, CORS-enabled, cached server-side.
 */
const DEFAULT_BASE_URL = 'https://www.carwhere.com';
const USER_AGENT = 'carwhere-vin-mcp/0.1';
export function getBaseUrl() {
    return process.env.CARWHERE_API_URL || DEFAULT_BASE_URL;
}
async function fetchJson(url) {
    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`CarWhere API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
    }
    return (await res.json());
}
export async function decodeVin(vin, opts = {}) {
    const params = new URLSearchParams();
    if (opts.pricing === false)
        params.set('pricing', 'false');
    if (opts.recalls === false)
        params.set('recalls', 'false');
    if (opts.insight === false)
        params.set('insight', 'false');
    const qs = params.toString();
    const url = `${getBaseUrl()}/api/public/vin/${encodeURIComponent(vin.toUpperCase())}${qs ? `?${qs}` : ''}`;
    return fetchJson(url);
}
export async function getRecalls(args) {
    const params = new URLSearchParams();
    if (args.vin)
        params.set('vin', args.vin.toUpperCase());
    else {
        if (args.make)
            params.set('make', args.make);
        if (args.model)
            params.set('model', args.model);
        if (args.year)
            params.set('year', String(args.year));
    }
    const url = `${getBaseUrl()}/api/recalls?${params.toString()}`;
    return fetchJson(url);
}
export async function getPricing(make, model, year, state) {
    const path = state
        ? `/api/public/pricing/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${year}/${encodeURIComponent(state.toLowerCase())}`
        : `/api/public/pricing/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${year}`;
    return fetchJson(`${getBaseUrl()}${path}`);
}
// Local check-digit validator. No network.
const CD_VALUES = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const CD_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
export function validateVinCheckDigit(rawVin) {
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
    for (let i = 0; i < 17; i++)
        sum += CD_VALUES[vin[i]] * CD_WEIGHTS[i];
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
async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(json.error || `CarWhere API ${res.status}`);
    }
    return json;
}
/** Free pre-purchase check: decodes the VIN and confirms sticker availability. */
export async function precheckVinReport(vin) {
    return postJson(`${getBaseUrl()}/api/vin-report/precheck`, {
        vin: vin.toUpperCase(),
    });
}
/**
 * Create a Stripe Checkout session for the Full VIN Report ($9.99) or the
 * Compare 3 VINs bundle ($19.99). Returns a secure stripe-hosted payment URL
 * the human must open to complete payment — no card data flows through here.
 */
export async function createVinReportCheckout(input) {
    return postJson(`${getBaseUrl()}/api/vin-report/checkout`, {
        ...input,
        source_url: 'mcp',
        utm_source: 'ai-mcp',
    });
}
