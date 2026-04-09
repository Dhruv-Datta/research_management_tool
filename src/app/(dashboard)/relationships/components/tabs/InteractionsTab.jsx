'use client';
import { useState, useEffect } from 'react';
import { Users, Phone, Mail, Coffee, Calendar, MessageSquare, Plus } from 'lucide-react';

const INTERACTION_ICONS = { meeting: Users, call: Phone, email: Mail, coffee: Coffee, event: Calendar, text: MessageSquare, note: MessageSquare, other: MessageSquare };
const TYPES = ['note', 'meeting', 'call', 'email', 'coffee', 'event', 'text'];
const sentimentColor = (s) => s === 'positive' ? '#22c55e' : s === 'negative' ? '#ef4444' : '#9ca3af';

function formatRelativeDate(dateStr) {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export default function InteractionsTab({ contactId, onUpdate }) {
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ type: 'note', summary: '', sentiment: 'neutral', date: new Date().toISOString().split('T')[0], next_step: '' });

  const fetchInteractions = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/interactions?contact_id=${contactId}`);
      if (r.ok) setInteractions(await r.json());
      else setError('Failed to load');
    } catch { setError('Failed to load'); }
    setLoading(false);
  };

  // Re-fetch every time the tab becomes active (contactId changes trigger this)
  useEffect(() => { if (contactId) fetchInteractions(); }, [contactId]);

  const submit = async () => {
    if (!form.summary.trim()) return;
    try {
      const r = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, ...form }),
      });
      if (r.ok) {
        setForm({ type: 'note', summary: '', sentiment: 'neutral', date: new Date().toISOString().split('T')[0], next_step: '' });
        setShowForm(false);
        await fetchInteractions();
        onUpdate();
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3 p-3 rounded-lg bg-gray-50 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-2 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-gray-500 mb-2">{error}</p>
        <button onClick={fetchInteractions} className="text-xs text-emerald-600 hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-900">Recent Interactions</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
          <Plus size={10} /> Log
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] text-gray-400 uppercase mb-0.5">Type</div>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20">
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[9px] text-gray-400 uppercase mb-0.5">Date</div>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20" />
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase mb-0.5">Summary</div>
            <input value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="What happened?"
              className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20 placeholder-gray-400" autoFocus />
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase mb-0.5">Sentiment</div>
            <div className="flex gap-1">
              {['positive', 'neutral', 'negative'].map(s => (
                <button key={s} onClick={() => setForm(p => ({ ...p, sentiment: s }))}
                  className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-all border ${
                    form.sentiment === s
                      ? s === 'positive' ? 'bg-green-50 border-green-300 text-green-700'
                        : s === 'negative' ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-gray-100 border-gray-300 text-gray-700'
                      : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                  }`}>
                  {s === 'positive' ? '😊' : s === 'negative' ? '😟' : '😐'} {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase mb-0.5">Next step</div>
            <input value={form.next_step} onChange={e => setForm(p => ({ ...p, next_step: e.target.value }))}
              placeholder="Optional follow-up..."
              className="w-full h-7 rounded-md bg-white border border-gray-200 text-[11px] text-gray-900 px-2 outline-none focus:ring-1 focus:ring-emerald-500/20 placeholder-gray-400" />
          </div>
          <div className="flex gap-2 pt-0.5">
            <button onClick={submit} disabled={!form.summary.trim()}
              className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-semibold rounded-md hover:bg-emerald-600 disabled:opacity-40 transition-colors">Save</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {interactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Calendar size={16} className="text-gray-400" />
          </div>
          <p className="text-xs text-gray-400">No interactions yet. Log your first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {interactions.map(ix => {
            const Icon = INTERACTION_ICONS[ix.type] || MessageSquare;
            return (
              <div key={ix.id} className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-900 truncate">{ix.summary || ix.type}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sentimentColor(ix.sentiment) }} />
                      <span className="text-[10px] text-gray-400">{formatRelativeDate(ix.date)}</span>
                    </div>
                  </div>
                  {ix.next_step && <p className="text-[10px] text-gray-400 mt-0.5 truncate">Next: {ix.next_step}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
