import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const body = await request.json();
    const { task_id, title } = body;

    if (!task_id || !title) {
      return NextResponse.json({ error: 'task_id and title are required' }, { status: 400 });
    }

    const { data: last } = await supabase
      .from('subtasks')
      .select('position')
      .eq('task_id', task_id)
      .order('position', { ascending: false })
      .limit(1);
    const position = (last?.[0]?.position ?? -1) + 1;

    const { data: subtask, error } = await supabase.from('subtasks').insert({
      task_id,
      title,
      done: false,
      position,
    }).select().single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, subtask });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: subtask, error } = await supabase
      .from('subtasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, subtask });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase.from('subtasks').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
