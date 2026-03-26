import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MACRO_DIR = path.resolve(process.cwd(), 'macro_regime_allocator');

function loadEnvFile() {
  const envPath = path.join(MACRO_DIR, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  });
  return env;
}

function parseOutput(stdout) {
  const signal = {};

  const dataAs = stdout.match(/Data as of:\s+(\S+)/);
  if (dataAs) signal.dataAsOf = dataAs[1];

  const allocFor = stdout.match(/Allocation for:\s+(\S+)/);
  if (allocFor) signal.allocationFor = allocFor[1];

  const pEquity = stdout.match(/P\(equity beats T-bills\):\s+([\d.]+)/);
  if (pEquity) signal.probEquity = parseFloat(pEquity[1]);

  const pTbills = stdout.match(/P\(T-bills win\):\s+([\d.]+)/);
  if (pTbills) signal.probTbills = parseFloat(pTbills[1]);

  const overlay = stdout.match(/Crash overlay:\s+(\S+)/);
  if (overlay) signal.overlay = overlay[1];

  // Parse market signals
  const marketBlock = stdout.match(/Market signals:\n([\s\S]*?)(?=\n\s*[┌╔]|\n\s*$)/);
  if (marketBlock) {
    signal.marketSignals = {};
    const lines = marketBlock[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^\s+(.+?):\s+([\d.+-]+)/);
      if (m) signal.marketSignals[m[1].trim()] = parseFloat(m[2]);
    }
  }

  // Parse allocation weights
  const eqMatch = stdout.match(/equity:\s+([\d.]+)%/);
  if (eqMatch) signal.equityWeight = parseFloat(eqMatch[1]) / 100;

  const tbMatch = stdout.match(/tbills:\s+([\d.]+)%/);
  if (tbMatch) signal.tbillsWeight = parseFloat(tbMatch[1]) / 100;

  // Derive regime
  const eq = signal.equityWeight || 0;
  if (eq >= 0.85) {
    signal.regime = 'RISK ON';
    signal.regimeColor = 'emerald';
  } else if (eq >= 0.60) {
    signal.regime = 'CAUTIOUS';
    signal.regimeColor = 'amber';
  } else {
    signal.regime = 'RISK OFF';
    signal.regimeColor = 'red';
  }

  return signal;
}

export async function GET() {
  try {
    const fileEnv = loadEnvFile();
    const env = { ...process.env, ...fileEnv };

    const stdout = execSync('make predict', {
      cwd: MACRO_DIR,
      env,
      shell: '/bin/bash',
      timeout: 30000,
      encoding: 'utf8',
    });

    const signal = parseOutput(stdout);
    signal.raw = stdout;

    return NextResponse.json(signal);
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';

    // If predict fails because no cached data, return that info
    if (stdout.includes('not found') || stderr.includes('not found')) {
      return NextResponse.json({
        error: 'No cached data. Run a full backtest first.',
        needsBacktest: true,
      }, { status: 400 });
    }

    return NextResponse.json({
      error: err.message,
      stderr: stderr.slice(-500),
    }, { status: 500 });
  }
}
