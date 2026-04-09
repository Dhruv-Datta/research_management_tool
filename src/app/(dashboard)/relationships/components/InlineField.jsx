'use client';
import { useState } from 'react';

export default function InlineField({ value, field, contactId, onSave, placeholder, className, type = 'text', displayValue }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const save = () => {
    setEditing(false);
    if (draft !== (value || '')) onSave(contactId, { [field]: draft || (type === 'date' ? null : '') });
  };

  if (editing) {
    return (
      <input
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className={`${className} bg-transparent outline-none border-b border-emerald-400 w-full`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onDoubleClick={() => { setDraft(value || ''); setEditing(true); }}
      className={`${className} cursor-text hover:bg-gray-50 rounded px-0.5 -mx-0.5 transition-colors ${!value ? 'text-gray-300' : ''}`}
      title="Double-click to edit"
    >
      {displayValue || value || placeholder || '—'}
    </div>
  );
}
