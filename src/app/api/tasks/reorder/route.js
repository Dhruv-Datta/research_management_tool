import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PATCH — bulk-update positions for tasks within a priority section
export async function PATCH(req) {
  const { items } = await req.json();

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 });
  }

  // items: [{ id, position, priority? }]
  const updates = items.map(({ id, position, priority }) => {
    const row = { id, position, updated_at: new Date().toISOString() };
    if (priority) row.priority = priority;
    return row;
  });

  const { error } = await supabase.from('tasks').upsert(updates, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
