/**
 * Underwritten Risk Engine
 * Pure factor-exposure-based risk model for concentrated long-only equity portfolios.
 *
 * Risk = factor exposure x crowding x importance.
 */

const EXPOSURE_EXPONENT = 1.25;
const CROWDING_PENALTY = 0.35;
const STATUS_THRESHOLD = 0.015;

export function normalizeVolToExposure(rawVols) {
  const tickers = Object.keys(rawVols);
  const vals = tickers.map(t => rawVols[t]);

  if (vals.length === 0) return {};

  const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, v) => a + (v - mu) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);

  if (std < 1e-12) {
    return Object.fromEntries(tickers.map(t => [t, 0.0]));
  }

  const result = {};
  for (let i = 0; i < tickers.length; i++) {
    let z = (vals[i] - mu) / std;
    z = Math.max(-2.0, Math.min(2.0, z));
    result[tickers[i]] = (z + 2.0) / 4.0;
  }
  return result;
}

export function computeUnderwrittenRisk(validTickers, weightMap, factorNames, importanceWeights, exposureMatrix, assetAnnVols) {
  const nAssets = validTickers.length;
  const nFactors = factorNames.length;
  const w = validTickers.map(t => weightMap[t] || 0);
  const a = factorNames.map(f => importanceWeights[f] ?? 0.5);

  // Portfolio factor exposure E_k = sum(w_i * x_ik)
  const E = new Array(nFactors).fill(0);
  for (let k = 0; k < nFactors; k++) {
    for (let i = 0; i < nAssets; i++) {
      E[k] += w[i] * exposureMatrix[i][k];
    }
  }

  // Factor concentration / crowding
  const HHI = new Array(nFactors).fill(0);
  const C = new Array(nFactors).fill(0);
  const Neff = new Array(nFactors).fill(0);

  for (let k = 0; k < nFactors; k++) {
    if (E[k] > 1e-12) {
      let hhi = 0;
      for (let i = 0; i < nAssets; i++) {
        const s = (w[i] * exposureMatrix[i][k]) / E[k];
        hhi += s * s;
      }
      HHI[k] = hhi;
    }

    Neff[k] = HHI[k] > 1e-12 ? 1.0 / HHI[k] : 0.0;

    let nk = 0;
    for (let i = 0; i < nAssets; i++) {
      if (exposureMatrix[i][k] > 0) nk++;
    }

    if (nk <= 1) {
      C[k] = 1.0;
    } else {
      C[k] = (HHI[k] - 1.0 / nk) / (1.0 - 1.0 / nk);
    }
    C[k] = Math.max(0.0, Math.min(1.0, C[k]));
  }

  // Factor load L_k = a_k * E_k^p * (1 + lambda * C_k)
  const L = new Array(nFactors).fill(0);
  for (let k = 0; k < nFactors; k++) {
    L[k] = a[k] * Math.pow(E[k], EXPOSURE_EXPONENT) * (1.0 + CROWDING_PENALTY * C[k]);
  }

  // Total underwritten risk
  const URtotal = L.reduce((a, b) => a + b, 0);

  // Stock contribution RC_ik = L_k * (w_i * x_ik / E_k)
  const RCmatrix = Array.from({ length: nAssets }, () => new Array(nFactors).fill(0));
  for (let k = 0; k < nFactors; k++) {
    if (E[k] > 1e-12) {
      for (let i = 0; i < nAssets; i++) {
        RCmatrix[i][k] = L[k] * (w[i] * exposureMatrix[i][k]) / E[k];
      }
    }
  }

  const RC = RCmatrix.map(row => row.reduce((a, b) => a + b, 0));
  const RCtotal = RC.reduce((a, b) => a + b, 0);

  const PctRC = RCtotal > 1e-12 ? RC.map(r => r / RCtotal) : new Array(nAssets).fill(0);
  const ExcessVsWeight = PctRC.map((p, i) => p - w[i]);

  const labels = ExcessVsWeight.map(e => {
    if (e > STATUS_THRESHOLD) return 'over contributing';
    if (e < -STATUS_THRESHOLD) return 'under contributing';
    return 'in line';
  });

  // Composite score
  const aSum = a.reduce((s, v) => s + v, 0);
  const scores = new Array(nAssets).fill(0);
  if (aSum > 0) {
    for (let i = 0; i < nAssets; i++) {
      let s = 0;
      for (let k = 0; k < nFactors; k++) {
        s += a[k] * exposureMatrix[i][k];
      }
      scores[i] = s / aSum;
    }
  }

  // Effective risk contributors
  const pctRcSqSum = PctRC.reduce((s, p) => s + p * p, 0);
  const effContributors = pctRcSqSum > 1e-12 ? 1.0 / pctRcSqSum : 0.0;

  // Top 5 risk share
  const sortedPct = [...PctRC].sort((a, b) => b - a);
  const top5Pct = sortedPct.slice(0, Math.min(5, sortedPct.length)).reduce((a, b) => a + b, 0);

  // Highest factor load
  let maxLoadIdx = 0;
  for (let k = 1; k < nFactors; k++) {
    if (L[k] > L[maxLoadIdx]) maxLoadIdx = k;
  }

  // Most crowded factor
  let maxCrowdIdx = 0;
  for (let k = 1; k < nFactors; k++) {
    if (C[k] > C[maxCrowdIdx]) maxCrowdIdx = k;
  }

  // Build attribution
  const attribution = validTickers.map((t, i) => {
    const factorExposures = {};
    const factorContribs = {};
    for (let k = 0; k < nFactors; k++) {
      factorExposures[factorNames[k]] = Math.round(exposureMatrix[i][k] * 10000) / 10000;
      factorContribs[factorNames[k]] = Math.round(RCmatrix[i][k] * 1000000) / 1000000;
    }
    return {
      ticker: t,
      weight: Math.round(w[i] * 100 * 100) / 100,
      standaloneVol: Math.round((assetAnnVols[t] || 0) * 100 * 100) / 100,
      underwrittenContrib: Math.round(RC[i] * 1000000) / 1000000,
      pctOfRisk: Math.round(PctRC[i] * 100 * 100) / 100,
      excessVsWeight: Math.round(ExcessVsWeight[i] * 100 * 100) / 100,
      compositeScore: Math.round(scores[i] * 10000) / 10000,
      riskLabel: labels[i],
      factorExposures,
      factorContribs,
    };
  });

  attribution.sort((a, b) => b.pctOfRisk - a.pctOfRisk);

  // Factor breakdown
  const factorBreakdown = factorNames.map((f, k) => ({
    factor: f,
    exposure: Math.round(E[k] * 10000) / 10000,
    crowding: Math.round(C[k] * 10000) / 10000,
    effectiveNames: Math.round(Neff[k] * 100) / 100,
    load: Math.round(L[k] * 1000000) / 1000000,
    importance: Math.round(a[k] * 100) / 100,
  }));
  factorBreakdown.sort((a, b) => b.load - a.load);

  const portfolioFactorProfile = {};
  for (let k = 0; k < nFactors; k++) {
    portfolioFactorProfile[factorNames[k]] = Math.round(E[k] * 10000) / 10000;
  }

  return {
    stocks: attribution,
    factorBreakdown,
    summary: {
      underwrittenRisk: Math.round(URtotal * 10000) / 10000,
      highestLoadFactor: factorNames[maxLoadIdx],
      highestLoadValue: Math.round(L[maxLoadIdx] * 10000) / 10000,
      mostCrowdedFactor: factorNames[maxCrowdIdx],
      mostCrowdedValue: Math.round(C[maxCrowdIdx] * 10000) / 10000,
      top5RiskPct: Math.round(top5Pct * 100 * 100) / 100,
      effectiveContributors: Math.round(effContributors * 100) / 100,
    },
    portfolioFactorProfile,
  };
}

