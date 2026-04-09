export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const SQL = `
DROP TABLE IF EXISTS miq_action_log CASCADE;
DROP TABLE IF EXISTS miq_deals CASCADE;
DROP TABLE IF EXISTS miq_evaluations CASCADE;
DROP TABLE IF EXISTS miq_leads CASCADE;

CREATE TABLE miq_leads (
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
);

CREATE TABLE miq_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES miq_leads(id) ON DELETE CASCADE,
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
);

CREATE TABLE miq_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES miq_leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pursuing',
  buy_price NUMERIC,
  sell_price NUMERIC,
  profit NUMERIC GENERATED ALWAYS AS (
    CASE WHEN sell_price IS NOT NULL AND buy_price IS NOT NULL THEN sell_price - buy_price ELSE NULL END
  ) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE miq_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES miq_leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES miq_deals(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_miq_leads_status ON miq_leads(status);
CREATE INDEX IF NOT EXISTS idx_miq_leads_created ON miq_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_miq_evaluations_lead ON miq_evaluations(lead_id);
CREATE INDEX IF NOT EXISTS idx_miq_evaluations_score ON miq_evaluations(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_miq_deals_status ON miq_deals(status);
CREATE INDEX IF NOT EXISTS idx_miq_action_log_lead ON miq_action_log(lead_id);
`;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-api-key');
  if (auth !== process.env.WEBHOOK_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(SQL);
    await pool.end();
    return NextResponse.json({ success: true, message: 'Migration complete — miq_ tables created' });
  } catch (err: any) {
    await pool.end();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
