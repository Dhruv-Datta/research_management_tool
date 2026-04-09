'use client';
import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
];
const colorFor = (name) => COLORS[Math.abs([...name].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % COLORS.length];

export default function GroupCell({ groups, contactId, allGroups, onSave }) {
  const [open, setOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (g) => {
    const next = groups.includes(g) ? groups.filter(x => x !== g) : [...groups, g];
    onSave(contactId, { groups: next });
  };

  const addNew = () => {
    const trimmed = newGroup.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    onSave(contactId, { groups: [...groups, trimmed] });
    setNewGroup('');
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 flex-wrap">
        {groups.map(g => (
          <span key={g} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorFor(g)}`}>{g}</span>
        ))}
        <button onClick={() => setOpen(!open)} className="w-4 h-4 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <Plus size={10} />
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[180px]">
          <div className="max-h-[200px] overflow-y-auto">
            {allGroups.map(g => (
              <label key={g} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                <input type="checkbox" checked={groups.includes(g)} onChange={() => toggle(g)}
                  className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500/20" />
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorFor(g)}`}>{g}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-1 pt-1">
            <input value={newGroup} onChange={e => setNewGroup(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Add new group..."
              className="w-full px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}
