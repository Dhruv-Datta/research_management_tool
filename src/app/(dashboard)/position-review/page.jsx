'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, AlertTriangle, Save, Plus, Trash2, CheckCircle, FileDown, Check, Image as ImageIcon, X, ZoomIn } from 'lucide-react';
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
import RichTextArea from '@/components/RichTextArea';

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
  const modelRef = useRef(null);
  const [exporting, setExporting] = useState(false);

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
    if (!selectedTicker || (!thesisDirty && !data)) return;
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
  }, [selectedTicker, thesis, thesisDirty]);

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
    setThesis(prev => ({ ...prev, coreReasons: [...(prev.coreReasons || []), { title: '', description: '' }] }));
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

  const [imageUploading, setImageUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const uploadNewsImage = async (newsIdx, files) => {
    if (!files || files.length === 0 || !selectedTicker) return;
    setImageUploading(true);
    try {
      const newImages = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ticker', selectedTicker);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          newImages.push({ url: data.url, path: data.path, name: file.name });
        }
      }
      if (newImages.length > 0) {
        setThesis(prev => ({
          ...prev,
          newsUpdates: (prev.newsUpdates || []).map((entry, i) => {
            if (i !== newsIdx) return entry;
            return { ...entry, images: [...(entry.images || []), ...newImages] };
          }),
        }));
        setThesisDirty(true);
      }
    } catch (e) {
      setToast({ message: 'Failed to upload image', type: 'error' });
    } finally {
      setImageUploading(false);
    }
  };

  const removeNewsImage = async (newsIdx, imgIdx) => {
    const entry = thesis.newsUpdates?.[newsIdx];
    const img = entry?.images?.[imgIdx];
    if (img?.path) {
      try { await fetch(`/api/upload?path=${encodeURIComponent(img.path)}`, { method: 'DELETE' }); } catch {}
    }
    setThesis(prev => ({
      ...prev,
      newsUpdates: (prev.newsUpdates || []).map((entry, i) => {
        if (i !== newsIdx) return entry;
        return { ...entry, images: (entry.images || []).filter((_, j) => j !== imgIdx) };
      }),
    }));
    setThesisDirty(true);
  };

  const updateCoreReason = (idx, field, value) => {
    setThesis(prev => ({
      ...prev,
      coreReasons: prev.coreReasons.map((r, i) => {
        if (i !== idx) return r;
        // Backward compat: if old format was a string, convert to object
        const obj = typeof r === 'string' ? { title: r, description: '' } : r;
        return { ...obj, [field]: value };
      }),
    }));
    setThesisDirty(true);
  };

  const addTodo = () => {
    const updated = { ...thesis, todos: [...(thesis.todos || []), { text: '', done: false }] };
    setThesis(updated);
    setThesisDirty(true);
    saveThesis(updated);
  };

  const removeTodo = (idx) => {
    const updated = { ...thesis, todos: (thesis.todos || []).filter((_, i) => i !== idx) };
    setThesis(updated);
    setThesisDirty(true);
    saveThesis(updated);
  };

  const updateTodo = (idx, field, value) => {
    const updated = { ...thesis, todos: (thesis.todos || []).map((t, i) => i === idx ? { ...t, [field]: value } : t) };
    setThesis(updated);
    setThesisDirty(true);
    // Save immediately for checkbox toggles, blur handles text inputs
    if (field === 'done') saveThesis(updated);
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
      <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
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

  const handleExport = async () => {
    setExporting(true);
    try {
      // Capture model data BEFORE switching tabs (switching unmounts ValuationModel)
      let modelData = modelRef.current?.getModelData?.() || null;

      // Fallback: if ref wasn't available (e.g. on fundamentals tab), load from API
      if (!modelData) {
        try {
          const modelRes = await fetch(`/api/model/${selectedTicker}`);
          const modelJson = await modelRes.json();
          if (modelJson.exists && modelJson.inputs) {
            // Import the compute logic inline
            const inp = modelJson.inputs;
            const p = (v) => (v === '' || v === undefined || v === null || isNaN(Number(v))) ? 0 : Number(v);
            const sharePrice = p(inp.sharePrice) || (livePrice || 0);
            const targetPE = p(inp.targetPE);
            const revG = p(inp.revenueGrowth), opexG = p(inp.opexGrowth), cogsG = p(inp.cogsGrowth);
            const dilution = p(inp.netShareDilution), divG = p(inp.dividendGrowth), curDiv = p(inp.currentDividend);
            const taxRate = p(inp.taxRate), baseYear = p(inp.baseYear);
            const revenue = [p(inp.baseRevenue)]; for (let i=1;i<=5;i++) revenue.push(revenue[i-1]*(1+revG));
            const cogs = [p(inp.baseCOGS)]; for (let i=1;i<=5;i++) cogs.push(cogs[i-1]*(1+cogsG));
            const opex = [p(inp.baseOpex)]; for (let i=1;i<=5;i++) opex.push(opex[i-1]*(1+opexG));
            const opIncome = [0,1,2,3,4,5].map(i => revenue[i]-cogs[i]-opex[i]);
            const opMargin = [0,1,2,3,4,5].map(i => revenue[i]?opIncome[i]/revenue[i]:0);
            const nonOpIncome = [p(inp.baseNonOpIncome),0,0,0,0,0];
            const taxExpense = [p(inp.baseTaxExpense)]; for (let i=1;i<=5;i++) taxExpense.push(opIncome[i]*taxRate);
            const netIncome = [0,1,2,3,4,5].map(i => opIncome[i]-taxExpense[i]+nonOpIncome[i]);
            const shares = [p(inp.baseShares)]; for (let i=1;i<=5;i++) shares.push(shares[i-1]*(1+dilution));
            const eps = [0,1,2,3,4,5].map(i => shares[i]?netIncome[i]/shares[i]:0);
            const epsGrowth = (eps[0]&&eps[5])?Math.pow(eps[5]/eps[0],0.2)-1:0;
            const targetPrice5 = targetPE*eps[5];
            const priceCAGR = (sharePrice>0&&targetPrice5>0)?Math.pow(targetPrice5/sharePrice,0.2)-1:0;
            const priceArr = [sharePrice]; for (let i=1;i<=5;i++) priceArr.push(priceArr[i-1]*(1+priceCAGR));
            const divShares = [1]; for (let i=1;i<=5;i++){const df=sharePrice>0?(curDiv/sharePrice)*Math.pow((1+divG)/(1+priceCAGR),i-1):0;divShares.push((1+df)*divShares[i-1]);}
            const totalCAGRNoDivs = priceCAGR;
            const totalCAGR = (sharePrice>0&&divShares[5]*priceArr[5]>0)?Math.pow((divShares[5]*priceArr[5])/sharePrice,0.2)-1:0;
            modelData = {
              inputs: { ...inp, sharePrice },
              computed: { yearLabels: [0,1,2,3,4,5].map(i=>baseYear+i), revenue, cogs, opex, opIncome, opMargin, nonOpIncome, taxExpense, netIncome, shares, eps, epsGrowth, priceArr, divShares, totalCAGRNoDivs, totalCAGR, priceTarget: priceArr[2], targetPrice5, priceCAGR },
            };
          }
        } catch {}
      }

      // Fetch a fresh quote with all extended fields for the export
      let freshQuote = liveQuote;
      try {
        const quoteRes = await fetch(`/api/quotes?tickers=${selectedTicker}`);
        const quoteJson = await quoteRes.json();
        if (quoteJson.quotes?.[selectedTicker]) {
          freshQuote = quoteJson.quotes[selectedTicker];
        }
      } catch {}

      const prevTab = activeResearchTab;
      if (prevTab !== 'fundamentals') {
        setActiveResearchTab('fundamentals');
        await new Promise(r => setTimeout(r, 800));
      }

      const { exportReport } = await import('@/lib/exportReport');

      await exportReport({
        ticker: selectedTicker,
        thesis,
        model: modelData,
        tickerData,
        liveQuote: freshQuote,
        displayPrice: freshQuote?.price || displayPrice,
      });

      if (prevTab !== 'fundamentals') {
        setActiveResearchTab(prevTab);
      }
      setToast({ message: 'Report exported!', type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ message: `Export failed: ${e.message}`, type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Position Review</h1>
          <p className="text-gray-500 mt-1">Review fundamentals and underwriting for current holdings</p>
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
      <Card className="mb-8 animate-fade-in-up stagger-2">
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
          {/* Tab Switcher + Save */}
          <div className="flex items-center justify-between mb-8 animate-fade-in-up stagger-3">
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

          {/* Position Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <StatCard label="Ticker" value={selectedTicker} />
            <StatCard label="% of AUM" value={`${pctAum}%`} />
            <StatCard
              label="Unrealized Gain/Loss"
              variant={
                quoteLoading || !holding || !livePrice ? 'default' :
                ((livePrice - holding.cost_basis) / holding.cost_basis >= 0 ? 'positive' : 'negative')
              }
              value={
                quoteLoading ? null :
                (holding && livePrice)
                  ? `${((livePrice - holding.cost_basis) / holding.cost_basis * 100) >= 0 ? '+' : ''}${((livePrice - holding.cost_basis) / holding.cost_basis * 100).toFixed(2)}%`
                  : '—'
              }
            />
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
                <FundamentalChart title="EPS (Diluted)" labels={epsLabels} data={epsData} label="EPS" formatY={(v) => `$${v.toFixed(2)}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <FundamentalChart title="Free Cash Flow" labels={fcfLabels} data={fcfData} label="FCF" formatY={(v) => formatLargeNumber(v)} />
                <FundamentalChart title="Operating Margins" labels={marginLabels} data={marginData} chartType="line" label="Op Margin" color="#f59e0b" formatY={(v) => `${v.toFixed(1)}%`} showCagr={false} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <FundamentalChart title="Outstanding Shares" labels={sharesLabels} data={sharesData} label="Shares" formatY={(v) => formatShareCount(v)} colorPositive="#06b6d4" colorNegative="#06b6d4" />
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
              <div className="space-y-8" onBlur={() => saveThesis()}>
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
                    <div className="space-y-4">
                      {(thesis.coreReasons || []).map((reason, idx) => {
                        const r = typeof reason === 'string' ? { title: reason, description: '' } : reason;
                        return (
                          <div key={idx} className="group border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-all duration-200">
                            <div className="flex gap-3 items-start">
                              <span className="flex-shrink-0 w-7 h-10 flex items-center justify-center text-xs font-bold text-gray-300 mt-px">{idx + 1}.</span>
                              <div className="flex-1 space-y-2">
                                <input
                                  type="text"
                                  value={r.title}
                                  onChange={e => updateCoreReason(idx, 'title', e.target.value)}
                                  placeholder={`Core reason #${idx + 1}...`}
                                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 placeholder:font-normal"
                                />
                                <textarea
                                  value={r.description}
                                  onChange={e => updateCoreReason(idx, 'description', e.target.value)}
                                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                  ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                                  placeholder="Elaborate on this reason..."
                                  rows={2}
                                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 resize-none overflow-hidden"
                                />
                              </div>
                              {(thesis.coreReasons || []).length > 1 && (
                                <button
                                  onClick={() => removeCoreReason(idx)}
                                  className="flex-shrink-0 p-2.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* The Story — rich text with inline images */}
                  <div className="mb-6">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">The Story</label>
                    <p className="text-[10px] text-gray-400 mb-3">Paste images with Ctrl+V or hover to add via the image icon</p>
                    <RichTextArea
                      value={thesis.assumptions || ''}
                      onChange={val => updateThesisField('assumptions', val)}
                      ticker={selectedTicker}
                      placeholder="What assumptions underpin your thesis? E.g., continued market share gains, margin expansion from scale, durable competitive moat..."
                      rows={4}
                    />
                  </div>

                </Card>

                {/* ── Research To-Do ── */}
                <Card>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-gray-900">Research To-Do</h2>
                    <button
                      onClick={addTodo}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <Plus size={13} />
                      Add Item
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Quick checklist of things to research or follow up on (do not delete until checked off by other founder)</p>

                  {(!thesis.todos || thesis.todos.length === 0) ? (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl">
                      <p className="text-sm text-gray-400 mb-1">No items yet</p>
                      <p className="text-xs text-gray-300">Add tasks like &ldquo;check Q4 guidance&rdquo; or &ldquo;review competitor margins&rdquo;</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(thesis.todos || []).map((todo, idx) => (
                        <div key={idx} className="flex items-center gap-3 group">
                          <button
                            onClick={() => updateTodo(idx, 'done', !todo.done)}
                            className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                              todo.done
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-gray-300 hover:border-emerald-400'
                            }`}
                          >
                            {todo.done && <Check size={12} className="text-white" strokeWidth={3} />}
                          </button>
                          <input
                            type="text"
                            value={todo.text}
                            onChange={e => updateTodo(idx, 'text', e.target.value)}
                            placeholder="What needs to be done..."
                            className={`flex-1 bg-transparent border-none outline-none text-sm transition-all duration-200 placeholder:text-gray-300 ${
                              todo.done ? 'line-through text-gray-400' : 'text-gray-900'
                            }`}
                          />
                          <button
                            onClick={() => removeTodo(idx)}
                            className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                              placeholder="Summarize the key takeaways..."
                              rows={3}
                              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 resize-none overflow-hidden"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">Impact on Assumptions</label>
                            <textarea
                              value={entry.impactOnAssumptions || ''}
                              onChange={e => updateNewsUpdate(activeIdx, 'impactOnAssumptions', e.target.value)}
                              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                              placeholder="Does this change your revenue growth, margin, or valuation assumptions? If so, how?"
                              rows={2}
                              className="w-full bg-amber-50/50 border border-amber-200/60 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-200 placeholder:text-amber-300 resize-none overflow-hidden"
                            />
                          </div>

                          {/* ── Attached Images ── */}
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                                <ImageIcon size={11} />
                                Attached Images
                              </label>
                              <label className={`flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer transition-colors ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <Plus size={12} />
                                {imageUploading ? 'Uploading...' : 'Add Image'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={e => uploadNewsImage(activeIdx, Array.from(e.target.files))}
                                />
                              </label>
                            </div>
                            {(entry.images && entry.images.length > 0) ? (
                              <div className="grid grid-cols-3 gap-2">
                                {entry.images.map((img, imgIdx) => (
                                  <div key={imgIdx} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                                    <img
                                      src={img.url}
                                      alt={img.name || 'Attached image'}
                                      className="w-full h-24 object-cover cursor-pointer"
                                      onClick={() => setPreviewImage(img.url)}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                      <button
                                        onClick={() => setPreviewImage(img.url)}
                                        className="p-1 bg-white/90 rounded-md text-gray-700 hover:bg-white"
                                      >
                                        <ZoomIn size={14} />
                                      </button>
                                      <button
                                        onClick={() => removeNewsImage(activeIdx, imgIdx)}
                                        className="p-1 bg-white/90 rounded-md text-red-500 hover:bg-white"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                    <p className="text-[9px] text-gray-400 truncate px-1.5 py-0.5">{img.name}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-4 border border-dashed border-gray-200 rounded-lg">
                                <p className="text-xs text-gray-300">No images attached</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </Card>

                {/* ── Valuation Model ── */}
                <ValuationModel ref={modelRef} ticker={selectedTicker} livePrice={livePrice} />

                {/* ── Export Button ── */}
                <div className="flex justify-center pt-2 pb-4">
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white font-semibold rounded-2xl hover:from-gray-800 hover:to-gray-700 shadow-lg shadow-gray-300/40 hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {exporting ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <FileDown size={16} />
                    )}
                    {exporting ? 'Generating Report...' : 'Export Research Report'}
                  </button>
                </div>
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

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-8"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X size={20} />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
