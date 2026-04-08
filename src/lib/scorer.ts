import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ScoreResult {
  urgency_score: number;
  profit_potential_score: number;
  flip_ease_score: number;
  risk_score: number;
  estimated_market_value: number;
  max_buy_price: number;
  target_sell_price: number;
  reasoning: string;
}

const SYSTEM = `You are a liquidation deal analyst for a reselling business. You evaluate listings for flip potential — buying undervalued items and reselling at market price. Be conservative with scores. Only give high scores (8+) when signals are strong. Respond ONLY with valid JSON, no markdown fences, no extra text.`;

export async function scoreLead(lead: {
  title: string;
  description?: string;
  asking_price?: number;
  location?: string;
  source: string;
}): Promise<{ result: ScoreResult; model: string; tokens: number; cost: number }> {
  const prompt = `Score this listing for flip potential.

LISTING:
Title: ${lead.title}
Description: ${lead.description || 'N/A'}
Asking Price: ${lead.asking_price ? '$' + lead.asking_price : 'Not listed'}
Location: ${lead.location || 'Unknown'}
Source: ${lead.source}

Score each 1-10:
- urgency_score: How quickly must seller move? (time-pressure signals like "must go today", "moving", "need gone")
- profit_potential_score: Likely spread between buy and resale price?
- flip_ease_score: How easy to find a buyer? (popular category, shippable, good condition)
- risk_score: What could go wrong? (condition unknown, scam signals, too large to ship, no photos mentioned)

Also estimate in USD:
- estimated_market_value: What this realistically sells for on eBay/Mercari/FB secondary market
- max_buy_price: Most we should pay to clear at least $50 profit after fees (~15%)
- target_sell_price: Realistic resale listing price

Finally provide "reasoning": 2-3 sentences explaining your assessment.

Respond as JSON: {"urgency_score":N,"profit_potential_score":N,"flip_ease_score":N,"risk_score":N,"estimated_market_value":N,"max_buy_price":N,"target_sell_price":N,"reasoning":"..."}`;

  const model = 'claude-sonnet-4-20250514';
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;
  // Sonnet 4 pricing: $3/MTok in, $15/MTok out
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const result: ScoreResult = JSON.parse(cleaned);

  return { result, model, tokens: totalTokens, cost };
}
