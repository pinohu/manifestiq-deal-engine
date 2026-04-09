export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { lead_id, notes } = await req.json();
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const res = await query(
    `INSERT INTO miq_deals (lead_id, notes) VALUES ($1, $2) RETURNING *`,
    [lead_id, notes || null]
  );

  await query(`UPDATE miq_leads SET status = 'actioned' WHERE id = $1`, [lead_id]);
  await query(
    `INSERT INTO miq_action_log (lead_id, deal_id, action) VALUES ($1, $2, 'deal_created')`,
    [lead_id, res.rows[0].id]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}

export async function GET() {
  const res = await query(`
    SELECT d.*, l.title, l.asking_price, l.source, l.url,
           e.total_score, e.max_buy_price, e.target_sell_price
    FROM miq_deals d
    JOIN miq_leads l ON l.id = d.lead_id
    LEFT JOIN LATERAL (SELECT * FROM miq_evaluations WHERE lead_id = d.lead_id ORDER BY created_at DESC LIMIT 1) e ON true
    ORDER BY d.created_at DESC
  `);
  return NextResponse.json({ deals: res.rows });
}
