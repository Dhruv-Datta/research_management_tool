'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Check, X, Calendar, User, ChevronDown, ChevronRight, AlertTriangle, Clock } from 'lucide-react';
import Card from '@/components/Card';
import Toast from '@/components/Toast';

const PRIORITY_CONFIG = {
  high: { label: 'Highest Priority', max: 3, color: 'emerald', accent: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Medium Priority', max: 5, color: 'blue', accent: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  low: { label: 'Low Priority', max: null, color: 'gray', accent: 'bg-gray-400', badge: 'bg-gray-50 text-gray-600 border-gray-200' },
};

const PEOPLE = ['bhuvan', 'dhruv'];

function daysOverdue(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TaskCard({ task, onUpdate, onDelete, onAddSubtask, onUpdateSubtask, onDeleteSubtask }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [expanded, setExpanded] = useState(true);
  const [newSubtask, setNewSubtask] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const titleRef = useRef(null);
  const subtaskRef = useRef(null);

  const overdueDays = daysOverdue(task.due_date);
  const isOverdue = overdueDays !== null && overdueDays > 0 && task.status === 'open';
  const isDueToday = overdueDays === 0 && task.status === 'open';
  const isDone = task.status === 'done';

  useEffect(() => {
    if (editing && titleRef.current) titleRef.current.focus();
  }, [editing]);

  useEffect(() => {
    if (showSubtaskInput && subtaskRef.current) subtaskRef.current.focus();
  }, [showSubtaskInput]);

  const saveTitle = () => {
    if (title.trim() && title !== task.title) {
      onUpdate(task.id, { title: title.trim() });
    } else {
      setTitle(task.title);
    }
    setEditing(false);
  };

  const handleSubtaskAdd = () => {
    if (newSubtask.trim()) {
      onAddSubtask(task.id, newSubtask.trim());
      setNewSubtask('');
      setShowSubtaskInput(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 transition-all duration-200 ${
      isDone ? 'bg-gray-50 border-gray-200 opacity-60' :
      isOverdue ? 'bg-red-50 border-red-200 shadow-sm shadow-red-100' :
      isDueToday ? 'bg-amber-50 border-amber-200' :
      'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
    }`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Done checkbox */}
        <button
          onClick={() => onUpdate(task.id, { status: isDone ? 'open' : 'done' })}
          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isDone ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
          }`}
        >
          {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(task.title); setEditing(false); } }}
              className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-emerald-300 outline-none pb-0.5"
            />
          ) : (
            <p
              onClick={() => !isDone && setEditing(true)}
              className={`text-sm font-semibold cursor-pointer ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}
            >
              {task.title}
            </p>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {isOverdue && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                <AlertTriangle size={11} />
                {overdueDays}d overdue
              </span>
            )}
            {isDueToday && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                <Clock size={11} />
                Due today
              </span>
            )}
            {task.due_date && !isOverdue && !isDueToday && task.status === 'open' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                <Calendar size={11} />
                {formatDate(task.due_date)}
              </span>
            )}
            {task.assigned_to && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                task.assigned_to === 'bhuvan' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'
              }`}>
                <User size={11} />
                {task.assigned_to.charAt(0).toUpperCase() + task.assigned_to.slice(1)} working
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Assign dropdown */}
          <select
            value={task.assigned_to || ''}
            onChange={e => onUpdate(task.id, { assigned_to: e.target.value || null })}
            className="text-xs bg-transparent border border-gray-200 rounded-lg px-1.5 py-1 text-gray-500 hover:border-gray-300 outline-none cursor-pointer"
          >
            <option value="">Unassigned</option>
            {PEOPLE.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          {/* Due date */}
          <input
            type="date"
            value={task.due_date || ''}
            onChange={e => onUpdate(task.id, { due_date: e.target.value || null })}
            className="text-xs bg-transparent border border-gray-200 rounded-lg px-1.5 py-1 text-gray-500 hover:border-gray-300 outline-none cursor-pointer w-[120px]"
          />

          {/* Delete */}
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Subtasks */}
      {(task.subtasks?.length > 0 || !isDone) && (
        <div className="mt-3 ml-8">
          {task.subtasks?.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1.5"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}
              {task.subtasks.filter(s => s.done).length > 0 && (
                <span className="text-emerald-500 ml-1">
                  ({task.subtasks.filter(s => s.done).length}/{task.subtasks.length} done)
                </span>
              )}
            </button>
          )}

          {expanded && task.subtasks?.map(sub => (
            <div key={sub.id} className="flex items-center gap-2 py-1 group">
              <button
                onClick={() => onUpdateSubtask(sub.id, { done: !sub.done })}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  sub.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
                }`}
              >
                {sub.done && <Check size={10} className="text-white" strokeWidth={3} />}
              </button>
              <span className={`text-xs flex-1 ${sub.done ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                {sub.title}
              </span>
              <button
                onClick={() => onDeleteSubtask(sub.id)}
                className="p-0.5 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {/* Add subtask */}
          {!isDone && (
            showSubtaskInput ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  ref={subtaskRef}
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubtaskAdd(); if (e.key === 'Escape') { setNewSubtask(''); setShowSubtaskInput(false); } }}
                  placeholder="Subtask title..."
                  className="flex-1 text-xs bg-transparent border-b border-gray-200 outline-none py-1 placeholder:text-gray-300 focus:border-emerald-300"
                />
                <button onClick={handleSubtaskAdd} className="p-1 text-emerald-500 hover:text-emerald-700">
                  <Check size={14} />
                </button>
                <button onClick={() => { setNewSubtask(''); setShowSubtaskInput(false); }} className="p-1 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSubtaskInput(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 mt-1 transition-colors"
              >
                <Plus size={12} />
                Add subtask
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function PrioritySection({ priority, tasks, counts, onAdd, onUpdate, onDelete, onAddSubtask, onUpdateSubtask, onDeleteSubtask }) {
  const config = PRIORITY_CONFIG[priority];
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef(null);
  const openTasks = tasks.filter(t => t.status === 'open');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const isFull = config.max && counts >= config.max;

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAdd(newTitle.trim(), priority);
      setNewTitle('');
      setAdding(false);
    }
  };

  // Sort: overdue first (most overdue at top), then by position
  const sortedOpen = [...openTasks].sort((a, b) => {
    const aOverdue = daysOverdue(a.due_date);
    const bOverdue = daysOverdue(b.due_date);
    const aIsOverdue = aOverdue !== null && aOverdue > 0;
    const bIsOverdue = bOverdue !== null && bOverdue > 0;
    if (aIsOverdue && !bIsOverdue) return -1;
    if (!aIsOverdue && bIsOverdue) return 1;
    if (aIsOverdue && bIsOverdue) return bOverdue - aOverdue;
    return a.position - b.position;
  });

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${config.accent}`} />
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{config.label}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${config.badge}`}>
            {openTasks.length}{config.max ? ` / ${config.max}` : ''}
          </span>
        </div>

        {!isFull && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <Plus size={14} />
            Add Task
          </button>
        )}
        {isFull && (
          <span className="text-xs text-gray-400 font-medium">Full — complete or move a task first</span>
        )}
      </div>

      {/* Add task input */}
      {adding && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
          <input
            ref={inputRef}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setNewTitle(''); setAdding(false); } }}
            placeholder="What needs to be done?"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          <button onClick={handleAdd} className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors">
            Add
          </button>
          <button onClick={() => { setNewTitle(''); setAdding(false); }} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2">
        {sortedOpen.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAddSubtask={onAddSubtask}
            onUpdateSubtask={onUpdateSubtask}
            onDeleteSubtask={onDeleteSubtask}
          />
        ))}
      </div>

      {/* Done tasks (collapsed) */}
      {doneTasks.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            {doneTasks.length} completed task{doneTasks.length !== 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-2">
            {doneTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddSubtask={onAddSubtask}
                onUpdateSubtask={onUpdateSubtask}
                onDeleteSubtask={onDeleteSubtask}
              />
            ))}
          </div>
        </details>
      )}

      {openTasks.length === 0 && doneTasks.length === 0 && !adding && (
        <p className="text-sm text-gray-400 text-center py-6">No tasks yet</p>
      )}
    </Card>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(data.tasks || []);
    } catch (e) {
      setToast({ message: 'Failed to load tasks', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const addTask = async (title, priority) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(prev => [...prev, data.task]);
      setToast({ message: 'Task added', type: 'success' });
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const updateTask = async (id, updates) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data.task } : t));
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const deleteTask = async (id) => {
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(prev => prev.filter(t => t.id !== id));
      setToast({ message: 'Task deleted', type: 'success' });
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const addSubtask = async (taskId, title) => {
    try {
      const res = await fetch('/api/tasks/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, title }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), data.subtask] } : t
      ));
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const updateSubtask = async (subtaskId, updates) => {
    try {
      const res = await fetch('/api/tasks/subtasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subtaskId, ...updates }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(prev => prev.map(t => ({
        ...t,
        subtasks: (t.subtasks || []).map(s => s.id === subtaskId ? { ...s, ...data.subtask } : s),
      })));
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const deleteSubtask = async (subtaskId) => {
    try {
      const res = await fetch(`/api/tasks/subtasks?id=${subtaskId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks(prev => prev.map(t => ({
        ...t,
        subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId),
      })));
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const openCounts = {
    high: tasks.filter(t => t.priority === 'high' && t.status === 'open').length,
    medium: tasks.filter(t => t.priority === 'medium' && t.status === 'open').length,
    low: tasks.filter(t => t.priority === 'low' && t.status === 'open').length,
  };

  const overdueCount = tasks.filter(t => {
    if (t.status !== 'open' || !t.due_date) return false;
    return daysOverdue(t.due_date) > 0;
  }).length;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 lg:px-12 pb-16">
        <div className="py-12 text-center text-gray-400 text-sm">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-12 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between py-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Board</h1>
          <p className="text-sm text-gray-500 mt-1">
            {openCounts.high + openCounts.medium + openCounts.low} open tasks
            {overdueCount > 0 && (
              <span className="text-red-500 font-semibold ml-2">
                ({overdueCount} overdue)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Priority sections */}
      {['high', 'medium', 'low'].map(priority => (
        <PrioritySection
          key={priority}
          priority={priority}
          tasks={tasks.filter(t => t.priority === priority)}
          counts={openCounts[priority]}
          onAdd={addTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={addSubtask}
          onUpdateSubtask={updateSubtask}
          onDeleteSubtask={deleteSubtask}
        />
      ))}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
