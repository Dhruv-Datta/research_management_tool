'use client';
import HealthSlider from '../HealthSlider';
import InlineField from '../InlineField';

const IMPORTANCE_LABELS = { 1: 'Low', 2: 'Minor', 3: 'Normal', 4: 'High', 5: 'Critical' };
const CONTACT_TAGS = [{ key: 'mailing_list', label: 'Mailing List' }];
const hasTag = (c, tag) => Array.isArray(c.tags) && c.tags.includes(tag);
const toggleTag = (tags, tag) => {
  const arr = Array.isArray(tags) ? [...tags] : [];
  return arr.includes(tag) ? arr.filter(t => t !== tag) : [...arr, tag];
};

export default function NotesTab({ contact, onUpdate }) {
  return (
    <div className="p-5 space-y-4">
      {/* Health Slider */}
      <HealthSlider
        value={contact.relationship_score ?? 50}
        onChange={v => onUpdate(contact.id, { relationship_score: v })}
      />

      <div className="h-px bg-gray-100" />

      {/* Importance */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Importance</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => onUpdate(contact.id, { importance: n })}
              className={`w-5 h-5 rounded-full text-[9px] font-semibold transition-all ${
                (contact.importance || 3) === n ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}>{n}</button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <span className="text-[10px] text-gray-400">Tags</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {CONTACT_TAGS.map(t => (
            <button key={t.key} onClick={() => onUpdate(contact.id, { tags: toggleTag(contact.tags, t.key) })}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                hasTag(contact, t.key)
                  ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Summary */}
      <div>
        <div className="text-[10px] text-gray-400 mb-0.5">Summary</div>
        <InlineField onSave={onUpdate} value={contact.summary} field="summary" contactId={contact.id} placeholder="Add a summary..." className="text-xs text-gray-600 italic leading-relaxed" />
      </div>

      {/* Notes */}
      <div>
        <div className="text-[10px] text-gray-400 mb-0.5">Notes</div>
        <InlineField onSave={onUpdate} value={contact.notes} field="notes" contactId={contact.id} placeholder="Strategy notes, observations..." className="text-xs text-gray-600 leading-relaxed" />
      </div>
    </div>
  );
}
