export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const key of ['status', 'buy_price', 'sell_price', 'notes'] as const) {
    if (body[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(body[key]);
    }
  }

  if (body.status === 'sold' || body.status === 'abandoned') {
    fields.push(`closed_at = now()`);
  }

  if (fields.length === 0) return NextResponse.json({ error: 'no fields' }, { status: 400 });

  values.push(params.id);
  await query(`UPDATE deals SET ${fields.join(', ')} WHERE id = $${i}`, values);

  // Log
  const deal = await query(`SELECT lead_id FROM deals WHERE id = $1`, [params.id]);
  if (deal.rows.length) {
    await query(
      `INSERT INTO action_log (lead_id, deal_id, action, details) VALUES ($1, $2, $3, $4)`,
      [deal.rows[0].lead_id, params.id, `deal_${body.status || 'updated'}`, JSON.stringify(body)]
    );
  }

  return NextResponse.json({ updated: true });
}
