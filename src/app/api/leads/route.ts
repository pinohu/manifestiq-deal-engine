export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getScoreQueue } from '@/lib/queue';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source, title, description, asking_price, location, url, raw_json } = body;

    if (!title || !source) {
      return NextResponse.json({ error: 'title and source are required' }, { status: 400 });
    }

    // Generate idempotency key
    const hash = crypto
      .createHash('sha256')
      .update(`${source}|${title}|${asking_price || ''}|${new Date().toISOString().slice(0, 10)}`)
      .digest('hex')
      .slice(0, 16);
    const idempotencyKey = `${source}-${hash}`;

    // Insert lead (ON CONFLICT = skip duplicate)
    const res = await query(
      `INSERT INTO leads (source, title, description, asking_price, location, url, raw_json, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [source, title, description || null, asking_price || null, location || null, url || null, raw_json ? JSON.stringify(raw_json) : null, idempotencyKey]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ message: 'duplicate_lead', idempotency_key: idempotencyKey }, { status: 200 });
    }

    const leadId = res.rows[0].id;

    // Enqueue for scoring
    const scoreQueue = getScoreQueue();
    await scoreQueue.add('score', { leadId }, { jobId: `score-${leadId}` });

    return NextResponse.json({ id: leadId, status: 'queued_for_scoring' }, { status: 201 });
  } catch (err: any) {
    console.error('[API] POST /api/leads error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const minScore = searchParams.get('min_score');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let sql = `
      SELECT l.*, e.urgency_score, e.profit_potential_score, e.flip_ease_score, e.risk_score,
             e.total_score, e.estimated_market_value, e.max_buy_price, e.target_sell_price, e.reasoning,
             e.cost_usd, d.id as deal_id, d.status as deal_status
      FROM leads l
      LEFT JOIN LATERAL (SELECT * FROM evaluations WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) e ON true
      LEFT JOIN LATERAL (SELECT id, status FROM deals WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) d ON true
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    if (minScore) {
      params.push(parseInt(minScore));
      conditions.push(`e.total_score >= $${params.length}`);
    }

    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY l.created_at DESC`;
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const res = await query(sql, params);
    return NextResponse.json({ leads: res.rows, count: res.rowCount });
  } catch (err: any) {
    console.error('[API] GET /api/leads error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
