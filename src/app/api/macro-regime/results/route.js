import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MACRO_DIR = path.resolve(process.cwd(), 'macro_regime_allocator');
const OUTPUT_DIR = path.join(MACRO_DIR, 'outputs');

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      const v = values[i];
      if (v === undefined || v === '' || v === 'NaN' || v === 'nan') {
        obj[h] = null;
      } else if (v === 'none') {
        obj[h] = 'none';
      } else {
        const num = Number(v);
        obj[h] = isNaN(num) ? v : num;
      }
    });
    return obj;
  });
}

export async function GET() {
  try {
    const result = { backtest: null, metrics: null, report: null, currentSignal: null };

    // Parse backtest_results.csv
    const btPath = path.join(OUTPUT_DIR, 'backtest_results.csv');
    if (fs.existsSync(btPath)) {
      const raw = fs.readFileSync(btPath, 'utf8');
      const rows = parseCSV(raw);
      result.backtest = rows;

      // Extract current signal from the last row with valid weights
      const validRows = rows.filter((r) => r.weight_equity != null);
      if (validRows.length > 0) {
        const last = validRows[validRows.length - 1];
        const eqWeight = last.weight_equity;

        let regime = 'RISK ON';
        let regimeColor = 'emerald';
        if (eqWeight < 0.60) {
          regime = 'RISK OFF';
          regimeColor = 'red';
        } else if (eqWeight < 0.85) {
          regime = 'CAUTIOUS';
          regimeColor = 'amber';
        }

        result.currentSignal = {
          date: last.date,
          rebalanceDate: last.rebalance_date,
          equityWeight: eqWeight,
          tbillsWeight: last.weight_tbills,
          probEquity: last.prob_equity,
          probTbills: last.prob_tbills,
          overlay: last.overlay,
          regime,
          regimeColor,
        };
      }
    }

    // Parse investment_metrics.csv
    const metricsPath = path.join(OUTPUT_DIR, 'investment_metrics.csv');
    if (fs.existsSync(metricsPath)) {
      const raw = fs.readFileSync(metricsPath, 'utf8');
      result.metrics = parseCSV(raw);
    }

    // Read report.md
    const reportPath = path.join(OUTPUT_DIR, 'report.md');
    if (fs.existsSync(reportPath)) {
      result.report = fs.readFileSync(reportPath, 'utf8');
    }

    // List available plots
    const plotDir = path.join(OUTPUT_DIR, 'plots');
    if (fs.existsSync(plotDir)) {
      result.plots = fs.readdirSync(plotDir).filter((f) => f.endsWith('.png'));
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
