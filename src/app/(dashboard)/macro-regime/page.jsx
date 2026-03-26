'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Activity, Play, Zap, RefreshCw, Shield, Settings, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, AlertTriangle, Check, Loader2, Terminal, X,
  BarChart3, Target, Eye,
} from 'lucide-react';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import Toast from '@/components/Toast';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  start_date: '2000-01-01',
  end_date: '2026-03-01',
  equity_ticker: 'SPY',
  forecast_horizon_months: 1,
  macro_lag_months: 1,
  momentum_window: 3,
  volatility_window: 3,
  regularization_C: 0.5,
  class_weight: null,
  max_iter: 1000,
  recency_halflife_months: 12,
  window_type: 'expanding',
  rolling_window_months: 120,
  min_train_months: 48,
  holdout_start: '2020-01-01',
  baseline_equity: 0.95,
  baseline_tbills: 0.05,
  min_weight: 0.10,
  max_weight: 0.97,
  allocation_steepness: 13.0,
  weight_smoothing_up: 0.98,
  weight_smoothing_down: 0.97,
  crash_overlay: true,
  vix_spike_threshold: 7.0,
  drawdown_defense_threshold: -10.0,
  credit_spike_threshold: 1.5,
};

const CONFIG_SECTIONS = [
  {
    label: 'Data & Horizon',
    fields: [
      { key: 'start_date', label: 'Start Date', type: 'text', help: 'Backtest start date' },
      { key: 'end_date', label: 'End Date', type: 'text', help: '1st of month to predict allocation for' },
      { key: 'equity_ticker', label: 'Equity Ticker', type: 'text' },
      { key: 'forecast_horizon_months', label: 'Forecast Horizon', type: 'number', step: 1, suffix: 'months' },
    ],
  },
  {
    label: 'Feature Engineering',
    fields: [
      { key: 'macro_lag_months', label: 'Macro Lag', type: 'number', step: 1, suffix: 'months' },
      { key: 'momentum_window', label: 'Momentum Window', type: 'number', step: 1, suffix: 'months' },
      { key: 'volatility_window', label: 'Volatility Window', type: 'number', step: 1, suffix: 'months' },
    ],
  },
  {
    label: 'Model',
    fields: [
      { key: 'regularization_C', label: 'Regularization C', type: 'number', step: 0.05 },
      { key: 'max_iter', label: 'Max Iterations', type: 'number', step: 100 },
    ],
  },
  {
    label: 'Training',
    fields: [
      { key: 'recency_halflife_months', label: 'Recency Halflife', type: 'number', step: 1, suffix: 'months' },
      { key: 'window_type', label: 'Window Type', type: 'select', options: ['expanding', 'rolling'] },
      { key: 'rolling_window_months', label: 'Rolling Window', type: 'number', step: 12, suffix: 'months' },
      { key: 'min_train_months', label: 'Min Training', type: 'number', step: 6, suffix: 'months' },
      { key: 'holdout_start', label: 'Holdout Start', type: 'text', help: 'Date or null' },
    ],
  },
  {
    label: 'Allocation',
    fields: [
      { key: 'baseline_equity', label: 'Baseline Equity', type: 'number', step: 0.05, pct: true },
      { key: 'baseline_tbills', label: 'Baseline T-Bills', type: 'number', step: 0.05, pct: true },
      { key: 'min_weight', label: 'Min Weight', type: 'number', step: 0.05, pct: true },
      { key: 'max_weight', label: 'Max Weight', type: 'number', step: 0.01, pct: true },
      { key: 'allocation_steepness', label: 'Steepness', type: 'number', step: 0.5 },
      { key: 'weight_smoothing_up', label: 'Smoothing Up (α)', type: 'number', step: 0.01 },
      { key: 'weight_smoothing_down', label: 'Smoothing Down (α)', type: 'number', step: 0.01 },
    ],
  },
  {
    label: 'Crash Overlay',
    fields: [
      { key: 'crash_overlay', label: 'Enable Overlay', type: 'toggle' },
      { key: 'vix_spike_threshold', label: 'VIX Spike Threshold', type: 'number', step: 0.5 },
      { key: 'drawdown_defense_threshold', label: 'Drawdown Threshold', type: 'number', step: 1, suffix: '%' },
      { key: 'credit_spike_threshold', label: 'Credit Spike Threshold', type: 'number', step: 0.1 },
    ],
  },
];

