export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { isQueueAvailable, getScoreQueue } from '@/lib/queue';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-api-key');
  if (auth !== process.env.WEBHOOK_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const miq_leads = Array.isArray(body) ? body : [body];
    const results: any[] = [];

    for (const item of miq_leads) {
      const title = item.title || item.name || item.subject || '';
      const source = item.source || 'webhook';
      if (!title) continue;

      const hash = crypto.createHash('sha256')
        .update(`${source}|${title}|${item.asking_price || item.price || ''}|${new Date().toISOString().slice(0, 10)}`)
        .digest('hex').slice(0, 16);

      const res = await query(
        `INSERT INTO miq_leads (source, title, description, asking_price, location, url, raw_json, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [source, title, item.description || null, item.asking_price || item.price || null,
         item.location || null, item.url || item.link || null, JSON.stringify(item), `${source}-${hash}`]
      );

      if (res.rows.length) {
        if (isQueueAvailable()) {
          try {
            const scoreQueue = getScoreQueue();
            await scoreQueue.add('score', { leadId: res.rows[0].id }, { jobId: `score-${res.rows[0].id}` });
          } catch { /* no redis */ }
        }
        results.push({ id: res.rows[0].id, status: 'queued' });
      } else {
        results.push({ title, status: 'duplicate' });
      }
    }

    return NextResponse.json({ processed: results.length, results }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
