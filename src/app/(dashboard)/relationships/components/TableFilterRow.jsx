'use client';

const URGENCY_OPTIONS = ['all', 'Urgent', 'High', 'Moderate', 'Low', 'Chilling'];
const IMPORTANCE_OPTIONS = ['all', '1', '2', '3', '4', '5'];
const FOLLOWUP_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'none', label: 'No Date' },
];

const selectCls = 'w-full bg-transparent text-[10px] text-gray-500 outline-none py-1';
const inputCls = 'w-full bg-transparent text-[10px] text-gray-500 outline-none py-1 placeholder-gray-300';

export default function TableFilterRow({ columns, filters, onChange, allGroups }) {
  const set = (key, val) => onChange(prev => ({ ...prev, [key]: val }));

  return (
    <tr className="bg-gray-50/80 border-b border-gray-100">
      {columns.map(col => (
        <th key={col.key} className="px-3 py-1 font-normal">
          {col.key === 'urgency' && (
            <select value={filters.urgency} onChange={e => set('urgency', e.target.value)} className={selectCls}>
              {URGENCY_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All' : o}</option>)}
            </select>
          )}
          {col.key === 'importance' && (
            <select value={filters.importance} onChange={e => set('importance', e.target.value)} className={selectCls}>
              {IMPORTANCE_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All' : o}</option>)}
            </select>
          )}
          {col.key === 'company' && (
            <input value={filters.company} onChange={e => set('company', e.target.value)} placeholder="Filter..." className={inputCls} />
          )}
          {col.key === 'followUp' && (
            <select value={filters.followUp} onChange={e => set('followUp', e.target.value)} className={selectCls}>
              {FOLLOWUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {col.key === 'groups' && (
            <select value={filters.group} onChange={e => set('group', e.target.value)} className={selectCls}>
              <option value="all">All</option>
              {(allGroups || []).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </th>
      ))}
    </tr>
  );
}