// ── Chart Colors ────────────────────────────────────────────────────────────

const COLORS = {
  model: '#10b981',
  baseline: '#3b82f6',
  sixtyForty: '#f59e0b',
  equity: '#8b5cf6',
  tbills: '#9ca3af',
  probEquity: '#10b981',
  probTbills: '#ef4444',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtPct = (v, decimals = 1) => {
  if (v == null) return '—';
  const n = Number(v);
  return isFinite(n) ? `${(n * 100).toFixed(decimals)}%` : String(v);
};
const fmtNum = (v, decimals = 2) => {
  if (v == null) return '—';
  const n = Number(v);
  return isFinite(n) ? n.toFixed(decimals) : String(v);
};
const fmtDate = (d) => {
  if (!d) return '—';
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 7) : s;
};

function computeDrawdowns(backtestRows, cumKey) {
  let peak = 0;
  return backtestRows.map((r) => {
    const v = r[cumKey];
    if (v == null) return null;
    if (v > peak) peak = v;
    return peak > 0 ? (v / peak - 1) : 0;
  });
}

function computeRollingSharpe(backtestRows, retKey, window = 24) {
  const rets = backtestRows.map((r) => r[retKey]);
  return rets.map((_, i) => {
    if (i < window) return null;
    const slice = rets.slice(i - window, i).filter((v) => v != null);
    if (slice.length < window * 0.75) return null;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    return std > 0 ? (mean * 12) / (std * Math.sqrt(12)) : 0;
  });
}

// ── Chart Builder ───────────────────────────────────────────────────────────

function buildChartOptions(title, yFormat = 'number', yLabel = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, font: { size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        titleColor: '#1f2937',
        bodyColor: '#374151',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (yFormat === 'pct') return `${ctx.dataset.label}: ${(v * 100).toFixed(1)}%`;
            if (yFormat === 'dollar') return `${ctx.dataset.label}: $${v.toFixed(0)}`;
            return `${ctx.dataset.label}: ${v.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 12, font: { size: 10 }, color: '#9ca3af' },
      },
      y: {
        grid: { color: '#f3f4f6' },
        ticks: {
          font: { size: 10 },
          color: '#9ca3af',
          callback: (v) => {
            if (yFormat === 'pct') return `${(v * 100).toFixed(0)}%`;
            if (yFormat === 'dollar') return `$${v.toFixed(0)}`;
            return v.toFixed(1);
          },
        },
        title: yLabel ? { display: true, text: yLabel, font: { size: 11 }, color: '#9ca3af' } : undefined,
      },
    },
    elements: { point: { radius: 0, hoverRadius: 4 }, line: { tension: 0.2, borderWidth: 2 } },
  };
}

function makeDataset(label, data, color, fill = false, borderDash) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill ? `${color}20` : 'transparent',
    fill,
    borderDash,
    borderWidth: 2,
  };
}

// ── Regime Badge ────────────────────────────────────────────────────────────

function RegimeBadge({ regime, size = 'lg' }) {
  const styles = {
    'RISK ON': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: TrendingUp },
    'CAUTIOUS': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle },
    'RISK OFF': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: TrendingDown },
  };
  const s = styles[regime] || styles['CAUTIOUS'];
  const Icon = s.icon;

  if (size === 'lg') {
    return (
      <div className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl ${s.bg} ${s.text} border ${s.border}`}>
        <Icon size={22} />
        <span className="text-xl font-bold tracking-tight">{regime}</span>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${s.bg} ${s.text} border ${s.border}`}>
      <Icon size={12} />
      {regime}
    </span>
  );
}

// ── Allocation Ring ─────────────────────────────────────────────────────────

function AllocationRing({ equity, tbills }) {
  const eqPct = Math.round((equity || 0) * 100);
  const tbPct = 100 - eqPct;
  const eqDeg = eqPct * 3.6;

  return (
    <div className="relative w-36 h-36">
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(#10b981 0deg ${eqDeg}deg, #e5e7eb ${eqDeg}deg 360deg)`,
        }}
      />
      <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-emerald-700">{eqPct}%</span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Equity</span>
      </div>
    </div>
  );
}

// ── Config Field ────────────────────────────────────────────────────────────

