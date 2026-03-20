'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Check, ChevronDown, ChevronRight, User, Pencil, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, pointerWithin, rectIntersection, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PRIORITY_SECTIONS = [
  { key: 'highest', label: 'HIGH PRIORITY',   color: 'bg-red-500',     maxTasks: 3 },
  { key: 'medium',  label: 'MEDIUM PRIORITY', color: 'bg-yellow-400',  maxTasks: 5 },
  { key: 'low',     label: 'LOW PRIORITY',    color: 'bg-emerald-500', maxTasks: null },
];

const ASSIGNEE_PRESETS = ['Dhruv', 'Bhuvan', 'Both'];

const ASSIGNEE_COLORS = {
  dhruv:  'bg-[#4F46E5] text-white border-[#4F46E5]',
  bhuvan: 'bg-[#16A34A] text-white border-[#16A34A]',
  both:   'bg-[#6B7280] text-white border-[#6B7280]',
};

function getAssigneeStyle(assignee) {
  if (!assignee) return '';
  return ASSIGNEE_COLORS[assignee.toLowerCase()] || 'bg-gray-500 text-white border-gray-500';
}

function AssigneeTag({ assignee, onClick, size = 'normal' }) {
  if (!assignee) {
    return (
      <button
        onClick={onClick}
        className={`opacity-0 group-hover:opacity-100 group-hover/sub:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 transition-all duration-200`}
        title="Assign"
      >
        <User size={size === 'small' ? 12 : 14} />
      </button>
    );
  }
  const sizeClasses = size === 'small' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5';
  return (
    <button
      onClick={onClick}
      className={`font-medium rounded-full border transition-colors hover:opacity-80 ${sizeClasses} ${getAssigneeStyle(assignee)}`}
    >
      {assignee}
    </button>
  );
}

