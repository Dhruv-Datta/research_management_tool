import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'data', 'sector-config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  return NextResponse.json(readConfig());
}

export async function PUT(request) {
  try {
    const { sector, label, color } = await request.json();
    if (!sector) {
      return NextResponse.json({ error: 'sector is required' }, { status: 400 });
    }

    const config = readConfig();
    if (!config[sector]) config[sector] = {};

    if (label !== undefined) {
      if (!label || label.trim() === '' || label.trim() === sector) {
        delete config[sector].label;
      } else {
        config[sector].label = label.trim();
      }
    }

    if (color !== undefined) {
      if (!color) {
        delete config[sector].color;
      } else {
        config[sector].color = color;
      }
    }

    // Clean up empty entries
    if (Object.keys(config[sector]).length === 0) delete config[sector];

    writeConfig(config);
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
