'use client';

import { useEffect, useState, useCallback } from 'react';

interface Stats {
  total_leads: number;
  total_scored: number;
  total_deals: number;
  deals_closed: number;
  total_profit: number;
  total_llm_cost: number;
  today_llm_cost: number;
}

interface Lead {
  id: string;
  source: string;
  title: string;
  description: string;
  asking_price: number | null;
  location: string;
  url: string;
  status: string;
  created_at: string;
  total_score: number | null;
  urgency_score: number | null;
  profit_potential_score: number | null;
  flip_ease_score: number | null;
  risk_score: number | null;
  estimated_market_value: number | null;
  max_buy_price: number | null;
  target_sell_price: number | null;
  reasoning: string | null;
  cost_usd: number | null;
  deal_id: string | null;
  deal_status: string | null;
}

interface Deal {
  id: string;
  lead_id: string;
  status: string;
  buy_price: number | null;
  sell_price: number | null;
  profit: number | null;
  title: string;
  asking_price: number | null;
  total_score: number | null;
  max_buy_price: number | null;
  target_sell_price: number | null;
  created_at: string;
}

const USD = (n: number | null | undefined) => (n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—');

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-zinc-600 text-xs">pending</span>;
  const color = score >= 20 ? 'bg-emerald-500/20 text-emerald-400' : score >= 15 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/50 text-zinc-400';
  return <span className={`score-pill ${color}`}>{score}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-blue-500/20 text-blue-400',
    scored: 'bg-violet-500/20 text-violet-400',
    actioned: 'bg-emerald-500/20 text-emerald-400',
    passed: 'bg-zinc-700/50 text-zinc-500',
    pursuing: 'bg-amber-500/20 text-amber-400',
    acquired: 'bg-cyan-500/20 text-cyan-400',
    listed: 'bg-violet-500/20 text-violet-400',
    sold: 'bg-emerald-500/20 text-emerald-400',
    abandoned: 'bg-red-500/20 text-red-400',
  };
  return <span className={`score-pill ${colors[status] || 'bg-zinc-700 text-zinc-400'}`}>{status}</span>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tab, setTab] = useState<'leads' | 'deals' | 'add'>('leads');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ source: 'facebook_marketplace', title: '', description: '', asking_price: '', location: '', url: '' });
  const [submitting, setSubmitting] = useState(false);
  const [dealForm, setDealForm] = useState<{ dealId: string; field: string; value: string } | null>(null);

  const load = useCallback(async () => {
    const [s, l, d] = await Promise.all([
      fetch('/api/stats').then((r) => r.json()),
      fetch(`/api/leads?limit=100${filter ? `&min_score=${filter}` : ''}`).then((r) => r.json()),
      fetch('/api/deals').then((r) => r.json()),
    ]);
    setStats(s);
    setLeads(l.leads || []);
    setDeals(d.deals || []);
  }, [filter]);

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);

  const submitLead = async () => {
    setSubmitting(true);
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, asking_price: form.asking_price ? parseFloat(form.asking_price) : null }),
    });
    setForm({ source: 'facebook_marketplace', title: '', description: '', asking_price: '', location: '', url: '' });
    setSubmitting(false);
    setTab('leads');
    setTimeout(load, 1000);
  };

  const pursueLead = async (leadId: string) => {
    await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    });
    load();
  };

  const passLead = async (leadId: string) => {
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'passed' }),
    });
    load();
  };

  const updateDeal = async (dealId: string, data: any) => {
    await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setDealForm(null);
    load();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">ManifestIQ</h1>
          <p className="text-zinc-500 text-sm">Deal Engine</p>
        </div>
        <button onClick={load} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded px-3 py-1.5">Refresh</button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Leads', value: stats.total_leads, sub: `${stats.total_scored} scored` },
            { label: 'Deals', value: stats.total_deals, sub: `${stats.deals_closed} closed` },
            { label: 'Profit', value: USD(stats.total_profit), sub: `LLM: ${USD(stats.total_llm_cost)}`, accent: stats.total_profit > 0 },
            { label: 'Today LLM', value: `$${stats.today_llm_cost.toFixed(2)}`, sub: '$5.00 budget' },
          ].map((s) => (
            <div key={s.label} className="bg-surface-1 border border-zinc-800/60 rounded-lg p-4">
              <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.accent ? 'text-emerald-400' : 'text-white'}`}>{s.value}</div>
              <div className="text-zinc-600 text-xs mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800/60 pb-px">
        {(['leads', 'deals', 'add'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${tab === t ? 'text-white bg-surface-2 border border-zinc-800/60 border-b-surface-2' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t === 'add' ? '+ Add Lead' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {tab === 'leads' && (
          <div className="ml-auto flex items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className="bg-surface-2 border border-zinc-800 rounded text-xs text-zinc-400 px-2 py-1.5">
              <option value="">All scores</option>
              <option value="20">🔥 20+</option>
              <option value="15">⚡ 15+</option>
              <option value="10">10+</option>
            </select>
          </div>
        )}
      </div>

      {/* Leads Tab */}
      {tab === 'leads' && (
        <div className="space-y-2">
          {leads.length === 0 && <p className="text-zinc-600 text-sm py-8 text-center">No leads yet. Add one to get started.</p>}
          {leads.map((lead) => (
            <div key={lead.id} className="bg-surface-1 border border-zinc-800/60 rounded-lg">
              <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ScoreBadge score={lead.total_score} />
                    <StatusBadge status={lead.deal_status || lead.status} />
                    <span className="text-zinc-600 text-xs">{lead.source}</span>
                  </div>
                  <h3 className="text-sm font-medium text-zinc-200 truncate">{lead.title}</h3>
                  <div className="flex gap-4 mt-1 text-xs text-zinc-500">
                    <span>Ask: {USD(lead.asking_price)}</span>
                    {lead.max_buy_price && <span>Max buy: {USD(lead.max_buy_price)}</span>}
                    {lead.target_sell_price && <span>Sell: {USD(lead.target_sell_price)}</span>}
                    {lead.location && <span>{lead.location}</span>}
                  </div>
                </div>
                <div className="text-zinc-600 text-xs shrink-0">{new Date(lead.created_at).toLocaleDateString()}</div>
              </div>

              {expanded === lead.id && (
                <div className="border-t border-zinc-800/40 px-4 py-3 space-y-3">
                  {lead.reasoning && <p className="text-xs text-zinc-400 leading-relaxed">{lead.reasoning}</p>}
                  {lead.description && <p className="text-xs text-zinc-500">{lead.description}</p>}
                  <div className="flex gap-4 text-xs text-zinc-500">
                    {lead.urgency_score != null && <span>Urgency: {lead.urgency_score}</span>}
                    {lead.profit_potential_score != null && <span>Profit: {lead.profit_potential_score}</span>}
                    {lead.flip_ease_score != null && <span>Ease: {lead.flip_ease_score}</span>}
                    {lead.risk_score != null && <span>Risk: {lead.risk_score}</span>}
                    {lead.cost_usd != null && <span>LLM: ${Number(lead.cost_usd).toFixed(4)}</span>}
                  </div>
                  {lead.url && <a href={lead.url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 hover:underline">View listing →</a>}

                  {lead.status === 'scored' && !lead.deal_id && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => pursueLead(lead.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-1.5 rounded transition-colors">Pursue</button>
                      <button onClick={() => passLead(lead.id)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium px-4 py-1.5 rounded transition-colors">Pass</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deals Tab */}
      {tab === 'deals' && (
        <div className="space-y-2">
          {deals.length === 0 && <p className="text-zinc-600 text-sm py-8 text-center">No deals yet. Pursue a lead to create one.</p>}
          {deals.map((deal) => (
            <div key={deal.id} className="bg-surface-1 border border-zinc-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={deal.status} />
                    <ScoreBadge score={deal.total_score} />
                  </div>
                  <h3 className="text-sm font-medium text-zinc-200">{deal.title}</h3>
                </div>
                <span className="text-zinc-600 text-xs">{new Date(deal.created_at).toLocaleDateString()}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                <div><span className="text-zinc-500">Asking</span><div className="text-zinc-300">{USD(deal.asking_price)}</div></div>
                <div><span className="text-zinc-500">Max buy</span><div className="text-zinc-300">{USD(deal.max_buy_price)}</div></div>
                <div><span className="text-zinc-500">Bought at</span><div className="text-zinc-300">{USD(deal.buy_price)}</div></div>
                <div><span className="text-zinc-500">Sold at</span><div className={deal.profit && deal.profit > 0 ? 'text-emerald-400 font-bold' : 'text-zinc-300'}>{USD(deal.sell_price)}{deal.profit != null ? ` (${USD(deal.profit)})` : ''}</div></div>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                {deal.status === 'pursuing' && (
                  <>
                    <button onClick={() => setDealForm({ dealId: deal.id, field: 'buy_price', value: '' })} className="text-xs bg-cyan-800/40 text-cyan-400 px-3 py-1 rounded hover:bg-cyan-800/60">Log Purchase</button>
                    <button onClick={() => updateDeal(deal.id, { status: 'abandoned' })} className="text-xs bg-zinc-800 text-zinc-500 px-3 py-1 rounded hover:bg-zinc-700">Abandon</button>
                  </>
                )}
                {deal.status === 'acquired' && (
                  <button onClick={() => updateDeal(deal.id, { status: 'listed' })} className="text-xs bg-violet-800/40 text-violet-400 px-3 py-1 rounded hover:bg-violet-800/60">Mark Listed</button>
                )}
                {deal.status === 'listed' && (
                  <button onClick={() => setDealForm({ dealId: deal.id, field: 'sell_price', value: '' })} className="text-xs bg-emerald-800/40 text-emerald-400 px-3 py-1 rounded hover:bg-emerald-800/60">Log Sale</button>
                )}
              </div>

              {dealForm?.dealId === deal.id && (
                <div className="flex gap-2 mt-2 items-center">
                  <span className="text-xs text-zinc-500">{dealForm.field === 'buy_price' ? 'Buy price:' : 'Sell price:'} $</span>
                  <input type="number" value={dealForm.value} onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })}
                    className="bg-surface-2 border border-zinc-700 rounded px-2 py-1 text-sm text-white w-28" autoFocus />
                  <button onClick={() => updateDeal(deal.id, {
                    [dealForm.field]: parseFloat(dealForm.value),
                    status: dealForm.field === 'buy_price' ? 'acquired' : 'sold',
                  })} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded">Save</button>
                  <button onClick={() => setDealForm(null)} className="text-xs text-zinc-500">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Lead Tab */}
      {tab === 'add' && (
        <div className="bg-surface-1 border border-zinc-800/60 rounded-lg p-6 max-w-lg">
          <h2 className="text-lg font-semibold text-white mb-4">Add Lead</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full bg-surface-2 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200">
                <option value="facebook_marketplace">Facebook Marketplace</option>
                <option value="offerup">OfferUp</option>
                <option value="craigslist">Craigslist</option>
                <option value="liquidation_com">Liquidation.com</option>
                <option value="govdeals">GovDeals</option>
                <option value="partner">Partner Referral</option>
                <option value="manual">Manual/Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Dyson V15 Detect — barely used, needs gone today"
                className="w-full bg-surface-2 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                placeholder="Copy/paste the full listing text..."
                className="w-full bg-surface-2 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Asking Price ($)</label>
                <input type="number" value={form.asking_price} onChange={(e) => setForm({ ...form, asking_price: e.target.value })}
                  placeholder="0" className="w-full bg-surface-2 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Erie, PA" className="w-full bg-surface-2 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Listing URL</label>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://..." className="w-full bg-surface-2 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200" />
            </div>
            <button onClick={submitLead} disabled={submitting || !form.title}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-2.5 rounded transition-colors">
              {submitting ? 'Submitting...' : 'Submit & Score'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
