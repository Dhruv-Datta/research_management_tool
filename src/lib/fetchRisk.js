import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
import { normalizeVolToExposure, computeUnderwrittenRisk, computeFactorOverlap } from './riskEngine';

export async function fetchRisk(holdings, factorConfig = null, lookbackDays = 252) {
  const tickers = holdings.map(h => h.ticker);
  if (tickers.length < 1) return { error: 'Need at least 1 position' };

  if (!factorConfig) {
    factorConfig = { factors: [], importanceWeights: { Volatility: 0.9 }, exposures: {} };
  }

  const manualFactors = factorConfig.factors || [];
  const importanceWeights = factorConfig.importanceWeights || { Volatility: 0.9 };
  const manualExposures = factorConfig.exposures || {};
  const allFactors = ['Volatility', ...manualFactors];

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (lookbackDays + 60));

  // Download historical prices
  const prices = {};
  for (const t of tickers) {
    try {
      const chartResult = await yahooFinance.chart(t, {
        period1: start.toISOString().split('T')[0],
        period2: end.toISOString().split('T')[0],
      });
      const hist = chartResult.quotes || [];
      if (hist.length > 0) {
        prices[t] = hist.map(h => h.close).filter(c => c != null);
      }
    } catch {
      // skip
    }
  }

  const validTickers = tickers.filter(t => prices[t] && prices[t].length >= 60);
  if (validTickers.length === 0) {
    return { error: 'Insufficient price history', metrics: null };
  }

  // Compute daily returns
  const returns = {};
  for (const t of validTickers) {
    const p = prices[t];
    const r = [];
    for (let i = 1; i < p.length; i++) {
      r.push((p[i] - p[i - 1]) / p[i - 1]);
    }
    returns[t] = r;
  }

  // Align returns to same length (use min length, tail)
  const minLen = Math.min(...validTickers.map(t => returns[t].length));
  const useDays = Math.min(minLen, lookbackDays);
  for (const t of validTickers) {
    returns[t] = returns[t].slice(-useDays);
  }

  // Portfolio weights
  let totalValue = 0;
  const weightMap = {};
  for (const h of holdings) {
    if (validTickers.includes(h.ticker)) {
      const val = h.shares * (h.price || h.cost_basis);
      weightMap[h.ticker] = val;
      totalValue += val;
    }
  }
  if (totalValue > 0) {
    for (const t of Object.keys(weightMap)) weightMap[t] /= totalValue;
  } else {
    const eq = 1.0 / validTickers.length;
    for (const t of validTickers) weightMap[t] = eq;
  }

  const weightArr = validTickers.map(t => weightMap[t] || 0);

  // Portfolio daily returns
  const nDays = useDays;
  const portReturns = new Array(nDays).fill(0);
  for (let d = 0; d < nDays; d++) {
    for (let i = 0; i < validTickers.length; i++) {
      portReturns[d] += weightArr[i] * returns[validTickers[i]][d];
    }
  }

  // Observed vol
  const portMean = portReturns.reduce((a, b) => a + b, 0) / portReturns.length;
  const portVar = portReturns.reduce((a, r) => a + (r - portMean) ** 2, 0) / portReturns.length;
  const obsVol = Math.sqrt(portVar) * Math.sqrt(252);

  // Max drawdown
  let peak = 1;
  let maxDd = 0;
  let cum = 1;
  for (const r of portReturns) {
    cum *= (1 + r);
    if (cum > peak) peak = cum;
    const dd = (cum - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }

  // VaR 95%
  let var95 = null;
  if (portReturns.length > 20) {
    const sorted = [...portReturns].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.05);
    var95 = sorted[idx];
  }

  // Implied portfolio correlation
  let portfolioCorr = null;
  if (validTickers.length >= 2) {
    const assetStds = {};
    for (const t of validTickers) {
      const r = returns[t];
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      assetStds[t] = Math.sqrt(r.reduce((a, v) => a + (v - mean) ** 2, 0) / r.length);
    }

    // Pairwise correlations
    let crossScale = 0;
    let crossCorr = 0;
    for (let i = 0; i < validTickers.length; i++) {
      for (let j = i + 1; j < validTickers.length; j++) {
        const ti = validTickers[i];
        const tj = validTickers[j];
        const ri = returns[ti];
        const rj = returns[tj];
        const mi = ri.reduce((a, b) => a + b, 0) / ri.length;
        const mj = rj.reduce((a, b) => a + b, 0) / rj.length;

        let cov = 0;
        for (let d = 0; d < nDays; d++) {
          cov += (ri[d] - mi) * (rj[d] - mj);
        }
        cov /= nDays;

        const corr = (assetStds[ti] > 0 && assetStds[tj] > 0) ? cov / (assetStds[ti] * assetStds[tj]) : 0;
        const scale = (weightMap[ti] || 0) * (weightMap[tj] || 0) * assetStds[ti] * assetStds[tj];
        crossScale += scale;
        crossCorr += scale * corr;
      }
    }
    if (crossScale > 0) portfolioCorr = crossCorr / crossScale;
  }

  // Realized vol per stock (annualized)
  const assetAnnVols = {};
  for (const t of validTickers) {
    const r = returns[t];
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const variance = r.reduce((a, v) => a + (v - mean) ** 2, 0) / r.length;
    assetAnnVols[t] = Math.sqrt(variance) * Math.sqrt(252);
  }

  // Volatility exposure
  const volExposures = normalizeVolToExposure(assetAnnVols);

  // Build exposure matrix
  const nAssets = validTickers.length;
  const nFactors = allFactors.length;
  const exposureMatrix = Array.from({ length: nAssets }, () => new Array(nFactors).fill(0));

  for (let i = 0; i < nAssets; i++) {
    const t = validTickers[i];
    exposureMatrix[i][0] = volExposures[t] || 0;
    const tExp = manualExposures[t] || {};
    for (let j = 0; j < manualFactors.length; j++) {
      exposureMatrix[i][j + 1] = tExp[manualFactors[j]] || 0;
    }
  }

  // Run underwritten risk engine
  const urResult = computeUnderwrittenRisk(
    validTickers, weightMap, allFactors,
    importanceWeights, exposureMatrix, assetAnnVols
  );

  // Factor overlap
  const overlap = computeFactorOverlap(
    validTickers, allFactors, importanceWeights, exposureMatrix
  );

  return {
    metrics: {
      observedVol: obsVol != null ? Math.round(obsVol * 100 * 100) / 100 : null,
      maxDrawdown: maxDd != null ? Math.round(maxDd * 100 * 100) / 100 : null,
      var95Pct: var95 != null ? Math.round(var95 * 100 * 100) / 100 : null,
      portfolioCorrelation: portfolioCorr != null ? Math.round(portfolioCorr * 10000) / 10000 : null,
      daysUsed: portReturns.length,
    },
    riskAttribution: {
      stocks: urResult.stocks,
      summary: urResult.summary,
      factorBreakdown: urResult.factorBreakdown,
    },
    portfolioFactorProfile: urResult.portfolioFactorProfile,
    allFactors,
    overlap,
  };
}
