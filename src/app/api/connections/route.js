import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const TABLE = 'contact_connections';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contact_id');

  if (!contactId) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .or(`contact_a_id.eq.${contactId},contact_b_id.eq.${contactId}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req) {
  const body = await req.json();
  let { contact_a_id, contact_b_id, type = 'other', strength = 3, context = '' } = body;

  if (!contact_a_id || !contact_b_id) {
    return NextResponse.json({ error: 'contact_a_id and contact_b_id are required' }, { status: 400 });
  }
  if (contact_a_id === contact_b_id) {
    return NextResponse.json({ error: 'Cannot connect a contact to itself' }, { status: 400 });
  }

  // Normalize: smaller UUID first (matches DB CHECK constraint)
  if (contact_a_id > contact_b_id) {
    [contact_a_id, contact_b_id] = [contact_b_id, contact_a_id];
  }

  const record = {
    contact_a_id,
    contact_b_id,
    type,
    strength: Math.max(1, Math.min(5, Number(strength) || 3)),
    context: context || '',
  };

  const { data, error } = await supabase.from(TABLE).insert(record).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
