/**
 * Thin fetch wrappers around the public CarWhere API.
 * No auth, CORS-enabled, cached server-side.
 */
export declare function getBaseUrl(): string;
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
        engine: {
            cylinders: number | string | null;
            displacementLiters: string | null;
        };
        transmission: string | null;
        plant: {
            city: string | null;
            state: string | null;
            country: string | null;
        };
        vehicleType: string | null;
        manufacturer: string | null;
    };
    pricing: {
        available: true;
        sampleSize: number;
        dataStatus: string;
        averageSellingPrice: number | null;
        averageDiscountPercent: number | null;
        priceBand: {
            low: number;
            typical: number;
            high: number;
        } | null;
        url: string;
        citation: string;
    } | {
        available: false;
        reason: string;
    };
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
    insight: {
        text: string;
        model: string;
        generatedAt: string;
    } | null;
    citation: string;
}
export interface RecallsResponse {
    decoded: {
        make: string;
        model: string;
        year: string;
    };
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
    priceBand: {
        low: number;
        typical: number;
        high: number;
    } | null;
    rebatesIncluded: boolean;
    lastUpdated: string;
    dealTypeSplit: {
        lease: number;
        cashFinance: number;
    };
    topTrims: Array<{
        trim: string;
        dealCount: number;
        avgPrice: number;
        avgDiscount: number;
    }>;
    citation: string;
}
export declare function decodeVin(vin: string, opts?: {
    pricing?: boolean;
    recalls?: boolean;
    insight?: boolean;
}): Promise<VinDecodeResponse>;
export declare function getRecalls(args: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number | string;
}): Promise<RecallsResponse>;
export declare function getPricing(make: string, model: string, year: number, state?: string): Promise<PricingResponse>;
export interface CheckDigitResult {
    vin: string;
    status: 'valid' | 'check-fail' | 'illegal-char' | 'invalid-format';
    expectedDigit?: string;
    actualDigit?: string;
    weightedSum?: number;
    message: string;
}
export declare function validateVinCheckDigit(rawVin: string): CheckDigitResult;
export interface PrecheckResponse {
    vehicle: {
        year: string;
        make: string;
        model: string;
        trim: string | null;
    } | null;
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
/** Free pre-purchase check: decodes the VIN and confirms sticker availability. */
export declare function precheckVinReport(vin: string): Promise<PrecheckResponse>;
/**
 * Create a Stripe Checkout session for the Full VIN Report ($9.99) or the
 * Compare 3 VINs bundle ($19.99). Returns a secure stripe-hosted payment URL
 * the human must open to complete payment — no card data flows through here.
 */
export declare function createVinReportCheckout(input: {
    vin: string;
    email: string;
    vins?: string[];
    productType?: 'full_report' | 'compare_3';
}): Promise<CheckoutResponse>;
