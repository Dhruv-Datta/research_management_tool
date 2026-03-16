/**
 * One-time seed script to migrate local JSON/CSV data to Supabase.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs
 *
 * Or set env vars in .env.local and run:
 *   node -e "require('dotenv').config({path:'.env.local'})" && node scripts/seed-supabase.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Use service role key for seeding (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readCSV(filePath) {
  try {
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
  } catch {
    return [];
  }
}

async function seed() {
  console.log('Seeding Supabase...\n');

  // 1. Portfolio holdings
  const portfolio = readJSON(path.join(ROOT, 'portfolio.json'));
  if (portfolio) {
    console.log(`Seeding ${portfolio.holdings.length} holdings...`);
    for (const h of portfolio.holdings) {
      const { error } = await supabase.from('holdings').upsert({
        ticker: h.ticker,
        shares: h.shares,
        cost_basis: h.cost_basis,
        added_at: h.added_at,
        updated_at: h.updated_at,
      }, { onConflict: 'ticker' });
      if (error) console.error(`  holdings error for ${h.ticker}:`, error.message);
    }

    // Cash
    const { error: cashErr } = await supabase
      .from('portfolio_cash')
      .update({ cash: portfolio.cash || 0 })
      .eq('id', 1);
    if (cashErr) console.error('  cash error:', cashErr.message);
    console.log('  Done.\n');
  }

  // 2. Watchlists
  const watchlist = readJSON(path.join(ROOT, 'watchlist.json'));
  if (watchlist) {
    console.log(`Seeding ${watchlist.watchlists.length} watchlists...`);
    for (const w of watchlist.watchlists) {
      const { error } = await supabase.from('watchlists').upsert({
        id: w.id,
        name: w.name,
        stocks: w.stocks || [],
      });
      if (error) console.error(`  watchlist error for ${w.id}:`, error.message);
    }

    // Active watchlist
    await supabase.from('app_settings').upsert({
      key: 'activeWatchlistId',
      value: watchlist.activeWatchlistId || 'default',
    });
    console.log('  Done.\n');
  }

  // 3. Factor config
  const factorConfig = readJSON(path.join(ROOT, 'data', 'factor-config.json'));
  if (factorConfig) {
    console.log('Seeding factor config...');
    const { error } = await supabase.from('factor_config').update({
      factors: factorConfig.factors || [],
      importance_weights: factorConfig.importanceWeights || { Volatility: 0.9 },
      exposures: factorConfig.exposures || {},
    }).eq('id', 1);
    if (error) console.error('  factor config error:', error.message);
    console.log('  Done.\n');
  }

  // 4. Sector config
  const sectorConfig = readJSON(path.join(ROOT, 'data', 'sector-config.json'));
  if (sectorConfig) {
    console.log('Seeding sector config...');
    const { error } = await supabase.from('sector_config').update({
      config: sectorConfig,
    }).eq('id', 1);
    if (error) console.error('  sector config error:', error.message);
    console.log('  Done.\n');
  }

  // 5. Per-ticker data
  const dataDir = path.join(ROOT, 'data');
  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  const tickerDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

  for (const ticker of tickerDirs) {
    const tickerDir = path.join(dataDir, ticker);
    console.log(`Seeding ticker: ${ticker}`);

    // Thesis
    const thesis = readJSON(path.join(tickerDir, 'thesis.json'));
    if (thesis) {
      const { error } = await supabase.from('theses').upsert({
        ticker,
        core_reasons: thesis.coreReasons || [],
        assumptions: thesis.assumptions || '',
        valuation: thesis.valuation || '',
        underwriting: thesis.underwriting || {},
        news_updates: thesis.newsUpdates || [],
        todos: thesis.todos || [],
        updated_at: thesis.updatedAt || new Date().toISOString(),
      });
      if (error) console.error(`  thesis error:`, error.message);
    }

    // Valuation model
    const model = readJSON(path.join(tickerDir, 'valuation_model.json'));
    if (model) {
      const { error } = await supabase.from('valuation_models').upsert({
        ticker,
        inputs: model.inputs || {},
        updated_at: model.updatedAt || new Date().toISOString(),
      });
      if (error) console.error(`  valuation model error:`, error.message);
    }

    // Fundamentals CSVs
    const fundamentalsDir = path.join(tickerDir, 'fundamentals');
    if (fs.existsSync(fundamentalsDir)) {
      const fundamentalTypes = ['revenue', 'eps', 'fcf', 'operating_margins', 'buybacks'];
      for (const type of fundamentalTypes) {
        const csvPath = path.join(fundamentalsDir, `${type}.csv`);
        const data = readCSV(csvPath);
        if (data.length > 0) {
          const { error } = await supabase.from('ticker_fundamentals').upsert({
            ticker,
            data_type: type,
            data,
            updated_at: new Date().toISOString(),
          });
          if (error) console.error(`  ${type} error:`, error.message);
        }
      }
    }

    // Price CSVs
    const priceDir = path.join(tickerDir, 'price_data');
    if (fs.existsSync(priceDir)) {
      const priceTypes = ['daily_prices', 'market_data'];
      for (const type of priceTypes) {
        const csvPath = path.join(priceDir, `${type}.csv`);
        const data = readCSV(csvPath);
        if (data.length > 0) {
          const { error } = await supabase.from('ticker_prices').upsert({
            ticker,
            data_type: type,
            data,
            updated_at: new Date().toISOString(),
          });
          if (error) console.error(`  ${type} error:`, error.message);
        }
      }
    }

    console.log(`  Done.`);
  }

  console.log('\nSeed complete!');
}

seed().catch(e => {
  console.error('Seed failed:', e);
  process.exit(1);
});
