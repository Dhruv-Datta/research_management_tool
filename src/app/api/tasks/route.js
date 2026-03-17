import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const LIMITS = { high: 3, medium: 5 };

export async function GET() {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw new Error(error.message);

    const { data: subtasks, error: subError } = await supabase
      .from('subtasks')
      .select('*')
      .order('position', { ascending: true });
    if (subError) throw new Error(subError.message);

    const subtaskMap = {};
    for (const s of subtasks || []) {
      if (!subtaskMap[s.task_id]) subtaskMap[s.task_id] = [];
      subtaskMap[s.task_id].push(s);
    }

    const result = (tasks || []).map(t => ({
      ...t,
      subtasks: subtaskMap[t.id] || [],
    }));

    return NextResponse.json({ tasks: result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { title, priority, due_date, assigned_to } = body;

    if (!title || !priority) {
      return NextResponse.json({ error: 'title and priority are required' }, { status: 400 });
    }

    if (!['high', 'medium', 'low'].includes(priority)) {
      return NextResponse.json({ error: 'priority must be high, medium, or low' }, { status: 400 });
    }

    // Check tier limits
    if (LIMITS[priority]) {
      const { count, error: countError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('priority', priority)
        .eq('status', 'open');
      if (countError) throw new Error(countError.message);
      if (count >= LIMITS[priority]) {
        return NextResponse.json(
          { error: `${priority} priority is full (max ${LIMITS[priority]})` },
          { status: 400 }
        );
      }
    }

    // Get next position
    const { data: last } = await supabase
      .from('tasks')
      .select('position')
      .eq('priority', priority)
      .order('position', { ascending: false })
      .limit(1);
    const position = (last?.[0]?.position ?? -1) + 1;

    const { data: task, error } = await supabase.from('tasks').insert({
      title,
      priority,
      due_date: due_date || null,
      assigned_to: assigned_to || null,
      status: 'open',
      position,
    }).select().single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, task: { ...task, subtasks: [] } });
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

    // If changing priority, check target tier limit
    if (updates.priority && LIMITS[updates.priority]) {
      const { count, error: countError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('priority', updates.priority)
        .eq('status', 'open')
        .neq('id', id);
      if (countError) throw new Error(countError.message);
      if (count >= LIMITS[updates.priority]) {
        return NextResponse.json(
          { error: `${updates.priority} priority is full (max ${LIMITS[updates.priority]})` },
          { status: 400 }
        );
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, task });
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

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
