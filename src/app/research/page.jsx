'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, AlertTriangle, Save, Plus, Trash2, CheckCircle } from 'lucide-react';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import FundamentalChart from '@/components/charts/FundamentalChart';
import PriceChart from '@/components/charts/PriceChart';
import Toast from '@/components/Toast';
import { formatMoney, formatLargeNumber, formatShareCount, formatNumber } from '@/lib/formatters';
import { useCache } from '@/lib/CacheContext';
import ValuationModel from '@/components/ValuationModel';

export default function ResearchPage() {
  const cache = useCache();
  const [portfolio, setPortfolio] = useState(() => cache.get('research_portfolio') || null);
  const [selectedTicker, setSelectedTicker] = useState(() => cache.get('research_selectedTicker') || '');
  const [tickerData, setTickerData] = useState(() => cache.get('research_tickerData') || null);
  const [loading, setLoading] = useState(() => !cache.get('research_portfolio'));
  const [tickerLoading, setTickerLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [liveQuote, setLiveQuote] = useState(() => cache.get('research_liveQuote') || null);
  const [quoteLoading, setQuoteLoading] = useState(() => !cache.get('research_liveQuote') && !!cache.get('research_selectedTicker'));
  const [activeResearchTab, setActiveResearchTab] = useState(() => cache.get('research_activeTab') || 'fundamentals');
  const [thesis, setThesis] = useState(null);
  const [thesisLoading, setThesisLoading] = useState(false);
  const [thesisSaving, setThesisSaving] = useState(false);
  const [thesisDirty, setThesisDirty] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        setPortfolio(data);
        cache.set('research_portfolio', data);
        setLoading(false);
        if (data.holdings?.length && !selectedTicker) {
          const first = data.holdings[0].ticker;
          setSelectedTicker(first);
          cache.set('research_selectedTicker', first);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const loadTickerData = useCallback(async (ticker) => {
    if (!ticker) return;
    // Use cache if available for this ticker
    const cached = cache.get(`research_tickerData_${ticker}`);
    if (cached) {
      setTickerData(cached);
      cache.set('research_tickerData', cached);
      return;
    }
    setTickerLoading(true);
    try {
      const res = await fetch(`/api/ticker/${ticker}`);
      const data = await res.json();
      setTickerData(data);
      cache.set('research_tickerData', data);
      cache.set(`research_tickerData_${ticker}`, data);
    } catch (e) {
      setToast({ message: `Failed to load data for ${ticker}`, type: 'error' });
    } finally {
      setTickerLoading(false);
    }
  }, [cache]);

  useEffect(() => {
    if (selectedTicker) {
      cache.set('research_selectedTicker', selectedTicker);
      loadTickerData(selectedTicker);
      // Only fetch quote if not cached for this ticker
      const cachedQuote = cache.get(`research_quote_${selectedTicker}`);
      if (cachedQuote) {
        setLiveQuote(cachedQuote);
        setQuoteLoading(false);
      } else {
        setLiveQuote(null);
        setQuoteLoading(true);
        fetch(`/api/quotes?tickers=${selectedTicker}`)
          .then(r => r.json())
          .then(data => {
            if (data.quotes?.[selectedTicker]) {
              setLiveQuote(data.quotes[selectedTicker]);
              cache.set('research_liveQuote', data.quotes[selectedTicker]);
              cache.set(`research_quote_${selectedTicker}`, data.quotes[selectedTicker]);
            }
          })
          .catch(() => {})
          .finally(() => setQuoteLoading(false));
      }
    }
  }, [selectedTicker, loadTickerData, cache]);

  // Load thesis data when ticker changes
  useEffect(() => {
    if (!selectedTicker) return;
    setThesisLoading(true);
    setThesisDirty(false);
    fetch(`/api/thesis/${selectedTicker}`)
      .then(r => r.json())
      .then(data => setThesis(data))
      .catch(() => {})
      .finally(() => setThesisLoading(false));
  }, [selectedTicker]);

  // Cache active tab
  useEffect(() => {
    cache.set('research_activeTab', activeResearchTab);
  }, [activeResearchTab, cache]);

  const saveThesis = useCallback(async (data) => {
    if (!selectedTicker) return;
    setThesisSaving(true);
    try {
      const res = await fetch(`/api/thesis/${selectedTicker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => { const { _activeNewsIdx, ...rest } = data || thesis; return rest; })()),
      });
      const result = await res.json();
      if (result.success) {
        setThesisDirty(false);
        setToast({ message: 'Thesis saved', type: 'success' });
      }
    } catch {
      setToast({ message: 'Failed to save thesis', type: 'error' });
    } finally {
      setThesisSaving(false);
    }
  }, [selectedTicker, thesis]);

  const updateThesisField = (field, value) => {
    setThesis(prev => ({ ...prev, [field]: value }));
    setThesisDirty(true);
  };

  const updateUnderwriting = (field, value) => {
    setThesis(prev => ({
      ...prev,
      underwriting: { ...prev.underwriting, [field]: value },
    }));
    setThesisDirty(true);
  };

  const addCoreReason = () => {
    setThesis(prev => ({ ...prev, coreReasons: [...(prev.coreReasons || []), ''] }));
    setThesisDirty(true);
  };

  const removeCoreReason = (idx) => {
    setThesis(prev => ({
      ...prev,
      coreReasons: prev.coreReasons.filter((_, i) => i !== idx),
    }));
    setThesisDirty(true);
  };

  const addNewsUpdate = () => {
    setThesis(prev => ({
      ...prev,
      newsUpdates: [...(prev.newsUpdates || []), { title: '', date: new Date().toISOString().slice(0, 10), body: '', impactOnAssumptions: '' }],
    }));
    setThesisDirty(true);
  };

  const removeNewsUpdate = (idx) => {
    setThesis(prev => ({
      ...prev,
      newsUpdates: (prev.newsUpdates || []).filter((_, i) => i !== idx),
    }));
    setThesisDirty(true);
  };

  const updateNewsUpdate = (idx, field, value) => {
    setThesis(prev => ({
      ...prev,
      newsUpdates: (prev.newsUpdates || []).map((entry, i) => i === idx ? { ...entry, [field]: value } : entry),
    }));
    setThesisDirty(true);
  };

  const updateCoreReason = (idx, value) => {
    setThesis(prev => ({
      ...prev,
      coreReasons: prev.coreReasons.map((r, i) => i === idx ? value : r),
    }));
    setThesisDirty(true);
  };

  const generateData = async () => {
    setGenerating(true);
    setShowGenerateModal(false);
    setShowUpdateModal(false);
    setToast({ message: `Generating data for ${selectedTicker}... This may take ~30 seconds.`, type: 'info' });
    try {
      const res = await fetch('/api/generate-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selectedTicker }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `Data generated for ${selectedTicker}!`, type: 'success' });
        // Clear caches so fresh data is loaded
        cache.set(`research_tickerData_${selectedTicker}`, null);
        cache.set(`research_quote_${selectedTicker}`, null);
        cache.set('research_liveQuote', null);
        loadTickerData(selectedTicker);
      } else {
        setToast({ message: `Error: ${data.error}`, type: 'error' });
      }
    } catch (e) {
      setToast({ message: `Generation failed: ${e.message}`, type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
        <div className="skeleton h-14 w-72 rounded-2xl mb-8" />
        <div className="skeleton h-96 rounded-3xl" />
      </div>
    );
  }

  const holdings = portfolio?.holdings || [];
  const cashVal = portfolio?.cash || 0;
  const totalAum = holdings.reduce((s, h) => s + h.shares * h.cost_basis, 0) + cashVal;

  const holding = holdings.find(h => h.ticker === selectedTicker);
  const holdingValue = holding ? holding.shares * holding.cost_basis : 0;
  const pctAum = totalAum > 0 ? ((holdingValue / totalAum) * 100).toFixed(1) : '0.0';

  const dataExists = tickerData?.dataExists;

  const makeQuarterLabel = (row) => `${row.quarter}'${String(row.year).slice(-2)}`;

  const revenueLabels = tickerData?.revenue?.map(makeQuarterLabel) || [];
  const revenueData = tickerData?.revenue?.map(r => r.revenue) || [];
  const epsLabels = tickerData?.eps?.map(makeQuarterLabel) || [];
  const epsData = tickerData?.eps?.map(e => e.eps_diluted) || [];
  const fcfLabels = tickerData?.fcf?.map(makeQuarterLabel) || [];
  const fcfData = tickerData?.fcf?.map(f => f.free_cash_flow) || [];
  const marginLabels = tickerData?.operating_margins?.map(makeQuarterLabel) || [];
  const marginData = tickerData?.operating_margins?.map(m => m.operating_margin * 100) || [];
  const sharesLabels = tickerData?.buybacks?.map(makeQuarterLabel) || [];
  const sharesData = tickerData?.buybacks?.map(b => b.shares_outstanding) || [];
  const priceLabels = tickerData?.daily_prices?.map(p => p.date) || [];
  const priceData = tickerData?.daily_prices?.map(p => p.close) || [];
  const peLabels = tickerData?.valuation?.peHistory?.map(p => p.date) || [];
  const peData = tickerData?.valuation?.peHistory?.map(p => p.pe_ratio) || [];
  const fcfYieldLabels = tickerData?.valuation?.fcfYieldHistory?.map(f => f.date) || [];
  const fcfYieldData = tickerData?.valuation?.fcfYieldHistory?.map(f => f.fcf_yield) || [];
  const valuation = tickerData?.valuation || {};

  // Use live price for data points, recompute ratios
  const livePrice = liveQuote?.price || null;
  const csvPrice = valuation.currentPrice ? Number(valuation.currentPrice) : null;
  const displayPrice = livePrice || csvPrice;

  // Recompute PE, FCF yield, P/S using live price if available
  const csvEps = epsData.length > 0 ? epsData[epsData.length - 1] : null;
  const csvFcf = fcfData.length > 0 ? fcfData[fcfData.length - 1] : null;
  const csvRevenue = revenueData.length > 0 ? revenueData[revenueData.length - 1] : null;
  const csvShares = sharesData.length > 0 ? sharesData[sharesData.length - 1] : null;

  const livePe = (displayPrice && csvEps && csvEps > 0) ? displayPrice / csvEps : (valuation.peRatio ? Number(valuation.peRatio) : null);
  const liveFcfYield = (displayPrice && csvFcf && csvShares && csvShares > 0) ? (csvFcf / (displayPrice * csvShares)) * 100 : (valuation.fcfYield ? Number(valuation.fcfYield) : null);
  const livePs = (displayPrice && csvRevenue && csvShares && csvShares > 0) ? (displayPrice * csvShares) / csvRevenue : (valuation.priceToSales ? Number(valuation.priceToSales) : null);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Research</h1>
          <p className="text-gray-500 mt-1">Analyze company fundamentals for your holdings</p>
        </div>
        {dataExists && (
          <button
            onClick={() => setShowUpdateModal(true)}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-white border border-gray-200 rounded-2xl text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-md transition-all duration-200 disabled:opacity-40"
          >
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
            Update Data
          </button>
        )}
      </div>

      {/* Ticker Selector */}
      <Card className="mb-8">
        <div className="flex items-center gap-4">
          <label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Select Company</label>
          <select
            value={selectedTicker}
            onChange={e => setSelectedTicker(e.target.value)}
            className="bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 min-w-[200px]"
          >
            <option value="">-- Select Ticker --</option>
            {holdings.map(h => (
              <option key={h.ticker} value={h.ticker}>{h.ticker}</option>
            ))}
          </select>
        </div>
      </Card>

      {!selectedTicker ? (
        <div className="text-center py-20">
          <p className="text-lg text-gray-400 mb-2">Select a ticker to view research data</p>
          <p className="text-sm text-gray-300">Choose from your portfolio holdings above</p>
        </div>
      ) : tickerLoading ? (
        <div className="space-y-6">
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-72 rounded-3xl" />
        </div>
      ) : !dataExists ? (
        <Card className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={28} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            No data generated for {selectedTicker}
          </h2>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
            Data for this ticker has not been generated yet. Fetch fundamentals from Alpha Vantage and price data from Yahoo Finance.
          </p>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={generating}
            className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold rounded-2xl hover:from-emerald-700 hover:to-emerald-600 shadow-lg shadow-emerald-200/50 hover:shadow-xl transition-all duration-200 disabled:opacity-40"
          >
            {generating ? 'Generating...' : 'Generate Data'}
          </button>
        </Card>
      ) : (
        <>
          {/* Position Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <StatCard label="Ticker" value={selectedTicker} />
            <StatCard label="% of AUM" value={`${pctAum}%`} />
            <StatCard
              label="Unrealized Gain/Loss"
              value={
                quoteLoading ? null :
                (holding && displayPrice)
                  ? `${((displayPrice - holding.cost_basis) / holding.cost_basis * 100) >= 0 ? '+' : ''}${((displayPrice - holding.cost_basis) / holding.cost_basis * 100).toFixed(2)}%`
                  : '—'
              }
            />
          </div>

          {/* Tab Switcher + Save */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex gap-1 bg-gray-100/80 rounded-2xl p-1 w-fit">
              {[
                { key: 'fundamentals', label: 'Fundamentals' },
                { key: 'thesis', label: 'Thesis & Underwriting' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveResearchTab(tab.key)}
                  className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                    activeResearchTab === tab.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeResearchTab === 'thesis' && thesis && (
              <button
                onClick={() => saveThesis()}
                disabled={thesisSaving || !thesisDirty}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-2xl shadow-md transition-all duration-200 ${
                  thesisDirty
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg hover:shadow-emerald-200/50'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {thesisSaving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : thesisDirty ? (
                  <Save size={14} />
                ) : (
                  <CheckCircle size={14} />
                )}
                {thesisSaving ? 'Saving...' : thesisDirty ? 'Save Thesis' : 'Saved'}
              </button>
            )}
          </div>

          {activeResearchTab === 'fundamentals' ? (
            <>
              {/* Price Chart */}
              <PriceChart labels={priceLabels} data={priceData} color="#10b981" />

              {/* Data Points */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Price', value: displayPrice ? `$${displayPrice.toFixed(2)}` : '—' },
                  { label: 'PE Ratio', value: livePe ? formatNumber(livePe, 1) : '—' },
                  { label: 'FCF Yield', value: liveFcfYield ? `${liveFcfYield.toFixed(1)}%` : '—' },
                  { label: 'Price / Sales', value: livePs ? formatNumber(livePs, 1) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1.5">{label}</p>
                    {quoteLoading ? (
                      <div className="h-7 w-20 rounded-lg skeleton" />
                    ) : (
                      <p className="text-xl font-extrabold gradient-text">{value}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <FundamentalChart title="Revenue" labels={revenueLabels} data={revenueData} label="Revenue" formatY={(v) => formatLargeNumber(v)} />
                <FundamentalChart title="Operating Margins" labels={marginLabels} data={marginData} chartType="line" label="Op Margin" color="#f59e0b" formatY={(v) => `${v.toFixed(1)}%`} showCagr={false} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <FundamentalChart title="Outstanding Shares" labels={sharesLabels} data={sharesData} label="Shares" formatY={(v) => formatShareCount(v)} colorPositive="#06b6d4" colorNegative="#06b6d4" />
                <FundamentalChart title="EPS (Diluted)" labels={epsLabels} data={epsData} label="EPS" formatY={(v) => `$${v.toFixed(2)}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <FundamentalChart title="Free Cash Flow" labels={fcfLabels} data={fcfData} label="FCF" formatY={(v) => formatLargeNumber(v)} />
                <PriceChart title="PE Ratio" labels={peLabels} data={peData} label="PE Ratio" color="#8b5cf6" formatY={(v) => v.toFixed(1)} showCagr={false} className="" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <PriceChart title="FCF Yield" labels={fcfYieldLabels} data={fcfYieldData} label="FCF Yield" color="#10b981" formatY={(v) => `${v.toFixed(1)}%`} showCagr={false} className="" />
              </div>
            </>
          ) : (
            /* ── Thesis & Underwriting Tab ── */
            thesisLoading ? (
              <div className="space-y-6">
                <div className="skeleton h-48 rounded-2xl" />
                <div className="skeleton h-64 rounded-2xl" />
              </div>
            ) : thesis ? (
              <div className="space-y-8">
                {/* ── Preexisting Thesis ── */}
                <Card>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Preexisting Thesis</h2>
                  <p className="text-xs text-gray-400 mb-6">Document your investment thesis, core reasoning, and valuation framework</p>

                  {/* Core Reasons */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Core Reasons We Own This</label>
                      <button
                        onClick={addCoreReason}
                        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        <Plus size={13} />
                        Add Reason
                      </button>
                    </div>
                    <div className="space-y-3">
                      {(thesis.coreReasons || []).map((reason, idx) => (
                        <div key={idx} className="flex gap-3 items-start group">
                          <span className="flex-shrink-0 w-7 h-10 flex items-center justify-center text-xs font-bold text-gray-300 mt-px">{idx + 1}.</span>
                          <input
                            type="text"
                            value={reason}
                            onChange={e => updateCoreReason(idx, e.target.value)}
                            placeholder={`Core reason #${idx + 1}...`}
                            className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300"
                          />
                          {(thesis.coreReasons || []).length > 1 && (
                            <button
                              onClick={() => removeCoreReason(idx)}
                              className="flex-shrink-0 p-2.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Assumptions */}
                  <div className="mb-6">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-3">Key Assumptions</label>
                    <textarea
                      value={thesis.assumptions || ''}
                      onChange={e => updateThesisField('assumptions', e.target.value)}
                      placeholder="What assumptions underpin your thesis? E.g., continued market share gains, margin expansion from scale, durable competitive moat..."
                      rows={4}
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 resize-none"
                    />
                  </div>

                </Card>

                {/* ── News & Updates ── */}
                <Card>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-gray-900">News & Updates</h2>
                    <button
                      onClick={addNewsUpdate}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <Plus size={13} />
                      Add Update
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mb-6">Log major developments, earnings, or news and how they affect your thesis</p>

                  {(!thesis.newsUpdates || thesis.newsUpdates.length === 0) ? (
                    <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
                      <p className="text-sm text-gray-400 mb-1">No updates yet</p>
                      <p className="text-xs text-gray-300">Add an entry when earnings drop or a big event happens</p>
                    </div>
                  ) : (() => {
                    const updates = thesis.newsUpdates || [];
                    const latestIdx = updates.length - 1;
                    const activeIdx = thesis._activeNewsIdx !== undefined && thesis._activeNewsIdx < updates.length ? thesis._activeNewsIdx : latestIdx;
                    const entry = updates[activeIdx];

                    return (
                      <div>
                        {/* Selector for previous updates */}
                        {updates.length > 1 && (
                          <div className="flex items-center gap-3 mb-4">
                            <select
                              value={activeIdx}
                              onChange={e => setThesis(prev => ({ ...prev, _activeNewsIdx: Number(e.target.value) }))}
                              className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                            >
                              {updates.map((u, i) => (
                                <option key={i} value={i}>
                                  {i === latestIdx ? '(Latest) ' : ''}{u.title || 'Untitled'}{u.date ? ` — ${u.date}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Active entry */}
                        <div className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all duration-200 group">
                          <div className="flex items-start gap-4 mb-4">
                            <div className="flex-1">
                              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Title</label>
                              <input
                                type="text"
                                value={entry.title || ''}
                                onChange={e => updateNewsUpdate(activeIdx, 'title', e.target.value)}
                                placeholder="e.g., Q3 2025 Earnings, Major Acquisition, Guidance Revision..."
                                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 placeholder:font-normal"
                              />
                            </div>
                            <div className="w-36 flex-shrink-0">
                              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Date</label>
                              <input
                                type="date"
                                value={entry.date || ''}
                                onChange={e => updateNewsUpdate(activeIdx, 'date', e.target.value)}
                                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                              />
                            </div>
                            <button
                              onClick={() => {
                                removeNewsUpdate(activeIdx);
                                setThesis(prev => ({ ...prev, _activeNewsIdx: undefined }));
                              }}
                              className="flex-shrink-0 p-2 mt-5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="mb-4">
                            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">What Happened</label>
                            <textarea
                              value={entry.body || ''}
                              onChange={e => updateNewsUpdate(activeIdx, 'body', e.target.value)}
                              placeholder="Summarize the key takeaways..."
                              rows={3}
                              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 resize-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Impact on Assumptions</label>
                            <textarea
                              value={entry.impactOnAssumptions || ''}
                              onChange={e => updateNewsUpdate(activeIdx, 'impactOnAssumptions', e.target.value)}
                              placeholder="Does this change your revenue growth, margin, or valuation assumptions? If so, how?"
                              rows={2}
                              className="w-full bg-amber-50/50 border border-amber-200/60 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-200 placeholder:text-amber-300 resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </Card>

                {/* ── Valuation Model ── */}
                <ValuationModel ticker={selectedTicker} livePrice={livePrice} />
              </div>
            ) : null
          )}
        </>
      )}

      {/* Generate Data Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Generate Data for {selectedTicker}</h3>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              This will fetch fundamental data from Alpha Vantage and price data from Yahoo Finance.
              The data will be saved locally so you only need to do this once.
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 mb-5">
              Note: Alpha Vantage free tier allows 5 API calls/minute. Generation takes ~30 seconds.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowGenerateModal(false)} className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-all duration-200">
                Cancel
              </button>
              <button onClick={generateData} className="px-5 py-2.5 text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-600 shadow-md hover:shadow-lg hover:shadow-emerald-200/50 transition-all duration-200">
                Generate Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Data Modal */}
      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Update Data for {selectedTicker}</h3>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              This will re-fetch the latest fundamental and price data, overwriting the existing data.
              Use this after an earnings release or if the data is stale.
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 mb-5">
              This will use your Alpha Vantage API quota. Are you sure?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowUpdateModal(false)} className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-all duration-200">
                Cancel
              </button>
              <button onClick={generateData} className="px-5 py-2.5 text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-amber-500 shadow-md hover:shadow-lg transition-all duration-200">
                Update Data
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
