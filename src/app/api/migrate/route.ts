export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const STEPS = [
  `CREATE SCHEMA IF NOT EXISTS manifestiq`,
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
  `CREATE TABLE IF NOT EXISTS manifestiq.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    asking_price NUMERIC,
    location TEXT,
    url TEXT,
    raw_json JSONB,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS manifestiq.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES manifestiq.leads(id) ON DELETE CASCADE,
    urgency_score INT,
    profit_potential_score INT,
    flip_ease_score INT,
    risk_score INT,
    total_score INT GENERATED ALWAYS AS (
      COALESCE(urgency_score,0) + COALESCE(profit_potential_score,0) + COALESCE(flip_ease_score,0) - COALESCE(risk_score,0)
    ) STORED,
    estimated_market_value NUMERIC,
    max_buy_price NUMERIC,
    target_sell_price NUMERIC,
    reasoning TEXT,
    model_used TEXT,
    tokens_used INT,
    cost_usd NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS manifestiq.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES manifestiq.leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pursuing',
    buy_price NUMERIC,
    sell_price NUMERIC,
    profit NUMERIC GENERATED ALWAYS AS (
      CASE WHEN sell_price IS NOT NULL AND buy_price IS NOT NULL THEN sell_price - buy_price ELSE NULL END
    ) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS manifestiq.action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES manifestiq.leads(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES manifestiq.deals(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_miq_leads_status ON manifestiq.leads(status)`,
  `CREATE INDEX IF NOT EXISTS idx_miq_leads_created ON manifestiq.leads(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_miq_evals_lead ON manifestiq.evaluations(lead_id)`,
  `CREATE INDEX IF NOT EXISTS idx_miq_evals_score ON manifestiq.evaluations(total_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_miq_deals_status ON manifestiq.deals(status)`,
  `CREATE INDEX IF NOT EXISTS idx_miq_log_lead ON manifestiq.action_log(lead_id)`,
];

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-api-key');
  if (auth !== process.env.WEBHOOK_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const results: string[] = [];
  try {
    for (const step of STEPS) {
      await pool.query(step);
      const label = step.slice(0, 60).replace(/\s+/g, ' ');
      results.push(`✓ ${label}...`);
    }
    await pool.end();
    return NextResponse.json({ success: true, steps: results });
  } catch (err: any) {
    await pool.end();
    return NextResponse.json({ error: err.message, completed: results }, { status: 500 });
  }
}
