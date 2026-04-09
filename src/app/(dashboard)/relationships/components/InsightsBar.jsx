'use client';
import { useState, useMemo } from 'react';
import { AlertCircle, Phone, UserX, Heart, Clock, ChevronDown, ChevronRight, Cake, ClipboardList } from 'lucide-react';

const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;
const daysUntil = (d) => {
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
};

export default function InsightsBar({ contacts, onSelectContact, onFilterOverdue }) {
  const [expanded, setExpanded] = useState(false);

  const metrics = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const overdue = contacts.filter(c => c.follow_up_date && new Date(c.follow_up_date) < now);
    const contactedThisWeek = contacts.filter(c => c.last_contacted_at && new Date(c.last_contacted_at) >= weekAgo);
    const neverContacted = contacts.filter(c => !c.last_contacted_at);
    const scores = contacts.filter(c => c.relationship_score != null).map(c => c.relationship_score);
    const avgHealth = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
    const stale = contacts.filter(c => (c.importance || 3) >= 4 && daysSince(c.last_contacted_at) > 30);

    return { overdue, contactedThisWeek, neverContacted, avgHealth, stale };
  }, [contacts]);

  const suggestions = useMemo(() => {
    const items = [];
    // Overdue follow-ups by importance
    metrics.overdue
      .sort((a, b) => (b.importance || 3) - (a.importance || 3))
      .slice(0, 3)
      .forEach(c => items.push({ contact: c, reason: 'Overdue follow-up', icon: AlertCircle }));
    // Stale high-importance
    metrics.stale
      .filter(c => !metrics.overdue.find(o => o.id === c.id))
      .sort((a, b) => (b.importance || 3) - (a.importance || 3))
      .slice(0, 2)
      .forEach(c => items.push({ contact: c, reason: `${daysSince(c.last_contacted_at)}d since last contact`, icon: Clock }));
    // Upcoming birthdays
    contacts
      .filter(c => c.birthday && daysUntil(c.birthday) !== null && daysUntil(c.birthday) >= 0 && daysUntil(c.birthday) <= 14)
      .slice(0, 2)
      .forEach(c => items.push({ contact: c, reason: `Birthday in ${daysUntil(c.birthday)}d`, icon: Cake }));
    // Has next_action but no recent interaction
    contacts
      .filter(c => c.next_action && daysSince(c.last_contacted_at) > 7)
      .slice(0, 2)
      .forEach(c => items.push({ contact: c, reason: c.next_action, icon: ClipboardList }));
    // Deduplicate
    const seen = new Set();
    return items.filter(i => { if (seen.has(i.contact.id)) return false; seen.add(i.contact.id); return true; }).slice(0, 5);
  }, [contacts, metrics]);

  const healthColor = metrics.avgHealth >= 70 ? 'text-green-600' : metrics.avgHealth >= 40 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="mb-3 animate-fade-in-up stagger-3">
      {/* Metric cards */}
      <div className="flex gap-2">
        <MetricCard label="Overdue" value={metrics.overdue.length} color={metrics.overdue.length > 0 ? 'text-red-600' : 'text-gray-400'} bg="bg-red-50" icon={AlertCircle} onClick={onFilterOverdue} />
        <MetricCard label="This Week" value={metrics.contactedThisWeek.length} color="text-green-600" bg="bg-green-50" icon={Phone} />
        <MetricCard label="Never Contacted" value={metrics.neverContacted.length} color={metrics.neverContacted.length > 0 ? 'text-orange-600' : 'text-gray-400'} bg="bg-orange-50" icon={UserX} />
        <MetricCard label="Avg Health" value={metrics.avgHealth ?? '—'} color={metrics.avgHealth != null ? healthColor : 'text-gray-400'} bg="bg-blue-50" icon={Heart} />
        <MetricCard label="Stale (High Imp)" value={metrics.stale.length} color={metrics.stale.length > 0 ? 'text-amber-600' : 'text-gray-400'} bg="bg-amber-50" icon={Clock} />
      </div>

      {/* Suggestions toggle */}
      {suggestions.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 mt-2 text-[10px] font-semibold text-gray-400 hover:text-gray-600 uppercase tracking-wider transition-colors">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Suggested Actions ({suggestions.length})
        </button>
      )}

      {/* Suggestions list */}
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => onSelectContact(s.contact.id)}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-white border border-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <s.icon size={12} className="text-gray-400 shrink-0" />
              <span className="text-xs font-semibold text-gray-800">{s.contact.name}</span>
              <span className="text-[10px] text-gray-400">—</span>
              <span className="text-[10px] text-gray-500 truncate">{s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, bg, icon: Icon, onClick }) {
  return (
    <div onClick={onClick} className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl ${bg} border border-gray-100 ${onClick ? 'cursor-pointer hover:shadow-sm' : ''} transition-all`}>
      <Icon size={14} className="text-gray-400 shrink-0" />
      <div>
        <div className={`text-base font-bold ${color}`}>{value}</div>
        <div className="text-[9px] font-semibold text-gray-400 uppercase">{label}</div>
      </div>
    </div>
  );
}
