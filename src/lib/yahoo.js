import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

function safeFloat(val) {
  if (val == null) return null;
  const v = Number(val);
  return Number.isFinite(v) ? v : null;
}

function getEffectiveMarketPrice(quote) {
  const postMarketPrice = safeFloat(quote.postMarketPrice);
  if (postMarketPrice) return { price: postMarketPrice, session: 'post' };

  const preMarketPrice = safeFloat(quote.preMarketPrice);
  if (preMarketPrice) return { price: preMarketPrice, session: 'pre' };

  const regularMarketPrice = safeFloat(quote.regularMarketPrice);
  if (regularMarketPrice) return { price: regularMarketPrice, session: 'regular' };

  return { price: null, session: 'unknown' };
}

export async function fetchQuotes(tickers) {
  const result = {};

  for (const t of tickers) {
    try {
      // quote() has price data but lacks EV, growth, ROE — get those from quoteSummary()
      const [quote, summary] = await Promise.all([
        yahooFinance.quote(t),
        yahooFinance.quoteSummary(t, {
          modules: ['financialData', 'defaultKeyStatistics'],
        }).catch(() => null),
      ]);

      const fin = summary?.financialData || {};
      const stats = summary?.defaultKeyStatistics || {};

      const { price, session } = getEffectiveMarketPrice(quote);
      const regularMarketPrice = safeFloat(quote.regularMarketPrice);
      const postMarketPrice = safeFloat(quote.postMarketPrice);
      const preMarketPrice = safeFloat(quote.preMarketPrice);
      const prev = safeFloat(quote.regularMarketPreviousClose);
      const dayChange = (price && prev) ? price - prev : 0;
      const dayChangePct = prev ? (dayChange / prev) * 100 : 0;

      result[t] = {
        shortName: quote.shortName || quote.longName || '',
        price,
        regularMarketPrice,
        postMarketPrice,
        preMarketPrice,
        priceSession: session,
        previousClose: prev,
        dayChange: Math.round(dayChange * 10000) / 10000,
        dayChangePct: Math.round(dayChangePct * 10000) / 10000,
        marketCap: safeFloat(quote.marketCap),
        enterpriseValue: safeFloat(stats.enterpriseValue),
        evToEbitda: safeFloat(stats.enterpriseToEbitda),
        avgVolume: safeFloat(quote.averageDailyVolume3Month),
        dividendYield: safeFloat(quote.trailingAnnualDividendYield),
        trailingPE: safeFloat(quote.trailingPE),
        forwardPE: safeFloat(quote.forwardPE),
        revenueGrowth: safeFloat(fin.revenueGrowth),
        earningsGrowth: safeFloat(fin.earningsGrowth),
        roic: safeFloat(fin.returnOnEquity),
        fiftyTwoWeekHigh: safeFloat(quote.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: safeFloat(quote.fiftyTwoWeekLow),
      };
    } catch (e) {
      result[t] = { price: null, error: e.message };
    }
  }

  return result;
}

export async function fetchFundamentals(tickers) {
  const result = {};

  for (const t of tickers) {
    try {
      const summary = await yahooFinance.quoteSummary(t, {
        modules: ['summaryDetail', 'assetProfile', 'defaultKeyStatistics', 'financialData'],
      });

      const profile = summary.assetProfile || {};
      const detail = summary.summaryDetail || {};
      const stats = summary.defaultKeyStatistics || {};
      const fin = summary.financialData || {};

      result[t] = {
        sector: profile.sector || 'Unknown',
        industry: profile.industry || 'Unknown',
        marketCap: safeFloat(detail.marketCap),
        pe: safeFloat(detail.trailingPE),
        forwardPe: safeFloat(detail.forwardPE),
        peg: safeFloat(stats.pegRatio),
        pb: safeFloat(stats.priceToBook),
        ps: safeFloat(detail.priceToSalesTrailing12Months),
        evEbitda: safeFloat(stats.enterpriseToEbitda),
        evRevenue: safeFloat(stats.enterpriseToRevenue),
        beta: safeFloat(stats.beta),
      };
    } catch (e) {
      result[t] = { error: e.message };
    }
  }

  return result;
}

export async function fetchPeriodChanges(tickers, period) {
  const result = {};

  for (const t of tickers) {
    try {
      if (period === '1d') {
        const quote = await yahooFinance.quote(t);
        const price = safeFloat(quote.regularMarketPrice);
        const prev = safeFloat(quote.regularMarketPreviousClose);
        if (price && prev) {
          result[t] = Math.round(((price - prev) / prev) * 100 * 10000) / 10000;
        } else {
          result[t] = 0;
        }
      } else {
        const periodMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825 };
        const days = periodMap[period];
        if (!days) { result[t] = 0; continue; }

        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);

        const chartResult = await yahooFinance.chart(t, {
          period1: start.toISOString().split('T')[0],
          period2: end.toISOString().split('T')[0],
        });
        const hist = chartResult.quotes || [];

        if (!hist || hist.length < 2) {
          result[t] = 0;
          continue;
        }

        const startPrice = hist[0].close;
        const endPrice = hist[hist.length - 1].close;
        if (startPrice > 0) {
          result[t] = Math.round(((endPrice - startPrice) / startPrice) * 100 * 10000) / 10000;
        } else {
          result[t] = 0;
        }
      }
    } catch {
      result[t] = 0;
    }
  }

  return result;
}
