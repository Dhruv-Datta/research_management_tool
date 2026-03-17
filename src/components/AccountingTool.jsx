'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle, DollarSign, TrendingUp, BarChart3, Layers, Users, ChevronDown
} from 'lucide-react';
import StatCard from '@/components/StatCard';
import ConfirmModal from '@/components/ConfirmModal';
import {
  createSeedState, computeFullTimeline, validateTimeline, getLatestMetrics,
  computeInvestorPerformance,
  updateEndAUM, addContribution, removeContribution, addPeriod, removePeriod,
  addQuarter, removeQuarter, updateContribution, updatePeriodDates,
  updateContributionDate
} from '@/lib/accounting';
import { formatMoneyPrecise, formatPct, formatNumber } from '@/lib/formatters';

const STORAGE_KEY = 'fund-accounting-state';

function fmt$(v) { return formatMoneyPrecise(v); }
function fmtPct(v) { return formatPct(v * 100); }
function fmtShares(v) { return v != null ? v.toFixed(6) : '—'; }
function fmtNav(v) { return v != null ? v.toFixed(3) : '—'; }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Editable Cell ───────────────────────────────────────────────────────────

function EditableCell({ value, onChange, format = 'money', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const display = format === 'money' ? fmt$(value)
    : format === 'date' ? (value || '')
    : String(value ?? '');

  const startEdit = () => {
    setDraft(format === 'money' ? (value ?? '').toString() : (value ?? ''));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (format === 'money') {
      const num = parseFloat(draft);
      if (!isNaN(num) && num !== value) onChange(num);
    } else if (format === 'date') {
      if (draft && draft !== value) onChange(draft);
    } else {
      if (draft !== String(value)) onChange(draft);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={format === 'date' ? 'date' : 'text'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className={`w-full px-2 py-1 text-[13px] font-medium tabular-nums text-right border border-sky-300 rounded bg-sky-50 outline-none focus:ring-2 focus:ring-sky-400/40 ${className}`}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      className={`cursor-pointer px-2 py-1 rounded hover:bg-sky-50/80 transition-colors inline-block w-full text-right ${className}`}
      title="Click to edit"
    >
      {display}
    </span>
  );
}


// ─── Modals ──────────────────────────────────────────────────────────────────

function AddContributionModal({ investors, onAdd, onClose }) {
  const [amounts, setAmounts] = useState({});
  const [date, setDate] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = {};
    for (const inv of investors) {
      const val = parseFloat(amounts[inv]);
      if (!isNaN(val) && val > 0) cleaned[inv] = val;
    }
    if (Object.keys(cleaned).length === 0) return;
    onAdd(cleaned, date);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add Capital Contribution</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
          </div>
          {investors.map(inv => (
            <div key={inv}>
              <label className="block text-sm font-medium text-gray-600 mb-1">{inv}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amounts[inv] || ''}
                onChange={e => setAmounts(a => ({ ...a, [inv]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-xl hover:from-emerald-700 hover:to-emerald-600 transition-all shadow-sm">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddPeriodModal({ onAdd, onClose, defaultAUM }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endAUM, setEndAUM] = useState(defaultAUM ? defaultAUM.toFixed(2) : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    const aum = parseFloat(endAUM);
    if (!startDate || !endDate) return;
    onAdd(startDate, endDate, isNaN(aum) ? 0 : aum);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add Period</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">End AUM</label>
            <input type="number" step="0.01" value={endAUM} onChange={e => setEndAUM(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-xl hover:from-emerald-700 hover:to-emerald-600 transition-all shadow-sm">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddQuarterModal({ onAdd, onClose }) {
  const [label, setLabel] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    onAdd(label.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add Quarter</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Quarter Label</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} required placeholder="e.g. Q1 2026" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-xl hover:from-emerald-700 hover:to-emerald-600 transition-all shadow-sm">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Quarter Table ───────────────────────────────────────────────────────────
// Renders the accounting table for a single quarter — mirrors the top block
// of each workbook sheet (rows 1-22, columns C onwards).

function QuarterTable({ quarter, quarterIndex, state, setState, computedQuarter }) {
  const { investors } = state;
  const { computedEvents } = computedQuarter;
  const [showContribModal, setShowContribModal] = useState(null); // afterEventIndex
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Build column array: interleave periods with start/end and contribution columns
  const columns = [];
  let periodNum = 0;

  for (let ei = 0; ei < computedEvents.length; ei++) {
    const ce = computedEvents[ei];
    const rawEvent = state.quarters[quarterIndex].events[ei];

    if (ce.type === 'contribution') {
      columns.push({ kind: 'contribution', data: ce, eventIndex: ei, raw: rawEvent });
    } else if (ce.type === 'period') {
      periodNum++;
      columns.push({ kind: 'period-start', data: ce, periodNum, eventIndex: ei, raw: rawEvent });
      columns.push({ kind: 'period-end', data: ce, periodNum, eventIndex: ei, raw: rawEvent });
    }
  }

  const cellBase = 'px-3 py-1.5 text-[13px] font-medium tabular-nums text-right whitespace-nowrap';
  const headerCell = 'px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right whitespace-nowrap';
  const rowLabel = 'px-3 py-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap text-left sticky left-0 bg-white z-10';
  const sectionLabel = 'px-3 py-2 text-[12px] font-extrabold text-gray-700 uppercase tracking-wider whitespace-nowrap text-left sticky left-0 bg-white z-10';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            {/* Column headers */}
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2 text-left sticky left-0 bg-white z-10 min-w-[160px]" />
              {columns.map((col, ci) => {
                if (col.kind === 'contribution') {
                  return (
                    <th key={ci} className={`${headerCell} bg-emerald-50/60 border-l border-dashed border-emerald-200 min-w-[120px]`}>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-emerald-700">Contribution</span>
                        <span className="text-[10px] text-emerald-600/70">{fmtDate(col.data.date)}</span>
                      </div>
                    </th>
                  );
                }
                if (col.kind === 'period-start') {
                  return (
                    <th key={ci} className={`${headerCell} bg-gray-50/50 min-w-[120px]`}>
                      <div className="flex flex-col items-end gap-0.5">
                        <span>P{col.periodNum} Start</span>
                        <span className="text-[10px] text-gray-400">{fmtDate(col.data.startDate)}</span>
                      </div>
                    </th>
                  );
                }
                return (
                  <th key={ci} className={`${headerCell} min-w-[120px]`}>
                    <div className="flex flex-col items-end gap-0.5">
                      <span>P{col.periodNum} End</span>
                      <span className="text-[10px] text-gray-400">{fmtDate(col.data.endDate)}</span>
                    </div>
                  </th>
                );
              })}
              {/* Add buttons column */}
              <th className="px-2 py-2 min-w-[80px]">
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => setShowContribModal(state.quarters[quarterIndex].events.length - 1)}
                    className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title="Add contribution"
                  >
                    <DollarSign size={14} />
                  </button>
                  <button
                    onClick={() => setShowPeriodModal(true)}
                    className="p-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Add period"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ── Fund Metrics Section ────────────────────────────────── */}
            <tr className="border-b border-gray-50">
              <td colSpan={columns.length + 2} className={sectionLabel}>Fund Metrics</td>
            </tr>

            {/* AUM */}
            <tr className="border-b border-gray-50 hover:bg-gray-50/30">
              <td className={rowLabel}>AUM</td>
              {columns.map((col, ci) => {
                if (col.kind === 'contribution') {
                  return <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200 text-emerald-700`}>{fmt$(col.data.aumAfter)}</td>;
                }
                if (col.kind === 'period-start') {
                  return <td key={ci} className={`${cellBase} bg-gray-50/30 text-gray-600`}>{fmt$(col.data.startAUM)}</td>;
                }
                return (
                  <td key={ci} className={`${cellBase}`}>
                    <EditableCell
                      value={col.data.endAUM}
                      onChange={v => setState(updateEndAUM(state, quarterIndex, col.eventIndex, v))}
                      className="font-semibold text-gray-900"
                    />
                  </td>
                );
              })}
              <td />
            </tr>

            {/* NAV per Share */}
            <tr className="border-b border-gray-50 hover:bg-gray-50/30">
              <td className={rowLabel}>NAV / Share</td>
              {columns.map((col, ci) => {
                if (col.kind === 'contribution') {
                  return <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200 text-emerald-700`}>{fmtNav(col.data.frozenNAV)}</td>;
                }
                if (col.kind === 'period-start') {
                  return <td key={ci} className={`${cellBase} bg-gray-50/30 text-gray-600`}>{fmtNav(col.data.startNAV)}</td>;
                }
                return <td key={ci} className={`${cellBase} text-gray-900 font-semibold`}>{fmtNav(col.data.endNAV)}</td>;
              })}
              <td />
            </tr>

            {/* Outstanding Shares */}
            <tr className="border-b border-gray-100 hover:bg-gray-50/30">
              <td className={rowLabel}>Outstanding Shares</td>
              {columns.map((col, ci) => {
                if (col.kind === 'contribution') {
                  return <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200 text-emerald-700`}>{fmtShares(col.data.totalSharesAfter)}</td>;
                }
                if (col.kind === 'period-start') {
                  return <td key={ci} className={`${cellBase} bg-gray-50/30 text-gray-600`}>{fmtShares(col.data.startTotalShares)}</td>;
                }
                return <td key={ci} className={`${cellBase} text-gray-900`}>{fmtShares(col.data.endTotalShares)}</td>;
              })}
              <td />
            </tr>

            {/* ── Per-Investor Sections ───────────────────────────────── */}
            {investors.map(inv => (
              <InvestorRows
                key={inv}
                investor={inv}
                columns={columns}
                cellBase={cellBase}
                rowLabel={rowLabel}
                sectionLabel={sectionLabel}
                state={state}
                setState={setState}
                quarterIndex={quarterIndex}
              />
            ))}

            {/* ── Returns Section ─────────────────────────────────────── */}
            <tr className="border-t border-gray-100">
              <td colSpan={columns.length + 2} className={sectionLabel}>Returns</td>
            </tr>

            {/* Period Return */}
            <tr className="border-b border-gray-50 hover:bg-gray-50/30">
              <td className={rowLabel}>Period Return</td>
              {columns.map((col, ci) => {
                if (col.kind !== 'period-end') {
                  return <td key={ci} className={col.kind === 'contribution' ? `${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200` : `${cellBase} bg-gray-50/30`} />;
                }
                const val = col.data.periodReturn;
                const color = val >= 0 ? 'text-emerald-700' : 'text-red-600';
                return <td key={ci} className={`${cellBase} font-semibold ${color}`}>{fmtPct(val)}</td>;
              })}
              <td />
            </tr>

            {/* QTD Return */}
            <tr className="border-b border-gray-50 hover:bg-gray-50/30">
              <td className={rowLabel}>Quarter to Date</td>
              {columns.map((col, ci) => {
                if (col.kind !== 'period-end') {
                  return <td key={ci} className={col.kind === 'contribution' ? `${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200` : `${cellBase} bg-gray-50/30`} />;
                }
                const val = col.data.qtdReturn;
                const color = val >= 0 ? 'text-emerald-700' : 'text-red-600';
                return <td key={ci} className={`${cellBase} font-semibold ${color}`}>{fmtPct(val)}</td>;
              })}
              <td />
            </tr>

            {/* Cumulative Return */}
            <tr className="border-b border-gray-50 hover:bg-gray-50/30">
              <td className={rowLabel}>Cumulative Return</td>
              {columns.map((col, ci) => {
                if (col.kind !== 'period-end') {
                  return <td key={ci} className={col.kind === 'contribution' ? `${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200` : `${cellBase} bg-gray-50/30`} />;
                }
                const val = col.data.cumulativeReturn;
                const color = val >= 0 ? 'text-emerald-700' : 'text-red-600';
                return <td key={ci} className={`${cellBase} font-semibold ${color}`}>{fmtPct(val)}</td>;
              })}
              <td />
            </tr>

            {/* ── Dates Row ──────────────────────────────────────────── */}
            <tr className="border-t border-gray-100 hover:bg-gray-50/30">
              <td className={rowLabel}>Dates</td>
              {columns.map((col, ci) => {
                if (col.kind === 'contribution') {
                  return (
                    <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200 text-emerald-600 text-[11px]`}>
                      <EditableCell value={col.raw.date} onChange={v => setState(updateContributionDate(state, quarterIndex, col.eventIndex, v))} format="date" />
                    </td>
                  );
                }
                if (col.kind === 'period-start') {
                  return (
                    <td key={ci} className={`${cellBase} bg-gray-50/30 text-[11px] text-gray-500`}>
                      <EditableCell value={col.raw.startDate} onChange={v => setState(updatePeriodDates(state, quarterIndex, col.eventIndex, v, undefined))} format="date" />
                    </td>
                  );
                }
                return (
                  <td key={ci} className={`${cellBase} text-[11px] text-gray-500`}>
                    <EditableCell value={col.raw.endDate} onChange={v => setState(updatePeriodDates(state, quarterIndex, col.eventIndex, undefined, v))} format="date" />
                  </td>
                );
              })}
              <td />
            </tr>

            {/* ── Action Row (delete buttons) ────────────────────────── */}
            <tr>
              <td className="px-3 py-1 sticky left-0 bg-white z-10" />
              {columns.map((col, ci) => {
                if (col.kind === 'contribution') {
                  return (
                    <td key={ci} className="px-2 py-1 text-center bg-emerald-50/40 border-l border-dashed border-emerald-200">
                      <button
                        onClick={() => setConfirmDelete({ type: 'contribution', eventIndex: col.eventIndex })}
                        className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove contribution"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  );
                }
                if (col.kind === 'period-start') {
                  return <td key={ci} className="bg-gray-50/30" />;
                }
                return (
                  <td key={ci} className="px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setShowContribModal(col.eventIndex)}
                        className="p-1 rounded text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                        title="Add contribution after this period"
                      >
                        <DollarSign size={12} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: 'period', eventIndex: col.eventIndex })}
                        className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove period"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showContribModal !== null && (
        <AddContributionModal
          investors={investors}
          onAdd={(amounts, date) => setState(addContribution(state, quarterIndex, showContribModal, amounts, date))}
          onClose={() => setShowContribModal(null)}
        />
      )}
      {showPeriodModal && (
        <AddPeriodModal
          defaultAUM={(() => {
            // Auto-fill with the latest AUM from this quarter's computed events
            for (let i = computedEvents.length - 1; i >= 0; i--) {
              if (computedEvents[i].type === 'period') return computedEvents[i].endAUM;
              if (computedEvents[i].type === 'contribution') return computedEvents[i].aumAfter;
            }
            return null;
          })()}
          onAdd={(sd, ed, aum) => setState(addPeriod(state, quarterIndex, sd, ed, aum))}
          onClose={() => setShowPeriodModal(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title={`Remove ${confirmDelete.type}?`}
          message={`This will remove the ${confirmDelete.type} and recalculate all subsequent values.`}
          onConfirm={() => {
            if (confirmDelete.type === 'contribution') {
              setState(removeContribution(state, quarterIndex, confirmDelete.eventIndex));
            } else {
              setState(removePeriod(state, quarterIndex, confirmDelete.eventIndex));
            }
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}


// ─── Investor Rows ───────────────────────────────────────────────────────────
// Renders 3 rows per investor: Capital, Equity %, No. Shares
// Mirrors workbook rows 7-9 (Bhuvan), 11-13 (Dhruv), 15-17 (Amit)

function InvestorRows({ investor, columns, cellBase, rowLabel, sectionLabel, state, setState, quarterIndex }) {
  return (
    <>
      <tr className="border-t border-gray-100">
        <td colSpan={columns.length + 2} className={sectionLabel}>{investor}</td>
      </tr>

      {/* Capital */}
      <tr className="border-b border-gray-50 hover:bg-gray-50/30">
        <td className={rowLabel}>Capital</td>
        {columns.map((col, ci) => {
          if (col.kind === 'contribution') {
            const amount = col.data.amounts[investor] || 0;
            return (
              <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200`}>
                {amount > 0 ? (
                  <EditableCell
                    value={amount}
                    onChange={v => setState(updateContribution(state, quarterIndex, col.eventIndex, investor, v))}
                    className="text-emerald-700 font-semibold"
                  />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            );
          }
          if (col.kind === 'period-start') {
            return <td key={ci} className={`${cellBase} bg-gray-50/30 text-gray-600`}>{fmt$(col.data.investorStart[investor]?.capital)}</td>;
          }
          return <td key={ci} className={`${cellBase} text-gray-900`}>{fmt$(col.data.investorEnd[investor]?.capital)}</td>;
        })}
        <td />
      </tr>

      {/* Equity % */}
      <tr className="border-b border-gray-50 hover:bg-gray-50/30">
        <td className={rowLabel}>Equity %</td>
        {columns.map((col, ci) => {
          if (col.kind === 'contribution') {
            return <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200`} />;
          }
          if (col.kind === 'period-start') {
            return <td key={ci} className={`${cellBase} bg-gray-50/30 text-gray-600`}>{fmtPct(col.data.investorStart[investor]?.equity)}</td>;
          }
          return <td key={ci} className={`${cellBase} text-gray-900`}>{fmtPct(col.data.investorEnd[investor]?.equity)}</td>;
        })}
        <td />
      </tr>

      {/* No. Shares */}
      <tr className="border-b border-gray-50 hover:bg-gray-50/30">
        <td className={rowLabel}>No. Shares</td>
        {columns.map((col, ci) => {
          if (col.kind === 'contribution') {
            const newShares = col.data.newShares[investor] || 0;
            return (
              <td key={ci} className={`${cellBase} bg-emerald-50/40 border-l border-dashed border-emerald-200 text-emerald-700`}>
                {newShares > 0 ? `+${fmtShares(newShares)}` : <span className="text-gray-300">—</span>}
              </td>
            );
          }
          if (col.kind === 'period-start') {
            return <td key={ci} className={`${cellBase} bg-gray-50/30 text-gray-600`}>{fmtShares(col.data.investorStart[investor]?.shares)}</td>;
          }
          return <td key={ci} className={`${cellBase} text-gray-900`}>{fmtShares(col.data.investorEnd[investor]?.shares)}</td>;
        })}
        <td />
      </tr>
    </>
  );
}


// ─── Investor Performance Tab ────────────────────────────────────────────────

function InvestorPerformanceTab({ computedTimeline, state }) {
  const [selectedInvestor, setSelectedInvestor] = useState(null);

  const perfData = useMemo(() => {
    if (!state || computedTimeline.length === 0) return null;
    return computeInvestorPerformance(computedTimeline, state);
  }, [computedTimeline, state]);

  if (!perfData) {
    return <div className="text-gray-400 text-sm py-12 text-center">No data available.</div>;
  }

  const { investorMetrics, validationErrors } = perfData;

  const cellBase = 'px-3 py-2 text-[13px] font-medium tabular-nums text-right whitespace-nowrap';
  const headerCell = 'px-3 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right whitespace-nowrap';

  const valColor = (v) => v == null ? '' : v >= 0 ? 'text-emerald-700' : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* ── Section 1: Summary Table ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Users size={16} className="text-emerald-600" />
            Investor Performance Summary
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className={`${headerCell} text-left`}>Investor</th>
                <th className={headerCell}>Total Contributed</th>
                <th className={headerCell}>Current Shares</th>
                <th className={headerCell}>Ownership %</th>
                <th className={headerCell}>Avg Cost NAV</th>
                <th className={headerCell}>Current NAV</th>
                <th className={headerCell}>Current Capital</th>
                <th className={headerCell}>Unrealized P/L $</th>
                <th className={headerCell}>Since Inception TWR</th>
                <th className={headerCell}>S&P 500 TWR</th>
                <th className={headerCell}>Alpha</th>
              </tr>
            </thead>
            <tbody>
              {investorMetrics.map((m) => (
                <tr
                  key={m.name}
                  className={`border-b border-gray-50 hover:bg-emerald-50/30 cursor-pointer transition-colors ${selectedInvestor === m.name ? 'bg-emerald-50/50' : ''}`}
                  onClick={() => setSelectedInvestor(selectedInvestor === m.name ? null : m.name)}
                >
                  <td className="px-3 py-2 text-[13px] font-bold text-gray-900 whitespace-nowrap text-left">
                    <div className="flex items-center gap-1.5">
                      <ChevronDown size={12} className={`text-gray-400 transition-transform ${selectedInvestor === m.name ? 'rotate-180' : ''}`} />
                      {m.name}
                    </div>
                  </td>
                  <td className={`${cellBase} text-gray-900`}>{fmt$(m.totalContributed)}</td>
                  <td className={`${cellBase} text-gray-900`}>{fmtShares(m.shares)}</td>
                  <td className={`${cellBase} text-gray-900`}>{fmtPct(m.ownership)}</td>
                  <td className={`${cellBase} text-gray-900`}>{m.avgCostNAV != null ? fmtNav(m.avgCostNAV) : '—'}</td>
                  <td className={`${cellBase} text-gray-900`}>{fmtNav(m.currentNAV)}</td>
                  <td className={`${cellBase} text-gray-900 font-semibold`}>{fmt$(m.currentValue)}</td>
                  <td className={`${cellBase} font-semibold ${valColor(m.unrealizedPL)}`}>{fmt$(m.unrealizedPL)}</td>
                  <td className={`${cellBase} font-semibold ${valColor(m.sinceInceptionTWR)}`}>{m.sinceInceptionTWR != null ? fmtPct(m.sinceInceptionTWR) : '—'}</td>
                  <td className={`${cellBase} font-semibold ${valColor(m.sinceInceptionSPTWR)}`}>{m.sinceInceptionSPTWR != null ? fmtPct(m.sinceInceptionSPTWR) : '—'}</td>
                  <td className={`${cellBase} font-semibold ${valColor(m.alpha)}`}>{m.alpha != null ? fmtPct(m.alpha) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 2: Investor Detail View ───────────────────────── */}
      {selectedInvestor && (() => {
        const m = investorMetrics.find(x => x.name === selectedInvestor);
        if (!m) return null;

        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{m.name} — Detail</h2>
            </div>

            {/* Contribution History */}
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Contribution History</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className={headerCell}>Date</th>
                      <th className={headerCell}>Amount</th>
                      <th className={headerCell}>NAV at Issuance</th>
                      <th className={headerCell}>Shares Issued</th>
                      <th className={headerCell}>Running Shares</th>
                      <th className={headerCell}>Running Contributed</th>
                      <th className={headerCell}>Running Current Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.contributionDetail.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/30">
                        <td className={`${cellBase} text-gray-600`}>{fmtDate(c.date)}</td>
                        <td className={`${cellBase} text-emerald-700 font-semibold`}>{fmt$(c.amount)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmtNav(c.nav)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmtShares(c.sharesIssued)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmtShares(c.runningShares)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmt$(c.runningContributed)}</td>
                        <td className={`${cellBase} text-gray-900 font-semibold`}>{fmt$(c.runningCurrentValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Period-by-Period Returns */}
            <div className="px-5 py-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Period-by-Period Returns (Active Periods Only)</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className={headerCell}>Quarter</th>
                      <th className={headerCell}>Start Date</th>
                      <th className={headerCell}>End Date</th>
                      <th className={headerCell}>Start NAV</th>
                      <th className={headerCell}>End NAV</th>
                      <th className={headerCell}>Shares at Start</th>
                      <th className={headerCell}>Period Return</th>
                      <th className={headerCell}>Cumulative TWR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.periodDetail.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/30">
                        <td className={`${cellBase} text-gray-600`}>{p.quarterLabel}</td>
                        <td className={`${cellBase} text-gray-600`}>{fmtDate(p.startDate)}</td>
                        <td className={`${cellBase} text-gray-600`}>{fmtDate(p.endDate)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmtNav(p.startNAV)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmtNav(p.endNAV)}</td>
                        <td className={`${cellBase} text-gray-900`}>{fmtShares(p.sharesAtStart)}</td>
                        <td className={`${cellBase} font-semibold ${valColor(p.periodReturn)}`}>{fmtPct(p.periodReturn)}</td>
                        <td className={`${cellBase} font-semibold ${valColor(p.cumulativeTWR)}`}>{fmtPct(p.cumulativeTWR)}</td>
                      </tr>
                    ))}
                    {m.periodDetail.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-400">No active periods — investor has not yet been invested at the start of any subperiod.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Validation ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          {validationErrors.length === 0 ? (
            <><CheckCircle size={16} className="text-emerald-500" /> Investor Validation Passed</>
          ) : (
            <><AlertTriangle size={16} className="text-amber-500" /> Investor Validation Issues ({validationErrors.length})</>
          )}
        </h3>
        {validationErrors.length === 0 ? (
          <p className="text-sm text-gray-500">Shares match engine, ownership sums to 100%, capital values sum to AUM.</p>
        ) : (
          <div className="space-y-2">
            {validationErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-600">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Main Component ──────────────────────────────────────────────────────────

export default function AccountingTool() {
  const [state, setState] = useState(null);
  const [activeTab, setActiveTab] = useState('accounting'); // 'accounting' | 'investor-performance'
  const [activeQuarter, setActiveQuarter] = useState(0);
  const [showAddQuarter, setShowAddQuarter] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Always sync S&P benchmark data from seed
        const seed = createSeedState();
        parsed.inceptionSP = seed.inceptionSP;
        for (let qi = 0; qi < parsed.quarters.length && qi < seed.quarters.length; qi++) {
          const savedEvents = parsed.quarters[qi].events;
          const seedEvents = seed.quarters[qi].events;
          let si = 0;
          for (let ei = 0; ei < savedEvents.length; ei++) {
            if (savedEvents[ei].type === 'period') {
              while (si < seedEvents.length && seedEvents[si].type !== 'period') si++;
              if (si < seedEvents.length) {
                savedEvents[ei].spEnd = seedEvents[si].spEnd;
              }
              si++;
            }
          }
        }
        setState(parsed);
      } else {
        setState(createSeedState());
      }
    } catch {
      setState(createSeedState());
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  // Compute timeline
  const computedTimeline = useMemo(() => {
    if (!state) return [];
    return computeFullTimeline(state);
  }, [state]);

  // Validation
  const validationErrors = useMemo(() => {
    if (!state || computedTimeline.length === 0) return [];
    return validateTimeline(computedTimeline, state);
  }, [computedTimeline, state]);

  // Latest metrics for stat cards
  const latest = useMemo(() => getLatestMetrics(computedTimeline), [computedTimeline]);

  if (!state) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-48 skeleton rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-12 pb-16">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Fund Accounting</h1>
          <p className="text-sm text-gray-500 mt-1">NAV-based share accounting &middot; {state.investors.join(', ')}</p>
        </div>
      </div>

      {/* Top-level tab switcher */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('accounting')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'accounting'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers size={15} />
          Workbook
        </button>
        <button
          onClick={() => setActiveTab('investor-performance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === 'investor-performance'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={15} />
          Investor Performance
        </button>
      </div>

      {/* ── Investor Performance Tab ────────────────────────────── */}
      {activeTab === 'investor-performance' && (
        <InvestorPerformanceTab computedTimeline={computedTimeline} state={state} />
      )}

      {/* ── Workbook Tab ─────────────────────────────────────────── */}
      {activeTab === 'accounting' && <>
      {/* Quarter Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {state.quarters.map((q, qi) => (
          <button
            key={qi}
            onClick={() => setActiveQuarter(qi)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              qi === activeQuarter
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {q.label}
          </button>
        ))}
        <button
          onClick={() => setShowAddQuarter(true)}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors whitespace-nowrap"
        >
          <Plus size={14} /> Quarter
        </button>
        {state.quarters.length > 0 && activeQuarter === state.quarters.length - 1 && (
          <button
            onClick={() => {
              if (state.quarters.length <= 1) return;
              setState(removeQuarter(state, activeQuarter));
              setActiveQuarter(Math.max(0, activeQuarter - 1));
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors whitespace-nowrap"
            title="Remove last quarter"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Quarter Table */}
      {computedTimeline[activeQuarter] && (
        <QuarterTable
          quarter={state.quarters[activeQuarter]}
          quarterIndex={activeQuarter}
          state={state}
          setState={setState}
          computedQuarter={computedTimeline[activeQuarter]}
        />
      )}

      {/* Empty quarter state */}
      {state.quarters[activeQuarter]?.events.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm mb-4">No periods in this quarter yet.</p>
          <button
            onClick={() => {/* trigger add period modal via ref or state - handled within QuarterTable */}}
            className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-xl"
          >
            Add First Period
          </button>
        </div>
      )}

      {/* Validation */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          {validationErrors.length === 0 ? (
            <><CheckCircle size={16} className="text-emerald-500" /> Validation Passed</>
          ) : (
            <><AlertTriangle size={16} className="text-amber-500" /> Validation Issues ({validationErrors.length})</>
          )}
        </h3>
        {validationErrors.length === 0 ? (
          <p className="text-sm text-gray-500">All accounting invariants hold. Shares sum correctly, NAV * shares = AUM, capital totals match.</p>
        ) : (
          <div className="space-y-2">
            {validationErrors.map((err, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm ${err.level === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span><span className="font-semibold">{err.quarter}:</span> {err.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      </>}

      {/* Modals */}
      {showAddQuarter && (
        <AddQuarterModal
          onAdd={label => {
            setState(addQuarter(state, label));
            setActiveQuarter(state.quarters.length); // new quarter will be at this index
          }}
          onClose={() => setShowAddQuarter(false)}
        />
      )}
    </div>
  );
}
