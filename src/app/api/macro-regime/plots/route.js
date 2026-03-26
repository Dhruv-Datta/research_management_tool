import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MACRO_DIR = path.resolve(process.cwd(), 'macro_regime_allocator');
const PLOT_DIR = path.join(MACRO_DIR, 'outputs', 'plots');

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');

    if (!name) {
      // Return list of available plots
      if (!fs.existsSync(PLOT_DIR)) return NextResponse.json({ plots: [] });
      const plots = fs.readdirSync(PLOT_DIR).filter((f) => f.endsWith('.png'));
      return NextResponse.json({ plots });
    }

    // Sanitize filename
    const safeName = path.basename(name);
    const filePath = path.join(PLOT_DIR, safeName.endsWith('.png') ? safeName : `${safeName}.png`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
