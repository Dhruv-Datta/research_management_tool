import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, HeadingLevel,
  ShadingType, TableBorders, PageBreak,
} from 'docx';
import { saveAs } from 'file-saver';
import { Chart } from 'chart.js';

const COLORS = {
  primary: '0F766E',
  dark: '111827',
  mid: '6B7280',
  light: '9CA3AF',
  accent: '10B981',
  headerBg: 'F0FDF4',
  rowAlt: 'F9FAFB',
  border: 'E5E7EB',
  white: 'FFFFFF',
};

const FONT = 'Calibri';

function heading(text, level = HeadingLevel.HEADING_1, opts = {}) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 240, after: 120 },
    keepNext: true,
    ...opts,
    children: [new TextRun({ text, font: FONT, bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 26 : 22, color: COLORS.dark })],
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 20, color: opts.color || COLORS.dark, bold: opts.bold, italics: opts.italic })],
  });
}

function spacer(size = 200) {
  return new Paragraph({ spacing: { before: size, after: 0 }, children: [] });
}

function dividerLine() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border } },
    children: [],
  });
}

function bulletPoint(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: 20, color: COLORS.dark })],
  });
}

function pageBreakParagraph() {
  return new Paragraph({
    children: [new TextRun({ children: [new PageBreak()] })],
  });
}

function fmt(v, dec = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(v, dec = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (v * 100).toFixed(dec) + '%';
}

function makeCell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), font: FONT, size: opts.size || 18, bold: opts.bold, color: opts.color || COLORS.dark })],
    })],
  });
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
  };
}

function lightBorders() {
  const b = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
  return { top: b, bottom: b, left: b, right: b };
}

// Capture all Chart.js canvases as base64 PNGs with proper aspect ratio and no tooltips
function captureCharts() {
  const canvases = document.querySelectorAll('.chart-container canvas');
  const images = [];
  canvases.forEach(canvas => {
    try {
      // Get the Chart.js instance to disable tooltip before capture
      const chartInstance = Chart.getChart(canvas);
      let tooltipWasEnabled = true;
      if (chartInstance) {
        tooltipWasEnabled = chartInstance.options.plugins.tooltip.enabled !== false;
        // Disable tooltip and clear any active hover state
        chartInstance.options.plugins.tooltip.enabled = false;
        chartInstance.setActiveElements([]);
        chartInstance.tooltip?.setActiveElements([], { x: 0, y: 0 });
        chartInstance.update('none');
      }

      const url = canvas.toDataURL('image/png');
      const w = canvas.width;
      const h = canvas.height;
      const label = canvas.closest('[data-chart-title]')?.getAttribute('data-chart-title') ||
        canvas.closest('.bg-white')?.querySelector('h3, p.text-sm.font-bold, .text-sm.font-semibold')?.textContent || '';
      // Capture CAGR values from the sibling element below the chart
      const cagrs = [];
      const card = canvas.closest('[data-chart-title]') || canvas.closest('.bg-white');
      if (card) {
        const cagrContainer = card.querySelector('.border-t.border-gray-100');
        if (cagrContainer) {
          cagrContainer.querySelectorAll('div.text-center').forEach(el => {
            const labelEl = el.querySelector('span.text-\\[10px\\], span.uppercase');
            const valueEl = el.querySelector('span.font-bold');
            if (labelEl && valueEl) {
              cagrs.push({ label: labelEl.textContent.trim(), value: valueEl.textContent.trim() });
            }
          });
        }
      }
      images.push({ url, label, width: w, height: h, cagrs });

      // Re-enable tooltip after capture
      if (chartInstance && tooltipWasEnabled) {
        chartInstance.options.plugins.tooltip.enabled = true;
        chartInstance.update('none');
      }
    } catch {}
  });
  return images;
}

function chartImageRun(dataUrl, canvasWidth, canvasHeight) {
  const base64 = dataUrl.split(',')[1];
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  // Scale to fit within max width while preserving aspect ratio
  const MAX_WIDTH = 560;
  const ratio = (canvasWidth && canvasHeight) ? canvasHeight / canvasWidth : 0.45;
  const width = MAX_WIDTH;
  const height = Math.round(MAX_WIDTH * ratio);
  return new ImageRun({
    data: buffer,
    transformation: { width, height },
    type: 'png',
  });
}

