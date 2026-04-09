'use client';
import { useState, useRef } from 'react';
import { Phone, Mail, Trash2, X } from 'lucide-react';
import InlineField from './InlineField';
import DetailsTab from './tabs/DetailsTab';
import InteractionsTab from './tabs/InteractionsTab';
import NotesTab from './tabs/NotesTab';
import ConnectionsTab from './tabs/ConnectionsTab';

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'interactions', label: 'Interactions' },
  { key: 'notes', label: 'Notes' },
  { key: 'connections', label: 'Connections' },
];

const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

export default function DetailPanel({ contact, contacts, onUpdate, onDelete, onClose, panelAnim, zoneColor }) {
  const [activeTab, setActiveTab] = useState('details');
  const [quickNote, setQuickNote] = useState('');
  const quickNoteRef = useRef(null);

  if (!contact) return null;

  const d = daysSince(contact.last_contacted_at);

  const submitQuickNote = async () => {
    const text = quickNote.trim();
    if (!text || !contact.id) return;
    try {
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, type: 'note', summary: text, sentiment: 'neutral' }),
      });
      setQuickNote('');
      onUpdate(contact.id, {}); // trigger refresh
    } catch {}
  };

  return (
    <div className={`h-full bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden shadow-lg ${panelAnim ? 'opacity-0 transition-opacity duration-[220ms] ease-in' : 'opacity-100 transition-opacity duration-[350ms] ease-out'}`} style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md" style={{ background: zoneColor }}>
              {contact.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <InlineField onSave={onUpdate} value={contact.name} field="name" contactId={contact.id} className="text-base font-bold text-gray-900 leading-tight" />
              <div className="flex items-center gap-1 mt-0.5">
                <InlineField onSave={onUpdate} value={contact.role} field="role" contactId={contact.id} placeholder="Role" className="text-xs text-gray-500" />
                {(contact.role && contact.company) && <span className="text-xs text-gray-300">·</span>}
                <InlineField onSave={onUpdate} value={contact.company} field="company" contactId={contact.id} placeholder="Company" className="text-xs text-gray-500" />
              </div>
              <InlineField onSave={onUpdate} value={contact.city} field="city" contactId={contact.id} placeholder="City" className="text-xs text-gray-400 mt-0.5" />
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
          <span className="font-semibold" style={{ color: zoneColor }}>{d === null ? 'Never contacted' : `${d}d ago`}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <Phone size={9} />
            <InlineField onSave={onUpdate} value={contact.phone} field="phone" contactId={contact.id} placeholder="Phone" className="text-xs text-gray-400" />
          </div>
          <div className="flex items-center gap-1">
            <Mail size={9} />
            <InlineField onSave={onUpdate} value={contact.contact_value} field="contact_value" contactId={contact.id} placeholder="Email" className="text-xs text-gray-400" />
          </div>
        </div>
      </div>

      {/* Quick Note */}
      <div className="px-5 pt-3 pb-2">
        <input
          ref={quickNoteRef}
          value={quickNote}
          onChange={e => setQuickNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && quickNote.trim()) submitQuickNote(); }}
          placeholder="Quick note... (Enter to save)"
          className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
        />
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-100 px-5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2.5 text-[10px] font-semibold transition-all ${
              activeTab === t.key
                ? 'text-gray-900 border-b-2 border-emerald-500'
                : 'text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'details' && <DetailsTab contact={contact} onUpdate={onUpdate} />}
        {activeTab === 'interactions' && <InteractionsTab contactId={contact.id} onUpdate={() => onUpdate(contact.id, {})} />}
        {activeTab === 'notes' && <NotesTab contact={contact} onUpdate={onUpdate} />}
        {activeTab === 'connections' && <ConnectionsTab contactId={contact.id} contacts={contacts} onUpdate={() => onUpdate(contact.id, {})} />}
      </div>
    </div>
  );
}
