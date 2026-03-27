'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Play, Zap, RefreshCw, Shield, Settings, Check, Loader2, Terminal, ChevronDown } from 'lucide-react';
import Card from '@/components/Card';
import Toast from '@/components/Toast';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/* ── Config ──────────────────────────────────────────────────────── */

const DEFAULT_CONFIG = {
  start_date: '2000-01-01', end_date: '2026-03-01', equity_ticker: 'SPY',
  forecast_horizon_months: 1, macro_lag_months: 1, momentum_window: 3,
  volatility_window: 3, regularization_C: 0.5, class_weight: null, max_iter: 1000,
  recency_halflife_months: 12, window_type: 'expanding', rolling_window_months: 120,
  min_train_months: 48, holdout_start: '2020-01-01', baseline_equity: 0.95,
  baseline_tbills: 0.05, min_weight: 0.10, max_weight: 0.97,
  allocation_steepness: 13.0, weight_smoothing_up: 0.98, weight_smoothing_down: 0.97,
  crash_overlay: true, vix_spike_threshold: 7.0, drawdown_defense_threshold: -10.0,
  credit_spike_threshold: 1.5,
};

const CFG = [
  { label: 'Data', fields: [
    { key: 'start_date', label: 'Start', type: 'text' }, { key: 'end_date', label: 'End', type: 'text' },
    { key: 'equity_ticker', label: 'Ticker', type: 'text' }, { key: 'forecast_horizon_months', label: 'Horizon', type: 'number', step: 1, suffix: 'mo' },
  ]},
  { label: 'Features', fields: [
    { key: 'macro_lag_months', label: 'Macro Lag', type: 'number', step: 1, suffix: 'mo' },
    { key: 'momentum_window', label: 'Momentum', type: 'number', step: 1, suffix: 'mo' },
    { key: 'volatility_window', label: 'Volatility', type: 'number', step: 1, suffix: 'mo' },
  ]},
  { label: 'Model', fields: [
    { key: 'regularization_C', label: 'C', type: 'number', step: 0.05 },
    { key: 'max_iter', label: 'Iters', type: 'number', step: 100 },
  ]},
  { label: 'Training', fields: [
    { key: 'recency_halflife_months', label: 'Halflife', type: 'number', step: 1, suffix: 'mo' },
    { key: 'window_type', label: 'Window', type: 'select', options: ['expanding', 'rolling'] },
    { key: 'rolling_window_months', label: 'Rolling', type: 'number', step: 12, suffix: 'mo' },
    { key: 'min_train_months', label: 'Min Train', type: 'number', step: 6, suffix: 'mo' },
    { key: 'holdout_start', label: 'Holdout', type: 'text' },
  ]},
  { label: 'Allocation', fields: [
    { key: 'baseline_equity', label: 'Base Eq', type: 'number', step: 0.05 },
    { key: 'baseline_tbills', label: 'Base TB', type: 'number', step: 0.05 },
    { key: 'min_weight', label: 'Min', type: 'number', step: 0.05 },
    { key: 'max_weight', label: 'Max', type: 'number', step: 0.01 },
    { key: 'allocation_steepness', label: 'Steep', type: 'number', step: 0.5 },
    { key: 'weight_smoothing_up', label: 'Sm Up', type: 'number', step: 0.01 },
    { key: 'weight_smoothing_down', label: 'Sm Dn', type: 'number', step: 0.01 },
  ]},
  { label: 'Crash Overlay', fields: [
    { key: 'crash_overlay', label: 'Enable', type: 'toggle' },
    { key: 'vix_spike_threshold', label: 'VIX', type: 'number', step: 0.5 },
    { key: 'drawdown_defense_threshold', label: 'DD', type: 'number', step: 1, suffix: '%' },
    { key: 'credit_spike_threshold', label: 'Credit', type: 'number', step: 0.1 },
  ]},
];