export async function exportReport({ ticker, thesis, model, tickerData, liveQuote, displayPrice }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Capture chart images from the DOM
  const chartImages = captureCharts();

  const sections = [];

  // ═══════════ COVER / TITLE ═══════════
  sections.push(
    new Paragraph({ spacing: { before: 2400, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: ticker, font: FONT, bold: true, size: 56, color: COLORS.primary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'Equity Research Update', font: FONT, size: 28, color: COLORS.mid })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: dateStr, font: FONT, size: 22, color: COLORS.light })],
    }),
  );

  // ═══════════ KEY METRICS (on cover page) ═══════════
  {
    sections.push(spacer(400));
    sections.push(dividerLine());

    const q = liveQuote || {};
    const val = tickerData?.valuation || {};

    // Helper formatters for large numbers
    const fmtLarge = (v) => {
      if (!v) return '—';
      const n = Number(v);
      if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
      return `$${fmt(n)}`;
    };
    const fmtVol = (v) => {
      if (!v) return '—';
      const n = Number(v);
      if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
      return fmt(n, 0);
    };

    // Compute operating margin and buyback yield from tickerData
    const opMargins = tickerData?.operating_margins || [];
    const latestOpMargin = opMargins.length ? opMargins[opMargins.length - 1].operating_margin : null;
    const shares = tickerData?.buybacks || [];
    let buybackYield = null;
    if (shares.length >= 5) {
      const cur = shares[shares.length - 1].shares_outstanding;
      const prev = shares[shares.length - 5].shares_outstanding; // ~1 year ago
      if (cur && prev && prev > 0) buybackYield = ((prev - cur) / prev);
    }

    // FCF yield from computed valuation or quote
    const fcfYield = val.fcfYield ? Number(val.fcfYield) : null;

    // 52-week range
    const hi52 = q.fiftyTwoWeekHigh || val.high52w;
    const lo52 = q.fiftyTwoWeekLow || val.low52w;
    const range52 = (lo52 && hi52) ? `$${fmt(Number(lo52))} – $${fmt(Number(hi52))}` : '—';

    // Net Debt / EBITDA — approximate from EV - MarketCap = Net Debt, EV/EBITDA gives EBITDA
    let netDebtEbitda = '—';
    if (q.enterpriseValue && q.marketCap && q.evToEbitda && q.evToEbitda > 0) {
      const netDebt = q.enterpriseValue - q.marketCap;
      const ebitda = q.enterpriseValue / q.evToEbitda;
      if (ebitda > 0) netDebtEbitda = fmt(netDebt / ebitda, 1) + 'x';
    }

    const metricsRows = [
      ['Current Price', displayPrice ? `$${fmt(displayPrice)}` : '—'],
      ['Market Cap', fmtLarge(q.marketCap)],
      ['Enterprise Value', fmtLarge(q.enterpriseValue)],
      ['P/E Ratio', q.trailingPE ? fmt(Number(q.trailingPE), 1) + 'x' : (val.peRatio ? fmt(Number(val.peRatio), 1) + 'x' : '—')],
      ['EV / EBITDA', q.evToEbitda ? fmt(Number(q.evToEbitda), 1) + 'x' : '—'],
      ['FCF Yield', fcfYield ? `${fmt(fcfYield, 1)}%` : '—'],
      ['Revenue Growth YoY', q.revenueGrowth != null ? `${(q.revenueGrowth * 100).toFixed(1)}%` : '—'],
      ['EPS Growth YoY', q.earningsGrowth != null ? `${(q.earningsGrowth * 100).toFixed(1)}%` : '—'],
      ['Operating Margin', latestOpMargin != null ? `${(latestOpMargin * 100).toFixed(1)}%` : '—'],
      ['Return on Equity', q.roic != null ? `${(q.roic * 100).toFixed(1)}%` : '—'],
      ['Net Debt / EBITDA', netDebtEbitda],
      ['Buyback Yield', buybackYield != null ? `${(buybackYield * 100).toFixed(1)}%` : '—'],
      ['Dividend Yield', q.dividendYield != null ? `${Number(q.dividendYield).toFixed(2)}%` : '—'],
      ['52 Week Range', range52],
      ['Average Daily Volume', fmtVol(q.avgVolume)],
    ];

    sections.push(new Table({
      width: { size: 65, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      borders: lightBorders(),
      rows: [
        new TableRow({
          children: [
            makeCell('Metric', { bold: true, shading: COLORS.headerBg, width: 50 }),
            makeCell('Value', { bold: true, shading: COLORS.headerBg, align: AlignmentType.RIGHT, width: 50 }),
          ],
        }),
        ...metricsRows.map((r, i) => new TableRow({
          children: [
            makeCell(r[0], { shading: i % 2 ? COLORS.rowAlt : COLORS.white }),
            makeCell(r[1], { align: AlignmentType.RIGHT, bold: true, shading: i % 2 ? COLORS.rowAlt : COLORS.white }),
          ],
        })),
      ],
    }));
  }

  // ═══════════ FUNDAMENTAL CHARTS ═══════════
  // Page break before charts section
  if (chartImages.length > 0) {
    sections.push(pageBreakParagraph());
    sections.push(heading('Fundamental Analysis', HeadingLevel.HEADING_1));
    sections.push(bodyText('The following charts illustrate the company\'s key financial metrics and trends over time.', { color: COLORS.mid }));
    sections.push(spacer(80));

    for (let ci = 0; ci < chartImages.length; ci++) {
      const img = chartImages[ci];

      // Page break before every 2nd chart (i.e. after every pair), but not before the 1st
      if (ci > 0 && ci % 2 === 0) {
        sections.push(pageBreakParagraph());
      }

      // Chart title — keepNext keeps it on same page as the image
      if (img.label) {
        sections.push(new Paragraph({
          spacing: { before: ci % 2 === 0 ? 100 : 300, after: 80 },
          keepNext: true,
          children: [new TextRun({ text: img.label, font: FONT, size: 22, bold: true, color: COLORS.dark })],
        }));
      }

      // Chart image — keepNext keeps it with CAGR line
      sections.push(new Paragraph({
        spacing: { after: img.cagrs?.length ? 40 : 120 },
        keepNext: true,
        children: [chartImageRun(img.url, img.width, img.height)],
      }));

      // CAGR values below chart
      if (img.cagrs && img.cagrs.length > 0) {
        sections.push(new Paragraph({
          spacing: { after: 120 },
          children: img.cagrs.flatMap((c, i) => [
            ...(i > 0 ? [new TextRun({ text: '    ', font: FONT, size: 18 })] : []),
            new TextRun({ text: `${c.label}: `, font: FONT, size: 18, color: COLORS.light }),
            new TextRun({ text: c.value, font: FONT, size: 18, bold: true, color: c.value.startsWith('-') ? 'EF4444' : COLORS.primary }),
          ]),
        }));
      }
    }
  }

  // ═══════════ INVESTMENT THESIS ═══════════
  if (thesis) {
    sections.push(pageBreakParagraph());
    sections.push(heading('Investment Thesis', HeadingLevel.HEADING_1));

    // Core reasons (supports both old string format and new {title, description} format)
    const reasons = (thesis.coreReasons || [])
      .map(r => typeof r === 'string' ? { title: r, description: '' } : r)
      .filter(r => r.title && r.title.trim());
    if (reasons.length > 0) {
      sections.push(heading('Core Reasons for Ownership', HeadingLevel.HEADING_2));
      reasons.forEach(r => {
        sections.push(bulletPoint(r.title));
        if (r.description && r.description.trim()) {
          r.description.split('\n').filter(l => l.trim()).forEach(line =>
            sections.push(new Paragraph({
              spacing: { after: 60 },
              indent: { left: 720 },
              children: [new TextRun({ text: line, font: FONT, size: 19, color: COLORS.mid })],
            }))
          );
        }
      });
      sections.push(spacer(100));
    }

    // Key assumptions / The Story
    if (thesis.assumptions && thesis.assumptions.trim()) {
      sections.push(heading('The Story', HeadingLevel.HEADING_2));
      thesis.assumptions.split('\n').filter(l => l.trim()).forEach(line => sections.push(bodyText(line)));
      sections.push(spacer(100));
    }

    // Valuation framework
    if (thesis.valuation && thesis.valuation.trim()) {
      sections.push(heading('Valuation Framework', HeadingLevel.HEADING_2));
      thesis.valuation.split('\n').filter(l => l.trim()).forEach(line => sections.push(bodyText(line)));
      sections.push(spacer(100));
    }
  }

  // ═══════════ RESEARCH TO-DO ═══════════
  {
    sections.push(pageBreakParagraph());
    sections.push(heading('Research To-Do', HeadingLevel.HEADING_1));
    const todos = (thesis?.todos || []).filter(t => t.text && t.text.trim());
    if (todos.length > 0) {
      todos.forEach(t => {
        const prefix = t.done ? '[x] ' : '[ ] ';
        sections.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [new TextRun({
            text: prefix + t.text,
            font: FONT,
            size: 19,
            color: t.done ? COLORS.light : COLORS.dark,
            strikeThrough: t.done,
          })],
        }));
      });
    } else {
      sections.push(bodyText('No outstanding research items at this time.', { color: COLORS.light, italic: true }));
    }
  }

  // ═══════════ NEWS & UPDATES ═══════════
  {
    sections.push(pageBreakParagraph());
    sections.push(heading('Recent Developments', HeadingLevel.HEADING_1));
    const updates = (thesis?.newsUpdates || []).filter(u => u.title || u.body);

    if (updates.length > 0) {
      // Show newest first
      [...updates].reverse().forEach((entry, idx) => {
        const titleParts = [];
        if (entry.title) titleParts.push(new TextRun({ text: entry.title, font: FONT, size: 22, bold: true, color: COLORS.dark }));
        if (entry.date) titleParts.push(new TextRun({ text: `  |  ${entry.date}`, font: FONT, size: 18, color: COLORS.light }));

        // keepNext so title stays with body
        sections.push(new Paragraph({ spacing: { before: idx > 0 ? 300 : 200, after: 80 }, keepNext: true, children: titleParts }));

        if (entry.body && entry.body.trim()) {
          entry.body.split('\n').filter(l => l.trim()).forEach(line => sections.push(bodyText(line)));
        }

        if (entry.impactOnAssumptions && entry.impactOnAssumptions.trim()) {
          sections.push(new Paragraph({
            spacing: { before: 120, after: 40 },
            keepNext: true,
            children: [new TextRun({ text: 'Impact on Assumptions:', font: FONT, size: 18, bold: true, color: 'B45309' })],
          }));
          entry.impactOnAssumptions.split('\n').filter(l => l.trim()).forEach(line =>
            sections.push(bodyText(line, { italic: true, color: '92400E' }))
          );
        }

        // Divider between entries
        if (idx < updates.length - 1) {
          sections.push(dividerLine());
        }
      });
    } else {
      sections.push(bodyText('No recent developments to report.', { color: COLORS.light, italic: true }));
    }
  }

  // ═══════════ VALUATION MODEL ═══════════
  if (model) {
    sections.push(pageBreakParagraph());
    sections.push(heading('EPS Based Valuation Model', HeadingLevel.HEADING_1));

    const inp = model.inputs || {};
    const has = (v) => v !== '' && v !== undefined && v !== null;

    // --- Helper: clean academic-style cell (no background, no vertical borders) ---
    const TB_NONE = { style: BorderStyle.NONE, size: 0, color: COLORS.white };
    const TB_LINE = { style: BorderStyle.SINGLE, size: 1, color: '000000' };

    function cleanCell(text, opts = {}) {
      const borders = {
        top: opts.borderTop ? TB_LINE : TB_NONE,
        bottom: opts.borderBottom ? TB_LINE : TB_NONE,
        left: TB_NONE,
        right: TB_NONE,
      };
      return new TableCell({
        width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        borders,
        margins: { top: 30, bottom: 30, left: 60, right: 60 },
        children: [new Paragraph({
          alignment: opts.align || AlignmentType.LEFT,
          children: [new TextRun({
            text: String(text ?? ''),
            font: FONT,
            size: opts.size || 19,
            bold: opts.bold,
            color: opts.color || COLORS.dark,
          })],
        })],
      });
    }

    // ── Top inputs table 1: Ticker | Share Price | Current Dividend | Target P/E Multiple ──
    const inputRow1Header = ['Ticker', 'Share Price', 'Current Dividend', 'Target P/E Multiple'];
    const inputRow1Values = [
      ticker,
      has(inp.sharePrice) ? `$${fmt(Number(inp.sharePrice))}` : '—',
      has(inp.currentDividend) && Number(inp.currentDividend) !== 0 ? `$${fmt(Number(inp.currentDividend))}` : '$0.00',
      has(inp.targetPE) ? fmt(Number(inp.targetPE), 2) : '—',
    ];

    sections.push(spacer(100));
    sections.push(new Table({
      width: { size: 80, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({
          children: inputRow1Header.map(h =>
            cleanCell(h, { bold: true, align: AlignmentType.CENTER, borderTop: true, borderBottom: true })
          ),
        }),
        new TableRow({
          children: inputRow1Values.map(v =>
            cleanCell(v, { align: AlignmentType.CENTER, borderBottom: true })
          ),
        }),
      ],
    }));

    sections.push(spacer(200));

    // ── Top inputs table 2: Revenue Growth | COGS Growth | OpEx Growth | Net Share Dilution | Dividend Growth % | Tax Rate ──
    const inputRow2Header = ['Revenue Growth', 'COGS Growth', 'OpEx Growth', 'Net Share Dilution', 'Dividend Growth %', 'Tax Rate'];
    const inputRow2Values = [
      has(inp.revenueGrowth) ? fmtPct(Number(inp.revenueGrowth), 2) : '—',
      has(inp.cogsGrowth) ? fmtPct(Number(inp.cogsGrowth), 2) : '0.00%',
      has(inp.opexGrowth) ? fmtPct(Number(inp.opexGrowth), 2) : '—',
      has(inp.netShareDilution) ? fmtPct(Number(inp.netShareDilution), 2) : '—',
      has(inp.dividendGrowth) ? fmtPct(Number(inp.dividendGrowth), 2) : '0.00%',
      has(inp.taxRate) ? fmtPct(Number(inp.taxRate), 2) : '21.00%',
    ];

    sections.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: inputRow2Header.map(h =>
            cleanCell(h, { bold: true, align: AlignmentType.CENTER, borderTop: true, borderBottom: true })
          ),
        }),
        new TableRow({
          children: inputRow2Values.map(v =>
            cleanCell(v, { align: AlignmentType.CENTER, borderBottom: true })
          ),
        }),
      ],
    }));

    sections.push(spacer(300));

    // ── Main projection table ──
    if (model.computed) {
      const yearLabels = model.computed.yearLabels || [];
      const labelWidth = 30;
      const yearWidth = (100 - labelWidth) / yearLabels.length;

      // Projection rows with grouping info for separator lines — matches the on-screen model exactly
      const projRows = [
        { label: 'Revenue (bil)', data: model.computed.revenue, fmt: v => `$${fmt(v, 2)}`, bold: true },
        { label: 'Cost of Revenue', data: model.computed.cogs, fmt: v => `$${fmt(v, 2)}` },
        { label: 'Operating Expense', data: model.computed.opex, fmt: v => `$${fmt(v, 2)}` },
        { label: 'Other Income, net', data: model.computed.nonOpIncome, fmt: v => `${Number(v) < 0 ? '-' : ''}$${fmt(Math.abs(v), 2)}` },
        { sep: true },
        { label: 'Operating Income (bil)', data: model.computed.opIncome, fmt: v => `$${fmt(v, 2)}`, bold: true },
        { label: 'Operating Margin (%)', data: model.computed.opMargin, fmt: v => fmtPct(v, 2) },
        { sep: true },
        { label: 'Tax Expense', data: model.computed.taxExpense, fmt: v => `$${fmt(v, 2)}` },
        { sep: true },
        { label: 'Net Income (bil)', data: model.computed.netIncome, fmt: v => `$${fmt(v, 2)}`, bold: true },
        { label: 'Outstanding Shares (bil)', data: model.computed.shares, fmt: v => fmt(v, 4) },
        { sep: true },
        { label: 'Earnings Per Share', data: model.computed.eps, fmt: v => `$${fmt(v, 2)}`, bold: true },
        { sep: true },
        { label: 'Share Price (Tgt P/E)', data: model.computed.priceArr, fmt: v => `$${fmt(v, 2)}`, bold: true },
        { label: 'Extra Shares w/ Reinvested Div', data: model.computed.divShares, fmt: v => fmt(v, 4) },
      ];

      // Build header row
      const headerCells = [
        cleanCell('Factors', { bold: true, width: labelWidth, borderTop: true, borderBottom: true }),
        ...yearLabels.map(y => cleanCell(String(y), { bold: true, align: AlignmentType.RIGHT, width: yearWidth, borderTop: true, borderBottom: true })),
      ];

      const tableRows = [new TableRow({ children: headerCells })];

      for (let ri = 0; ri < projRows.length; ri++) {
        const row = projRows[ri];
        if (row.sep) continue;

        // Check if previous row was a separator
        const prevIsSep = ri > 0 && projRows[ri - 1]?.sep;

        const cells = [
          cleanCell(row.label, { bold: row.bold, width: labelWidth, borderTop: prevIsSep }),
          ...(row.data || []).map(v => cleanCell(row.fmt(v), { align: AlignmentType.RIGHT, bold: row.bold, width: yearWidth, borderTop: prevIsSep })),
        ];
        tableRows.push(new TableRow({ children: cells }));
      }

      // ── Total CAGR footer row ──
      const totalCAGRVal = model.computed.totalCAGR != null ? fmtPct(model.computed.totalCAGR, 2) : '—';
      const cagrCells = [
        cleanCell('Total CAGR', { bold: true, width: labelWidth, borderTop: true, borderBottom: true }),
      ];
      for (let i = 0; i < yearLabels.length - 1; i++) {
        cagrCells.push(cleanCell('', { width: yearWidth, borderTop: true, borderBottom: true }));
      }
      cagrCells.push(cleanCell(totalCAGRVal, { bold: true, align: AlignmentType.RIGHT, width: yearWidth, borderTop: true, borderBottom: true }));
      tableRows.push(new TableRow({ children: cagrCells }));

      sections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      }));

      // Caption
      sections.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 80 },
        children: [new TextRun({
          text: `Table 1: ${ticker} 5-Year Valuation Forecast (revenue and income in billions).`,
          font: FONT,
          size: 18,
          italics: true,
          color: COLORS.mid,
        })],
      }));

      sections.push(spacer(300));

      // ── Model Output Summary ──
      sections.push(new Table({
        width: { size: 80, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['', 'Expected CAGR', 'CAGR w/ Dividends', '1Y Price Target', '5Y Target Price'].map(h =>
              cleanCell(h, { bold: true, align: h ? AlignmentType.CENTER : AlignmentType.LEFT, borderTop: true, borderBottom: true, size: 17 })
            ),
          }),
          new TableRow({
            children: [
              cleanCell('', { borderBottom: true }),
              cleanCell(fmtPct(model.computed.totalCAGRNoDivs, 2), { align: AlignmentType.CENTER, bold: true, borderBottom: true }),
              cleanCell(fmtPct(model.computed.totalCAGR, 2), { align: AlignmentType.CENTER, bold: true, borderBottom: true }),
              cleanCell(`$${fmt(model.computed.priceTarget, 2)}`, { align: AlignmentType.CENTER, bold: true, borderBottom: true }),
              cleanCell(`$${fmt(model.computed.targetPrice5, 2)}`, { align: AlignmentType.CENTER, bold: true, borderBottom: true }),
            ],
          }),
        ],
      }));
    }
  }

  // ═══════════ DISCLAIMER ═══════════
  sections.push(spacer(600));
  sections.push(dividerLine());
  sections.push(bodyText('This report was generated for internal research purposes only. It does not constitute investment advice.', { color: COLORS.light, italic: true }));
  sections.push(bodyText(`Generated on ${dateStr}`, { color: COLORS.light, italic: true }));

  // Build document
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 20 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 },
        },
      },
      children: sections,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${ticker}_Research_Report_${now.toISOString().slice(0, 10)}.docx`;
  saveAs(blob, filename);
}