function ConfigField({ field, value, onChange }) {
  const { key, label, type, step, suffix, options, help, pct } = field;

  if (type === 'toggle') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">{label}</span>
        <button
          onClick={() => onChange(key, !value)}
          className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
        <select
          value={value || ''}
          onChange={(e) => onChange(key, e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-emerald-400 transition-colors"
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label} {help && <span className="text-gray-300">({help})</span>}</label>
      <div className="relative">
        <input
          type={type}
          value={value ?? ''}
          step={step}
          onChange={(e) => {
            let v = e.target.value;
            if (type === 'number' && v !== '') v = Number(v);
            onChange(key, v);
          }}
          className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-colors pr-12"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Metrics Table Row ───────────────────────────────────────────────────────

const METRICS_DISPLAY = [
  { key: 'cagr', label: 'CAGR', fmt: 'pct' },
  { key: 'total_return', label: 'Total Return', fmt: 'pct' },
  { key: 'volatility', label: 'Volatility', fmt: 'pct' },
  { key: 'sharpe', label: 'Sharpe', fmt: 'num' },
  { key: 'sortino', label: 'Sortino', fmt: 'num' },
  { key: 'calmar', label: 'Calmar', fmt: 'num' },
  { key: 'max_drawdown', label: 'Max Drawdown', fmt: 'pct' },
  { key: 'max_dd_duration', label: 'Max DD Duration', fmt: 'mo' },
  { key: 'hit_rate', label: 'Hit Rate', fmt: 'pct' },
  { key: 'best_month', label: 'Best Month', fmt: 'pct' },
  { key: 'worst_month', label: 'Worst Month', fmt: 'pct' },
  { key: 'up_down_ratio', label: 'Up/Down Ratio', fmt: 'num' },
];

// ── Main Page ───────────────────────────────────────────────────────────────

export default function MacroRegimePage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [results, setResults] = useState(null);
  const [predict, setPredict] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [runStatus, setRunStatus] = useState({ running: false });
  const [runLog, setRunLog] = useState('');
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showPlots, setShowPlots] = useState(false);
  const [activeTab, setActiveTab] = useState('charts');
  const [toast, setToast] = useState(null);
  const logRef = useRef(null);
  const pollRef = useRef(null);

  // ── Load data on mount ──────────────────────────────────────────────────

  const loadResults = useCallback(async () => {
    try {
      const res = await fetch('/api/macro-regime/results');
      const data = await res.json();
      if (data.backtest) setResults(data);
    } catch { /* ignore */ }
  }, []);

  const loadPredict = useCallback(async () => {
    setPredictLoading(true);
    try {
      const res = await fetch('/api/macro-regime/predict');
      const data = await res.json();
      if (!data.error) setPredict(data);
      else if (data.needsBacktest) setPredict(null);
    } catch { /* ignore */ }
    setPredictLoading(false);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/macro-regime/config').then((r) => r.json()).then((d) => {
        if (d.config) setConfig({ ...DEFAULT_CONFIG, ...d.config });
      }),
      loadResults(),
      loadPredict(),
      fetch('/api/macro-regime/run').then((r) => r.json()).then((d) => {
        if (d.running) {
          setRunStatus(d);
          setRunLog(d.log || '');
          setShowLog(true);
        }
      }),
    ]).finally(() => setLoading(false));
  }, [loadResults, loadPredict]);

  // ── Poll run status ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!runStatus.running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/macro-regime/run');
        const data = await res.json();
        setRunLog(data.log || '');
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

        if (!data.running) {
          setRunStatus(data);
          clearInterval(pollRef.current);
          await Promise.all([loadResults(), loadPredict()]);
          setToast({
            message: data.exitCode === 0 ? 'Run completed successfully' : `Run failed (exit code ${data.exitCode})`,
            type: data.exitCode === 0 ? 'success' : 'error',
          });
        }
      } catch { /* ignore */ }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runStatus.running, loadResults]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleRun = async (command) => {
    try {
      const res = await fetch('/api/macro-regime/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (data.error) {
        setToast({ message: data.error, type: 'error' });
        return;
      }
      setRunStatus({ running: true, command });
      setRunLog('');
      setShowLog(true);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleSaveConfig = async () => {
    try {
      const res = await fetch('/api/macro-regime/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (data.error) {
        setToast({ message: data.error, type: 'error' });
      } else {
        setToast({ message: 'Configuration saved & config.yaml updated', type: 'success' });
      }
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleConfigChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // ── Prepare chart data ─────────────────────────────────────────────────

  const backtest = results?.backtest || [];
  const signal = predict;
  const metrics = results?.metrics || [];

  // Sample every Nth row for charts if too many points
  const step = backtest.length > 400 ? 2 : 1;
  const chartRows = backtest.filter((_, i) => i % step === 0 || i === backtest.length - 1);
  const labels = chartRows.map((r) => fmtDate(r.date));

  // Cumulative returns chart
  const cumReturnsData = {
    labels,
    datasets: [
      makeDataset('Model Portfolio', chartRows.map((r) => r.cum_port), COLORS.model),
      makeDataset('95/5 Baseline', chartRows.map((r) => r.cum_ew), COLORS.baseline, false, [4, 2]),
      makeDataset('60/40 Reference', chartRows.map((r) => r.cum_6040), COLORS.sixtyForty, false, [6, 3]),
      makeDataset('Equity Only', chartRows.map((r) => r.cum_equity), COLORS.equity, false, [2, 2]),
      makeDataset('T-Bills Only', chartRows.map((r) => r.cum_tbills), COLORS.tbills, false, [8, 4]),
    ],
  };

  // Drawdowns chart
  const ddModel = computeDrawdowns(chartRows, 'cum_port');
  const ddEquity = computeDrawdowns(chartRows, 'cum_equity');
  const ddBaseline = computeDrawdowns(chartRows, 'cum_ew');
  const drawdownsData = {
    labels,
    datasets: [
      { ...makeDataset('Model', ddModel, COLORS.model, true), backgroundColor: `${COLORS.model}15` },
      { ...makeDataset('Equity', ddEquity, COLORS.equity, true), backgroundColor: `${COLORS.equity}10` },
      { ...makeDataset('95/5', ddBaseline, COLORS.baseline, true), backgroundColor: `${COLORS.baseline}08` },
    ],
  };

  // Weight chart
  const weightData = {
    labels,
    datasets: [
      {
        label: 'Equity Weight',
        data: chartRows.map((r) => r.weight_equity),
        borderColor: COLORS.model,
        backgroundColor: `${COLORS.model}20`,
        fill: true,
        borderWidth: 2,
      },
    ],
  };

  // Probability chart
  const probData = {
    labels,
    datasets: [
      makeDataset('P(Equity Beats T-Bills)', chartRows.map((r) => r.prob_equity), COLORS.probEquity),
      makeDataset('P(T-Bills Win)', chartRows.map((r) => r.prob_tbills), COLORS.probTbills, false, [4, 2]),
    ],
  };

  // Rolling Sharpe
  const rsSharpeModel = computeRollingSharpe(chartRows, 'port_return');
  const rsSharpeEquity = computeRollingSharpe(chartRows, 'ret_equity');
  const rollingSharpeData = {
    labels,
    datasets: [
      makeDataset('Model', rsSharpeModel, COLORS.model),
      makeDataset('Equity', rsSharpeEquity, COLORS.equity, false, [4, 2]),
    ],
  };

  // ── Model metrics ──────────────────────────────────────────────────────

  const modelMetrics = metrics.find((m) => m.label === 'Model Portfolio');

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 lg:p-12 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-8 w-64 rounded-xl skeleton" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-3xl skeleton" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-12 max-w-7xl mx-auto">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Activity size={22} className="text-emerald-600" />
            Macro Regime Allocator
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Dynamic equity/T-bills allocation based on macroeconomic regime detection
          </p>
        </div>
        <div className="flex items-center gap-3">
          {signal && <RegimeBadge regime={signal.regime} />}
          <button
            onClick={loadPredict}
            disabled={predictLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Re-run prediction"
          >
            <RefreshCw size={12} className={predictLoading ? 'animate-spin' : ''} />
            Refresh Signal
          </button>
        </div>
      </div>

      {/* ── Current Signal Hero ───────────────────────────────────────── */}
      {signal ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="lg:col-span-1">
            <div className="flex flex-col items-center gap-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Current Allocation</div>
              <AllocationRing equity={signal.equityWeight} tbills={signal.tbillsWeight} />
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="font-bold text-emerald-700">{fmtPct(signal.equityWeight, 1)}</div>
                  <div className="text-[10px] text-gray-400">EQUITY</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-500">{fmtPct(signal.tbillsWeight, 1)}</div>
                  <div className="text-[10px] text-gray-400">T-BILLS</div>
                </div>
              </div>
              <div className="text-xs text-gray-400 text-center space-y-0.5">
                <div>Allocation for <span className="font-semibold text-gray-600">{signal.allocationFor || '—'}</span></div>
                <div>Data as of <span className="font-semibold text-gray-600">{signal.dataAsOf || '—'}</span></div>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-1">
            <div className="space-y-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Model Signals</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">P(Equity Beats T-Bills)</span>
                  <span className="font-bold text-gray-900">{signal.probEquity?.toFixed(3) || '—'}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(signal.probEquity || 0) * 100}%`,
                      backgroundColor: signal.probEquity > 0.5 ? '#10b981' : '#ef4444',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">P(T-Bills Win)</span>
                  <span className="font-bold text-gray-900">{signal.probTbills?.toFixed(3) || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Crash Overlay</span>
                  <span className={`text-sm font-semibold ${signal.overlay === 'none' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {signal.overlay === 'none' ? 'Clear' : signal.overlay}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Regime</span>
                  <RegimeBadge regime={signal.regime} size="sm" />
                </div>
                {signal.marketSignals && Object.keys(signal.marketSignals).length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Market Signals</div>
                    {Object.entries(signal.marketSignals).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-gray-400">{k}</span>
                        <span className={`font-mono font-semibold ${v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-gray-600'}`}>
                          {v > 0 ? '+' : ''}{fmtNum(v, 2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:col-span-1">
            <StatCard
              label="CAGR"
              value={modelMetrics ? fmtPct(modelMetrics.cagr) : null}
              variant="positive"
            />
            <StatCard
              label="Sharpe Ratio"
              value={modelMetrics ? fmtNum(modelMetrics.sharpe) : null}
              variant="positive"
            />
            <StatCard
              label="Max Drawdown"
              value={modelMetrics ? fmtPct(modelMetrics.max_drawdown) : null}
              variant="negative"
            />
            <StatCard
              label="Sortino"
              value={modelMetrics ? fmtNum(modelMetrics.sortino) : null}
            />
          </div>
        </div>
      ) : (
        <Card className="mb-6">
          <div className="text-center py-8 text-gray-400">
            {predictLoading ? (
              <>
                <Loader2 size={32} className="mx-auto mb-3 text-emerald-400 animate-spin" />
                <p className="text-sm font-medium">Running prediction...</p>
              </>
            ) : (
              <>
                <Activity size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium">No prediction available</p>
                <p className="text-xs mt-1">Run a full backtest first, then predictions will show the current allocation signal</p>
              </>
            )}
          </div>
        </Card>
      )}

      {/* ── Run Controls ──────────────────────────────────────────────── */}
      <Card title="Run Controls" className="mb-6" actions={
        runStatus.running && (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
            <Loader2 size={13} className="animate-spin" />
            Running {runStatus.command}...
          </span>
        )
      }>
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={() => handleRun('predict')}
            disabled={runStatus.running}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Zap size={14} />
            Quick Predict
          </button>
          <button
            onClick={() => handleRun('fast')}
            disabled={runStatus.running}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw size={14} />
            Fast (Cached Data)
          </button>
          <button
            onClick={() => handleRun('run')}
            disabled={runStatus.running}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Play size={14} />
            Full Backtest
          </button>
          <button
            onClick={() => handleRun('validate')}
            disabled={runStatus.running}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Shield size={14} />
            Validate
          </button>
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors ml-auto"
          >
            <Terminal size={14} />
            {showLog ? 'Hide' : 'Show'} Log
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-400">
          <span><strong>Quick Predict:</strong> Uses saved model + cached data (~5s)</span>
          <span className="text-gray-200">|</span>
          <span><strong>Fast:</strong> Re-runs backtest with cached data (~30s)</span>
          <span className="text-gray-200">|</span>
          <span><strong>Full:</strong> Downloads fresh data + backtest (~2min)</span>
          <span className="text-gray-200">|</span>
          <span><strong>Validate:</strong> Full robustness suite (~5min)</span>
        </div>

        {showLog && (
          <div className="mt-4">
            <div
              ref={logRef}
              className="bg-gray-950 text-gray-300 rounded-2xl p-4 font-mono text-xs max-h-64 overflow-y-auto whitespace-pre-wrap"
            >
              {runLog || 'No output yet. Run a command to see output here.'}
            </div>
          </div>
        )}
      </Card>

      {/* ── Configuration ─────────────────────────────────────────────── */}
      <Card className="mb-6" actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors"
          >
            <Check size={12} />
            Save Config
          </button>
          <button
            onClick={() => setConfig(DEFAULT_CONFIG)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={12} />
            Reset
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
          >
            <Settings size={12} />
            {showConfig ? 'Hide' : 'Show'}
            {showConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      }>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Configuration</h2>
          <span className="text-xs text-gray-400">(config.yaml)</span>
        </div>

        {showConfig && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            {CONFIG_SECTIONS.map((section) => (
              <div key={section.label}>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  {section.label}
                </h3>
                <div className="space-y-3">
                  {section.fields.map((field) => (
                    <ConfigField
                      key={field.key}
                      field={field}
                      value={config[field.key]}
                      onChange={handleConfigChange}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Tab Selector ──────────────────────────────────────────────── */}
      {results && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100/60 rounded-2xl p-1 w-fit">
            {[
              { id: 'charts', label: 'Interactive Charts', icon: BarChart3 },
              { id: 'plots', label: 'Backend Plots', icon: Eye },
              { id: 'metrics', label: 'Performance', icon: Target },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === id
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Interactive Charts ─────────────────────────────────────── */}
          {activeTab === 'charts' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Cumulative Returns ($100 invested)">
                  <div className="h-72">
                    <Line data={cumReturnsData} options={buildChartOptions('Cumulative Returns', 'dollar')} />
                  </div>
                </Card>

                <Card title="Drawdowns">
                  <div className="h-72">
                    <Line data={drawdownsData} options={buildChartOptions('Drawdowns', 'pct')} />
                  </div>
                </Card>

                <Card title="Equity Weight Over Time">
                  <div className="h-72">
                    <Line data={weightData} options={{
                      ...buildChartOptions('Equity Weight', 'pct'),
                      scales: {
                        ...buildChartOptions('Equity Weight', 'pct').scales,
                        y: {
                          ...buildChartOptions('Equity Weight', 'pct').scales.y,
                          min: 0,
                          max: 1,
                        },
                      },
                    }} />
                  </div>
                </Card>

                <Card title="Model Probabilities">
                  <div className="h-72">
                    <Line data={probData} options={{
                      ...buildChartOptions('Probabilities', 'pct'),
                      scales: {
                        ...buildChartOptions('Probabilities', 'pct').scales,
                        y: {
                          ...buildChartOptions('Probabilities', 'pct').scales.y,
                          min: 0,
                          max: 1,
                        },
                      },
                    }} />
                  </div>
                </Card>
              </div>

              <Card title="Rolling 24-Month Sharpe Ratio">
                <div className="h-64">
                  <Line data={rollingSharpeData} options={buildChartOptions('Rolling Sharpe', 'number')} />
                </div>
              </Card>
            </div>
          )}

          {/* ── Backend Plots ──────────────────────────────────────────── */}
          {activeTab === 'plots' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(results.plots || []).map((plot) => (
                <Card key={plot} title={plot.replace(/_/g, ' ').replace('.png', '').replace(/\b\w/g, (c) => c.toUpperCase())}>
                  <img
                    src={`/api/macro-regime/plots?name=${plot}`}
                    alt={plot}
                    className="w-full rounded-xl"
                    loading="lazy"
                  />
                </Card>
              ))}
              {(!results.plots || results.plots.length === 0) && (
                <Card className="col-span-2">
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No plots available. Run a full backtest to generate plots.
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ── Performance Metrics ────────────────────────────────────── */}
          {activeTab === 'metrics' && (
            <Card title="Investment Metrics Comparison">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Metric</th>
                      {metrics.map((m) => (
                        <th key={m.label} className="text-right py-3 px-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          {m.label === 'Model Portfolio' ? (
                            <span className="text-emerald-600">{m.label}</span>
                          ) : m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS_DISPLAY.map(({ key, label, fmt }) => (
                      <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 px-3 text-gray-600 font-medium">{label}</td>
                        {metrics.map((m, j) => {
                          const v = m[key];
                          let display = '—';
                          if (v != null) {
                            if (fmt === 'pct') display = fmtPct(v);
                            else if (fmt === 'num') display = fmtNum(v);
                            else if (fmt === 'mo') display = `${Math.round(v)} mo`;
                          }
                          const isModel = j === 0;
                          return (
                            <td key={m.label} className={`py-2.5 px-3 text-right font-mono text-xs ${isModel ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
