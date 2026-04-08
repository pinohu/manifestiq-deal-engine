# ManifestIQ Deal Engine

LLM-powered liquidation deal scoring and tracking. Paste listings, get instant scoring with buy/sell price recommendations, track deals through acquisition to sale.

## Stack

- **Next.js 14** — Dashboard + API routes
- **BullMQ + Redis** — Job queue for async scoring
- **Neon Postgres** — Persistent storage
- **Claude Sonnet 4** — Deal evaluation via Anthropic API
- **Tailwind CSS** — UI styling

## Quick Start

```bash
# Install
npm install

# Copy env and configure
cp .env.example .env.local

# Run database migration
npm run db:migrate

# Start the dashboard (separate terminal)
npm run dev

# Start the worker (separate terminal)
npm run worker
```

## Architecture

```
Lead Sources → POST /api/leads → BullMQ (lead.score) → Claude API → Postgres
                                                              ↓
                                              Score >= 15 → lead.alert → Webhook/SMS
```

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/leads` | Create lead + enqueue scoring |
| GET | `/api/leads` | List leads (filter by status, min_score) |
| GET | `/api/leads/:id` | Get lead + evaluation |
| PATCH | `/api/leads/:id` | Update lead status |
| POST | `/api/deals` | Create deal from lead |
| GET | `/api/deals` | List all deals |
| PATCH | `/api/deals/:id` | Update deal (buy_price, sell_price, status) |
| GET | `/api/stats` | Dashboard statistics |
| POST | `/api/webhook` | n8n/external lead ingestion (requires x-api-key header) |

## n8n Integration

POST leads to `/api/webhook` with header `x-api-key: <your-key>`:

```json
{
  "source": "facebook_marketplace",
  "title": "Dyson V15 — must go today",
  "description": "Barely used, moving this weekend",
  "asking_price": 150,
  "location": "Erie, PA",
  "url": "https://..."
}
```

## Cost Controls

- Daily LLM budget (default $5/day) — worker auto-pauses when reached
- Per-lead cost tracked in evaluations table
- Stats endpoint shows today's spend vs budget

## License

Proprietary — Dynasty Empire LLC
