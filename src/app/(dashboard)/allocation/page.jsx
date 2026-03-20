'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { BarChart3, Settings, Target, Zap } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const riskFactors = ['Volatility', 'Regulatory', 'Disruption', 'Valuation', 'Earnings Quality'];

const defaultRiskFactorWeights = [0.9, 0.3, 0.7, 0.6, 0.8];

const defaultTickers = ['MA', 'AMZN', 'GOOGL', 'UBER', 'ASML', 'HLT', 'BKNG', 'AAAU', 'UNH', 'ADBE', 'META', 'NFLX'];

const defaultFactorExposures = {
  MA:    [0.20, 0.50, 0.40, 0.30, 0.10],
  AMZN:  [0.55, 0.10, 0.20, 0.35, 0.25],
  GOOGL: [0.50, 0.20, 0.40, 0.20, 0.20],
  UBER:  [0.70, 0.20, 0.60, 0.75, 0.35],
  ASML:  [0.30, 0.15, 0.10, 0.25, 0.20],
  HLT:   [0.25, 0.10, 0.30, 0.45, 0.25],
  BKNG:  [0.25, 0.10, 0.30, 0.35, 0.25],
  AAAU:  [0.20, 0.01, 0.01, 0.50, 0.01],
  UNH:   [0.40, 0.60, 0.40, 0.15, 0.80],
  ADBE:  [0.75, 0.10, 0.80, 0.35, 0.25],
  CASH:  [0.00, 0.00, 0.00, 0.00, 0.00],
  META:  [0.65, 0.20, 0.10, 0.75, 0.45],
  NFLX:  [0.75, 0.10, 0.20, 0.75, 0.60],
};

const createAllocationRow = (overrides = {}) => ({
  id: crypto.randomUUID(),
  ticker: '',
  expectedReturn: '',
  factorExposures: riskFactors.map(() => ''),
  userWeight: '',
  ...overrides,
});

const createDefaultAllocations = () => [
  ...defaultTickers.map((ticker) =>
    createAllocationRow({
      ticker,
      expectedReturn: '',
      factorExposures: defaultFactorExposures[ticker] || riskFactors.map(() => ''),
      userWeight: '',
    })
  ),
  createAllocationRow({
    ticker: 'CASH',
    expectedReturn: '0',
    factorExposures: riskFactors.map(() => 0),
    userWeight: '',
  }),
];

const parseNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const colorScale = [
  [215, 25, 28],
  [253, 174, 97],
  [255, 255, 191],
  [171, 221, 164],
  [43, 131, 186],
];

const lerp = (start, end, t) => start + (end - start) * t;

const getColorFromScale = (value) => {
  const clamped = Math.min(1, Math.max(0, value));
  const segment = (colorScale.length - 1) * clamped;
  const index = Math.floor(segment);
  const ratio = segment - index;
  const [r1, g1, b1] = colorScale[index];
  const [r2, g2, b2] = colorScale[Math.min(index + 1, colorScale.length - 1)];
  return `rgb(${Math.round(lerp(r1, r2, ratio))}, ${Math.round(lerp(g1, g2, ratio))}, ${Math.round(lerp(b1, b2, ratio))})`;
};

