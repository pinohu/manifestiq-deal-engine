export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const [leads, scored, deals, closed, profit, llmCost, todayCost] = await Promise.all([
    query(`SELECT COUNT(*) as c FROM leads`),
    query(`SELECT COUNT(*) as c FROM evaluations`),
    query(`SELECT COUNT(*) as c FROM deals`),
    query(`SELECT COUNT(*) as c FROM deals WHERE status = 'sold'`),
    query(`SELECT COALESCE(SUM(sell_price - buy_price), 0) as total FROM deals WHERE status = 'sold' AND sell_price IS NOT NULL AND buy_price IS NOT NULL`),
    query(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM evaluations`),
    query(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM evaluations WHERE created_at >= CURRENT_DATE`),
  ]);

  return NextResponse.json({
    total_leads: parseInt(leads.rows[0].c),
    total_scored: parseInt(scored.rows[0].c),
    total_deals: parseInt(deals.rows[0].c),
    deals_closed: parseInt(closed.rows[0].c),
    total_profit: parseFloat(profit.rows[0].total),
    total_llm_cost: parseFloat(llmCost.rows[0].total),
    today_llm_cost: parseFloat(todayCost.rows[0].total),
  });
}
