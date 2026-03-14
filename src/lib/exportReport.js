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

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 240, after: 120 },
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
      images.push({ url, label, width: w, height: h });

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
    new Paragraph({ spacing: { before: 600, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: ticker, font: FONT, bold: true, size: 56, color: COLORS.primary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'Equity Research Report', font: FONT, size: 28, color: COLORS.mid })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: dateStr, font: FONT, size: 22, color: COLORS.light })],
    }),
    dividerLine(),
  );

  // ═══════════ KEY METRICS ═══════════
  if (displayPrice || liveQuote) {
    sections.push(heading('Key Metrics', HeadingLevel.HEADING_1));

    const metricsRows = [];
    if (displayPrice) metricsRows.push(['Current Price', `$${fmt(displayPrice)}`]);
    if (liveQuote?.dayChangePct !== undefined) metricsRows.push(['Day Change', `${liveQuote.dayChangePct >= 0 ? '+' : ''}${fmt(liveQuote.dayChangePct)}%`]);

    // Valuation metrics from tickerData
    const val = tickerData?.valuation || {};
    if (val.peRatio) metricsRows.push(['P/E Ratio', fmt(Number(val.peRatio), 1)]);
    if (val.fcfYield) metricsRows.push(['FCF Yield', `${fmt(Number(val.fcfYield), 1)}%`]);
    if (val.priceToSales) metricsRows.push(['Price / Sales', fmt(Number(val.priceToSales), 1)]);

    if (metricsRows.length) {
      sections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
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
    sections.push(spacer());
  }

  // ═══════════ FUNDAMENTAL CHARTS ═══════════
  if (chartImages.length > 0) {
    sections.push(heading('Fundamental Analysis', HeadingLevel.HEADING_1));
    sections.push(bodyText('The following charts illustrate the company\'s key financial metrics and trends over time.', { color: COLORS.mid }));
    sections.push(spacer(100));

    for (const img of chartImages) {
      if (img.label) {
        sections.push(new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: img.label, font: FONT, size: 22, bold: true, color: COLORS.dark })],
        }));
      }
      sections.push(new Paragraph({
        spacing: { after: 160 },
        children: [chartImageRun(img.url, img.width, img.height)],
      }));
    }
    sections.push(spacer());
  }

  // ═══════════ INVESTMENT THESIS ═══════════
  if (thesis) {
    sections.push(heading('Investment Thesis', HeadingLevel.HEADING_1));

    // Core reasons
    const reasons = (thesis.coreReasons || []).filter(r => r && r.trim());
    if (reasons.length > 0) {
      sections.push(heading('Core Reasons for Ownership', HeadingLevel.HEADING_2));
      reasons.forEach(r => sections.push(bulletPoint(r)));
      sections.push(spacer(100));
    }

    // Key assumptions
    if (thesis.assumptions && thesis.assumptions.trim()) {
      sections.push(heading('Key Assumptions', HeadingLevel.HEADING_2));
      thesis.assumptions.split('\n').filter(l => l.trim()).forEach(line => sections.push(bodyText(line)));
      sections.push(spacer(100));
    }

    // Valuation framework
    if (thesis.valuation && thesis.valuation.trim()) {
      sections.push(heading('Valuation Framework', HeadingLevel.HEADING_2));
      thesis.valuation.split('\n').filter(l => l.trim()).forEach(line => sections.push(bodyText(line)));
      sections.push(spacer(100));
    }

    sections.push(dividerLine());
  }

  // ═══════════ NEWS & UPDATES ═══════════
  if (thesis?.newsUpdates?.length > 0) {
    const updates = thesis.newsUpdates.filter(u => u.title || u.body);
    if (updates.length > 0) {
      sections.push(heading('Recent Developments', HeadingLevel.HEADING_1));

      // Show newest first
      [...updates].reverse().forEach(entry => {
        const titleParts = [];
        if (entry.title) titleParts.push(new TextRun({ text: entry.title, font: FONT, size: 22, bold: true, color: COLORS.dark }));
        if (entry.date) titleParts.push(new TextRun({ text: `  |  ${entry.date}`, font: FONT, size: 18, color: COLORS.light }));

        sections.push(new Paragraph({ spacing: { before: 240, after: 80 }, children: titleParts }));

        if (entry.body && entry.body.trim()) {
          entry.body.split('\n').filter(l => l.trim()).forEach(line => sections.push(bodyText(line)));
        }

        if (entry.impactOnAssumptions && entry.impactOnAssumptions.trim()) {
          sections.push(new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [new TextRun({ text: 'Impact on Assumptions:', font: FONT, size: 18, bold: true, color: 'B45309' })],
          }));
          entry.impactOnAssumptions.split('\n').filter(l => l.trim()).forEach(line =>
            sections.push(bodyText(line, { italic: true, color: '92400E' }))
          );
        }

        sections.push(spacer(80));
      });

      sections.push(dividerLine());
    }
  }

  // ═══════════ VALUATION MODEL ═══════════
  if (model) {
    sections.push(heading('Valuation Model', HeadingLevel.HEADING_1));

    // Assumptions summary table
    const inp = model.inputs || {};
    const has = (v) => v !== '' && v !== undefined && v !== null;
    const assumptions = [];
    if (has(inp.sharePrice)) assumptions.push(['Share Price', `$${fmt(Number(inp.sharePrice))}`]);
    if (has(inp.targetPE)) assumptions.push(['Target P/E Multiple', `${inp.targetPE}x`]);
    if (has(inp.revenueGrowth)) assumptions.push(['Revenue Growth', fmtPct(Number(inp.revenueGrowth))]);
    if (has(inp.opexGrowth)) assumptions.push(['OpEx Growth', fmtPct(Number(inp.opexGrowth))]);
    if (has(inp.cogsGrowth)) assumptions.push(['COGS Growth', fmtPct(Number(inp.cogsGrowth))]);
    if (has(inp.netShareDilution)) assumptions.push(['Net Share Dilution', fmtPct(Number(inp.netShareDilution))]);
    if (has(inp.taxRate)) assumptions.push(['Tax Rate', fmtPct(Number(inp.taxRate))]);
    if (has(inp.dividendGrowth) && Number(inp.dividendGrowth) !== 0) assumptions.push(['Dividend Growth', fmtPct(Number(inp.dividendGrowth))]);
    if (has(inp.currentDividend) && Number(inp.currentDividend) !== 0) assumptions.push(['Current Dividend', `$${fmt(Number(inp.currentDividend))}`]);
    if (model.computed?.epsGrowth) assumptions.push(['Implied EPS Growth (5Y)', fmtPct(model.computed.epsGrowth, 2)]);

    if (assumptions.length) {
      sections.push(heading('Model Assumptions', HeadingLevel.HEADING_2));
      sections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: lightBorders(),
        rows: [
          new TableRow({
            children: [
              makeCell('Assumption', { bold: true, shading: COLORS.headerBg, width: 50 }),
              makeCell('Value', { bold: true, shading: COLORS.headerBg, align: AlignmentType.RIGHT, width: 50 }),
            ],
          }),
          ...assumptions.map((r, i) => new TableRow({
            children: [
              makeCell(r[0], { shading: i % 2 ? COLORS.rowAlt : COLORS.white }),
              makeCell(r[1], { align: AlignmentType.RIGHT, bold: true, shading: i % 2 ? COLORS.rowAlt : COLORS.white }),
            ],
          })),
        ],
      }));
      sections.push(spacer(200));
    }

    // Projection table
    if (model.computed) {
      sections.push(heading('5-Year Projections', HeadingLevel.HEADING_2));

      const yearLabels = model.computed.yearLabels || [];
      const projRows = [
        { label: 'Revenue (bil)', data: model.computed.revenue, fmt: v => `$${fmt(v, 3)}` },
        { label: 'Cost of Revenue', data: model.computed.cogs, fmt: v => `$${fmt(v, 3)}` },
        { label: 'Operating Expense', data: model.computed.opex, fmt: v => `$${fmt(v, 3)}` },
        { label: 'Operating Income (bil)', data: model.computed.opIncome, fmt: v => `$${fmt(v, 3)}`, bold: true },
        { label: 'Operating Margin', data: model.computed.opMargin, fmt: v => fmtPct(v, 2) },
        { label: 'Net Income (bil)', data: model.computed.netIncome, fmt: v => `$${fmt(v, 3)}`, bold: true },
        { label: 'Outstanding Shares (bil)', data: model.computed.shares, fmt: v => fmt(v, 4) },
        { label: 'Earnings per Share', data: model.computed.eps, fmt: v => `$${fmt(v, 2)}`, bold: true },
        { label: 'Share Price (at Tgt P/E)', data: model.computed.priceArr, fmt: v => `$${fmt(v, 2)}`, bold: true },
      ];

      const headerRow = new TableRow({
        children: [
          makeCell('', { bold: true, shading: COLORS.headerBg, width: 25 }),
          ...yearLabels.map(y => makeCell(String(y), { bold: true, shading: COLORS.headerBg, align: AlignmentType.RIGHT })),
        ],
      });

      const dataRows = projRows.map((row, ri) => new TableRow({
        children: [
          makeCell(row.label, { bold: row.bold, shading: ri % 2 ? COLORS.rowAlt : COLORS.white, width: 25 }),
          ...(row.data || []).map(v => makeCell(row.fmt(v), {
            align: AlignmentType.RIGHT,
            bold: row.bold,
            shading: ri % 2 ? COLORS.rowAlt : COLORS.white,
          })),
        ],
      }));

      sections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: lightBorders(),
        rows: [headerRow, ...dataRows],
      }));

      sections.push(spacer(200));

      // Output summary
      sections.push(heading('Model Output', HeadingLevel.HEADING_2));
      const outputs = [
        ['Expected CAGR', fmtPct(model.computed.totalCAGRNoDivs, 2)],
        ['Total CAGR (w/ Dividends)', fmtPct(model.computed.totalCAGR, 2)],
        ['1-Year Price Target', `$${fmt(model.computed.priceTarget, 2)}`],
        ['5-Year Target Price', `$${fmt(model.computed.targetPrice5, 2)}`],
      ];

      sections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: lightBorders(),
        rows: outputs.map((r, i) => new TableRow({
          children: [
            makeCell(r[0], { bold: true, shading: i % 2 ? COLORS.rowAlt : COLORS.white, width: 50 }),
            makeCell(r[1], { bold: true, align: AlignmentType.RIGHT, shading: i % 2 ? COLORS.rowAlt : COLORS.white, color: COLORS.primary, size: 22, width: 50 }),
          ],
        })),
      }));
    }
  }

  // ═══════════ DISCLAIMER ═══════════
  sections.push(spacer(400));
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
