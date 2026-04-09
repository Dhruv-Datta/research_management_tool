'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Plus, Search, X } from 'lucide-react';
import Toast from '@/components/Toast';
import ConfirmModal from '@/components/ConfirmModal';
import DetailPanel from './components/DetailPanel';
import ContactsTable from './components/ContactsTable';
import InsightsBar from './components/InsightsBar';

const IMPORTANCE_LABELS = { 1: 'Low', 2: 'Minor', 3: 'Normal', 4: 'High', 5: 'Critical' };
const DEFAULT_GROUPS = ['Sinn Fund', 'TAMU', 'Alumni', 'BD Sterling'];

function Inp({ label, value, onChange, placeholder, type = 'text', autoFocus }) {
  return (
    <div>
      {label && <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-0.5">{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
    </div>
  );
}

export default function RelationshipsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const [selId, setSelId] = useState(null);
  const [displayId, setDisplayId] = useState(null);
  const [panelAnim, setPanelAnim] = useState(false);
  const animTimer = useRef(null);
  const closeTimer = useRef(null);
  const panelRef = useRef(null);
  const displayIdRef = useRef(null);

  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const emptyC = { name: '', company: '', role: '', importance: 3, contact_method: 'email', contact_value: '', city: '', summary: '', tags: [], groups: [] };
  const [cf, setCf] = useState(emptyC);

  const sel = contacts.find(c => c.id === displayId);

  const allGroups = useMemo(() => {
    const set = new Set(DEFAULT_GROUPS);
    contacts.forEach(c => (c.groups || []).forEach(g => set.add(g)));
    return [...set].sort();
  }, [contacts]);

  // Panel open/close animation
  useEffect(() => {
    if (animTimer.current) clearTimeout(animTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const prevDisplayId = displayIdRef.current;

    if (!selId) {
      closeTimer.current = setTimeout(() => {
        setDisplayId(null);
        displayIdRef.current = null;
      }, 400);
    } else if (!prevDisplayId) {
      setDisplayId(selId);
      displayIdRef.current = selId;
      setPanelAnim(false);
    } else if (selId !== prevDisplayId) {
      setPanelAnim(true);
      animTimer.current = setTimeout(() => {
        setDisplayId(selId);
        displayIdRef.current = selId;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPanelAnim(false));
        });
      }, 250);
    }
    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [selId]);

  // Click outside panel to close
  useEffect(() => {
    if (!selId) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setSelId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selId]);

  // Fetch contacts
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/contacts');
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d)) setContacts(d);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  /* ─── CRUD ─── */
  const create = async () => {
    if (!cf.name.trim()) return;
    try {
      const r = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cf) });
      if (r.ok) {
        const d = await r.json();
        setContacts(p => [d, ...p]); setAdding(false); setCf(emptyC); setToast({ message: `Added ${d.name}`, type: 'success' });
      }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const update = async (id, u) => {
    try {
      const r = await fetch('/api/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...u }) });
      if (r.ok) { const d = await r.json(); setContacts(p => p.map(c => c.id === id ? d : c)); }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const del = async (id) => {
    try {
      const r = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      if (r.ok) { setContacts(p => p.filter(c => c.id !== id)); if (selId === id) setSelId(null); setToast({ message: 'Deleted', type: 'success' }); }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };

  return (
    <div className="px-6 lg:px-12 -mt-3 py-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 animate-fade-in-up">
        <div className="flex items-center gap-2.5">
          <Users size={18} className="text-emerald-600" />
          <h1 className="text-lg font-bold text-gray-900">Relationships</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{contacts.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
              className="pl-8 pr-8 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 w-52 transition-all" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
          </div>
          <button onClick={() => { setCf(emptyC); setAdding(true); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 shadow-sm transition-colors">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* Add Contact Modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">New Contact</h2>
              <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Inp placeholder="Name *" value={cf.name} onChange={v => setCf({ ...cf, name: v })} autoFocus />
              <Inp placeholder="Company" value={cf.company} onChange={v => setCf({ ...cf, company: v })} />
              <Inp placeholder="Role" value={cf.role} onChange={v => setCf({ ...cf, role: v })} />
              <Inp placeholder="Email / Phone / LinkedIn" value={cf.contact_value} onChange={v => setCf({ ...cf, contact_value: v })} />
              <Inp placeholder="City" value={cf.city} onChange={v => setCf({ ...cf, city: v })} />
            </div>
            <div className="mt-3">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Importance</label>
              <div className="flex gap-1.5">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setCf({ ...cf, importance: n })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      cf.importance === n ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {n} — {IMPORTANCE_LABELS[n]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Groups</label>
              <div className="flex flex-wrap gap-1.5">
                {allGroups.map(g => (
                  <button key={g} type="button" onClick={() => {
                    const arr = cf.groups || [];
                    setCf({ ...cf, groups: arr.includes(g) ? arr.filter(x => x !== g) : [...arr, g] });
                  }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      (cf.groups || []).includes(g) ? 'bg-gray-900 text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end mt-4 gap-2">
              <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={create} disabled={!cf.name.trim()} className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-40 shadow-sm transition-colors">Add Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Insights Bar */}
      <InsightsBar contacts={contacts} onSelectContact={(id) => setSelId(id)} />

      {/* Main area — table + detail panel overlay */}
      <div className="relative" style={{ height: 'calc(100vh - 230px)' }}>
        <div className={`h-full transition-all ${selId ? 'mr-[420px]' : ''}`}>
          <ContactsTable contacts={contacts} selId={selId} setSelId={setSelId} update={update} del={del} search={search} allGroups={allGroups} />
        </div>

        {/* Detail Panel */}
        <div ref={panelRef} className={`absolute top-0 right-0 h-full w-[420px] z-20 transition-opacity ${selId ? 'opacity-100 duration-[400ms] ease-out' : 'opacity-0 pointer-events-none duration-[350ms] ease-in-out'}`}>
          {sel && (
            <DetailPanel
              contact={sel}
              contacts={contacts}
              onUpdate={update}
              onDelete={() => setConfirm({ title: 'Delete Contact', message: `Delete ${sel.name}?`, onConfirm: () => { del(sel.id); setConfirm(null); }, onCancel: () => setConfirm(null) })}
              onClose={() => setSelId(null)}
              panelAnim={panelAnim}
              zoneColor="#22c55e"
            />
          )}
        </div>
      </div>

      {confirm && <ConfirmModal {...confirm} />}
      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
