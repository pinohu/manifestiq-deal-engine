export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await query(
    `SELECT l.*, e.urgency_score, e.profit_potential_score, e.flip_ease_score, e.risk_score,
            e.total_score, e.estimated_market_value, e.max_buy_price, e.target_sell_price, e.reasoning,
            e.model_used, e.tokens_used, e.cost_usd
     FROM miq_leads l
     LEFT JOIN LATERAL (SELECT * FROM miq_evaluations WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) e ON true
     WHERE l.id = $1`,
    [params.id]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status } = body;
  if (status) {
    await query(`UPDATE miq_leads SET status = $1 WHERE id = $2`, [status, params.id]);
  }
  return NextResponse.json({ updated: true });
}
