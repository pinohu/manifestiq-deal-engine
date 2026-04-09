import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import IORedis from 'ioredis';
import { scoreLead } from '../lib/scorer';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

pool.on('connect', (client) => {
  client.query('SET search_path TO manifestiq, public');
});

const SCORE_THRESHOLD = parseInt(process.env.SCORE_THRESHOLD || '15', 10);
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_LLM_BUDGET || '5');

async function getDailySpend(): Promise<number> {
  const res = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM miq_evaluations WHERE created_at >= CURRENT_DATE`
  );
  return parseFloat(res.rows[0].total);
}

// --- Score Worker ---
const scoreWorker = new Worker(
  'lead.score',
  async (job: Job) => {
    const { leadId } = job.data;

    // Budget guard
    const spent = await getDailySpend();
    if (spent >= DAILY_BUDGET_USD) {
      console.log(`[BUDGET] Daily limit $${DAILY_BUDGET_USD} reached (spent: $${spent.toFixed(4)}). Skipping.`);
      return { skipped: true, reason: 'budget_exceeded' };
    }

    // Fetch lead
    const leadRes = await pool.query('SELECT * FROM miq_leads WHERE id = $1', [leadId]);
    if (leadRes.rows.length === 0) throw new Error(`Lead ${leadId} not found`);
    const lead = leadRes.rows[0];

    console.log(`[SCORE] Scoring lead: ${lead.title}`);

    // Call Claude
    const { result, model, tokens, cost } = await scoreLead({
      title: lead.title,
      description: lead.description,
      asking_price: lead.asking_price,
      location: lead.location,
      source: lead.source,
    });

    // Insert evaluation
    await pool.query(
      `INSERT INTO miq_evaluations (lead_id, urgency_score, profit_potential_score, flip_ease_score, risk_score,
        estimated_market_value, max_buy_price, target_sell_price, reasoning, model_used, tokens_used, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        leadId,
        result.urgency_score,
        result.profit_potential_score,
        result.flip_ease_score,
        result.risk_score,
        result.estimated_market_value,
        result.max_buy_price,
        result.target_sell_price,
        result.reasoning,
        model,
        tokens,
        cost,
      ]
    );

    // Update lead status
    await pool.query(`UPDATE miq_leads SET status = 'scored' WHERE id = $1`, [leadId]);

    // Log action
    await pool.query(
      `INSERT INTO miq_action_log (lead_id, action, details) VALUES ($1, 'scored', $2)`,
      [leadId, JSON.stringify({ total_score: result.urgency_score + result.profit_potential_score + result.flip_ease_score - result.risk_score, cost })]
    );

    const totalScore = result.urgency_score + result.profit_potential_score + result.flip_ease_score - result.risk_score;
    console.log(`[SCORE] ${lead.title} → score=${totalScore}, cost=$${cost.toFixed(4)}`);

    // Enqueue alert if hot
    if (totalScore >= SCORE_THRESHOLD) {
      const { Queue } = await import('bullmq');
      const alertQueue = new Queue('lead.alert', { connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }) });
      await alertQueue.add('alert', { leadId, totalScore }, { jobId: `alert-${leadId}` });
      await alertQueue.close();
    }

    return { scored: true, totalScore, cost };
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 5, duration: 10000 }, // 5 jobs per 10s
  }
);

// --- Alert Worker ---
const alertWorker = new Worker(
  'lead.alert',
  async (job: Job) => {
    const { leadId, totalScore } = job.data;

    const res = await pool.query(
      `SELECT l.*, e.estimated_market_value, e.max_buy_price, e.target_sell_price, e.reasoning, e.total_score
       FROM miq_leads l JOIN miq_evaluations e ON e.lead_id = l.id WHERE l.id = $1 ORDER BY e.created_at DESC LIMIT 1`,
      [leadId]
    );
    if (res.rows.length === 0) return;
    const row = res.rows[0];

    const message = `🔥 HOT DEAL (score: ${row.total_score})\n${row.title}\nAsking: $${row.asking_price || '?'} | Buy under: $${row.max_buy_price} | Sell at: $${row.target_sell_price}\n${row.reasoning}\n${row.url || ''}`;

    // Send via webhook if configured
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, lead_id: leadId }),
        });
        console.log(`[ALERT] Sent webhook for lead ${leadId}`);
      } catch (err) {
        console.error(`[ALERT] Webhook failed:`, err);
      }
    }

    // Log
    await pool.query(
      `INSERT INTO miq_action_log (lead_id, action, details) VALUES ($1, 'alert_sent', $2)`,
      [leadId, JSON.stringify({ total_score: totalScore, channel: webhookUrl ? 'webhook' : 'console' })]
    );

    console.log(`[ALERT] ${message}`);
  },
  { connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 1 }
);

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down workers...');
  await scoreWorker.close();
  await alertWorker.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[WORKER] ManifestIQ Deal Engine workers started`);
console.log(`[WORKER] Score threshold: ${SCORE_THRESHOLD} | Daily budget: $${DAILY_BUDGET_USD}`);