const METRICS_KEYS = [
  { k: 'cagr', l: 'CAGR', f: 'p' }, { k: 'total_return', l: 'Total Return', f: 'p' },
  { k: 'volatility', l: 'Volatility', f: 'p' }, { k: 'sharpe', l: 'Sharpe', f: 'n' },
  { k: 'sortino', l: 'Sortino', f: 'n' }, { k: 'calmar', l: 'Calmar', f: 'n' },
  { k: 'max_drawdown', l: 'Max DD', f: 'p' }, { k: 'max_dd_duration', l: 'DD Duration', f: 'm' },
  { k: 'hit_rate', l: 'Hit Rate', f: 'p' }, { k: 'best_month', l: 'Best Mo', f: 'p' },
  { k: 'worst_month', l: 'Worst Mo', f: 'p' }, { k: 'up_down_ratio', l: 'Up/Down', f: 'n' },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

const fp = (v) => { const n = Number(v); return v != null && isFinite(n) ? `${(n * 100).toFixed(1)}%` : '--'; };
const fn = (v) => { const n = Number(v); return v != null && isFinite(n) ? n.toFixed(2) : '--'; };
const fd = (d) => d ? String(d).slice(0, 7) : '--';

function drawdowns(rows, key) {
  let pk = 0;
  return rows.map(r => { const v = r[key]; if (v == null) return null; if (v > pk) pk = v; return pk > 0 ? v / pk - 1 : 0; });
}

function rollingSharpe(rows, key, w = 24) {
  const r = rows.map(x => x[key]);
  return r.map((_, i) => {
    if (i < w) return null;
    const s = r.slice(i - w, i).filter(v => v != null);
    if (s.length < w * 0.75) return null;
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    return sd > 0 ? (m * 12) / (sd * Math.sqrt(12)) : 0;
  });
}

const C = { m: '#10b981', e: '#8b5cf6', b: '#3b82f6', s: '#f59e0b', r: '#ef4444' };

/* ── Per-stock standalone risk (weighted sum of bad-factor exposures) ── */

function computePerStockRisk(allocations, riskFactorWeights) {
  if (!allocations?.length || !riskFactorWeights?.length) return {};
  const result = {};
  for (const a of allocations) {
    if (!a.ticker) continue;
    const exposures = (a.factorExposures || []).map(v => Number(v) || 0);
    let score = 0;
    let wSum = 0;
    for (let i = 0; i < exposures.length; i++) {
      const w = Number(riskFactorWeights[i]) || 0;
      score += exposures[i] * w;
      wSum += w;
    }
    // Normalize to 0-1 scale (exposures are 0-1, weights are 0-1)
    result[a.ticker] = wSum > 0 ? score / wSum : 0;
  }
  return result;
}

/* ── Macro derisk overlay engine ──────────────────────────────── */

const DERISK_DEFAULTS = {
  alpha: 0.5,           // blend between vol and composite risk for aggressiveness
  derisk_start: 0.70,   // M threshold below which derisking kicks in
  max_trim: 0.20,       // max relative cut from base weight
  max_boost: 0.10,      // max relative boost above base weight
  cash_min: 0.002,      // 0.2%
  cash_max: 0.02,       // 2.0%
};

/**
 * Compute macro-adjusted portfolio weights.
 *
 * @param {Object} params
 * @param {Object} params.baseWeights   { ticker: percent } — base portfolio weights (sum ~100)
 * @param {Object} params.volScores  { ticker: number }  — Realized annualized vol per stock (e.g. 0.32 = 32%)
 * @param {Object} params.compRisks     { ticker: 0-1 }    — Standalone composite risk per stock
 * @param {number} params.M             Macro regime score 0-1 (higher = stronger / risk-on)
 * @param {Object} params.cfg           Override config fields from DERISK_DEFAULTS
 * @returns {{ weights: Object, cash: number, D: number, aggressiveness: Object, trimmed: boolean }}
 */
function computeDeriskOverlay({ baseWeights, volScores, compRisks, M, cfg = {} }) {
  const c = { ...DERISK_DEFAULTS, ...cfg };
  const tickers = Object.keys(baseWeights).filter(t => t !== 'CASH');

  // If no stocks or no signal, return base weights unchanged
  if (tickers.length === 0 || M == null) {
    return { weights: { ...baseWeights }, cash: Number(baseWeights.CASH || 0) / 100, D: 0, aggressiveness: {}, trimmed: false };
  }

  // Convert base weights from percent to fractions
  const wBase = {};
  let stockSum = 0;
  for (const t of tickers) {
    wBase[t] = (Number(baseWeights[t]) || 0) / 100;
    stockSum += wBase[t];
  }
  const cashBase = (Number(baseWeights.CASH) || 0) / 100;

  // Step 2: Stock aggressiveness score
  // Collect raw vol and composite for normalization
  const rawVol = tickers.map(t => Number(volScores[t]) || 0);
  const rawComp = tickers.map(t => Number(compRisks[t]) || 0);

  const minMax = (arr) => {
    const mn = Math.min(...arr);
    const mx = Math.max(...arr);
    const range = mx - mn;
    return arr.map(v => range > 1e-9 ? (v - mn) / range : 0.5);
  };

  const volNorm = minMax(rawVol);
  const compNorm = minMax(rawComp);

  const agg = {};
  tickers.forEach((t, i) => {
    agg[t] = c.alpha * volNorm[i] + (1 - c.alpha) * compNorm[i];
  });

  // Step 3: Derisk strength
  const D = Math.max(0, (c.derisk_start - M) / c.derisk_start);

  // If no derisking needed, return base unchanged with min cash
  if (D === 0) {
    const result = {};
    for (const t of tickers) result[t] = Number(baseWeights[t]) || 0;
    result.CASH = Number(baseWeights.CASH) || 0;
    return { weights: result, cash: cashBase, D: 0, aggressiveness: agg, trimmed: false };
  }

  // Step 4: Relative aggressiveness
  const aggValues = tickers.map(t => agg[t]);
  const aggMean = aggValues.reduce((s, v) => s + v, 0) / aggValues.length;

  const Z = {};
  const aggSide = {};
  const defSide = {};
  for (const t of tickers) {
    Z[t] = agg[t] - aggMean;
    aggSide[t] = Math.max(0, Z[t]);
    defSide[t] = Math.max(0, -Z[t]);
  }

  // Scale to [0,1] using cross-sectional max
  const maxAgg = Math.max(...tickers.map(t => aggSide[t]));
  const maxDef = Math.max(...tickers.map(t => defSide[t]));

  const aggScaled = {};
  const defScaled = {};
  for (const t of tickers) {
    aggScaled[t] = maxAgg > 1e-9 ? aggSide[t] / maxAgg : 0;
    defScaled[t] = maxDef > 1e-9 ? defSide[t] / maxDef : 0;
  }

  // Step 5: Trim aggressive names
  const wTrim = {};
  for (const t of tickers) {
    wTrim[t] = wBase[t] * (1 - c.max_trim * D * aggScaled[t]);
  }

  // Step 6: Removed weight
  let removed = 0;
  for (const t of tickers) {
    removed += wBase[t] - wTrim[t];
  }

  // Step 7: Cash target (strictly one-sided — only use what trimming freed)
  const cashTarget = c.cash_min + D * (c.cash_max - c.cash_min);
  const cashExtra = Math.max(0, cashTarget - cashBase);
  const actualCashExtra = Math.min(cashExtra, removed);
  const actualCash = cashBase + actualCashExtra;
  const redistribute = Math.max(0, removed - actualCashExtra);

  // Step 8: Redistribute toward defensive names
  const defSum = tickers.reduce((s, t) => s + defScaled[t], 0);
  const wNew = {};
  for (const t of tickers) {
    const add = defSum > 1e-9 ? redistribute * (defScaled[t] / defSum) : 0;
    wNew[t] = wTrim[t] + add;
  }

  // Step 9: Bound all changes relative to base weight
  const wBounded = {};
  for (const t of tickers) {
    const lower = wBase[t] * (1 - c.max_trim);
    const upper = wBase[t] * (1 + c.max_boost);
    wBounded[t] = Math.min(upper, Math.max(lower, wNew[t]));
  }

  // Step 10: Final renormalization — stocks sum to (1 - actualCash)
  const boundedSum = tickers.reduce((s, t) => s + wBounded[t], 0);
  const targetStockSum = 1 - actualCash;
  const scale = boundedSum > 1e-9 ? targetStockSum / boundedSum : 1;

  const finalWeights = {};
  for (const t of tickers) {
    finalWeights[t] = Math.round(wBounded[t] * scale * 10000) / 100; // back to percent, 2 decimals
  }
  finalWeights.CASH = Math.round(actualCash * 10000) / 100;

  return { weights: finalWeights, cash: actualCash, D, aggressiveness: agg, trimmed: true };
}

function cOpts(yf) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 5, font: { size: 10 }, padding: 12, color: '#6b7280' } },
      tooltip: {
        backgroundColor: '#fff', titleColor: '#111', bodyColor: '#6b7280', borderColor: '#e5e7eb', borderWidth: 1, padding: 8,
        callbacks: { label: ctx => {
          const v = ctx.parsed.y;
          return yf === 'pct' ? `${ctx.dataset.label}: ${(v * 100).toFixed(1)}%` : yf === '$' ? `${ctx.dataset.label}: $${v.toFixed(0)}` : `${ctx.dataset.label}: ${v.toFixed(2)}`;
        }},
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 9 }, color: '#9ca3af' } },
      y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 9 }, color: '#9ca3af',
        callback: v => yf === 'pct' ? `${(v * 100).toFixed(0)}%` : yf === '$' ? `$${v}` : v.toFixed(1),
      }},
    },
    elements: { point: { radius: 0, hoverRadius: 3 }, line: { tension: 0.3, borderWidth: 1.5 } },
  };
}

