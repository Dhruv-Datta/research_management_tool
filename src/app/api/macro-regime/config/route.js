import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

const TABLE = 'macro_regime_config';
const MACRO_DIR = path.resolve(process.cwd(), 'macro_regime_allocator');
const CONFIG_PATH = path.join(MACRO_DIR, 'config.yaml');

const DEFAULT_CONFIG = {
  start_date: '2000-01-01',
  end_date: '2026-03-01',
  equity_ticker: 'SPY',
  forecast_horizon_months: 1,
  macro_lag_months: 1,
  momentum_window: 3,
  volatility_window: 3,
  regularization_C: 0.5,
  class_weight: null,
  max_iter: 1000,
  recency_halflife_months: 12,
  window_type: 'expanding',
  rolling_window_months: 120,
  min_train_months: 48,
  holdout_start: '2020-01-01',
  baseline_equity: 0.95,
  baseline_tbills: 0.05,
  min_weight: 0.10,
  max_weight: 0.97,
  allocation_steepness: 13.0,
  weight_smoothing_up: 0.98,
  weight_smoothing_down: 0.97,
  crash_overlay: true,
  vix_spike_threshold: 7.0,
  drawdown_defense_threshold: -10.0,
  credit_spike_threshold: 1.5,
};

function configToYaml(cfg) {
  const v = (key) => {
    const val = cfg[key];
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'string') return `"${val}"`;
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  };

  return `# ======================================================================
#              MACRO REGIME ALLOCATOR -- Configuration
# ======================================================================

start_date: ${v('start_date')}
# end_date: set to the 1st of the month you want the allocation for.
end_date: ${v('end_date')}

equity_ticker: ${v('equity_ticker')}
forecast_horizon_months: ${v('forecast_horizon_months')}

# -- Feature Engineering -----------------------------------------------
macro_lag_months: ${v('macro_lag_months')}
momentum_window: ${v('momentum_window')}
volatility_window: ${v('volatility_window')}

# -- Model -------------------------------------------------------------
regularization_C: ${v('regularization_C')}
class_weight: ${v('class_weight')}
max_iter: ${v('max_iter')}

# -- Training ----------------------------------------------------------
recency_halflife_months: ${v('recency_halflife_months')}
window_type: ${v('window_type')}
rolling_window_months: ${v('rolling_window_months')}
min_train_months: ${v('min_train_months')}

# -- Holdout -----------------------------------------------------------
holdout_start: ${v('holdout_start')}

# -- Allocation --------------------------------------------------------
baseline_equity: ${v('baseline_equity')}
baseline_tbills: ${v('baseline_tbills')}

min_weight: ${v('min_weight')}
max_weight: ${v('max_weight')}

allocation_steepness: ${v('allocation_steepness')}

weight_smoothing_up: ${v('weight_smoothing_up')}
weight_smoothing_down: ${v('weight_smoothing_down')}

# -- Crash Overlay -----------------------------------------------------
crash_overlay: ${v('crash_overlay')}
vix_spike_threshold: ${v('vix_spike_threshold')}
drawdown_defense_threshold: ${v('drawdown_defense_threshold')}
credit_spike_threshold: ${v('credit_spike_threshold')}
`;
}

export async function GET() {
  try {
    // Try Supabase first
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', 1)
      .single();

    if (data?.config) {
      return NextResponse.json({ config: { ...DEFAULT_CONFIG, ...data.config } });
    }

    // Fallback: read config.yaml and parse it
    if (fs.existsSync(CONFIG_PATH)) {
      const yaml = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = {};
      yaml.split('\n').forEach((line) => {
        const match = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
        if (!match) return;
        const [, key, raw] = match;
        let val = raw.trim().replace(/^["']|["']$/g, '');
        if (val === 'null') val = null;
        else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        if (key in DEFAULT_CONFIG) parsed[key] = val;
      });
      return NextResponse.json({ config: { ...DEFAULT_CONFIG, ...parsed } });
    }

    return NextResponse.json({ config: DEFAULT_CONFIG });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { config } = await req.json();
    if (!config) return NextResponse.json({ error: 'config is required' }, { status: 400 });

    const merged = { ...DEFAULT_CONFIG, ...config };

    // Write config.yaml to the macro regime directory
    fs.writeFileSync(CONFIG_PATH, configToYaml(merged), 'utf8');

    // Save to Supabase
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: 1, config: merged, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) console.error('Supabase save warning:', error.message);

    return NextResponse.json({ config: merged, saved: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
