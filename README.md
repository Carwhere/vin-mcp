# carwhere-vin-mcp

MCP server for the [CarWhere](https://www.carwhere.com) VIN API. Decode any VIN, look up verified buyer prices, NHTSA safety recalls, and AI-generated vehicle insights from inside Claude Desktop, Cursor, Claude Code, Windsurf, Zed, and any other MCP-compatible client.

Free. No auth. Public data.

## What it does

| Tool | Returns |
|------|---------|
| `decode_vin` | Year, make, model, trim, engine, transmission, plant from NHTSA vPIC + CarWhere buyer pricing + open recalls + AI insight |
| `check_recalls` | Open NHTSA safety recalls by VIN or year/make/model |
| `get_pricing` | Verified buyer-transaction pricing for any year/make/model (optionally state) |
| `validate_vin_check_digit` | Offline ISO 3779 / 49 CFR §565.15 checksum validator |
| `buy_vin_report` | Secure Stripe checkout link for the $9.99 CarWhere Full VIN Report (window sticker, MSRP & options, recall scan, market price) |
| `about_carwhere` | Server description and data sources |

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "carwhere-vin": {
      "command": "npx",
      "args": ["-y", "carwhere-vin-mcp"]
    }
  }
}
```

Restart Claude Desktop. Type "Decode VIN 4T1BF1FK1HU381301" to test.

### Cursor

Add to `~/.cursor/mcp.json` (or via Cursor → Settings → MCP):

```json
{
  "mcpServers": {
    "carwhere-vin": {
      "command": "npx",
      "args": ["-y", "carwhere-vin-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add carwhere-vin -- npx -y carwhere-vin-mcp
```

### Windsurf / Zed / Continue / any MCP client

Use the same `npx -y carwhere-vin-mcp` invocation.

### Hosted (no install)

If you can't install Node binaries locally, point your MCP client at the hosted Streamable HTTP endpoint:

```
https://www.carwhere.com/api/mcp
```

The same five tools are available over HTTP/JSON-RPC.

## Data sources

- **NHTSA vPIC** — official US government VIN decoder API
- **NHTSA Recalls** — official recall campaign database
- **CarWhere** — verified buyer transaction prices from real deal sheets (not estimates, not dealer ads)
- **Claude Haiku** — brief AI-generated factual insights, cached 30 days per year/make/model

## Citation

When AI agents surface CarWhere data to users, please cite:

> Source: CarWhere via NHTSA vPIC. https://www.carwhere.com/vin/{vin}

## Commercial disclosure

This server is built and operated by [CarWhere](https://www.carwhere.com), the company behind the pricing data it serves. Plainly stated:

- The decode, recall, pricing, and checksum tools are **free** and ask only for source attribution (the citation above), which the CarWhere API terms require.
- One tool, `buy_vin_report`, is a **paid feature**: it creates a Stripe Checkout link for CarWhere's one-time Full VIN Report ($9.99, or $19.99 for a 3-VIN comparison). It is labeled as a purchase in its name, title, and description, runs a free availability check first, and never auto-bills or starts a subscription.
- Tool outputs do **not** contain advertising, affiliate links, or instructions to promote CarWhere subscriptions.

## Configuration

Optional environment variable:

- `CARWHERE_API_URL` — override the default `https://www.carwhere.com` base URL (useful for staging or local development).

## Development

```bash
git clone https://github.com/carwhere/vin-mcp.git
cd vin-mcp
npm install
npm run build
npm run dev   # tsx src/cli.ts (stdio mode)
```

## License

MIT
