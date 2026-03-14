import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export function getTickerDataDir(ticker) {
  return path.join(DATA_DIR, ticker.toUpperCase());
}

export function tickerDataExists(ticker) {
  const dir = getTickerDataDir(ticker);
  const fundamentalsDir = path.join(dir, 'fundamentals');
  const priceDir = path.join(dir, 'price_data');

  if (!fs.existsSync(fundamentalsDir) || !fs.existsSync(priceDir)) return false;

  // Check if at least revenue.csv and daily_prices.csv exist
  const hasRevenue = fs.existsSync(path.join(fundamentalsDir, 'revenue.csv'));
  const hasPrices = fs.existsSync(path.join(priceDir, 'daily_prices.csv'));
  return hasRevenue && hasPrices;
}

export function readCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  const lines = content.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      const val = (values[i] || '').trim();
      const num = Number(val);
      row[h] = val !== '' && !isNaN(num) && h !== 'date' && h !== 'quarter' ? num : val;
    });
    return row;
  });
}

export function loadTickerFundamentals(ticker) {
  const dir = getTickerDataDir(ticker);
  const fundamentalsDir = path.join(dir, 'fundamentals');
  const priceDir = path.join(dir, 'price_data');

  return {
    revenue: readCSV(path.join(fundamentalsDir, 'revenue.csv')),
    eps: readCSV(path.join(fundamentalsDir, 'eps.csv')),
    fcf: readCSV(path.join(fundamentalsDir, 'fcf.csv')),
    operating_margins: readCSV(path.join(fundamentalsDir, 'operating_margins.csv')),
    buybacks: readCSV(path.join(fundamentalsDir, 'buybacks.csv')),
    daily_prices: readCSV(path.join(priceDir, 'daily_prices.csv')),
    market_data: readCSV(path.join(priceDir, 'market_data.csv')),
  };
}

export function getMarketDataPoint(marketData, metric) {
  const row = marketData.find(r => r.metric === metric);
  return row ? row.value : null;
}

// Compute PE ratio from price and EPS data
export function computeValuationMetrics(data) {
  const { daily_prices, eps, fcf, revenue, market_data } = data;

  const currentPrice = getMarketDataPoint(market_data, 'current_price')
    || (daily_prices.length ? daily_prices[daily_prices.length - 1].close : null);

  const latestEps = eps.length ? eps[eps.length - 1].eps_diluted : null;
  const latestFcf = fcf.length ? fcf[fcf.length - 1].free_cash_flow : null;
  const latestRevenue = revenue.length ? revenue[revenue.length - 1].revenue : null;

  // Shares outstanding from buybacks data (latest)
  const buybacks = data.buybacks || [];
  const latestShares = buybacks.length ? buybacks[buybacks.length - 1].shares_outstanding : null;

  const peRatio = (currentPrice && latestEps && latestEps !== 0) ? currentPrice / latestEps : null;
  const marketCap = (currentPrice && latestShares) ? currentPrice * latestShares : null;
  const fcfYield = (latestFcf && marketCap && marketCap !== 0) ? (latestFcf / marketCap) * 100 : null;
  const priceToSales = (marketCap && latestRevenue && latestRevenue !== 0) ? marketCap / latestRevenue : null;

  // Helper: convert quarter row {year, quarter} to a cutoff date string
  // Q1 ends ~Mar 31, Q2 ~Jun 30, Q3 ~Sep 30, Q4 ~Dec 31
  const quarterEndDate = (row) => {
    const qNum = parseInt(row.quarter.replace('Q', ''));
    const month = String(qNum * 3).padStart(2, '0');
    const lastDay = [0, 31, 30, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][qNum * 3];
    return `${row.year}-${month}-${String(lastDay).padStart(2, '0')}`;
  };

  // Build sorted quarterly lookup arrays with end dates
  const epsLookup = eps
    .filter(e => e.eps_diluted && e.eps_diluted !== 0)
    .map(e => ({ date: quarterEndDate(e), value: e.eps_diluted }));
  const fcfLookup = fcf
    .map(f => ({ date: quarterEndDate(f), value: f.free_cash_flow }));
  const sharesLookup = (data.buybacks || [])
    .filter(b => b.shares_outstanding && b.shares_outstanding > 0)
    .map(b => ({ date: quarterEndDate(b), value: b.shares_outstanding }));

  // For a given date, find the most recent quarterly value at or before that date
  const findLatest = (lookup, date) => {
    let result = null;
    for (const item of lookup) {
      if (item.date <= date) result = item.value;
      else break;
    }
    return result;
  };

  // Build daily PE ratio history
  const peHistory = [];
  if (epsLookup.length && daily_prices.length) {
    for (let i = 0; i < daily_prices.length; i++) {
      const p = daily_prices[i];
      const epsVal = findLatest(epsLookup, p.date);
      if (epsVal && p.close) {
        peHistory.push({ date: p.date, pe_ratio: p.close / epsVal });
      }
    }
  }

  // Build daily FCF yield history
  const fcfYieldHistory = [];
  if (fcfLookup.length && sharesLookup.length && daily_prices.length) {
    for (let i = 0; i < daily_prices.length; i++) {
      const p = daily_prices[i];
      const fcfVal = findLatest(fcfLookup, p.date);
      const sharesVal = findLatest(sharesLookup, p.date);
      if (fcfVal && sharesVal && p.close) {
        const mc = p.close * sharesVal;
        if (mc !== 0) {
          fcfYieldHistory.push({ date: p.date, fcf_yield: (fcfVal / mc) * 100 });
        }
      }
    }
  }

  return {
    currentPrice,
    peRatio,
    fcfYield,
    priceToSales,
    peHistory,
    fcfYieldHistory,
    high52w: getMarketDataPoint(market_data, '52_week_high'),
    low52w: getMarketDataPoint(market_data, '52_week_low'),
    pctFrom52wHigh: getMarketDataPoint(market_data, 'pct_from_52week_high'),
  };
}
