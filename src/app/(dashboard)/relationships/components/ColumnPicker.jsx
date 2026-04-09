'use client';
import { useState, useRef, useEffect } from 'react';
import { Settings2 } from 'lucide-react';

export default function ColumnPicker({ columns, visible, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (key) => {
    onChange(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="Show/hide columns">
        <Settings2 size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-2 px-1 z-30 w-44">
          <p className="px-2 pb-1 text-[9px] font-semibold text-gray-400 uppercase">Columns</p>
          {columns.map(col => (
            <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => toggle(col.key)}
                className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5" />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
