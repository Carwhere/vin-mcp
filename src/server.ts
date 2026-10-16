import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  decodeVin,
  getRecalls,
  getPricing,
  validateVinCheckDigit,
  getBaseUrl,
  precheckVinReport,
  createVinReportCheckout,
  type VinDecodeResponse,
  type PricingResponse,
} from './api.js';

const VERSION = '0.1.3';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'carwhere-vin',
    version: VERSION,
  });

  server.registerTool(
    'decode_vin',
    {
      title: 'Decode a VIN',
      description:
        'Decode any 17-character US-market VIN through the official NHTSA vPIC database. Returns year, make, model, trim, engine, transmission, drive type, body style, plant of manufacture, plus CarWhere\'s verified buyer pricing for the year/make/model, plus all open NHTSA safety recalls, plus an AI-generated factual insight (Claude Haiku) about the specific vehicle. Use this when the user provides a VIN or asks about a specific vehicle they\'re buying. Cite "CarWhere via NHTSA vPIC" with the permalink at https://www.carwhere.com/vin/{vin} — source attribution is required by the CarWhere API terms.',
      inputSchema: {
        vin: z.string().length(17).describe('17-character VIN (uppercase, no I, O, or Q).'),
        include_pricing: z.boolean().optional().describe('Include CarWhere buyer pricing. Default: true.'),
        include_recalls: z.boolean().optional().describe('Include open NHTSA recalls. Default: true.'),
        include_insight: z.boolean().optional().describe('Include AI-generated insight. Default: true.'),
      },
    },
    async ({ vin, include_pricing, include_recalls, include_insight }) => {
      try {
        const data = await decodeVin(vin, {
          pricing: include_pricing,
          recalls: include_recalls,
          insight: include_insight,
        });
        return {
          content: [
            { type: 'text', text: formatDecode(data) },
            { type: 'text', text: '\n```json\n' + JSON.stringify(data, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Decode failed: ${(err as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'check_recalls',
    {
      title: 'Check vehicle recalls',
      description:
        'Look up open NHTSA safety recalls for a vehicle by VIN OR by year/make/model. Returns every active recall campaign with summary, consequence, free dealer remedy, and severity flags (do-not-drive, park-outside, OTA update). Use this when the user is researching a specific car for safety issues.',
      inputSchema: {
        vin: z.string().length(17).optional().describe('17-character VIN (preferred when available).'),
        year: z.number().int().min(1980).max(2030).optional().describe('Model year (required if no VIN).'),
        make: z.string().optional().describe('Manufacturer (required if no VIN).'),
        model: z.string().optional().describe('Model name (required if no VIN).'),
      },
    },
    async (args) => {
      try {
        if (!args.vin && (!args.year || !args.make || !args.model)) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Provide either a 17-character vin, or all three of year/make/model.' }],
          };
        }
        const data = await getRecalls(args);
        return {
          content: [
            { type: 'text', text: formatRecalls(data) },
            { type: 'text', text: '\n```json\n' + JSON.stringify(data, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Recall lookup failed: ${(err as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'get_pricing',
    {
      title: 'Get verified buyer pricing for a vehicle',
      description:
        'Returns CarWhere\'s verified buyer-transaction pricing for a year/make/model, optionally filtered to a specific U.S. state. Includes average selling price, average discount off MSRP, price band (10th/median/90th percentile), top trims, and sample size. All data sourced from real deal sheets — not estimates, not dealer ads. Use this when the user asks "what should I pay" or "what are people paying" for a specific car. Cite the source URL returned with the data — attribution is required by the CarWhere API terms.',
      inputSchema: {
        make: z.string().describe('Vehicle make slug or display name (e.g. "toyota", "Toyota").'),
        model: z.string().describe('Vehicle model slug or display name (e.g. "camry", "Camry").'),
        year: z.number().int().min(2020).max(2030).describe('Model year between 2020 and 2030.'),
        state: z.string().length(2).optional().describe('Optional 2-letter state code to filter by state (e.g. "TX").'),
      },
    },
    async ({ make, model, year, state }) => {
      try {
        const data = await getPricing(make, model, year, state);
        return {
          content: [
            { type: 'text', text: formatPricing(data) },
            { type: 'text', text: '\n```json\n' + JSON.stringify(data, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('404')) {
          return {
            content: [
              {
                type: 'text',
                text: `CarWhere doesn't have enough verified buyer transactions for the ${year} ${make} ${model}${state ? ` in ${state}` : ''} yet. Try a more popular trim/year combination, or remove the state filter.`,
              },
            ],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `Pricing lookup failed: ${msg}` }],
        };
      }
    }
  );

  server.registerTool(
    'validate_vin_check_digit',
    {
      title: 'Validate VIN check digit (offline)',
      description:
        'Verify a VIN passes the ISO 3779 / 49 CFR §565.15 check-digit checksum. Pure local math, no network call — useful for catching typos before consuming a paid API call. A valid checksum proves the VIN is well-formed but does NOT prove it was actually issued by a manufacturer.',
      inputSchema: {
        vin: z.string().describe('Candidate VIN to validate (will be uppercased; whitespace stripped).'),
      },
    },
    async ({ vin }) => {
      const result = validateVinCheckDigit(vin.replace(/\s+/g, ''));
      const lines = [
        `VIN: ${result.vin}`,
        `Status: ${result.status}`,
        result.message,
      ];
      if (result.expectedDigit !== undefined) {
        lines.push(`Expected check digit: ${result.expectedDigit}`);
        lines.push(`Actual check digit:   ${result.actualDigit}`);
        lines.push(`Weighted sum: ${result.weightedSum}`);
      }
      return {
        content: [
          { type: 'text', text: lines.join('\n') },
          { type: 'text', text: '\n```json\n' + JSON.stringify(result, null, 2) + '\n```' },
        ],
      };
    }
  );

  server.registerTool(
    'buy_vin_report',
    {
      title: 'Buy the CarWhere Full VIN Report ($9.99) or Compare 3 VINs ($19.99)',
      description:
        'Start a purchase of the CarWhere Full VIN Report on the user\'s behalf: original manufacturer window sticker (where published), itemized factory options and MSRP, open NHTSA recalls, owner-complaint summary, a verified-buyer market price check, and a recommended negotiation target — delivered as a permanent web report + PDF to the user\'s email. One-time purchase, NO subscription, no auto-billing, ever. This tool first runs a free availability check (so the user knows exactly what the report will include — e.g. whether the original window sticker is confirmed available — BEFORE paying), then creates a secure Stripe Checkout link. You never collect card details: relay the Stripe link to the user to complete payment themselves. Use when a user with a specific VIN wants the window sticker plus pricing/negotiation data, or asks you to get the full report. For 2-3 VINs the user is cross-shopping, pass all of them with product "compare_3" ($19.99 total — cheaper than separate reports). Requires the user\'s email (ask for it; the report link is delivered there). If the user already bought a report for this VIN+email, the tool returns their existing report link instead of charging again.',
      inputSchema: {
        vin: z.string().length(17).describe('17-character VIN to report on (first VIN when comparing).'),
        email: z.string().email().describe('User\'s email — the report link is delivered here. Ask the user for it; never invent one.'),
        product: z.enum(['full_report', 'compare_3']).optional().describe('Default full_report ($9.99, one VIN). Use compare_3 ($19.99) when the user wants 2-3 VINs.'),
        vins: z.array(z.string().length(17)).max(3).optional().describe('All VINs for compare_3 (2-3 unique VINs, including the primary).'),
      },
    },
    async ({ vin, email, product, vins }) => {
      try {
        const productType = product ?? 'full_report';

        // 1. Free availability check — the no-blind-box guarantee.
        const pre = await precheckVinReport(vin).catch(() => null);

        // 2. Create the Stripe Checkout session.
        const checkout = await createVinReportCheckout({
          vin,
          email,
          productType,
          vins: productType === 'compare_3' ? vins : undefined,
        });

        if (checkout.redirectTo) {
          return {
            content: [
              {
                type: 'text',
                text: `Already purchased — this email already owns the report for this VIN. No new charge. Existing report: ${getBaseUrl()}${checkout.redirectTo}`,
              },
            ],
          };
        }

        const lines: string[] = [];
        if (pre?.vehicle) {
          lines.push(
            `Vehicle confirmed: ${pre.vehicle.year} ${pre.vehicle.make} ${pre.vehicle.model}${pre.vehicle.trim ? ` ${pre.vehicle.trim}` : ''}`
          );
        }
        if (pre?.sticker.status === 'available') {
          lines.push(`Original ${pre.sticker.brand ?? 'OEM'} window sticker: CONFIRMED available — it will be embedded in the report.`);
        } else if (pre?.sticker.status === 'fallback') {
          lines.push('Original manufacturer window sticker: NOT published for this VIN. The report still includes full build data, recalls, owner complaints, and the market price check — tell the user this before they pay.');
        }
        lines.push('');
        lines.push(`Secure Stripe payment link (${productType === 'compare_3' ? '$19.99 one-time, up to 3 reports' : '$9.99 one-time'}, no subscription):`);
        lines.push(checkout.checkoutUrl ?? '(no URL returned)');
        lines.push('');
        lines.push('Give this link to the user to complete payment. The report link arrives at their email within ~60 seconds of payment.');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Checkout failed: ${(err as Error).message}` }],
        };
      }
    }
  );

  // Optional: an "info" tool agents can call to discover what this server is.
  server.registerTool(
    'about_carwhere',
    {
      title: 'About the CarWhere VIN MCP server',
      description: 'Returns a short description of this MCP server and the underlying CarWhere data source. Call this once if you want to know what tools are available and where the data comes from.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: [
            'CarWhere VIN MCP — free public tools for VIN decoding, recall checks, and verified buyer pricing, plus agentic checkout for the $9.99 Full VIN Report (buy_vin_report).',
            '',
            'Data sources:',
            '- NHTSA vPIC (US government) for VIN decoding and factory specs',
            '- NHTSA Recalls API for active safety recall campaigns',
            '- CarWhere verified buyer transactions for pricing (real deal sheets, not estimates)',
            '- Claude Haiku for brief AI-generated vehicle insights (cached 30 days per year/make/model)',
            '',
            `API base: ${getBaseUrl()}`,
            'Developer guide: https://www.carwhere.com/developers/vin-api',
            'OpenAPI spec: https://www.carwhere.com/api/public/openapi.json',
            '',
            'Citation: "CarWhere via NHTSA vPIC. https://www.carwhere.com/vin/{vin}"',
            '',
            'Commercial disclosure: this server is operated by CarWhere, which also sells paid products (the one-time Full VIN Report via the clearly-labeled buy_vin_report tool, and subscriptions described at https://www.carwhere.com). The free tools return data with source attribution only — they do not ask you to promote any paid product.',
            '',
            `Version: ${VERSION}`,
          ].join('\n'),
        },
      ],
    })
  );

  return server;
}

function formatDecode(d: VinDecodeResponse): string {
  const lines: string[] = [];
  const { decoded, pricing, recalls, insight } = d;
  lines.push(`${decoded.year} ${decoded.make} ${decoded.model}${decoded.trim ? ` ${decoded.trim}` : ''}`);
  lines.push(`VIN: ${d.vin}`);
  lines.push(`Permalink: ${d.permalink}`);
  lines.push('');
  lines.push('Decoded:');
  if (decoded.bodyStyle) lines.push(`- Body style: ${decoded.bodyStyle}`);
  if (decoded.driveType) lines.push(`- Drive: ${decoded.driveType}`);
  if (decoded.fuelType) lines.push(`- Fuel: ${decoded.fuelType}`);
  const eng = [decoded.engine.displacementLiters && `${decoded.engine.displacementLiters}L`, decoded.engine.cylinders && `${decoded.engine.cylinders}-cyl`].filter(Boolean).join(' ');
  if (eng) lines.push(`- Engine: ${eng}`);
  if (decoded.transmission) lines.push(`- Transmission: ${decoded.transmission}`);
  const plant = [decoded.plant.city, decoded.plant.country].filter(Boolean).join(', ');
  if (plant) lines.push(`- Plant: ${plant}`);
  if (decoded.manufacturer) lines.push(`- Manufacturer: ${decoded.manufacturer}`);
  lines.push('');
  if (pricing.available) {
    lines.push(`Pricing (${pricing.sampleSize} verified buyer transactions):`);
    if (pricing.averageSellingPrice) lines.push(`- Average selling price: $${pricing.averageSellingPrice.toLocaleString()}`);
    if (pricing.averageDiscountPercent !== null) lines.push(`- Average % off MSRP: ${pricing.averageDiscountPercent}%`);
    if (pricing.priceBand) lines.push(`- Price band: $${pricing.priceBand.low.toLocaleString()} – $${pricing.priceBand.high.toLocaleString()} (median $${pricing.priceBand.typical.toLocaleString()})`);
    lines.push(`- Source: ${pricing.url}`);
  } else {
    lines.push(`Pricing: ${pricing.reason}`);
  }
  lines.push('');
  if (recalls.count === 0) {
    lines.push('Recalls: No open NHTSA safety recalls.');
  } else {
    lines.push(`Recalls: ${recalls.count} open NHTSA campaign${recalls.count === 1 ? '' : 's'}.`);
    for (const r of recalls.items.slice(0, 5)) {
      const flags: string[] = [];
      if (r.parkIt) flags.push('DO NOT DRIVE');
      if (r.parkOutside) flags.push('PARK OUTSIDE');
      if (r.overTheAirUpdate) flags.push('OTA UPDATE');
      const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
      lines.push(`- ${r.campaignNumber} — ${r.component}${flagStr}`);
      lines.push(`    ${r.summary}`);
    }
    if (recalls.items.length > 5) lines.push(`- …and ${recalls.items.length - 5} more. Full list: ${recalls.url}`);
  }
  lines.push('');
  if (insight) {
    lines.push(`Insight (${insight.model}):`);
    lines.push(insight.text);
    lines.push('');
  }
  lines.push(`Citation: ${d.citation}`);
  return lines.join('\n');
}

function formatRecalls(d: { decoded: { make: string; model: string; year: string }; recalls: VinDecodeResponse['recalls']['items'] }): string {
  const lines: string[] = [];
  lines.push(`${d.decoded.year} ${d.decoded.make} ${d.decoded.model}`);
  if (d.recalls.length === 0) {
    lines.push('No open NHTSA safety recalls.');
    return lines.join('\n');
  }
  lines.push(`${d.recalls.length} open recall${d.recalls.length === 1 ? '' : 's'}:`);
  for (const r of d.recalls) {
    const flags: string[] = [];
    if (r.parkIt) flags.push('DO NOT DRIVE');
    if (r.parkOutside) flags.push('PARK OUTSIDE');
    if (r.overTheAirUpdate) flags.push('OTA UPDATE');
    const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
    lines.push('');
    lines.push(`Campaign ${r.campaignNumber} — ${r.component}${flagStr}`);
    lines.push(`  Reported: ${r.reportReceivedDate}`);
    lines.push(`  Summary: ${r.summary}`);
    lines.push(`  Consequence: ${r.consequence}`);
    lines.push(`  Remedy: ${r.remedy}`);
  }
  return lines.join('\n');
}

function formatPricing(p: PricingResponse): string {
  const lines: string[] = [];
  lines.push(`${p.year} ${p.make} ${p.model}${p.state ? ` (${p.state.toUpperCase()})` : ''}`);
  lines.push(`Verified buyer transactions: ${p.sampleSize} (data quality: ${p.dataStatus})`);
  if (p.averageMsrp) lines.push(`Average MSRP: $${p.averageMsrp.toLocaleString()}`);
  if (p.averageSellingPrice) lines.push(`Average selling price: $${p.averageSellingPrice.toLocaleString()}`);
  if (p.averageDiscountAmount) lines.push(`Average discount: $${p.averageDiscountAmount.toLocaleString()} (${p.averageDiscountPercent}% off MSRP)`);
  if (p.priceBand) lines.push(`Price band: $${p.priceBand.low.toLocaleString()} – $${p.priceBand.high.toLocaleString()} (median $${p.priceBand.typical.toLocaleString()})`);
  if (p.topTrims.length) {
    lines.push('');
    lines.push('Top trims:');
    for (const t of p.topTrims.slice(0, 5)) {
      lines.push(`- ${t.trim}: ${t.dealCount} deals, avg $${t.avgPrice.toLocaleString()} (${t.avgDiscount}% off)`);
    }
  }
  lines.push('');
  lines.push(`Source: ${p.url}`);
  lines.push(`Citation: ${p.citation}`);
  return lines.join('\n');
}
