'use client';
import { useState, useEffect, useMemo } from 'react';
import { Link, Plus, Trash2 } from 'lucide-react';

const CONNECTION_TYPES = ['introduced_by', 'colleagues', 'friends', 'family', 'classmates', 'other'];
const fmtType = (t) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function ConnectionsTab({ contactId, contacts, onUpdate }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contact_b_id: '', type: 'other', strength: 3, context: '' });
  const [search, setSearch] = useState('');

  const fetchConnections = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/connections?contact_id=${contactId}`);
      if (r.ok) setConnections(await r.json());
      else setError('Failed to load');
    } catch { setError('Failed to load'); }
    setLoading(false);
  };

  useEffect(() => { if (contactId) fetchConnections(); }, [contactId]);

  const connectedIds = useMemo(() => {
    const ids = new Set();
    connections.forEach(c => {
      ids.add(c.contact_a_id === contactId ? c.contact_b_id : c.contact_a_id);
    });
    return ids;
  }, [connections, contactId]);

  const available = useMemo(() => {
    const list = contacts.filter(c => c.id !== contactId && !connectedIds.has(c.id));
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(c => c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q));
  }, [contacts, contactId, connectedIds, search]);

  const addConnection = async () => {
    if (!form.contact_b_id) return;
    try {
      const r = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_a_id: contactId, contact_b_id: form.contact_b_id, type: form.type, strength: form.strength, context: form.context }),
      });
      if (r.ok) {
        setForm({ contact_b_id: '', type: 'other', strength: 3, context: '' });
        setSearch('');
        setShowForm(false);
        await fetchConnections();
        onUpdate();
      }
    } catch {}
  };

  const removeConnection = async (id) => {
    try {
      await fetch(`/api/connections?id=${id}`, { method: 'DELETE' });
      await fetchConnections();
      onUpdate();
    } catch {}
  };

  if (loading) {
    return (
      <div className="p-5 space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="flex gap-3 p-3 rounded-lg bg-gray-50 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-2/3" />
              <div className="h-2 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 flex flex-col items-center py-10 text-center">
        <p className="text-sm text-gray-500 mb-2">{error}</p>
        <button onClick={fetchConnections} className="text-xs text-emerald-600 hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-900">Connections</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
          <Plus size={10} /> Add
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2.5">
          <div>
            <div className="text-[9px] text-gray-400 uppercase mb-0.5">Connect to</div>
            <input value={search} onChange={e => { setSearch(e.target.value); setForm(p => ({ ...p, contact_b_id: '' })); }}
              placeholder="Search contacts..."
              className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20 placeholder-gray-400" autoFocus />
            {(search || form.contact_b_id) && (
              <div className="mt-1 max-h-28 overflow-y-auto rounded-md border border-gray-200 bg-white">
                {available.slice(0, 10).map(c => (
                  <button key={c.id} onClick={() => { setForm(p => ({ ...p, contact_b_id: c.id })); setSearch(c.name); }}
                    className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-gray-50 transition-colors ${form.contact_b_id === c.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}>
                    {c.name} {c.company && <span className="text-gray-400">· {c.company}</span>}
                  </button>
                ))}
                {available.length === 0 && <div className="px-2 py-1.5 text-[10px] text-gray-400">No contacts found</div>}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] text-gray-400 uppercase mb-0.5">Type</div>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20">
                {CONNECTION_TYPES.map(t => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[9px] text-gray-400 uppercase mb-0.5">Strength</div>
              <div className="flex items-center gap-1 h-7">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setForm(p => ({ ...p, strength: n }))}
                    className={`w-4 h-4 rounded-full transition-all ${n <= form.strength ? 'bg-emerald-500' : 'bg-gray-200 hover:bg-gray-300'}`} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase mb-0.5">Context</div>
            <input value={form.context} onChange={e => setForm(p => ({ ...p, context: e.target.value }))}
              placeholder="How are they connected?"
              className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20 placeholder-gray-400" />
          </div>
          <div className="flex gap-2 pt-0.5">
            <button onClick={addConnection} disabled={!form.contact_b_id}
              className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-semibold rounded-md hover:bg-emerald-600 disabled:opacity-40 transition-colors">Save</button>
            <button onClick={() => { setShowForm(false); setSearch(''); }} className="px-3 py-1.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Connection list */}
      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Link size={16} className="text-gray-400" />
          </div>
          <p className="text-xs text-gray-400">No connections yet. Link this contact to others.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map(conn => {
            const otherId = conn.contact_a_id === contactId ? conn.contact_b_id : conn.contact_a_id;
            const other = contacts.find(c => c.id === otherId);
            return (
              <div key={conn.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-400/40 to-emerald-600/40 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0">
                  {other ? other.name?.charAt(0) : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-gray-900 truncate block">{other ? other.name : 'Unknown'}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">{fmtType(conn.type)}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= conn.strength ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  </div>
                  {conn.context && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{conn.context}</p>}
                </div>
                <button onClick={() => removeConnection(conn.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
