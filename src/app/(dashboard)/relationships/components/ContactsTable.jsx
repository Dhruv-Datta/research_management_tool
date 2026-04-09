'use client';
import { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import InlineField from './InlineField';
import TableFilterRow from './TableFilterRow';
import ColumnPicker from './ColumnPicker';
import GroupCell from './GroupCell';

const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;
const fmtRelative = (d) => {
  if (!d) return '—';
  const days = daysSince(d);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const getUrgency = (c) => {
  const d = daysSince(c.last_contacted_at);
  const overdue = c.follow_up_date && new Date(c.follow_up_date) <= new Date();
  const imp = c.importance || 3;
  if (d === null) return Math.min(1, 0.5 + imp * 0.1);
  if (overdue) return Math.min(1, 0.7 + imp * 0.06);
  const dayFactor = Math.min(1, d / 45);
  return Math.min(1, dayFactor * (0.5 + imp * 0.1));
};
const urgencyLabel = (u) => {
  if (u < 0.25) return 'Chilling';
  if (u < 0.45) return 'Low';
  if (u < 0.6) return 'Moderate';
  if (u < 0.75) return 'High';
  return 'Urgent';
};
const urgencyBg = (u) => {
  if (u < 0.25) return 'bg-green-100 text-green-700';
  if (u < 0.45) return 'bg-lime-100 text-lime-700';
  if (u < 0.6) return 'bg-yellow-100 text-yellow-700';
  if (u < 0.75) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
};
const healthColor = (s) => {
  if (s == null) return 'text-gray-400';
  if (s >= 70) return 'text-green-600';
  if (s >= 40) return 'text-yellow-600';
  return 'text-red-600';
};

const ALL_COLUMNS = [
  { key: 'name', label: 'Name', defaultVisible: true },
  { key: 'company', label: 'Company', defaultVisible: true },
  { key: 'role', label: 'Role', defaultVisible: true },
  { key: 'urgency', label: 'Urgency', defaultVisible: true },
  { key: 'importance', label: 'Imp', defaultVisible: true },
  { key: 'lastContacted', label: 'Last Contact', defaultVisible: true },
  { key: 'followUp', label: 'Follow-up', defaultVisible: true },
  { key: 'nextAction', label: 'Next Action', defaultVisible: true },
  { key: 'health', label: 'Health', defaultVisible: true },
  { key: 'groups', label: 'Groups', defaultVisible: true },
  { key: 'tags', label: 'Tags', defaultVisible: false },
  { key: 'city', label: 'City', defaultVisible: false },
  { key: 'phone', label: 'Phone', defaultVisible: false },
  { key: 'email', label: 'Email', defaultVisible: false },
  { key: 'linkedin', label: 'LinkedIn', defaultVisible: false },
  { key: 'birthday', label: 'Birthday', defaultVisible: false },
  { key: 'status', label: 'Status', defaultVisible: false },
];

const SORTABLE = new Set(['name', 'company', 'role', 'urgency', 'importance', 'lastContacted', 'followUp', 'nextAction', 'health', 'groups']);

function getSortValue(c, key) {
  switch (key) {
    case 'name': return (c.name || '').toLowerCase();
    case 'company': return (c.company || '').toLowerCase();
    case 'role': return (c.role || '').toLowerCase();
    case 'urgency': return getUrgency(c);
    case 'importance': return c.importance || 3;
    case 'lastContacted': return c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : 0;
    case 'followUp': return c.follow_up_date ? new Date(c.follow_up_date).getTime() : Infinity;
    case 'nextAction': return (c.next_action || '').toLowerCase();
    case 'health': return c.relationship_score ?? 50;
    case 'groups': return (Array.isArray(c.groups) && c.groups.length ? c.groups.sort()[0] : '').toLowerCase();
    default: return '';
  }
}

export default function ContactsTable({ contacts, selId, setSelId, update, del, search, allGroups }) {
  const [sort, setSort] = useState({ key: 'urgency', dir: 'desc' });
  const [visibleCols, setVisibleCols] = useState(() => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));
  const [filters, setFilters] = useState({ urgency: 'all', importance: 'all', company: '', followUp: 'all', group: 'all' });

  const toggleSort = useCallback((key) => {
    if (!SORTABLE.has(key)) return;
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'urgency', dir: 'desc' }; // reset to default
    });
  }, []);

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.role?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q));
    }
    if (filters.urgency !== 'all') {
      list = list.filter(c => urgencyLabel(getUrgency(c)) === filters.urgency);
    }
    if (filters.importance !== 'all') {
      list = list.filter(c => (c.importance || 3) === Number(filters.importance));
    }
    if (filters.company) {
      const q = filters.company.toLowerCase();
      list = list.filter(c => (c.company || '').toLowerCase().includes(q));
    }
    if (filters.followUp !== 'all') {
      const now = new Date(); now.setHours(0, 0, 0, 0);
      if (filters.followUp === 'overdue') list = list.filter(c => c.follow_up_date && new Date(c.follow_up_date) < now);
      else if (filters.followUp === 'week') list = list.filter(c => c.follow_up_date && new Date(c.follow_up_date) <= new Date(now.getTime() + 7 * 86400000));
      else if (filters.followUp === 'month') list = list.filter(c => c.follow_up_date && new Date(c.follow_up_date) <= new Date(now.getTime() + 30 * 86400000));
      else if (filters.followUp === 'none') list = list.filter(c => !c.follow_up_date);
    }
    if (filters.group !== 'all') {
      list = list.filter(c => Array.isArray(c.groups) && c.groups.includes(filters.group));
    }
    return list;
  }, [contacts, search, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = getSortValue(a, sort.key);
      const vb = getSortValue(b, sort.key);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const cols = ALL_COLUMNS.filter(c => visibleCols.has(c.key));
  const hasActiveFilters = filters.urgency !== 'all' || filters.importance !== 'all' || filters.company || filters.followUp !== 'all' || filters.group !== 'all';

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden animate-fade-in-up">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
        <span className="text-xs text-gray-500">{sorted.length} contact{sorted.length !== 1 ? 's' : ''}{hasActiveFilters ? ' (filtered)' : ''}</span>
        <ColumnPicker columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
            <tr>
              {cols.map(col => (
                <th key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`px-3 py-2.5 text-left font-semibold text-gray-500 uppercase text-[10px] tracking-wider whitespace-nowrap ${SORTABLE.has(col.key) ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort.key === col.key && (
                      sort.dir === 'asc' ? <ChevronUp size={12} className="text-emerald-500" /> : <ChevronDown size={12} className="text-emerald-500" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
            <TableFilterRow columns={cols} filters={filters} onChange={setFilters} allGroups={allGroups} />
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(c => {
              const urg = getUrgency(c);
              const isOverdue = c.follow_up_date && new Date(c.follow_up_date) < new Date();
              const isSelected = c.id === selId;

              return (
                <tr key={c.id}
                  onClick={() => setSelId(isSelected ? null : c.id)}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : 'hover:bg-gray-50'}`}
                >
                  {cols.map(col => (
                    <td key={col.key} className="px-3 py-2.5" onClick={col.key !== 'name' ? (e) => e.stopPropagation() : undefined}>
                      {renderCell(col.key, c, urg, isOverdue, update, allGroups)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-gray-400 text-sm">No contacts match filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(key, c, urg, isOverdue, update, allGroups) {
  switch (key) {
    case 'name':
      return <span className="font-semibold text-gray-900">{c.name}</span>;
    case 'company':
      return <InlineField value={c.company} field="company" contactId={c.id} onSave={update} placeholder="—" className="text-xs text-gray-700" />;
    case 'role':
      return <InlineField value={c.role} field="role" contactId={c.id} onSave={update} placeholder="—" className="text-xs text-gray-700" />;
    case 'urgency':
      return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${urgencyBg(urg)}`}>{urgencyLabel(urg)}</span>;
    case 'importance':
      return (
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => update(c.id, { importance: n })}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${n <= (c.importance || 3) ? 'bg-emerald-500' : 'bg-gray-200 hover:bg-gray-300'}`} />
          ))}
        </div>
      );
    case 'lastContacted':
      return <span className="text-gray-500">{fmtRelative(c.last_contacted_at)}</span>;
    case 'followUp':
      return (
        <InlineField value={c.follow_up_date} field="follow_up_date" contactId={c.id} onSave={update}
          placeholder="—" type="date"
          className={`text-xs ${isOverdue ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}
          displayValue={fmtDate(c.follow_up_date)} />
      );
    case 'nextAction':
      return <InlineField value={c.next_action} field="next_action" contactId={c.id} onSave={update} placeholder="—" className="text-xs text-gray-700 max-w-[180px] truncate" />;
    case 'health':
      return <span className={`font-semibold ${healthColor(c.relationship_score)}`}>{c.relationship_score ?? '—'}</span>;
    case 'groups':
      return <GroupCell groups={c.groups || []} contactId={c.id} allGroups={allGroups || []} onSave={update} />;
    case 'tags':
      return (
        <div className="flex gap-1 flex-wrap">
          {(Array.isArray(c.tags) ? c.tags : []).map(t => (
            <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{t.replace('_', ' ')}</span>
          ))}
        </div>
      );
    case 'city':
      return <span className="text-gray-500">{c.city || '—'}</span>;
    case 'phone':
      return <span className="text-gray-500">{c.phone || '—'}</span>;
    case 'email':
      return <span className="text-gray-500">{c.contact_value || '—'}</span>;
    case 'linkedin':
      return c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noopener" className="text-blue-500 hover:underline" onClick={e => e.stopPropagation()}>View</a> : <span className="text-gray-400">—</span>;
    case 'birthday':
      return <span className="text-gray-500">{fmtDate(c.birthday)}</span>;
    case 'status':
      return <span className={`text-[10px] font-semibold ${c.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>{c.status || 'active'}</span>;
    default:
      return '—';
  }
}
