import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';

const MACRO_DIR = path.resolve(process.cwd(), 'macro_regime_allocator');
const STATUS_FILE = '/tmp/macro-regime-run-status.json';
const LOG_FILE = '/tmp/macro-regime-run-output.log';

const VALID_COMMANDS = ['run', 'predict', 'fast', 'validate', 'clean'];

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

// POST - start a run
export async function POST(req) {
  try {
    const { command } = await req.json();
    if (!VALID_COMMANDS.includes(command)) {
      return NextResponse.json({ error: `Invalid command: ${command}` }, { status: 400 });
    }

    // Check if already running
    if (fs.existsSync(STATUS_FILE)) {
      try {
        const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        if (status.running) {
          // Verify the process is actually still running
          try {
            process.kill(status.pid, 0);
            return NextResponse.json({ error: 'A run is already in progress', status: 'running' }, { status: 409 });
          } catch {
            // Process is dead, clean up stale status
          }
        }
      } catch { /* corrupted file, proceed */ }
    }

    const fileEnv = loadEnvFile();
    const startedAt = new Date().toISOString();

    // Write initial status
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ running: true, command, startedAt, pid: null }));
    fs.writeFileSync(LOG_FILE, `[${startedAt}] Starting: make ${command}\n`);

    // Record run in Supabase
    let runId = null;
    try {
      const { data } = await supabase
        .from('macro_regime_runs')
        .insert({ run_type: command, status: 'running', started_at: startedAt })
        .select('id')
        .single();
      if (data) runId = data.id;
    } catch { /* Supabase not configured, continue without */ }

    const proc = spawn('make', [command], {
      cwd: MACRO_DIR,
      shell: '/bin/bash',
      env: { ...process.env, ...fileEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Update status with PID
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ running: true, command, startedAt, pid: proc.pid }));

    proc.stdout.on('data', (data) => {
      fs.appendFileSync(LOG_FILE, data.toString());
    });
    proc.stderr.on('data', (data) => {
      fs.appendFileSync(LOG_FILE, data.toString());
    });

    proc.on('close', async (code) => {
      const completedAt = new Date().toISOString();
      fs.writeFileSync(STATUS_FILE, JSON.stringify({
        running: false, command, startedAt, completedAt, exitCode: code, pid: proc.pid,
      }));
      fs.appendFileSync(LOG_FILE, `\n[${completedAt}] Finished with exit code ${code}\n`);

      // Update Supabase run record
      if (runId) {
        try {
          const log = fs.readFileSync(LOG_FILE, 'utf8');
          await supabase.from('macro_regime_runs').update({
            status: code === 0 ? 'completed' : 'failed',
            completed_at: completedAt,
            log_output: log.slice(-10000),
          }).eq('id', runId);
        } catch { /* ignore */ }
      }
    });

    return NextResponse.json({ status: 'started', command, pid: proc.pid });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET - check run status
export async function GET() {
  try {
    const status = fs.existsSync(STATUS_FILE)
      ? JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'))
      : { running: false };

    const log = fs.existsSync(LOG_FILE)
      ? fs.readFileSync(LOG_FILE, 'utf8')
      : '';

    return NextResponse.json({ ...status, log });
  } catch (err) {
    return NextResponse.json({ running: false, log: '', error: err.message });
  }
}