export default function AllocationPage() {
  const [allocations, setAllocations] = useState(createDefaultAllocations);
  const [riskFactorWeights, setRiskFactorWeights] = useState(defaultRiskFactorWeights);
  const [riskFreeRate, setRiskFreeRate] = useState('4');
  const [minWeight, setMinWeight] = useState('3');
  const [maxWeight, setMaxWeight] = useState('15');
  const [cashMinWeight, setCashMinWeight] = useState('1');
  const [cashMaxWeight, setCashMaxWeight] = useState('5');
  const [numPortfolios, setNumPortfolios] = useState('100000');
  const [simulationError, setSimulationError] = useState('');
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationChart, setSimulationChart] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const tableRef = useRef(null);

  const handleColumnTab = (e, colName, rowIdx) => {
    if (e.key !== 'Tab') return;
    const nextIdx = e.shiftKey ? rowIdx - 1 : rowIdx + 1;
    if (nextIdx < 0 || nextIdx >= allocations.length) return;
    e.preventDefault();
    const next = tableRef.current?.querySelector(`[data-col="${colName}"][data-row="${nextIdx}"]`);
    if (next) next.focus();
  };

  // Load saved config on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/allocation');
        const { config } = await res.json();
        if (config) {
          if (config.allocations) setAllocations(config.allocations);
          if (config.riskFactorWeights) setRiskFactorWeights(config.riskFactorWeights);
          if (config.riskFreeRate !== undefined) setRiskFreeRate(config.riskFreeRate);
          if (config.minWeight !== undefined) setMinWeight(config.minWeight);
          if (config.maxWeight !== undefined) setMaxWeight(config.maxWeight);
          if (config.cashMinWeight !== undefined) setCashMinWeight(config.cashMinWeight);
          if (config.cashMaxWeight !== undefined) setCashMaxWeight(config.cashMaxWeight);
          if (config.numPortfolios !== undefined) setNumPortfolios(config.numPortfolios);
        }
      } catch (err) {
        console.error('Failed to load allocation config:', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Auto-save with debounce whenever config changes
  const saveConfig = useCallback((config) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/allocation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        });
      } catch (err) {
        console.error('Failed to save allocation config:', err);
      }
    }, 800);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveConfig({
      allocations,
      riskFactorWeights,
      riskFreeRate,
      minWeight,
      maxWeight,
      cashMinWeight,
      cashMaxWeight,
      numPortfolios,
    });
  }, [loaded, allocations, riskFactorWeights, riskFreeRate, minWeight, maxWeight, cashMinWeight, cashMaxWeight, numPortfolios, saveConfig]);

  const simulationChartOptions = useMemo(
    () => ({
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (context) => context.raw?.hoverLines || '',
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Composite Risk (0 to 1)' },
          min: 0,
          max: 1,
        },
        y: {
          title: { display: true, text: 'Expected Return' },
          ticks: {
            callback: (value) => `${(Number(value) * 100).toFixed(0)}%`,
          },
        },
      },
    }),
    []
  );

  const updateAllocation = (id, field, value) => {
    setAllocations((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const updateAllocationExposure = (id, index, value) => {
    setAllocations((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const exposures = [...row.factorExposures];
        exposures[index] = value;
        return { ...row, factorExposures: exposures };
      })
    );
  };

  const updateRiskFactorWeight = (index, value) => {
    setRiskFactorWeights((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const addAllocation = () => {
    setAllocations((prev) => [...prev, createAllocationRow()]);
  };

  const removeAllocation = (id) => {
    setAllocations((prev) => prev.filter((row) => row.id !== id));
  };

  const runMonteCarloSimulation = () => {
    setSimulationError('');
    setSimulationResult(null);
    setSimulationChart(null);

    const filtered = allocations.filter(
      (row) =>
        row.ticker.trim() ||
        row.expectedReturn ||
        row.userWeight ||
        row.factorExposures.some((value) => value)
    );

    if (filtered.length === 0) {
      setSimulationError('Add at least one asset to run the simulation.');
      return;
    }

    const assets = [];
    const expectedReturns = [];
    const factorMatrix = [];
    const userWeights = [];
    const problems = [];

    filtered.forEach((row, index) => {
      const ticker = row.ticker.trim().toUpperCase();
      const expectedReturn = parseNumber(row.expectedReturn) / 100;
      const exposures = row.factorExposures.map((entry) => parseNumber(entry));
      const userWeight = parseNumber(row.userWeight) / 100;

      if (!ticker) problems.push(`Row ${index + 1}: add a ticker.`);
      if (expectedReturn < 0) problems.push(`Row ${index + 1}: expected return must be positive.`);
      if (exposures.some((value) => value < 0)) problems.push(`Row ${index + 1}: factor exposures must be positive.`);
      if (userWeight < 0) problems.push(`Row ${index + 1}: user weight must be positive.`);

      if (ticker) {
        assets.push(ticker);
        expectedReturns.push(expectedReturn);
        factorMatrix.push(exposures);
        userWeights.push(userWeight);
      }
    });

    const riskFree = parseNumber(riskFreeRate) / 100;
    const minW = parseNumber(minWeight) / 100;
    const maxW = parseNumber(maxWeight) / 100;
    const cashMinW = parseNumber(cashMinWeight) / 100;
    const cashMaxW = parseNumber(cashMaxWeight) / 100;
    const portfoliosTarget = Math.max(100, Math.round(parseNumber(numPortfolios)));

    if (!assets.includes('CASH')) problems.push('Include a CASH row to apply cash weight constraints.');
    if (minW < 0 || maxW <= 0 || minW > maxW) problems.push('Stock weight limits are invalid.');
    if (cashMinW < 0 || cashMaxW < 0 || cashMinW > cashMaxW) problems.push('Cash weight limits are invalid.');

    const factorWeights = riskFactorWeights.map((value) => parseNumber(value));
    if (factorWeights.length !== riskFactors.length || factorWeights.some((value) => value < 0)) {
      problems.push('Risk factor weights must be non-negative for each factor.');
    }

    const userWeightTotal = userWeights.reduce((sum, value) => sum + value, 0);
    if (userWeightTotal > 0 && Math.abs(userWeightTotal - 1) > 0.001) {
      problems.push(`User-defined weights must sum to 100%. Current total: ${(userWeightTotal * 100).toFixed(2)}%.`);
    }

    if (problems.length > 0) {
      setSimulationError(problems.join(' '));
      return;
    }

    const cashIndex = assets.indexOf('CASH');
    if (cashIndex === -1) {
      setSimulationError('Include a CASH row to apply cash weight constraints.');
      return;
    }

    const factorCount = riskFactors.length;
    const factorSums = Array.from({ length: factorCount }, (_, idx) =>
      factorMatrix.reduce((sum, row) => sum + (row[idx] || 0), 0)
    );

    const normalizedFactors = factorMatrix.map((row, rowIndex) => {
      if (assets[rowIndex] === 'CASH') return Array.from({ length: factorCount }, () => 0);
      return row.map((value, idx) => (factorSums[idx] > 0 ? value / factorSums[idx] : 0));
    });

    const factorMeans = Array.from({ length: factorCount }, (_, idx) =>
      normalizedFactors.reduce((sum, row) => sum + row[idx], 0) / normalizedFactors.length
    );

    const centeredFactors = normalizedFactors.map((row) =>
      row.map((value, idx) => value - factorMeans[idx])
    );

    const covarianceFactors = Array.from({ length: factorCount }, () =>
      Array.from({ length: factorCount }, () => 0)
    );

    const denominator = Math.max(normalizedFactors.length - 1, 1);
    for (let i = 0; i < factorCount; i += 1) {
      for (let j = 0; j < factorCount; j += 1) {
        covarianceFactors[i][j] =
          centeredFactors.reduce((sum, row) => sum + row[i] * row[j], 0) / denominator;
      }
    }

    const weightedFactors = covarianceFactors.map((row, i) =>
      row.map((value, j) => value * factorWeights[i] * factorWeights[j])
    );

    const compositeMatrix = Array.from({ length: assets.length }, () =>
      Array.from({ length: assets.length }, () => 0)
    );

    for (let i = 0; i < assets.length; i += 1) {
      for (let j = 0; j < assets.length; j += 1) {
        let sum = 0;
        for (let k = 0; k < factorCount; k += 1) {
          for (let l = 0; l < factorCount; l += 1) {
            sum += normalizedFactors[i][k] * weightedFactors[k][l] * normalizedFactors[j][l];
          }
        }
        compositeMatrix[i][j] = sum;
      }
    }

    const simulations = [];
    let samplesGenerated = 0;
    let attempts = 0;
    const maxAttempts = portfoliosTarget * 50;

    while (samplesGenerated < portfoliosTarget && attempts < maxAttempts) {
      attempts += 1;
      const rawWeights = assets.map(() => Math.random());
      const total = rawWeights.reduce((sum, value) => sum + value, 0);
      const weights = rawWeights.map((value) => value / total);

      const cashWeight = weights[cashIndex];
      const otherWeights = weights.filter((_, idx) => idx !== cashIndex);

      const stockConstraintsMet =
        otherWeights.every((value) => value >= minW && value <= maxW) &&
        cashWeight >= cashMinW &&
        cashWeight <= cashMaxW;

      if (!stockConstraintsMet) continue;

      const expectedReturn = weights.reduce(
        (sum, weight, idx) => sum + weight * expectedReturns[idx],
        0
      );
      let variance = 0;
      for (let i = 0; i < weights.length; i += 1) {
        for (let j = 0; j < weights.length; j += 1) {
          variance += weights[i] * compositeMatrix[i][j] * weights[j];
        }
      }
      const volatility = Math.sqrt(Math.max(variance, 0));
      const sharpe = volatility > 0 ? (expectedReturn - riskFree) / volatility : 0;

      simulations.push({ weights, expectedReturn, volatility, sharpe });
      samplesGenerated += 1;
    }

    if (simulations.length === 0) {
      setSimulationError('Unable to generate portfolios with the provided constraints.');
      return;
    }

    const maxSharpe = simulations.reduce((best, current) =>
      current.sharpe > best.sharpe ? current : best
    );
    const minVol = simulations.reduce((best, current) =>
      current.volatility < best.volatility ? current : best
    );

    const formatWeights = (weights) =>
      weights
        .map((weight, idx) => ({ ticker: assets[idx], weight }))
        .sort((a, b) => b.weight - a.weight);

    const sharpeValues = simulations.map((item) => item.sharpe);
    const volValues = simulations.map((item) => item.volatility);
    const minSharpeValue = Math.min(...sharpeValues);
    const maxSharpeValue = Math.max(...sharpeValues);
    const minVolValue = Math.min(...volValues);
    const maxVolValue = Math.max(...volValues);

    const getCompositeRatio = (sharpe) =>
      maxSharpeValue === minSharpeValue ? 0 : (sharpe - minSharpeValue) / (maxSharpeValue - minSharpeValue);
    const getCompositeRisk = (volatility) =>
      maxVolValue === minVolValue ? 0 : (volatility - minVolValue) / (maxVolValue - minVolValue);

    const buildHoverLines = (weights, expectedReturn, volatility, sharpe) => [
      `Composite Ratio: ${getCompositeRatio(sharpe).toFixed(3)}`,
      `Return: ${(expectedReturn * 100).toFixed(2)}%`,
      `Volatility: ${(volatility * 100).toFixed(2)}%`,
      '',
      ...weights.map((weight, idx) => `${assets[idx]}: ${(weight * 100).toFixed(2)}%`),
    ];

    const simulationPoints = simulations.map((item) => {
      const compositeRatio = getCompositeRatio(item.sharpe);
      return {
        x: getCompositeRisk(item.volatility),
        y: item.expectedReturn,
        hoverLines: buildHoverLines(item.weights, item.expectedReturn, item.volatility, item.sharpe),
        color: getColorFromScale(compositeRatio),
      };
    });

    const buildStarPoint = (item, label) => ({
      x: getCompositeRisk(item.volatility),
      y: item.expectedReturn,
      hoverLines: buildHoverLines(item.weights, item.expectedReturn, item.volatility, item.sharpe),
      label,
      compositeRatio: getCompositeRatio(item.sharpe),
    });

    const computeUserMetrics = () => {
      if (userWeightTotal <= 0) return null;
      let userVariance = 0;
      for (let i = 0; i < userWeights.length; i += 1) {
        for (let j = 0; j < userWeights.length; j += 1) {
          userVariance += userWeights[i] * compositeMatrix[i][j] * userWeights[j];
        }
      }
      const userReturn = userWeights.reduce(
        (sum, weight, idx) => sum + weight * expectedReturns[idx],
        0
      );
      const userVolatility = Math.sqrt(Math.max(userVariance, 0));
      const userSharpe = userVolatility > 0 ? (userReturn - riskFree) / userVolatility : 0;
      return {
        expectedReturn: userReturn,
        volatility: userVolatility,
        sharpe: userSharpe,
        weights: formatWeights(userWeights),
        rawWeights: userWeights,
      };
    };

    const userMetrics = computeUserMetrics();
    if (userMetrics) {
      userMetrics.compositeRatio = getCompositeRatio(userMetrics.sharpe);
    }

    const starRadius = 22;
    const starBorderWidth = 4;
    const chartData = {
      datasets: [
        {
          label: 'Portfolio Simulations',
          data: simulationPoints.map((point) => ({ x: point.x, y: point.y, hoverLines: point.hoverLines })),
          backgroundColor: simulationPoints.map((point) => point.color),
          pointRadius: 4,
          order: 3,
        },
        {
          label: 'Max Composite Ratio',
          data: [buildStarPoint(maxSharpe, 'Max Composite Ratio')],
          backgroundColor: '#dc2626',
          pointRadius: starRadius,
          pointStyle: 'star',
          pointBorderWidth: starBorderWidth,
          pointBorderColor: '#dc2626',
          pointHoverRadius: starRadius + 4,
          order: 1,
        },
        {
          label: 'Min Volatility',
          data: [buildStarPoint(minVol, 'Min Volatility')],
          backgroundColor: '#2563eb',
          pointRadius: starRadius,
          pointStyle: 'star',
          pointBorderWidth: starBorderWidth,
          pointBorderColor: '#2563eb',
          pointHoverRadius: starRadius + 4,
          order: 1,
        },
      ],
    };

    if (userMetrics) {
      chartData.datasets.push({
        label: 'User-Defined Portfolio',
        data: [
          {
            x: getCompositeRisk(userMetrics.volatility),
            y: userMetrics.expectedReturn,
            hoverLines: buildHoverLines(
              userMetrics.rawWeights,
              userMetrics.expectedReturn,
              userMetrics.volatility,
              userMetrics.sharpe
            ),
            compositeRatio: getCompositeRatio(userMetrics.sharpe),
          },
        ],
        backgroundColor: '#16a34a',
        pointRadius: starRadius,
        pointStyle: 'star',
        pointBorderWidth: starBorderWidth,
        pointBorderColor: '#16a34a',
        pointHoverRadius: starRadius + 4,
        order: 1,
      });
    }

    setSimulationChart(chartData);
    setSimulationResult({
      totalSamples: simulations.length,
      maxSharpe: {
        ...maxSharpe,
        weights: formatWeights(maxSharpe.weights),
        compositeRatio: getCompositeRatio(maxSharpe.sharpe),
      },
      minVol: {
        ...minVol,
        weights: formatWeights(minVol.weights),
        compositeRatio: getCompositeRatio(minVol.sharpe),
      },
      userDefined: userMetrics,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
      <div className="animate-fade-in-up">
        <div className="mb-8 pt-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Project Optimum</h2>
            <p className="text-sm text-gray-500 mt-1">
              Input expected returns and risk parameters to simulate the optimal risk to reward portfolios.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up stagger-2">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-900">Portfolio Constraints</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk-Free Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={riskFreeRate}
                  onChange={(e) => setRiskFreeRate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Portfolios</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={numPortfolios}
                  onChange={(e) => setNumPortfolios(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Min Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minWeight}
                  onChange={(e) => setMinWeight(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Max Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cash Min Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashMinWeight}
                  onChange={(e) => setCashMinWeight(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cash Max Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashMaxWeight}
                  onChange={(e) => setCashMaxWeight(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-900">Risk Factor Weights</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {riskFactors.map((factor, index) => (
                <div key={factor}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{factor}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={riskFactorWeights[index]}
                    onChange={(e) => updateRiskFactorWeight(index, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 animate-fade-in-up stagger-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Asset Parameters</h3>
          <div className="overflow-x-auto">
            <table ref={tableRef} className="min-w-full text-left text-sm">
              <thead className="text-gray-600 border-b border-gray-300">
                <tr>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Ticker</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Expected Return (%)</th>
                  {riskFactors.map((factor) => (
                    <th key={factor} className="px-3 py-2 font-semibold text-center whitespace-nowrap">
                      {factor}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">User Weight (%)</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((row, idx) => (
                  <tr key={row.id} className={idx > 0 ? 'border-t border-gray-200' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.ticker}
                        onChange={(e) => updateAllocation(row.id, 'ticker', e.target.value)}
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        placeholder="AAPL"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        data-col="expectedReturn"
                        data-row={idx}
                        value={row.expectedReturn}
                        onChange={(e) => updateAllocation(row.id, 'expectedReturn', e.target.value)}
                        onKeyDown={(e) => handleColumnTab(e, 'expectedReturn', idx)}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        placeholder="0.00"
                      />
                    </td>
                    {row.factorExposures.map((value, index) => (
                      <td key={`${row.id}-${riskFactors[index]}`} className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={value}
                          onChange={(e) => updateAllocationExposure(row.id, index, e.target.value)}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                          placeholder="0.00"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        data-col="userWeight"
                        data-row={idx}
                        value={row.userWeight}
                        onKeyDown={(e) => handleColumnTab(e, 'userWeight', idx)}
                        onChange={(e) => updateAllocation(row.id, 'userWeight', e.target.value)}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {allocations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAllocation(row.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 animate-fade-in-up stagger-5">
          <button
            type="button"
            onClick={addAllocation}
            className="inline-flex items-center justify-center px-5 py-2.5 border-2 border-cyan-600 text-cyan-700 rounded-xl font-semibold hover:bg-cyan-50 transition-colors"
          >
            Add Asset
          </button>
          <button
            type="button"
            onClick={runMonteCarloSimulation}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-cyan-600 text-white rounded-xl font-semibold hover:bg-cyan-700 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Run Simulation
          </button>
        </div>

        {simulationError && <p className="mt-4 text-sm text-red-600 font-semibold">{simulationError}</p>}

        {simulationChart && (
          <div className="mt-8 bg-white border border-gray-200 rounded-2xl p-6 animate-fade-in-up">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Efficient Frontier (Weighted Composite Risk)
            </h3>
            <Scatter data={simulationChart} options={simulationChartOptions} />
          </div>
        )}

        {simulationResult && (
          <div className="mt-8 space-y-6 animate-fade-in-up">
            <div className="text-sm text-gray-500">
              Generated portfolios: <span className="font-semibold text-gray-900">{simulationResult.totalSamples}</span>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                <h4 className="font-semibold text-gray-900 mb-2">Max Composite Ratio</h4>
                <p className="text-sm text-gray-600 mb-4">
                  Return {(simulationResult.maxSharpe.expectedReturn * 100).toFixed(2)}% • Volatility{' '}
                  {(simulationResult.maxSharpe.volatility * 100).toFixed(2)}% • Composite Ratio{' '}
                  {simulationResult.maxSharpe.compositeRatio.toFixed(2)}
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                  {simulationResult.maxSharpe.weights.map((item) => (
                    <li key={`max-${item.ticker}`} className="flex justify-between">
                      <span>{item.ticker}</span>
                      <span className="font-semibold">{(item.weight * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                <h4 className="font-semibold text-gray-900 mb-2">Min Risk</h4>
                <p className="text-sm text-gray-600 mb-4">
                  Return {(simulationResult.minVol.expectedReturn * 100).toFixed(2)}% • Volatility{' '}
                  {(simulationResult.minVol.volatility * 100).toFixed(2)}% • Composite Ratio{' '}
                  {simulationResult.minVol.compositeRatio.toFixed(2)}
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                  {simulationResult.minVol.weights.map((item) => (
                    <li key={`min-${item.ticker}`} className="flex justify-between">
                      <span>{item.ticker}</span>
                      <span className="font-semibold">{(item.weight * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {simulationResult.userDefined && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                <h4 className="font-semibold text-gray-900 mb-2">User-Defined Portfolio</h4>
                <p className="text-sm text-gray-600 mb-4">
                  Return {(simulationResult.userDefined.expectedReturn * 100).toFixed(2)}% • Volatility{' '}
                  {(simulationResult.userDefined.volatility * 100).toFixed(2)}% • Composite Ratio{' '}
                  {simulationResult.userDefined.compositeRatio.toFixed(2)}
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                  {simulationResult.userDefined.weights.map((item) => (
                    <li key={`user-${item.ticker}`} className="flex justify-between">
                      <span>{item.ticker}</span>
                      <span className="font-semibold">{(item.weight * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