function AssigneePicker({ current, onSelect, onClose }) {
  const [customValue, setCustomValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
      {ASSIGNEE_PRESETS.map(name => (
        <button
          key={name}
          onClick={() => { onSelect(name); onClose(); }}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${
            current?.toLowerCase() === name.toLowerCase() ? 'font-semibold' : ''
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${getAssigneeStyle(name).split(' ')[0]}`} />
          {name}
        </button>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 px-2 pb-1">
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Other..."
            value={customValue}
            onChange={e => setCustomValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && customValue.trim()) { onSelect(customValue.trim()); onClose(); }
              if (e.key === 'Escape') onClose();
            }}
            className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 min-w-0"
          />
        </div>
      </div>
      {current && (
        <button
          onClick={() => { onSelect(''); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors border-t border-gray-100 mt-1"
        >
          Remove assignee
        </button>
      )}
    </div>
  );
}

function SortableTaskRow({ task, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ dragHandleProps: listeners })}
    </div>
  );
}

function DroppableSection({ id, isEmpty, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // Only show the highlight on empty sections where there are no task items to drop onto
  const showHighlight = isOver && isEmpty;
  return (
    <div ref={setNodeRef} className={`min-h-[2rem] rounded-xl ${showHighlight ? 'bg-emerald-50/60 ring-2 ring-emerald-200 ring-inset' : ''}`}>
      {children}
    </div>
  );
}

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [addingSubtask, setAddingSubtask] = useState(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(null);     // 'task-{id}' or 'sub-{taskId}-{subId}'
  const [editingSubId, setEditingSubId] = useState(null);                 // '{taskId}-{subId}'
  const [editingSubTitle, setEditingSubTitle] = useState('');
  const [activeId, setActiveId] = useState(null);
  const tasksSnapshot = useRef(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const editRef = useRef(null);
  const subEditRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (Array.isArray(data)) setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (editingSubId && subEditRef.current) {
      subEditRef.current.focus();
      subEditRef.current.select();
    }
  }, [editingSubId]);

  const tasksByPriority = (key) => tasks.filter(t => t.priority === key && !t.done);
  const completedTasks = tasks.filter(t => t.done);
  const [completedOpen, setCompletedOpen] = useState(false);
  const totalOpen = tasks.filter(t => !t.done).length;

  // --- Task CRUD ---

  const getMaxForPriority = (priority) => PRIORITY_SECTIONS.find(s => s.key === priority)?.maxTasks ?? null;

  const handleAddTask = async (priority, { keepOpen = false } = {}) => {
    if (!newTaskTitle.trim()) return;
    const max = getMaxForPriority(priority);
    const currentCount = tasks.filter(t => t.priority === priority).length;
    if (max && currentCount >= max) return;
    const title = newTaskTitle.trim();
    setNewTaskTitle('');
    const willBeAtCapacity = max && currentCount + 1 >= max;
    if (!keepOpen || willBeAtCapacity) setAdding(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority }),
      });
      const created = await res.json();
      if (res.ok) setTasks(prev => [...prev, created]);
    } catch (err) {
      console.error('Failed to add task', err);
    }
  };

  const toggleDone = async (id, currentDone) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !currentDone } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done: !currentDone }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: currentDone } : t));
    }
  };

  const removeTask = async (id) => {
    const prev = tasks;
    setTasks(t => t.filter(x => x.id !== id));
    try {
      await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
    } catch (err) {
      setTasks(prev);
    }
  };

  const startEditing = (task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
    setEditingNotes(task.notes || '');
  };

  const saveEdit = async (id, { thenAddTask = false } = {}) => {
    const task = tasks.find(t => t.id === id);
    if (!task) { setEditingId(null); return; }

    const newTitle = editingTitle.trim() || task.title;
    const newNotes = editingNotes.trim();
    const titleChanged = newTitle !== task.title;
    const notesChanged = newNotes !== (task.notes || '');

    setEditingId(null);

    if (thenAddTask) {
      const max = getMaxForPriority(task.priority);
      if (!max || tasks.filter(t => t.priority === task.priority).length < max) {
        setAdding(task.priority);
        setNewTaskTitle('');
      }
    }

    if (!titleChanged && !notesChanged) return;

    const updates = {};
    if (titleChanged) updates.title = newTitle;
    if (notesChanged) updates.notes = newNotes;

    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, title: task.title, notes: task.notes } : t));
    }
  };

  const updateAssignee = async (id, assignee) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, assignee } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, assignee }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, assignee: task.assignee } : t));
    }
  };

  // --- Subtask helpers ---

  const toggleExpanded = (id) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateSubtasks = async (taskId, subtasks) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, subtasks }),
      });
    } catch (err) {
      fetchTasks();
    }
  };

  const addSubtask = (taskId, { keepOpen = false } = {}) => {
    if (!newSubtaskTitle.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    const subtasks = [...(task.subtasks || []), { id: Date.now(), title: newSubtaskTitle.trim(), done: false, assignee: '' }];
    updateSubtasks(taskId, subtasks);
    setNewSubtaskTitle('');
    if (!keepOpen) setAddingSubtask(null);
  };

  const toggleSubtask = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    const subtasks = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
    updateSubtasks(taskId, subtasks);
  };

  const removeSubtask = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    const subtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);
    updateSubtasks(taskId, subtasks);
  };

  const startEditingSubtask = (taskId, sub) => {
    setEditingSubId(`${taskId}-${sub.id}`);
    setEditingSubTitle(sub.title);
  };

  const saveSubtaskEdit = (taskId, subtaskId, { thenAdd = false } = {}) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) { setEditingSubId(null); return; }
    const newTitle = editingSubTitle.trim();
    if (!newTitle) {
      // Remove the empty subtask if it has no title
      const cleaned = (task.subtasks || []).filter(s => s.id !== subtaskId || s.title.trim());
      if (cleaned.length !== (task.subtasks || []).length) updateSubtasks(taskId, cleaned);
      setEditingSubId(null);
      return;
    }
    const currentSubs = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, title: newTitle } : s);

    if (thenAdd) {
      // Insert a new empty subtask right after the current one
      const idx = currentSubs.findIndex(s => s.id === subtaskId);
      const newSub = { id: Date.now(), title: '', done: false, assignee: '' };
      const subtasks = [...currentSubs.slice(0, idx + 1), newSub, ...currentSubs.slice(idx + 1)];
      updateSubtasks(taskId, subtasks);
      // Start editing the new subtask
      setEditingSubId(`${taskId}-${newSub.id}`);
      setEditingSubTitle('');
    } else {
      setEditingSubId(null);
      updateSubtasks(taskId, currentSubs);
    }
  };

  const updateSubtaskAssignee = (taskId, subtaskId, assignee) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const subtasks = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, assignee } : s);
    updateSubtasks(taskId, subtasks);
  };

  // Subtask drag reorder — pointer-event based, immediate swap on crossing midpoints
  const [subDragId, setSubDragId] = useState(null); // currently dragging subtask id
  const subDragTaskId = useRef(null);
  const subRowRefs = useRef({}); // subId -> element ref

  const handleSubPointerDown = (e, taskId, subId) => {
    e.preventDefault();
    e.stopPropagation();
    setSubDragId(subId);
    subDragTaskId.current = taskId;

    const onMove = (ev) => {
      const tid = subDragTaskId.current;
      if (!tid) return;
      // Find which row the pointer is over by checking midpoints
      const task = tasksRef.current.find(t => t.id === tid);
      if (!task) return;
      const subs = task.subtasks || [];
      const curIdx = subs.findIndex(s => s.id === subId);
      if (curIdx === -1) return;

      for (let i = 0; i < subs.length; i++) {
        if (i === curIdx) continue;
        const el = subRowRefs.current[subs[i].id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        // If dragging down and pointer passed below a lower item's midpoint, swap
        // If dragging up and pointer passed above a higher item's midpoint, swap
        if ((i > curIdx && ev.clientY > midY) || (i < curIdx && ev.clientY < midY)) {
          const newSubs = [...subs];
          const [moved] = newSubs.splice(curIdx, 1);
          newSubs.splice(i, 0, moved);
          updateSubtasks(tid, newSubs);
          break; // only swap one at a time
        }
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setSubDragId(null);
      subDragTaskId.current = null;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // --- Drag and Drop ---

  // Find which priority section a task or droppable belongs to
  const findPriority = (id) => {
    if (typeof id === 'string' && id.startsWith('section-')) return id.replace('section-', '');
    const task = tasksRef.current.find(t => t.id === id);
    return task?.priority ?? null;
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    tasksSnapshot.current = tasks;
  };

  // onDragOver: ONLY handle cross-container moves (changing priority).
  // Within the same container, do nothing — let onDragEnd handle it with arrayMove.
  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activePriority = findPriority(active.id);
    const overPriority = findPriority(over.id);

    if (!activePriority || !overPriority) return;
    // Same container — skip, onDragEnd will handle reordering
    if (activePriority === overPriority) return;

    // Cross-container: move the active task into the over container
    setTasks(prev => {
      const activeTask = prev.find(t => t.id === active.id);
      if (!activeTask) return prev;

      // Check capacity
      const section = PRIORITY_SECTIONS.find(s => s.key === overPriority);
      const targetCount = prev.filter(t => t.priority === overPriority).length;
      if (section?.maxTasks && targetCount >= section.maxTasks) return prev;

      // Determine insert index
      const overIsSection = typeof over.id === 'string' && over.id.startsWith('section-');
      const targetTasks = prev.filter(t => t.priority === overPriority);
      let insertIdx = targetTasks.length; // default: append to end
      if (!overIsSection) {
        const idx = targetTasks.findIndex(t => t.id === over.id);
        if (idx !== -1) insertIdx = idx;
      }

      // Remove from old section, insert into new
      const without = prev.filter(t => t.id !== active.id);
      const movedTask = { ...activeTask, priority: overPriority };

      // Find the global insert point
      if (insertIdx >= targetTasks.length) {
        // Append after the last task in target section
        const lastTarget = targetTasks[targetTasks.length - 1];
        const globalIdx = lastTarget ? without.findIndex(t => t.id === lastTarget.id) + 1 : without.length;
        without.splice(globalIdx, 0, movedTask);
      } else {
        const globalIdx = without.findIndex(t => t.id === targetTasks[insertIdx].id);
        without.splice(globalIdx, 0, movedTask);
      }

      // Reindex positions for affected sections
      const affected = new Set([activePriority, overPriority]);
      const counters = {};
      for (const t of without) {
        if (affected.has(t.priority)) {
          counters[t.priority] = counters[t.priority] ?? 0;
          t.position = counters[t.priority]++;
        }
      }
      return without;
    });
  };

  // onDragEnd: handle final positioning (same-container reorder + persist)
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    const snapshot = tasksSnapshot.current;
    tasksSnapshot.current = null;
    setActiveId(null);

    if (!over || !snapshot) {
      if (snapshot) setTasks(snapshot);
      return;
    }

    // Compute the new task list synchronously, then set state AND persist
    const prev = tasksRef.current;
    const activePriority = prev.find(t => t.id === active.id)?.priority;
    if (!activePriority) return;

    const overIsSection = typeof over.id === 'string' && over.id.startsWith('section-');

    let newTasks = prev;
    let itemsToSave = [];

    if (overIsSection) {
      // Cross-container was handled in onDragOver — persist current state
      newTasks = prev;
      itemsToSave = prev
        .filter(t => {
          const orig = snapshot.find(s => s.id === t.id);
          return !orig || orig.position !== t.position || orig.priority !== t.priority;
        })
        .map(t => {
          const orig = snapshot.find(s => s.id === t.id);
          const item = { id: t.id, position: t.position };
          if (orig && orig.priority !== t.priority) item.priority = t.priority;
          return item;
        });
    } else {
      const overTask = prev.find(t => t.id === over.id);
      if (!overTask || overTask.priority !== activePriority) return;

      // Same container — reorder with arrayMove
      const sectionTasks = prev.filter(t => t.priority === activePriority);
      const oldIdx = sectionTasks.findIndex(t => t.id === active.id);
      const newIdx = sectionTasks.findIndex(t => t.id === over.id);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

      const reordered = arrayMove(sectionTasks, oldIdx, newIdx);
      const reorderedWithPos = reordered.map((t, i) => ({ ...t, position: i }));

      const otherTasks = prev.filter(t => t.priority !== activePriority);
      newTasks = [...otherTasks, ...reorderedWithPos].sort((a, b) => {
        const pa = PRIORITY_SECTIONS.findIndex(s => s.key === a.priority);
        const pb = PRIORITY_SECTIONS.findIndex(s => s.key === b.priority);
        if (pa !== pb) return pa - pb;
        return a.position - b.position;
      });

      itemsToSave = reorderedWithPos
        .filter(t => {
          const orig = snapshot.find(s => s.id === t.id);
          return !orig || orig.position !== t.position;
        })
        .map(t => ({ id: t.id, position: t.position }));
    }

    setTasks(newTasks);

    // Persist
    if (itemsToSave.length === 0) return;

    try {
      const res = await fetch('/api/tasks/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave }),
      });
      if (!res.ok) console.error('Reorder API error:', await res.text());
    } catch (err) {
      console.error('Failed to reorder tasks', err);
      setTasks(snapshot);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    if (tasksSnapshot.current) {
      setTasks(tasksSnapshot.current);
      tasksSnapshot.current = null;
    }
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold text-gray-900">Task Board</h1>
        <p className="text-sm text-gray-500 mt-1">{totalOpen} open task{totalOpen !== 1 ? 's' : ''}</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-48 mb-6" />
              <div className="h-4 bg-gray-100 rounded w-32 mx-auto" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {PRIORITY_SECTIONS.map(({ key, label, color, maxTasks }, sectionIdx) => {
            const sectionTasks = tasksByPriority(key);
            const openCount = sectionTasks.filter(t => !t.done).length;
            const atCapacity = maxTasks ? sectionTasks.length >= maxTasks : false;
            const countLabel = maxTasks ? `${sectionTasks.length} / ${maxTasks}` : `${openCount}`;
            const taskIds = sectionTasks.map(t => t.id);

            return (
              <div key={key} className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm animate-fade-in-up" style={{ animationDelay: `${0.06 + sectionIdx * 0.08}s` }}>
                {/* Section Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${color}`} />
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{label}</h2>
                    <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                      atCapacity ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-500 border-gray-200'
                    }`}>
                      {countLabel}
                    </span>
                  </div>
                  {!atCapacity && (
                    <button
                      onClick={() => { setAdding(key); setNewTaskTitle(''); }}
                      className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <Plus size={16} />
                      Add Task
                    </button>
                  )}
                </div>

                {/* Task List */}
                <DroppableSection id={`section-${key}`} isEmpty={sectionTasks.length === 0}>
                {sectionTasks.length === 0 && adding !== key ? (
                  <p className="text-center text-gray-400 py-8">No tasks yet</p>
                ) : (
                  <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {sectionTasks.map(task => {
                      const subtasks = task.subtasks || [];
                      const hasSubtasks = subtasks.length > 0;
                      const isExpanded = expandedTasks.has(task.id);
                      const doneSubtasks = subtasks.filter(s => s.done).length;
                      const isEditing = editingId === task.id;

                      return (
                        <SortableTaskRow key={task.id} task={task}>
                          {({ dragHandleProps }) => (
                        <div>
                          {/* Main Task Row */}
                          <div
                            className={`rounded-xl border transition-all duration-200 ${
                              isEditing
                                ? 'bg-white border-emerald-200 shadow-sm'
                                : 'bg-gray-50/70 border-gray-100 hover:border-gray-200 group'
                            }`}
                            onBlur={(e) => {
                              if (isEditing && !e.currentTarget.contains(e.relatedTarget)) {
                                saveEdit(task.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 px-4 py-3">
                              {/* Drag handle */}
                              <button
                                {...dragHandleProps}
                                className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors touch-none"
                                tabIndex={-1}
                              >
                                <GripVertical size={16} />
                              </button>

                              {/* Expand toggle */}
                              <button
                                onClick={() => toggleExpanded(task.id)}
                                className="flex-shrink-0 w-4 text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                {hasSubtasks ? (
                                  isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                                ) : (
                                  <span className="w-[14px]" />
                                )}
                              </button>

                              {/* Checkbox */}
                              <button
                                onClick={() => toggleDone(task.id, task.done)}
                                className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                                  task.done
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-gray-300 hover:border-emerald-400'
                                }`}
                              >
                                {task.done && <Check size={12} strokeWidth={3} />}
                              </button>

                              {/* Title */}
                              {isEditing ? (
                                <input
                                  ref={editRef}
                                  type="text"
                                  value={editingTitle}
                                  onChange={e => setEditingTitle(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveEdit(task.id, { thenAddTask: true });
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  className="flex-1 bg-transparent text-sm text-gray-900 outline-none"
                                />
                              ) : (
                                <span
                                  onClick={() => startEditing(task)}
                                  className={`flex-1 text-sm cursor-text ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}
                                >
                                  {task.title}
                                </span>
                              )}

                              {/* Subtask count badge */}
                              {hasSubtasks && !isEditing && (
                                <span className="text-xs text-gray-400">
                                  {doneSubtasks}/{subtasks.length}
                                </span>
                              )}

                              {/* Assignee tag */}
                              <div className="relative flex-shrink-0">
                                <AssigneeTag
                                  assignee={task.assignee}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const key = `task-${task.id}`;
                                    setAssigneePickerOpen(assigneePickerOpen === key ? null : key);
                                  }}
                                />
                                {assigneePickerOpen === `task-${task.id}` && (
                                  <AssigneePicker
                                    current={task.assignee}
                                    onSelect={(val) => updateAssignee(task.id, val)}
                                    onClose={() => setAssigneePickerOpen(null)}
                                  />
                                )}
                              </div>

                              {/* Actions */}
                              {!isEditing && (
                                <>
                                  <button
                                    onClick={() => {
                                      setAddingSubtask(task.id);
                                      setNewSubtaskTitle('');
                                      if (!expandedTasks.has(task.id)) toggleExpanded(task.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-all duration-200"
                                    title="Add subtask"
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <button
                                    onClick={() => removeTask(task.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all duration-200"
                                    title="Delete task"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Notes area */}
                            {isEditing ? (
                              <div className="px-4 pb-3 pl-16">
                                <textarea
                                  value={editingNotes}
                                  onChange={e => setEditingNotes(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  placeholder="Add a note..."
                                  rows={2}
                                  className="w-full bg-gray-50/80 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 placeholder-gray-400 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent resize-none transition-all duration-200"
                                />
                              </div>
                            ) : (
                              task.notes && (
                                <div
                                  onClick={() => startEditing(task)}
                                  className="px-4 pb-3 pl-16 cursor-text"
                                >
                                  <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{task.notes}</p>
                                </div>
                              )
                            )}
                          </div>

                          {/* Subtasks */}
                          {isExpanded && (
                            <div className="ml-10 mt-1">
                              {subtasks.map(sub => {
                                const subKey = `${task.id}-${sub.id}`;
                                const isEditingSub = editingSubId === subKey;
                                const pickerKey = `sub-${task.id}-${sub.id}`;
                                const isDraggingThis = subDragId === sub.id;

                                return (
                                  <div
                                    key={sub.id}
                                    ref={el => { subRowRefs.current[sub.id] = el; }}
                                    className={`flex items-center gap-3 px-4 py-2 rounded-lg group/sub hover:bg-gray-50 transition-all duration-150 ${
                                      isDraggingThis ? 'bg-emerald-50 shadow-sm ring-1 ring-emerald-200 scale-[1.01]' : ''
                                    } ${subDragId && !isDraggingThis ? 'transition-all duration-200' : ''}`}
                                  >
                                    <div
                                      onPointerDown={(e) => handleSubPointerDown(e, task.id, sub.id)}
                                      className="flex-shrink-0 text-gray-300 opacity-0 group-hover/sub:opacity-100 transition-opacity cursor-grab touch-none select-none"
                                    >
                                      <GripVertical size={12} />
                                    </div>
                                    <button
                                      onClick={() => toggleSubtask(task.id, sub.id)}
                                      className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                                        sub.done
                                          ? 'bg-emerald-500 border-emerald-500 text-white'
                                          : 'border-gray-300 hover:border-emerald-400'
                                      }`}
                                    >
                                      {sub.done && <Check size={10} strokeWidth={3} />}
                                    </button>

                                    {isEditingSub ? (
                                      <input
                                        ref={subEditRef}
                                        type="text"
                                        value={editingSubTitle}
                                        onChange={e => setEditingSubTitle(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') { e.preventDefault(); saveSubtaskEdit(task.id, sub.id, { thenAdd: true }); }
                                          if (e.key === 'Escape') setEditingSubId(null);
                                        }}
                                        onBlur={() => saveSubtaskEdit(task.id, sub.id)}
                                        className="flex-1 bg-white border border-emerald-300 rounded-lg px-2 py-0.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-emerald-500"
                                      />
                                    ) : (
                                      <span
                                        onClick={() => startEditingSubtask(task.id, sub)}
                                        className={`flex-1 text-sm cursor-text ${sub.done ? 'line-through text-gray-400' : 'text-gray-600'}`}
                                      >
                                        {sub.title}
                                      </span>
                                    )}

                                    {/* Subtask assignee */}
                                    <div className="relative flex-shrink-0">
                                      <AssigneeTag
                                        assignee={sub.assignee}
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAssigneePickerOpen(assigneePickerOpen === pickerKey ? null : pickerKey);
                                        }}
                                      />
                                      {assigneePickerOpen === pickerKey && (
                                        <AssigneePicker
                                          current={sub.assignee}
                                          onSelect={(val) => updateSubtaskAssignee(task.id, sub.id, val)}
                                          onClose={() => setAssigneePickerOpen(null)}
                                        />
                                      )}
                                    </div>

                                    <button
                                      onClick={() => removeSubtask(task.id, sub.id)}
                                      className="opacity-0 group-hover/sub:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all duration-200"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                );
                              })}

                              {/* Add subtask input */}
                              {addingSubtask === task.id && (
                                <div className="flex items-center gap-2 px-4 py-1.5">
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Subtask title..."
                                    value={newSubtaskTitle}
                                    onChange={e => setNewSubtaskTitle(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') addSubtask(task.id, { keepOpen: true });
                                      if (e.key === 'Escape') setAddingSubtask(null);
                                    }}
                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                                  />
                                  <button
                                    onClick={() => addSubtask(task.id)}
                                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    Add
                                  </button>
                                  <button
                                    onClick={() => setAddingSubtask(null)}
                                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                          )}
                        </SortableTaskRow>
                      );
                    })}
                  </div>
                  </SortableContext>
                )}
                </DroppableSection>

                {/* Add Task Input — always at bottom of section */}
                {adding === key && !atCapacity && (
                  <div className="flex items-center gap-3 mt-3">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Task title..."
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddTask(key, { keepOpen: true });
                        if (e.key === 'Escape') setAdding(null);
                      }}
                      className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    />
                    <button
                      onClick={() => handleAddTask(key)}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAdding(null)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <button
                onClick={() => setCompletedOpen(o => !o)}
                className="flex items-center gap-3 w-full"
              >
                <ChevronRight size={16} className={`text-gray-400 transition-transform duration-200 ${completedOpen ? 'rotate-90' : ''}`} />
                <span className="w-3 h-3 rounded-full bg-gray-300" />
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Completed</h2>
                <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded-full px-2.5 py-0.5">
                  {completedTasks.length}
                </span>
              </button>

              {completedOpen && (
                <div className="mt-4 space-y-1">
                  {completedTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3 rounded-xl group hover:bg-gray-50 transition-colors">
                      <button
                        onClick={() => toggleDone(task.id, task.done)}
                        className="flex-shrink-0 w-5 h-5 rounded-md bg-emerald-500 border-2 border-emerald-500 text-white flex items-center justify-center transition-all duration-200 hover:bg-emerald-400 hover:border-emerald-400"
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                      <span className="flex-1 text-sm text-gray-400 line-through">{task.title}</span>
                      {task.assignee && (
                        <span className={`text-xs px-2 py-0.5 font-medium rounded-full border opacity-50 ${getAssigneeStyle(task.assignee)}`}>
                          {task.assignee}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-300 uppercase tracking-wide">{task.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      )}

      {/* Drag overlay for visual feedback */}
      <DragOverlay>
        {activeTask ? (
          <div className="rounded-xl border border-emerald-300 bg-white shadow-lg px-4 py-3 opacity-90">
            <div className="flex items-center gap-3">
              <GripVertical size={16} className="text-emerald-500" />
              <span className="text-sm text-gray-800">{activeTask.title}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}
