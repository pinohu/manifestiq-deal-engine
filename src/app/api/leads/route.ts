export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { isQueueAvailable, getScoreQueue } from '@/lib/queue';
import { scoreLead } from '@/lib/scorer';
import crypto from 'crypto';

async function scoreLeadSync(leadId: string) {
  try {
    const leadRes = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadRes.rows.length === 0) return;
    const lead = leadRes.rows[0];

    const { result, model, tokens, cost } = await scoreLead({
      title: lead.title,
      description: lead.description,
      asking_price: lead.asking_price,
      location: lead.location,
      source: lead.source,
    });

    await query(
      `INSERT INTO evaluations (lead_id, urgency_score, profit_potential_score, flip_ease_score, risk_score,
        estimated_market_value, max_buy_price, target_sell_price, reasoning, model_used, tokens_used, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [leadId, result.urgency_score, result.profit_potential_score, result.flip_ease_score, result.risk_score,
       result.estimated_market_value, result.max_buy_price, result.target_sell_price, result.reasoning, model, tokens, cost]
    );

    await query(`UPDATE leads SET status = 'scored' WHERE id = $1`, [leadId]);
    await query(`INSERT INTO action_log (lead_id, action, details) VALUES ($1, 'scored', $2)`,
      [leadId, JSON.stringify({ total_score: result.urgency_score + result.profit_potential_score + result.flip_ease_score - result.risk_score, cost, mode: 'sync' })]
    );
  } catch (err) {
    console.error('[SCORE_SYNC] Error:', err);
    // Lead stays in 'new' status — can be retried
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source, title, description, asking_price, location, url, raw_json } = body;

    if (!title || !source) {
      return NextResponse.json({ error: 'title and source are required' }, { status: 400 });
    }

    const hash = crypto.createHash('sha256')
      .update(`${source}|${title}|${asking_price || ''}|${new Date().toISOString().slice(0, 10)}`)
      .digest('hex').slice(0, 16);
    const idempotencyKey = `${source}-${hash}`;

    const res = await query(
      `INSERT INTO leads (source, title, description, asking_price, location, url, raw_json, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [source, title, description || null, asking_price || null, location || null, url || null,
       raw_json ? JSON.stringify(raw_json) : null, idempotencyKey]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ message: 'duplicate_lead', idempotency_key: idempotencyKey }, { status: 200 });
    }

    const leadId = res.rows[0].id;

    // Queue if Redis available, otherwise score synchronously
    if (isQueueAvailable()) {
      try {
        const scoreQueue = getScoreQueue();
        await scoreQueue.add('score', { leadId }, { jobId: `score-${leadId}` });
        return NextResponse.json({ id: leadId, status: 'queued_for_scoring' }, { status: 201 });
      } catch {
        // Redis failed — fall through to sync
      }
    }

    // Sync scoring (works without Redis, needs ANTHROPIC_API_KEY)
    if (process.env.ANTHROPIC_API_KEY) {
      // Fire and don't await — return immediately, score in background
      // In serverless we need to await or the function exits
      await scoreLeadSync(leadId);
      return NextResponse.json({ id: leadId, status: 'scored' }, { status: 201 });
    }

    return NextResponse.json({ id: leadId, status: 'created_pending_scoring' }, { status: 201 });
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

    if (status) { params.push(status); conditions.push(`l.status = $${params.length}`); }
    if (minScore) { params.push(parseInt(minScore)); conditions.push(`e.total_score >= $${params.length}`); }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

    sql += ` ORDER BY l.created_at DESC`;
    params.push(limit); sql += ` LIMIT $${params.length}`;
    params.push(offset); sql += ` OFFSET $${params.length}`;

    const res = await query(sql, params);
    return NextResponse.json({ leads: res.rows, count: res.rowCount });
  } catch (err: any) {
    console.error('[API] GET /api/leads error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