function ds(label, data, color, fill, dash) {
  return { label, data, borderColor: color, backgroundColor: fill ? `${color}12` : 'transparent', fill: !!fill, borderDash: dash, borderWidth: 1.5 };
}

const cOpts01 = o => ({ ...o, scales: { ...o.scales, y: { ...o.scales.y, min: 0, max: 1 } } });

/* ── Tiny components ─────────────────────────────────────────────── */

function CfgField({ f, value, onChange }) {
  if (f.type === 'toggle') return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-[11px] text-gray-500">{f.label}</span>
      <button type="button" onClick={() => onChange(f.key, !value)}
        className={`relative h-4 w-7 rounded-full ${value ? 'bg-emerald-500' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${value ? 'left-3.5' : 'left-0.5'}`} />
      </button>
    </label>
  );
  if (f.type === 'select') return (
    <div>
      <label className="mb-0.5 block text-[10px] text-gray-400">{f.label}</label>
      <select value={value || ''} onChange={e => onChange(f.key, e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-700 focus:border-gray-400 focus:outline-none">{f.options.map(o => <option key={o}>{o}</option>)}</select>
    </div>
  );
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-gray-400">{f.label}</label>
      <div className="relative">
        <input type={f.type} value={value ?? ''} step={f.step}
          onChange={e => { let v = e.target.value; if (f.type === 'number' && v !== '') v = Number(v); onChange(f.key, v); }}
          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 pr-7 text-[11px] text-gray-700 focus:border-gray-400 focus:outline-none" />
        {f.suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-300">{f.suffix}</span>}
      </div>
    </div>
  );
}

function MdRender({ content }) {
  if (!content) return null;
  const lines = content.split('\n'), out = []; let tbl = [], inTbl = false, k = 0;
  const flush = () => { if (!tbl.length) return; out.push(
    <div key={k++} className="my-2 overflow-x-auto"><table className="w-full text-[11px]">
      <thead><tr className="border-b border-gray-200">{tbl[0].map((c, i) => <th key={i} className="px-3 py-1.5 text-left text-[10px] text-gray-400">{c.trim()}</th>)}</tr></thead>
      <tbody>{tbl.slice(1).map((row, ri) => <tr key={ri} className="border-b border-gray-50">{row.map((c, ci) => <td key={ci} className="px-3 py-1.5 text-gray-500">{c.trim() || '--'}</td>)}</tr>)}</tbody>
    </table></div>); tbl = []; };
  for (const l of lines) {
    if (/^\|[\s:|-]+\|$/.test(l)) continue;
    if (l.startsWith('|') && l.endsWith('|')) { inTbl = true; tbl.push(l.slice(1, -1).split('|')); continue; }
    if (inTbl) { flush(); inTbl = false; }
    if (l.startsWith('# ')) out.push(<h1 key={k++} className="mb-2 mt-4 text-sm font-semibold text-gray-900">{l.slice(2)}</h1>);
    else if (l.startsWith('## ')) out.push(<h2 key={k++} className="mb-1 mt-3 text-xs font-semibold text-gray-700">{l.slice(3)}</h2>);
    else if (l.startsWith('- ')) out.push(<li key={k++} className="ml-4 list-disc text-[11px] text-gray-500">{l.slice(2)}</li>);
    else if (l.trim()) out.push(<p key={k++} className="mb-1 text-[11px] text-gray-500">{l}</p>);
  }
  if (inTbl) flush();
  return <div>{out}</div>;
}

/* ══════════════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════════════ */

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
  const [detailTab, setDetailTab] = useState('');
  const [toast, setToast] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [historyLog, setHistoryLog] = useState(null);
  const logRef = useRef(null);
  const pollRef = useRef(null);

  /* ── Allocation state ─────────────────────────────────────────── */
  const [allocConfig, setAllocConfig] = useState(null);     // full allocation_config
  const [allocWeights, setAllocWeights] = useState({});      // { ticker: number } editable
  const [allocLoaded, setAllocLoaded] = useState(false);     // guard for auto-save
  const [syncingWeights, setSyncingWeights] = useState(false);
  const allocSaveTimer = useRef(null);

  /* ── Derisk overlay config ─────────────────────────────────── */
  const [deriskCfg, setDeriskCfg] = useState(DERISK_DEFAULTS);
  const [showOverlayCfg, setShowOverlayCfg] = useState(false);

  /* ── Realized vol ────────────────────────────────────────────── */
  const [realizedVol, setRealizedVol] = useState(null);       // { ticker: annualized vol }

  /* ── Sandbox / dev mode ─────────────────────────────────────── */
  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxM, setSandboxM] = useState(0.5);

  const loadResults = useCallback(async () => {
    try { const d = await fetch('/api/macro-regime/results').then(r => r.json()); if (d.backtest) setResults(d); } catch {}
  }, []);
  const loadPredict = useCallback(async (fresh = false) => {
    setPredictLoading(true);
    try {
      const r = fresh ? await fetch('/api/macro-regime/predict', { method: 'POST' }) : await fetch('/api/macro-regime/predict');
      const d = await r.json(); if (!d.error) setPredict(d); else if (d.needsBacktest) setPredict(null);
    } catch {} setPredictLoading(false);
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const [cfgD, resD, predD, runD, allocD, wD] = await Promise.all([
          fetch('/api/macro-regime/config').then(r => r.json()),
          fetch('/api/macro-regime/results').then(r => r.json()),
          fetch('/api/macro-regime/predict').then(r => r.json()),
          fetch('/api/macro-regime/run').then(r => r.json()),
          fetch('/api/allocation').then(r => r.json()),
          fetch('/api/macro-regime/weights').then(r => r.json()),
        ]);
        if (off) return;
        if (cfgD.config) {
          setConfig({ ...DEFAULT_CONFIG, ...cfgD.config });
          if (cfgD.config.deriskOverlay) setDeriskCfg({ ...DERISK_DEFAULTS, ...cfgD.config.deriskOverlay });
        }
        if (resD.backtest) setResults(resD);
        if (!predD.error) setPredict(predD);
        if (runD.history) setRunHistory(runD.history);
        if (runD.running) { setRunStatus(runD); setRunLog(runD.log || ''); setShowLog(true); }
        if (allocD.config) setAllocConfig(allocD.config);
        // Load saved macro-regime weights, or fall back to allocation page's userWeights
        if (wD.weights) {
          setAllocWeights(wD.weights);
        } else if (allocD.config?.allocations) {
          const w = {};
          for (const a of allocD.config.allocations) {
            if (a.ticker) w[a.ticker] = Number(a.userWeight) || 0;
          }
          setAllocWeights(w);
        }
        setAllocLoaded(true);
      } finally { if (!off) setLoading(false); }
    })();
    return () => { off = true; };
  }, []);

  // Fetch realized vol when allocConfig tickers are known
  useEffect(() => {
    if (!allocConfig?.allocations) return;
    const tickers = allocConfig.allocations.filter(a => a.ticker && a.ticker !== 'CASH').map(a => a.ticker);
    if (tickers.length === 0) return;
    (async () => {
      try {
        const d = await fetch(`/api/realized-vol?tickers=${tickers.join(',')}`).then(r => r.json());
        if (d.vols) setRealizedVol(d.vols);
      } catch {}
    })();
  }, [allocConfig]);

  useEffect(() => {
    if (!runStatus.running) { if (pollRef.current) clearInterval(pollRef.current); return; }
    pollRef.current = setInterval(async () => {
      try {
        const d = await fetch('/api/macro-regime/run').then(r => r.json());
        setRunLog(d.log || '');
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        if (!d.running) {
          setRunStatus(d); if (d.history) setRunHistory(d.history);
          clearInterval(pollRef.current);
          await Promise.all([loadResults(), loadPredict(false)]);
          setToast({ message: d.exitCode === 0 ? 'Completed' : `Failed (exit ${d.exitCode})`, type: d.exitCode === 0 ? 'success' : 'error' });
        }
      } catch {}
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runStatus.running, loadResults, loadPredict]);

  const handleRun = async (cmd) => {
    try {
      const d = await fetch('/api/macro-regime/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) }).then(r => r.json());
      if (d.error) { setToast({ message: d.error, type: 'error' }); return; }
      setRunStatus({ running: true, command: cmd }); setRunLog(''); setShowLog(true);
    } catch (e) { setToast({ message: e.message, type: 'error' }); }
  };
  const saveConfig = async () => {
    try {
      const merged = { ...config, deriskOverlay: deriskCfg };
      const d = await fetch('/api/macro-regime/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: merged }) }).then(r => r.json());
      setToast({ message: d.error || 'Saved', type: d.error ? 'error' : 'success' });
    } catch (e) { setToast({ message: e.message, type: 'error' }); }
  };
  const viewLog = async (id) => {
    if (historyLog?.id === id) { setHistoryLog(null); return; }
    try { const d = await fetch(`/api/macro-regime/run?history=${id}`).then(r => r.json()); if (d.run) setHistoryLog(d.run); } catch {}
  };

  /* ── Allocation helpers ──────────────────────────────────────── */
  const stockRisks = useMemo(() => {
    if (!allocConfig) return {};
    return computePerStockRisk(allocConfig.allocations || [], allocConfig.riskFactorWeights || []);
  }, [allocConfig]);

  const allocTickers = useMemo(() => {
    if (!allocConfig?.allocations) return [];
    // Stocks first, then CASH at the end
    const stocks = allocConfig.allocations.filter(a => a.ticker && a.ticker !== 'CASH').map(a => a.ticker);
    const hasCash = allocConfig.allocations.some(a => a.ticker === 'CASH');
    return hasCash ? [...stocks, 'CASH'] : stocks;
  }, [allocConfig]);

  // Realized vol per stock (annualized), fallback to factor exposure if not yet loaded
  const volScores = useMemo(() => {
    if (!allocConfig?.allocations) return {};
    const m = {};
    for (const a of allocConfig.allocations) {
      if (!a.ticker) continue;
      if (realizedVol && realizedVol[a.ticker] != null) {
        m[a.ticker] = realizedVol[a.ticker]; // raw annualized vol (e.g. 0.32 = 32%)
      } else {
        m[a.ticker] = Number((a.factorExposures || [])[0]) || 0; // fallback
      }
    }
    return m;
  }, [allocConfig, realizedVol]);

  // Macro regime score M = equityWeight from predict signal (0-1, higher = risk-on)
  const macroM = predict?.equityWeight ?? null;

  // Compute overlay
  const overlay = useMemo(() => {
    if (macroM == null || allocTickers.length === 0) return null;
    return computeDeriskOverlay({
      baseWeights: allocWeights,
      volScores,
      compRisks: stockRisks,
      M: macroM,
      cfg: deriskCfg,
    });
  }, [allocWeights, volScores, stockRisks, macroM, deriskCfg, allocTickers]);

  // Sandbox overlay — uses sandboxM instead of live M
  const sandboxOverlay = useMemo(() => {
    if (!showSandbox || allocTickers.length === 0) return null;
    return computeDeriskOverlay({
      baseWeights: allocWeights,
      volScores,
      compRisks: stockRisks,
      M: sandboxM,
      cfg: deriskCfg,
    });
  }, [showSandbox, allocWeights, volScores, stockRisks, sandboxM, deriskCfg, allocTickers]);

  const handleAllocChange = (ticker, val) => {
    const n = val === '' ? 0 : Number(val);
    setAllocWeights(p => ({ ...p, [ticker]: n }));
  };

  // Auto-save weights with debounce
  useEffect(() => {
    if (!allocLoaded) return;
    if (allocSaveTimer.current) clearTimeout(allocSaveTimer.current);
    allocSaveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/macro-regime/weights', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weights: allocWeights }),
        });
      } catch {}
    }, 800);
    return () => { if (allocSaveTimer.current) clearTimeout(allocSaveTimer.current); };
  }, [allocWeights, allocLoaded]);

  const syncWeightsFromPortfolio = async () => {
    setSyncingWeights(true);
    try {
      const [portfolioRes, allocRes] = await Promise.all([
        fetch('/api/portfolio').then(r => r.json()),
        !allocConfig ? fetch('/api/allocation').then(r => r.json()) : null,
      ]);
      if (allocRes?.config && !allocConfig) setAllocConfig(allocRes.config);
      const holdings = portfolioRes.holdings || [];
      const cashVal = portfolioRes.cash || 0;
      if (holdings.length === 0) { setSyncingWeights(false); return; }

      const tickers = holdings.map(h => h.ticker).join(',');
      const quotesData = await fetch(`/api/quotes?tickers=${tickers}`).then(r => r.json());
      const quotes = quotesData.quotes || quotesData;

      let totalAum = cashVal;
      const values = {};
      for (const h of holdings) {
        const price = quotes[h.ticker]?.price || h.cost_basis || 0;
        const val = h.shares * price;
        values[h.ticker] = val;
        totalAum += val;
      }
      if (totalAum <= 0) { setSyncingWeights(false); return; }

      const w = {};
      for (const [ticker, val] of Object.entries(values)) {
        w[ticker] = Number(((val / totalAum) * 100).toFixed(2));
      }
      w.CASH = Number(((cashVal / totalAum) * 100).toFixed(2));

      setAllocWeights(w);
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
    setSyncingWeights(false);
  };

  const allocTotal = useMemo(() => Object.values(allocWeights).reduce((s, v) => s + (Number(v) || 0), 0), [allocWeights]);

  /* Dedup backtest rows */
  const btMap = new Map();
  for (const row of (results?.backtest || [])) { const k = row.date; const ex = btMap.get(k); if (!ex || (row.rebalance_date || '') > (ex.rebalance_date || '')) btMap.set(k, row); }
  const bt = [...btMap.values()];
  const metrics = results?.metrics || [];
  const sig = predict;
  const mm = metrics.find(m => m.label === 'Model Portfolio');
  const em = metrics.find(m => m.label && m.label.includes('Equity'));
  const step = bt.length > 400 ? 2 : 1;
  const cr = bt.filter((_, i) => i % step === 0 || i === bt.length - 1);
  const lbl = cr.map(r => fd(r.date));

  if (loading) return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="h-5 w-36 rounded skeleton mb-8" />
      <div className="h-40 rounded-3xl skeleton" />
    </div>
  );

  const eq = Math.round((sig?.equityWeight || 0) * 100);
  const regime = sig?.regime === 'RISK ON' ? 'Risk On' : sig?.regime === 'RISK OFF' ? 'Risk Off' : sig ? 'Cautious' : null;
  const rDot = sig?.regime === 'RISK ON' ? 'bg-emerald-500' : sig?.regime === 'RISK OFF' ? 'bg-red-500' : 'bg-amber-500';

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">

      {/* ━━ TOP: Signal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="mb-10">
        <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900 mb-1">Macro Regime</h1>

        {sig ? (
          <div className="mt-4">
            {/* Big number + regime */}
            <div className="flex items-end gap-3 mb-4">
              <span className="text-6xl font-semibold tabular-nums leading-none text-gray-900">{eq}%</span>
              <div className="pb-1">
                <span className="text-sm text-gray-400">equity allocation</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${rDot}`} />
                  <span className="text-xs text-gray-500">{regime}</span>
                </div>
              </div>
            </div>

            {/* Allocation bar */}
            <div className="h-2 rounded-full bg-gray-100 mb-3">
              <div className="h-full rounded-full bg-gray-900 transition-all duration-700" style={{ width: `${eq}%` }} />
            </div>

            {/* Meta line */}
            <p className="text-xs text-gray-400">
              {sig.allocationFor || '--'}
              <span className="mx-2 text-gray-200">·</span>
              data thru {sig.dataAsOf || '--'}
              <span className="mx-2 text-gray-200">·</span>
              P(equity) {sig.probEquity != null ? `${Math.round(sig.probEquity * 100)}%` : '--'}
              {sig.overlay && sig.overlay !== 'none' && (
                <><span className="mx-2 text-gray-200">·</span><span className="text-red-500">overlay: {sig.overlay}</span></>
              )}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">
            {predictLoading ? <Loader2 size={14} className="inline animate-spin" /> : 'No signal yet. Run a backtest below.'}
          </p>
        )}
      </div>

      {/* ━━ PORTFOLIO ALLOCATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {allocTickers.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Portfolio Allocation</h2>
            <button onClick={syncWeightsFromPortfolio} disabled={syncingWeights}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-400 hover:border-gray-300 hover:text-gray-600 disabled:opacity-40"
              title="Sync weights from current portfolio holdings">
              <RefreshCw size={10} className={syncingWeights ? 'animate-spin' : ''} /> Sync
            </button>
          </div>

          {/* Total bar */}
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${allocTotal > 100 ? 'bg-red-400' : allocTotal === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(allocTotal, 100)}%` }} />
            </div>
            <span className={`text-[11px] font-mono tabular-nums ${allocTotal > 100 ? 'text-red-500' : allocTotal === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {allocTotal.toFixed(1)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {allocTickers.map(ticker => {
              const risk = stockRisks[ticker];
              return (
                <div key={ticker} className="rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-800">{ticker}</span>
                    {risk != null && (
                      <span className="text-[10px] font-mono text-gray-400" title="Composite risk">
                        {(risk * 100).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={allocWeights[ticker] ?? ''}
                      onChange={e => handleAllocChange(ticker, e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 pr-6 text-[12px] font-mono text-gray-700 tabular-nums focus:border-gray-400 focus:outline-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ━━ MACRO OVERLAY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {overlay && allocTickers.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Macro-Adjusted Weights</h2>
              {overlay.trimmed ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">
                  D = {overlay.D.toFixed(2)}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">
                  no derisking
                </span>
              )}
            </div>
            <button onClick={() => setShowOverlayCfg(v => !v)}
              className={`h-6 rounded-lg border px-2 text-[10px] ${showOverlayCfg ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-gray-200 text-gray-400'}`}>
              <Settings size={10} />
            </button>
          </div>

          {/* Overlay config */}
          {showOverlayCfg && (
            <div className="mb-3 rounded-xl border border-gray-100 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  { key: 'alpha', label: 'Alpha', step: 0.05, desc: 'How much to weight volatility vs composite risk when scoring aggressiveness. 0 = composite only, 1 = volatility only.' },
                  { key: 'derisk_start', label: 'Derisk Start', step: 0.05, desc: 'Regime score (M) below which the overlay begins trimming. Above this, portfolio stays at base weights.' },
                  { key: 'max_trim', label: 'Max Trim', step: 0.05, desc: 'Largest relative cut to any stock. 0.20 means a 10% position can drop to 8% at most.' },
                  { key: 'max_boost', label: 'Max Boost', step: 0.05, desc: 'Largest relative boost for defensive names. 0.10 means a 10% position can rise to 11% at most.' },
                  { key: 'cash_min', label: 'Cash Min', step: 0.001, desc: 'Minimum cash allocation in strong regimes (decimal). 0.002 = 0.2%.' },
                  { key: 'cash_max', label: 'Cash Max', step: 0.005, desc: 'Maximum cash allocation in worst regime (decimal). 0.02 = 2.0%.' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-0.5 block text-[10px] text-gray-400">{f.label}</label>
                    <input type="number" step={f.step} value={deriskCfg[f.key] ?? ''}
                      onChange={e => setDeriskCfg(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-700 focus:border-gray-400 focus:outline-none" />
                    <p className="mt-0.5 text-[9px] leading-tight text-gray-300">{f.desc}</p>
                  </div>
                ))}
                <div className="flex items-end">
                  <button onClick={saveConfig}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-[11px] text-white">
                    <Check size={9} /> Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Adjusted weights grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {allocTickers.map(ticker => {
              const baseW = Number(allocWeights[ticker]) || 0;
              const adjW = overlay.weights[ticker] ?? baseW;
              const delta = adjW - baseW;
              const aggScore = overlay.aggressiveness[ticker];
              return (
                <div key={ticker} className={`rounded-xl border px-3 py-2.5 ${
                  Math.abs(delta) < 0.01 ? 'border-gray-100' : delta < 0 ? 'border-red-100 bg-red-50/30' : 'border-emerald-100 bg-emerald-50/30'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-800">{ticker}</span>
                    {ticker !== 'CASH' && aggScore != null && (
                      <span className="text-[9px] font-mono text-gray-300" title="Aggressiveness">
                        agg {(aggScore * 100).toFixed(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-gray-900">{adjW.toFixed(1)}%</span>
                    {Math.abs(delta) >= 0.01 && (
                      <span className={`text-[10px] font-mono tabular-nums ${delta < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ━━ ALLOCATION OVER TIME ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {cr.length > 0 && (
        <Card title="Allocation Over Time" className="mb-10">
          <div className="h-56">
            <Line
              data={{ labels: lbl, datasets: [
                { label: 'Equity', data: cr.map(r => r.weight_equity), borderColor: '#111', backgroundColor: 'rgba(0,0,0,0.05)', fill: true, stepped: 'before', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3 },
                { label: 'T-Bills', data: cr.map(r => r.weight_equity != null ? 1 : null), borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.02)', fill: true, stepped: 'before', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0 },
              ]}}
              options={{
                ...cOpts01(cOpts('pct')),
                plugins: { ...cOpts01(cOpts('pct')).plugins, legend: { display: false },
                  tooltip: { ...cOpts01(cOpts('pct')).plugins.tooltip,
                    callbacks: { label: ctx => ctx.datasetIndex === 1 ? null : [`Eq ${(ctx.parsed.y * 100).toFixed(1)}%`, `TB ${((1 - ctx.parsed.y) * 100).toFixed(1)}%`] },
                    filter: item => item.datasetIndex === 0,
                  },
                },
              }}
            />
          </div>
        </Card>
      )}

      {/* ━━ BOTTOM: Tools + Backtest ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="border-t border-gray-100 pt-8">

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-xs font-medium text-gray-400 mr-1">Tools</span>
          {runStatus.running && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 mr-1">
              <Loader2 size={11} className="animate-spin" /> {runStatus.command}
            </span>
          )}
          {[
            { cmd: 'predict', icon: Zap, label: 'Predict' },
            { cmd: 'fast', icon: RefreshCw, label: 'Fast' },
            { cmd: 'run', icon: Play, label: 'Full Run' },
            { cmd: 'validate', icon: Shield, label: 'Validate' },
          ].map(({ cmd, icon: I, label }) => (
            <button key={cmd} onClick={() => handleRun(cmd)} disabled={runStatus.running}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[11px] text-gray-500 hover:border-gray-300 hover:text-gray-800 disabled:opacity-30">
              <I size={11} /> {label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setShowLog(v => !v)}
            className={`h-7 rounded-lg border px-2 text-[11px] ${showLog ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-gray-200 text-gray-400'}`}>
            <Terminal size={11} />
          </button>
          <button onClick={() => setShowConfig(v => !v)}
            className={`h-7 rounded-lg border px-2 text-[11px] ${showConfig ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-gray-200 text-gray-400'}`}>
            <Settings size={11} />
          </button>
        </div>

        {/* Log */}
        {showLog && (
          <div className="mb-5">
            <div ref={logRef} className="max-h-40 overflow-y-auto rounded-xl bg-gray-950 px-4 py-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-gray-400">
              {runLog || 'No output yet.'}
            </div>
            {runHistory.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {runHistory.map(r => (
                  <button key={r.id} onClick={() => viewLog(r.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600">
                    <span className={`h-1 w-1 rounded-full ${r.status === 'completed' ? 'bg-emerald-400' : r.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />{r.run_type}
                  </button>
                ))}
              </div>
            )}
            {historyLog && (
              <div className="mt-1 max-h-28 overflow-y-auto rounded-xl bg-gray-950 p-3 font-mono text-[10px] whitespace-pre-wrap text-gray-400">
                {historyLog.log_output || 'No log.'}
              </div>
            )}
          </div>
        )}

        {/* Config */}
        {showConfig && (
          <div className="mb-5 rounded-2xl border border-gray-100 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {CFG.map(s => (
                <div key={s.label}>
                  <div className="mb-1.5 text-[10px] font-medium text-gray-400">{s.label}</div>
                  <div className="space-y-1.5">{s.fields.map(fi => <CfgField key={fi.key} f={fi} value={config[fi.key]} onChange={(k, v) => setConfig(p => ({ ...p, [k]: v }))} />)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-gray-50 pt-3">
              <button onClick={() => setConfig(DEFAULT_CONFIG)} className="text-[11px] text-gray-400 hover:text-gray-600">Reset</button>
              <button onClick={saveConfig} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] text-white"><Check size={9} /> Save</button>
            </div>
          </div>
        )}

        {/* Backtest charts */}
        {results && (
          <>
            <div className="grid gap-5 lg:grid-cols-2 mb-5">
              <Card title="Cumulative Returns">
                <div className="h-52">
                  <Line data={{ labels: lbl, datasets: [
                    ds('Model', cr.map(r => r.cum_port), C.m),
                    ds('95/5', cr.map(r => r.cum_ew), C.b, false, [4, 2]),
                    ds('60/40', cr.map(r => r.cum_6040), C.s, false, [6, 3]),
                    ds('Equity', cr.map(r => r.cum_equity), C.e, false, [2, 2]),
                  ]}} options={cOpts('$')} />
                </div>
              </Card>
              <Card title="Drawdowns">
                <div className="h-52">
                  <Line data={{ labels: lbl, datasets: [
                    { ...ds('Model', drawdowns(cr, 'cum_port'), C.m, true) },
                    { ...ds('Equity', drawdowns(cr, 'cum_equity'), C.e, true), backgroundColor: `${C.e}08` },
                  ]}} options={cOpts('pct')} />
                </div>
              </Card>
            </div>

            {/* Key metrics */}
            {mm && em && (
              <div className="mb-5 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-gray-100 bg-gray-100">
                {[
                  { l: 'CAGR', v: fp(mm.cagr), c: fp(em.cagr), g: mm.cagr > em.cagr },
                  { l: 'Sharpe', v: fn(mm.sharpe), c: fn(em.sharpe), g: mm.sharpe > em.sharpe },
                  { l: 'Max DD', v: fp(mm.max_drawdown), c: fp(em.max_drawdown), g: mm.max_drawdown > em.max_drawdown },
                  { l: 'Sortino', v: fn(mm.sortino), c: fn(em.sortino), g: mm.sortino > em.sortino },
                ].map(({ l, v, c, g }) => (
                  <div key={l} className="bg-white p-4">
                    <div className="text-[10px] text-gray-400">{l}</div>
                    <div className="text-lg font-semibold text-gray-900 mt-0.5">{v}</div>
                    <div className={`text-[10px] mt-0.5 ${g ? 'text-emerald-600' : 'text-red-500'}`}>vs {c}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Expandable detail */}
            <button onClick={() => setDetailTab(detailTab ? '' : 'charts')}
              className="flex w-full items-center gap-2 py-2 text-xs text-gray-400 hover:text-gray-600">
              <ChevronDown size={12} className={`transition-transform ${detailTab ? 'rotate-180' : ''}`} />
              More analysis
            </button>

            {detailTab && (
              <div className="mt-3 mb-5">
                <div className="flex gap-1 mb-3">
                  {[
                    { id: 'charts', label: 'Charts' },
                    { id: 'metrics', label: 'Metrics' },
                    ...(results.plots?.length ? [{ id: 'plots', label: 'Plots' }] : []),
                    ...(results.validationReport ? [{ id: 'validation', label: 'Validation' }] : []),
                  ].map(({ id, label }) => (
                    <button key={id} onClick={() => setDetailTab(id)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] ${detailTab === id ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {detailTab === 'charts' && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Card title="Model Probabilities"><div className="h-48">
                      <Line data={{ labels: lbl, datasets: [
                        ds('P(Eq > TB)', cr.map(r => r.prob_equity), C.m),
                        ds('P(TB Win)', cr.map(r => r.prob_tbills), C.r, false, [4, 2]),
                      ]}} options={cOpts01(cOpts('pct'))} />
                    </div></Card>
                    <Card title="Rolling 24mo Sharpe"><div className="h-48">
                      <Line data={{ labels: lbl, datasets: [
                        ds('Model', rollingSharpe(cr, 'port_return'), C.m),
                        ds('Equity', rollingSharpe(cr, 'ret_equity'), C.e, false, [4, 2]),
                      ]}} options={cOpts('num')} />
                    </div></Card>
                  </div>
                )}

                {detailTab === 'metrics' && metrics.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-[11px]">
                      <thead><tr className="border-b border-gray-100">
                        <th className="py-2 pl-3 text-left text-[10px] text-gray-400">Metric</th>
                        {metrics.map(m => <th key={m.label} className={`px-2 py-2 text-right text-[10px] ${m.label === 'Model Portfolio' ? 'text-emerald-600' : 'text-gray-400'}`}>{m.label.replace(' Portfolio', '').replace(' Only', '')}</th>)}
                      </tr></thead>
                      <tbody>{METRICS_KEYS.map(({ k, l, f }) => (
                        <tr key={k} className="border-b border-gray-50">
                          <td className="py-1.5 pl-3 text-gray-600">{l}</td>
                          {metrics.map((m, j) => {
                            const v = m[k]; let d = '--';
                            if (v != null) { if (f === 'p') d = fp(v); else if (f === 'n') d = fn(v); else d = `${Math.round(v)} mo`; }
                            return <td key={m.label} className={`px-2 py-1.5 text-right font-mono ${j === 0 ? 'text-gray-800' : 'text-gray-400'}`}>{d}</td>;
                          })}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'plots' && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {(results.plots || []).map(p => (
                      <div key={p}>
                        <div className="mb-1 text-[10px] text-gray-400">{p.replace(/_/g, ' ').replace('.png', '')}</div>
                        <Image src={`/api/macro-regime/plots?name=${p}`} alt={p} width={1600} height={900} className="w-full rounded-xl border border-gray-100" unoptimized />
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'validation' && results.validationReport && (
                  <div>
                    <MdRender content={results.validationReport} />
                    {Object.entries(results.validationData || {}).map(([name, rows]) => {
                      if (!rows?.length) return null;
                      const cols = Object.keys(rows[0]);
                      return (
                        <div key={name} className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                          <div className="border-b border-gray-100 px-3 py-2 text-[10px] text-gray-400">{name.replace(/_/g, ' ')}</div>
                          <table className="w-full text-[11px]">
                            <thead><tr className="border-b border-gray-100">{cols.map(c => <th key={c} className="px-3 py-1.5 text-left text-[10px] text-gray-400">{c.replace(/_/g, ' ')}</th>)}</tr></thead>
                            <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-gray-50">{cols.map(c => {
                              const v = row[c]; const isN = typeof v === 'number' && isFinite(v);
                              return <td key={c} className={`px-3 py-1.5 ${isN ? 'font-mono text-gray-500' : 'text-gray-600'}`}>{v == null ? '--' : isN ? fn(v) : String(v)}</td>;
                            })}</tr>)}</tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!results && !sig && <p className="py-8 text-center text-sm text-gray-400">Run a full backtest to get started.</p>}
      </div>

      {/* ━━ SANDBOX / DEV MODE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {allocTickers.length > 0 && (
        <div className="border-t border-gray-100 pt-8 mt-8">
          <button onClick={() => setShowSandbox(v => !v)}
            className="flex w-full items-center gap-2 py-2 text-xs text-gray-400 hover:text-gray-600">
            <ChevronDown size={12} className={`transition-transform ${showSandbox ? 'rotate-180' : ''}`} />
            Overlay Sandbox
          </button>

          {showSandbox && sandboxOverlay && (
            <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Derisk Sandbox</h3>
                <div className="flex items-center gap-3">
                  {sandboxOverlay.trimmed ? (
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-mono text-amber-600">
                      D = {sandboxOverlay.D.toFixed(3)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-600">
                      no derisking
                    </span>
                  )}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-500">
                    cash {(sandboxOverlay.cash * 100).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* M slider */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] text-gray-500">Equity Allocation (M)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="1" step="0.01" value={sandboxM}
                      onChange={e => setSandboxM(Math.min(1, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-mono text-gray-700 text-right focus:border-gray-400 focus:outline-none" />
                  </div>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={sandboxM}
                  onChange={e => setSandboxM(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-gray-900 cursor-pointer" />
                <div className="flex justify-between mt-1 text-[9px] text-gray-300">
                  <span>0% — Risk Off</span>
                  <span className="text-gray-400">derisk_start {deriskCfg.derisk_start}</span>
                  <span>100% — Risk On</span>
                </div>
              </div>

              {/* Per-stock detail table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] text-gray-400">
                      <th className="py-2 pl-3 text-left">Ticker</th>
                      <th className="px-2 py-2 text-right">Base %</th>
                      <th className="px-2 py-2 text-right">Real Vol</th>
                      <th className="px-2 py-2 text-right">Comp</th>
                      <th className="px-2 py-2 text-right">Agg</th>
                      <th className="px-2 py-2 text-right">Adj %</th>
                      <th className="px-2 py-2 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocTickers.filter(t => t !== 'CASH').map(ticker => {
                      const baseW = Number(allocWeights[ticker]) || 0;
                      const adjW = sandboxOverlay.weights[ticker] ?? baseW;
                      const delta = adjW - baseW;
                      const aggScore = sandboxOverlay.aggressiveness[ticker];
                      const vol = volScores[ticker] ?? 0;
                      const comp = stockRisks[ticker] ?? 0;
                      return (
                        <tr key={ticker} className="border-b border-gray-50">
                          <td className="py-1.5 pl-3 font-medium text-gray-700">{ticker}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-500">{baseW.toFixed(1)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-400">{(vol * 100).toFixed(1)}%</td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-400">{(comp * 100).toFixed(0)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-400">{aggScore != null ? (aggScore * 100).toFixed(0) : '--'}</td>
                          <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-800">{adjW.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${Math.abs(delta) < 0.01 ? 'text-gray-300' : delta < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* CASH row */}
                    <tr className="border-t border-gray-200 bg-gray-50/50">
                      <td className="py-1.5 pl-3 font-medium text-gray-500">CASH</td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-400">{(Number(allocWeights.CASH) || 0).toFixed(1)}</td>
                      <td className="px-2 py-1.5" colSpan={3} />
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-800">{(sandboxOverlay.weights.CASH ?? 0).toFixed(2)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${
                        ((sandboxOverlay.weights.CASH ?? 0) - (Number(allocWeights.CASH) || 0)) > 0.01 ? 'text-emerald-600' : 'text-gray-300'
                      }`}>
                        {(((sandboxOverlay.weights.CASH ?? 0) - (Number(allocWeights.CASH) || 0)) > 0 ? '+' : '')}
                        {((sandboxOverlay.weights.CASH ?? 0) - (Number(allocWeights.CASH) || 0)).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Summary stats */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Regime Score (M)', value: sandboxM.toFixed(2) },
                  { label: 'Derisk Strength (D)', value: sandboxOverlay.D.toFixed(3) },
                  { label: 'Target Cash', value: `${(sandboxOverlay.cash * 100).toFixed(2)}%` },
                  { label: 'Total Adj Weight', value: `${Object.values(sandboxOverlay.weights).reduce((s, v) => s + v, 0).toFixed(1)}%` },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">{s.label}</div>
                    <div className="text-sm font-semibold font-mono text-gray-800 mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
