'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import Treemap from '@/components/Treemap';
import Toast from '@/components/Toast';
import { formatMoney, formatMoneyPrecise, formatPct, formatLargeNumber } from '@/lib/formatters';
import { useCache } from '@/lib/CacheContext';

export default function HoldingsPage() {
  const cache = useCache();
  const [portfolio, setPortfolio] = useState(() => cache.get('holdings_portfolio') || null);
  const [quotes, setQuotes] = useState(() => cache.get('holdings_quotes') || {});
  const [loading, setLoading] = useState(() => !cache.get('holdings_portfolio'));
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [treemapMode, setTreemapMode] = useState('alltime');
  const [activeSubTab, setActiveSubTab] = useState('summary');

  // Risk & Factors state
  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [fundamentalsData, setFundamentalsData] = useState(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [fundamentalsSearch, setFundamentalsSearch] = useState('');

  // Form state
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [cash, setCash] = useState('');
  const [search, setSearch] = useState('');

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      setPortfolio(data);
      cache.set('holdings_portfolio', data);
      setCash(String(data.cash || 0));
      return data;
    } catch (e) {
      setToast({ message: 'Failed to load portfolio', type: 'error' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [cache]);

  const loadQuotes = useCallback(async (holdings) => {
    if (!holdings?.length) return;
    setQuotesLoading(true);
    try {
      const tickers = holdings.map(h => h.ticker).join(',');
      const res = await fetch(`/api/quotes?tickers=${tickers}`);
      const data = await res.json();
      if (data.quotes) {
        setQuotes(data.quotes);
        cache.set('holdings_quotes', data.quotes);
      }
    } catch (e) {
      // silent fail
    } finally {
      setQuotesLoading(false);
    }
  }, [cache]);

  const loadRisk = useCallback(async (holdings) => {
    if (!holdings?.length) return;
    setRiskLoading(true);
    try {
      const holdingsWithPrices = holdings.map(h => ({
        ticker: h.ticker,
        shares: h.shares,
        cost_basis: h.cost_basis,
        price: quotes[h.ticker]?.price || h.cost_basis,
      }));
      const res = await fetch('/api/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: holdingsWithPrices }),
      });
      const data = await res.json();
      setRiskData(data);
    } catch (e) {
      setToast({ message: 'Failed to load risk data', type: 'error' });
    } finally {
      setRiskLoading(false);
    }
  }, [quotes]);

  const loadFundamentals = useCallback(async (holdings) => {
    if (!holdings?.length) return;
    setFundamentalsLoading(true);
    try {
      const tickers = holdings.map(h => h.ticker).join(',');
      const res = await fetch(`/api/fundamentals?tickers=${tickers}`);
      const data = await res.json();
      if (data.fundamentals) setFundamentalsData(data.fundamentals);
    } catch (e) {
      setToast({ message: 'Failed to load fundamentals', type: 'error' });
    } finally {
      setFundamentalsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolio().then(data => {
      // Only fetch quotes if not already cached
      if (data?.holdings?.length && !cache.get('holdings_quotes')) {
        loadQuotes(data.holdings);
      }
    });
  }, [loadPortfolio, loadQuotes, cache]);

  useEffect(() => {
    if (activeSubTab === 'risk' && !riskData && !riskLoading && portfolio?.holdings?.length) {
      loadRisk(portfolio.holdings);
    }
    if (activeSubTab === 'factors' && !fundamentalsData && !fundamentalsLoading && portfolio?.holdings?.length) {
      loadFundamentals(portfolio.holdings);
    }
  }, [activeSubTab, riskData, riskLoading, fundamentalsData, fundamentalsLoading, portfolio, loadRisk, loadFundamentals]);

  const refreshAll = async () => {
    cache.set('holdings_quotes', null);
    const data = await loadPortfolio();
    if (data?.holdings?.length) {
      loadQuotes(data.holdings);
      if (activeSubTab === 'risk') { setRiskData(null); loadRisk(data.holdings); }
      if (activeSubTab === 'factors') { setFundamentalsData(null); loadFundamentals(data.holdings); }
    }
  };

  const addHolding = async (e) => {
    e.preventDefault();
    if (!ticker) { setToast({ message: 'Please enter a ticker symbol', type: 'error' }); return; }
    if (!shares || Number(shares) <= 0) { setToast({ message: 'Please enter a valid number of shares', type: 'error' }); return; }
    if (!costBasis) return;
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, shares: Number(shares), cost_basis: Number(costBasis) }),
      });
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
        setTicker(''); setShares(''); setCostBasis('');
        setToast({ message: `${ticker.toUpperCase()} added to portfolio`, type: 'success' });
        loadQuotes(data.portfolio.holdings);
      } else {
        setToast({ message: data.error, type: 'error' });
      }
    } catch (e) {
      setToast({ message: 'Failed to add holding', type: 'error' });
    }
  };

  const removeHolding = async (t) => {
    if (!confirm(`Remove ${t} from your portfolio?`)) return;
    try {
      const res = await fetch(`/api/holdings?ticker=${t}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
        setToast({ message: `${t} removed from portfolio`, type: 'success' });
      }
    } catch (e) {
      setToast({ message: 'Failed to remove holding', type: 'error' });
    }
  };

  const saveCash = async () => {
    try {
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cash: Number(cash) }),
      });
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
        setToast({ message: 'Cash balance updated', type: 'success' });
      }
    } catch (e) {
      setToast({ message: 'Failed to update cash', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
        <div className="grid grid-cols-3 gap-6 mb-8">
          {[1,2,3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="skeleton h-72 rounded-3xl" />
      </div>
    );
  }

  const holdings = portfolio?.holdings || [];
  const cashVal = portfolio?.cash || 0;

  const positions = holdings.map(h => {
    const quote = quotes[h.ticker];
    const price = quote?.price || h.cost_basis;
    const value = h.shares * price;
    const cost = h.shares * h.cost_basis;
    const unrealizedPnl = value - cost;
    const unrealizedPnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;
    const dayChangePct = quote?.dayChangePct || 0;
    return { ticker: h.ticker, shares: h.shares, costBasis: h.cost_basis, price, value, cost, unrealizedPnl, unrealizedPnlPct, dayChangePct };
  });

  const quotesLoaded = !quotesLoading && Object.keys(quotes).length > 0;

  const nav = positions.reduce((s, p) => s + p.value, 0);
  const totalAum = nav + cashVal;
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalUnrealizedPnl = nav - totalCost;

  const treemapPositions = positions.map(p => ({
    ticker: p.ticker, value: p.value, pnlPct: p.unrealizedPnlPct, dayChangePct: p.dayChangePct,
  }));

  const filtered = positions
    .filter(p => !search || p.ticker.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.value - a.value);

  const inputCls = "w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200";

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Our Holdings</h1>
          <p className="text-gray-500 mt-1">Track your positions and portfolio allocation</p>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-white border border-gray-200 rounded-2xl text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-md transition-all duration-200"
        >
          <RefreshCw size={14} className={quotesLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-8 bg-gray-100 rounded-2xl p-1 w-fit">
        {['summary', 'risk', 'factors'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
              activeSubTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ===== SUMMARY TAB ===== */}
      {activeSubTab === 'summary' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <StatCard label="Total AUM" value={quotesLoaded ? formatMoney(totalAum) : <div className="h-8 w-28 rounded-lg skeleton" />} />
            <StatCard label="Positions" value={holdings.length} />
            <StatCard
              label="Unrealized P&L"
              value={quotesLoaded ? (
                <span className={totalUnrealizedPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                  {totalUnrealizedPnl >= 0 ? '+' : ''}{formatMoney(totalUnrealizedPnl)}
                </span>
              ) : <div className="h-8 w-28 rounded-lg skeleton" />}
            />
          </div>

          {/* Treemap */}
          <Card
            title="Position Heatmap"
            actions={
              <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
                <button
                  onClick={() => setTreemapMode('alltime')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-200 ${treemapMode === 'alltime' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  All Time
                </button>
                <button
                  onClick={() => setTreemapMode('day')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-200 ${treemapMode === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Day Change
                </button>
              </div>
            }
            className="mb-6"
          >
            <Treemap positions={treemapPositions} mode={treemapMode} />
          </Card>

          {/* Add Holding Form */}
          <Card title="Add Position" className="mb-6">
            <form onSubmit={addHolding} className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1.5">Ticker Symbol</label>
                <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="e.g., AAPL" className={inputCls} />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1.5">Shares</label>
                <input type="number" value={shares} onChange={e => setShares(e.target.value)} placeholder="100" step="0.01" min="0" className={inputCls} />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1.5">Cost Basis ($)</label>
                <input type="number" value={costBasis} onChange={e => setCostBasis(e.target.value)} placeholder="150.00" step="0.01" min="0" className={inputCls} />
              </div>
              <button type="submit" className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-600 shadow-md hover:shadow-lg hover:shadow-emerald-200/50 transition-all duration-200">
                <Plus size={14} />
                Add
              </button>
            </form>

            <div className="flex items-center gap-3 mt-5 pt-5 border-t border-gray-100">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Cash</span>
              <span className="text-gray-400">$</span>
              <input
                type="number" value={cash} onChange={e => setCash(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveCash()} onBlur={saveCash}
                placeholder="0.00" step="0.01" min="0"
                className="w-36 bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
              <span className="text-xs text-gray-400">Press Enter to save</span>
            </div>
          </Card>

          {/* Positions Table */}
          <Card
            title="Positions"
            actions={
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search ticker..."
                className="w-44 bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            }
          >
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No holdings yet. Add your first position above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Symbol', 'Qty', 'Avg Cost', 'Price', 'Value', 'Unreal P&L', '% AUM', ''].map((col, i) => (
                        <th key={i} className={`py-3 px-3 text-xs text-gray-400 uppercase tracking-wider font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const weight = totalAum > 0 ? (p.value / totalAum) * 100 : 0;
                      const pnlIsPos = p.unrealizedPnl >= 0;
                      return (
                        <tr key={p.ticker} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors duration-150">
                          <td className="py-3.5 px-3">
                            <span className="bg-emerald-50 text-emerald-700 font-bold text-xs px-2.5 py-1 rounded-lg">
                              {p.ticker}
                            </span>
                          </td>
                          <td className="text-right py-3.5 px-3 text-gray-700">{p.shares.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                          <td className="text-right py-3.5 px-3 text-gray-700">{formatMoneyPrecise(p.costBasis)}</td>
                          <td className="text-right py-3.5 px-3 text-gray-900 font-medium">
                            {quotesLoaded ? formatMoneyPrecise(p.price) : <div className="h-5 w-16 rounded skeleton ml-auto" />}
                          </td>
                          <td className="text-right py-3.5 px-3 text-gray-900 font-semibold">
                            {quotesLoaded ? formatMoney(p.value) : <div className="h-5 w-20 rounded skeleton ml-auto" />}
                          </td>
                          <td className="text-right py-3.5 px-3">
                            {quotesLoaded ? (
                              <span className={`font-semibold ${pnlIsPos ? 'text-emerald-600' : 'text-red-500'}`}>
                                {pnlIsPos ? '+' : ''}{formatMoneyPrecise(p.unrealizedPnl)}
                                <span className="text-xs ml-1 opacity-75">({formatPct(p.unrealizedPnlPct, 1)})</span>
                              </span>
                            ) : <div className="h-5 w-28 rounded skeleton ml-auto" />}
                          </td>
                          <td className="text-right py-3.5 px-3 text-gray-500">{weight.toFixed(1)}%</td>
                          <td className="text-right py-3.5 px-3">
                            <button onClick={() => removeHolding(p.ticker)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Remove">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ===== RISK TAB ===== */}
      {activeSubTab === 'risk' && (
        <>
          {riskLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
              </div>
              <div className="skeleton h-72 rounded-3xl" />
            </div>
          ) : !riskData?.metrics ? (
            <Card className="text-center py-16">
              <p className="text-gray-400">{riskData?.error || 'Need at least 2 positions with price history to compute risk metrics.'}</p>
            </Card>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-6 font-medium">
                Constant-weight basket, per-date renormalized, up to 252 trading days ({riskData.metrics.daysUsed} used)
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-8">
                <StatCard label="Ann. Volatility" value={riskData.metrics.volatility != null ? `${riskData.metrics.volatility}%` : '—'} />
                <StatCard label="Max Drawdown" value={riskData.metrics.maxDrawdown != null ? `${riskData.metrics.maxDrawdown}%` : '—'} />
                <StatCard label="Sharpe Ratio" value={riskData.metrics.sharpe != null ? riskData.metrics.sharpe : '—'} />
                <StatCard label="VaR 95%" value={riskData.metrics.var95Pct != null ? `${riskData.metrics.var95Pct}%` : '—'} />
                <StatCard label="VaR USD" value={riskData.metrics.var95Pct != null ? formatMoney(Math.abs(riskData.metrics.var95Pct / 100) * totalAum) : '—'} />
                <StatCard label="Beta" value={riskData.metrics.beta != null ? riskData.metrics.beta : 'N/A'} />
              </div>

              {riskData.correlation && riskData.correlation.tickers?.length >= 2 && (
                <Card title="Correlation Matrix">
                  <div className="overflow-x-auto">
                    <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `60px repeat(${riskData.correlation.tickers.length}, 60px)` }}>
                      <div />
                      {riskData.correlation.tickers.map(t => (
                        <div key={`h-${t}`} className="text-center text-xs font-bold text-gray-700 py-2">{t}</div>
                      ))}
                      {riskData.correlation.tickers.map((rowTicker, i) => (
                        <React.Fragment key={`row-${rowTicker}`}>
                          <div className="text-xs font-bold text-gray-700 flex items-center justify-center">{rowTicker}</div>
                          {riskData.correlation.matrix[i].map((val, j) => {
                            const isDiag = i === j;
                            const abs = Math.abs(val);
                            let bg;
                            if (isDiag) {
                              bg = '#e5e7eb';
                            } else if (val >= 0) {
                              const t = abs;
                              bg = `rgba(16, 185, 129, ${0.1 + t * 0.5})`;
                            } else {
                              const t = abs;
                              bg = `rgba(239, 68, 68, ${0.1 + t * 0.5})`;
                            }
                            return (
                              <div key={`${i}-${j}`} className={`flex items-center justify-center text-xs font-bold rounded-lg ${isDiag ? 'text-gray-500' : val >= 0 ? 'text-emerald-800' : 'text-red-800'}`} style={{ background: bg, height: 44 }}>
                                {val.toFixed(2)}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ===== FACTORS TAB ===== */}
      {activeSubTab === 'factors' && (
        <>
          {fundamentalsLoading ? (
            <div className="space-y-6">
              <div className="skeleton h-52 rounded-3xl" />
              <div className="skeleton h-72 rounded-3xl" />
            </div>
          ) : !fundamentalsData ? (
            <Card className="text-center py-16">
              <p className="text-gray-400">No fundamental data available.</p>
            </Card>
          ) : (
            <>
              {/* Sector Exposure */}
              <Card title="Sector Exposure" className="mb-6">
                {(() => {
                  const sectors = {};
                  positions.forEach(p => {
                    const f = fundamentalsData[p.ticker];
                    const sector = f?.sector || 'Unknown';
                    if (!sectors[sector]) sectors[sector] = { weight: 0, value: 0, count: 0 };
                    const w = totalAum > 0 ? (p.value / totalAum) * 100 : 0;
                    sectors[sector].weight += w;
                    sectors[sector].value += p.value;
                    sectors[sector].count += 1;
                  });
                  const sorted = Object.entries(sectors).sort((a, b) => b[1].weight - a[1].weight);
                  const maxWeight = sorted.length > 0 ? sorted[0][1].weight : 1;

                  const sectorColors = {
                    'Technology': '#10b981', 'Communication Services': '#06b6d4',
                    'Consumer Cyclical': '#f59e0b', 'Financial Services': '#059669',
                    'Healthcare': '#ef4444', 'Consumer Defensive': '#0891b2',
                    'Industrials': '#8b5cf6', 'Energy': '#f97316',
                    'Basic Materials': '#84cc16', 'Real Estate': '#ec4899',
                    'Utilities': '#14b8a6', 'Unknown': '#9ca3af',
                  };

                  if (sorted.length === 0) return <p className="text-gray-400 text-sm text-center py-6">No sector data</p>;

                  return sorted.map(([sector, data]) => (
                    <div key={sector} className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-b-0">
                      <span className="text-xs font-bold uppercase text-gray-700 w-[150px] truncate shrink-0">{sector}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(data.weight / maxWeight) * 100}%`, backgroundColor: sectorColors[sector] || '#10b981' }} />
                      </div>
                      <div className="flex items-center gap-5 shrink-0 text-xs text-gray-500">
                        <span className="font-bold text-gray-900 text-sm">{data.weight.toFixed(1)}%</span>
                        <span>{formatMoney(data.value)}</span>
                        <span>{data.count} pos</span>
                      </div>
                    </div>
                  ));
                })()}
              </Card>

              {/* Position Fundamentals Table */}
              <Card
                title="Position Fundamentals"
                actions={
                  <input type="text" value={fundamentalsSearch} onChange={e => setFundamentalsSearch(e.target.value)}
                    placeholder="Search symbol or sector..."
                    className="w-56 bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                  />
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Symbol', 'Sector', 'Industry', 'Mkt Value', 'Mkt Cap', 'P/E', 'Fwd P/E', 'PEG', 'P/B', 'P/S', 'EV/EBITDA', 'EV/REV', 'Beta'].map(col => (
                          <th key={col} className="text-right py-3 px-2 text-[0.65rem] text-gray-400 uppercase tracking-wider font-semibold first:text-left whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions
                        .filter(p => {
                          if (!fundamentalsSearch) return true;
                          const q = fundamentalsSearch.toLowerCase();
                          const f = fundamentalsData[p.ticker];
                          return p.ticker.toLowerCase().includes(q) || (f?.sector || '').toLowerCase().includes(q) || (f?.industry || '').toLowerCase().includes(q);
                        })
                        .map(p => {
                          const f = fundamentalsData[p.ticker] || {};
                          const fmtVal = (v) => {
                            if (v == null) return '—';
                            if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
                            if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
                            if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
                            return Number(v).toFixed(2);
                          };
                          return (
                            <tr key={p.ticker} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors duration-150">
                              <td className="py-3 px-2"><span className="bg-emerald-50 text-emerald-700 font-bold text-xs px-2 py-0.5 rounded-lg">{p.ticker}</span></td>
                              <td className="text-right py-3 px-2 text-gray-500 text-xs">{f.sector || '—'}</td>
                              <td className="text-right py-3 px-2 text-gray-500 text-xs max-w-[120px] truncate">{f.industry || '—'}</td>
                              <td className="text-right py-3 px-2 text-gray-900 font-medium">{formatMoney(p.value)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.marketCap)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.pe)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.forwardPe)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.peg)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.pb)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.ps)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.evEbitda)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.evRevenue)}</td>
                              <td className="text-right py-3 px-2 text-gray-700">{fmtVal(f.beta)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
