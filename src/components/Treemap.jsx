'use client';

import { useRef, useEffect, useState } from 'react';

function squarify(items, x, y, w, h) {
  if (!items.length) return [];
  const rects = [];
  const total = items.reduce((s, it) => s + it.normValue, 0);
  if (total <= 0) return [];

  let remaining = [...items];
  let cx = x, cy = y, cw = w, ch = h;

  while (remaining.length > 0) {
    const isWide = cw >= ch;
    const side = isWide ? ch : cw;
    const areaLeft = remaining.reduce((s, it) => s + it.normValue, 0);

    let row = [remaining[0]];
    let rowArea = remaining[0].normValue;

    const worstRatio = (rowItems, rowTotal, sideLen) => {
      if (sideLen <= 0 || rowTotal <= 0) return Infinity;
      const rowWidth = rowTotal / sideLen;
      let worst = 0;
      for (const it of rowItems) {
        const h = it.normValue / rowWidth;
        const ratio = Math.max(rowWidth / h, h / rowWidth);
        if (ratio > worst) worst = ratio;
      }
      return worst;
    };

    for (let i = 1; i < remaining.length; i++) {
      const candidate = remaining[i];
      const newRow = [...row, candidate];
      const newArea = rowArea + candidate.normValue;
      if (worstRatio(newRow, newArea, side) <= worstRatio(row, rowArea, side)) {
        row = newRow;
        rowArea = newArea;
      } else {
        break;
      }
    }

    // Layout the row
    const rowFrac = areaLeft > 0 ? rowArea / areaLeft : 1;
    const rowThickness = isWide ? cw * rowFrac : ch * rowFrac;
    let offset = 0;

    for (const it of row) {
      const frac = rowArea > 0 ? it.normValue / rowArea : 0;
      const len = side * frac;
      if (isWide) {
        rects.push({ ...it, rx: cx, ry: cy + offset, rw: rowThickness, rh: len });
      } else {
        rects.push({ ...it, rx: cx + offset, ry: cy, rw: len, rh: rowThickness });
      }
      offset += len;
    }

    if (isWide) {
      cx += rowThickness;
      cw -= rowThickness;
    } else {
      cy += rowThickness;
      ch -= rowThickness;
    }

    remaining = remaining.slice(row.length);
  }

  return rects;
}

function getPnlColor(pct, mode = 'alltime') {
  const abs = Math.abs(pct);

  if (mode === 'day') {
    if (abs === 0) {
      return 'rgb(156, 163, 175)';
    }

    // Same palette as all-time mode, but intensifies more distinctly every ~0.5%.
    const intensity = Math.min(0.18 + abs / 2.5, 1);
    if (pct > 0) {
      const r = Math.round(74 - intensity * 52);
      const g = Math.round(222 - intensity * 59);
      const b = Math.round(128 - intensity * 54);
      return `rgb(${r}, ${g}, ${b})`;
    }

    const r = Math.round(248 - intensity * 28);
    const g = Math.round(113 - intensity * 75);
    const b = Math.round(113 - intensity * 75);
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (abs < 0.5) {
    return 'rgb(156, 163, 175)';
  }

  const intensity = Math.min(abs / 20, 1); // 0 to 1 over 20%
  if (pct > 0) {
    // Green: from mild #4ade80 to vivid #16a34a
    const r = Math.round(74 - intensity * 52);
    const g = Math.round(222 - intensity * 59);
    const b = Math.round(128 - intensity * 54);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red: from mild #f87171 to vivid #dc2626
    const r = Math.round(248 - intensity * 28);
    const g = Math.round(113 - intensity * 75);
    const b = Math.round(113 - intensity * 75);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export default function Treemap({ positions, mode = 'alltime' }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 600, h: 400 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: 400 });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  if (!positions || !positions.length) {
    return (
      <div className="text-gray-400 text-sm text-center py-12 border border-dashed border-gray-200 rounded-2xl">
        No positions to display
      </div>
    );
  }

  const total = positions.reduce((s, p) => s + (p.value || 0), 0);
  if (total <= 0) return null;

  // Sort descending by value for better squarify results
  const sorted = [...positions]
    .map(p => ({ ...p, normValue: (p.value / total) * dims.w * dims.h }))
    .sort((a, b) => b.normValue - a.normValue);

  const rects = squarify(sorted, 0, 0, dims.w, dims.h);

  return (
    <div ref={containerRef} className="relative w-full rounded-2xl overflow-hidden" style={{ height: 400 }}>
      {rects.map((r) => {
        const pnlPct = mode === 'day' ? (r.dayChangePct || 0) : (r.pnlPct || 0);
        const bg = getPnlColor(pnlPct, mode);
        const weight = total > 0 ? (r.value / total) * 100 : 0;
        const showTicker = r.rw > 35 && r.rh > 30;
        const showPnl = r.rw > 50 && r.rh > 45;
        const showWeight = r.rw > 60 && r.rh > 60;

        return (
          <div
            key={r.ticker}
            className="absolute flex flex-col items-center justify-center text-center transition-opacity duration-200 hover:opacity-80 cursor-default"
            style={{
              left: r.rx,
              top: r.ry,
              width: r.rw - 2,
              height: r.rh - 2,
              margin: 1,
              background: bg,
              borderRadius: 8,
            }}
          >
            {showTicker && (
              <span className="font-bold text-sm text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                {r.ticker}
              </span>
            )}
            {showPnl && (
              <span className="text-xs font-semibold text-white/90">
                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
              </span>
            )}
            {showWeight && (
              <span className="text-[10px] text-white/60">
                {weight.toFixed(1)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
