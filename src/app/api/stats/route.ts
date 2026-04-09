export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const [leadsR, scoredR, dealsR, closedR, profitR, llmR, todayR] = await Promise.all([
    query(`SELECT COUNT(*) as c FROM miq_leads`),
    query(`SELECT COUNT(*) as c FROM miq_evaluations`),
    query(`SELECT COUNT(*) as c FROM miq_deals`),
    query(`SELECT COUNT(*) as c FROM miq_deals WHERE status = 'sold'`),
    query(`SELECT COALESCE(SUM(sell_price - buy_price), 0) as total FROM miq_deals WHERE status = 'sold' AND sell_price IS NOT NULL AND buy_price IS NOT NULL`),
    query(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM miq_evaluations`),
    query(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM miq_evaluations WHERE created_at >= CURRENT_DATE`),
  ]);

  return NextResponse.json({
    total_leads: parseInt(leadsR.rows[0].c),
    total_scored: parseInt(scoredR.rows[0].c),
    total_deals: parseInt(dealsR.rows[0].c),
    deals_closed: parseInt(closedR.rows[0].c),
    total_profit: parseFloat(profitR.rows[0].total),
    total_llm_cost: parseFloat(llmR.rows[0].total),
    today_llm_cost: parseFloat(todayR.rows[0].total),
  });
}