export function computeFactorOverlap(validTickers, factorNames, importanceWeights, exposureMatrix) {
  const nAssets = validTickers.length;
  const nFactors = factorNames.length;
  const a = factorNames.map(f => importanceWeights[f] ?? 0.5);

  // Z-score each column
  const Z = Array.from({ length: nAssets }, () => new Array(nFactors).fill(0));
  for (let k = 0; k < nFactors; k++) {
    const col = [];
    for (let i = 0; i < nAssets; i++) col.push(exposureMatrix[i][k]);
    const mu = col.reduce((a, b) => a + b, 0) / col.length;
    const variance = col.reduce((a, v) => a + (v - mu) ** 2, 0) / col.length;
    const std = Math.sqrt(variance);
    for (let i = 0; i < nAssets; i++) {
      if (std > 1e-12) {
        Z[i][k] = Math.max(-2.5, Math.min(2.5, (col[i] - mu) / std));
      }
    }
  }

  // Weighted Z
  const Zw = Z.map(row => row.map((z, k) => z * Math.sqrt(a[k])));

  // Norms
  const norms = Zw.map(row => {
    const s = row.reduce((a, v) => a + v * v, 0);
    return s < 1e-12 ? 1.0 : Math.sqrt(s);
  });

  // Similarity matrix
  const matrix = Array.from({ length: nAssets }, (_, i) =>
    Array.from({ length: nAssets }, (_, j) => {
      if (i === j) return 1.0;
      let dot = 0;
      for (let k = 0; k < nFactors; k++) dot += Zw[i][k] * Zw[j][k];
      let sim = dot / (norms[i] * norms[j]);
      return Math.max(-1, Math.min(1, sim));
    })
  );

  // Symmetrize
  for (let i = 0; i < nAssets; i++) {
    for (let j = i + 1; j < nAssets; j++) {
      const avg = (matrix[i][j] + matrix[j][i]) / 2;
      matrix[i][j] = avg;
      matrix[j][i] = avg;
    }
  }

  return { tickers: validTickers, matrix };
}
