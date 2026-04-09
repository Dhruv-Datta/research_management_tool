'use client';
import { Briefcase, MessageSquare, Cake, Zap } from 'lucide-react';
import InlineField from '../InlineField';

const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

export default function DetailsTab({ contact, onUpdate }) {
  const defaultFollowUp = contact.last_contacted_at
    ? new Date(new Date(contact.last_contacted_at).getTime() + 14 * 86400000).toISOString().split('T')[0]
    : new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  return (
    <div className="p-5 space-y-4">
      {/* Professional */}
      <div>
        <div className="flex items-center gap-1.5 text-emerald-500 mb-2">
          <Briefcase size={13} />
          <span className="text-xs font-medium">Professional</span>
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Title</div>
            <InlineField onSave={onUpdate} value={contact.role} field="role" contactId={contact.id} placeholder="Role / Title" className="text-xs text-gray-700" />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Company</div>
            <InlineField onSave={onUpdate} value={contact.company} field="company" contactId={contact.id} placeholder="Company" className="text-xs text-gray-700" />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Location</div>
            <InlineField onSave={onUpdate} value={contact.city} field="city" contactId={contact.id} placeholder="City" className="text-xs text-gray-700" />
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Reachability */}
      <div>
        <div className="flex items-center gap-1.5 text-emerald-500 mb-2">
          <MessageSquare size={13} />
          <span className="text-xs font-medium">Reachability</span>
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Phone</div>
            <InlineField onSave={onUpdate} value={contact.phone} field="phone" contactId={contact.id} placeholder="Phone number" className="text-xs text-gray-700" />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Email</div>
            <InlineField onSave={onUpdate} value={contact.contact_value} field="contact_value" contactId={contact.id} placeholder="Email address" className="text-xs text-gray-700" />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">LinkedIn</div>
            <InlineField onSave={onUpdate} value={contact.linkedin_url} field="linkedin_url" contactId={contact.id} placeholder="LinkedIn URL" className="text-xs text-gray-700" />
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Birthday */}
      <div>
        <div className="flex items-center gap-1.5 text-emerald-500 mb-2">
          <Cake size={13} />
          <span className="text-xs font-medium">Birthday</span>
        </div>
        <InlineField onSave={onUpdate} value={contact.birthday ? contact.birthday.slice(0, 10) : ''} field="birthday" contactId={contact.id} placeholder="Set birthday" type="date" className="text-xs text-gray-700" displayValue={contact.birthday ? fmtShort(contact.birthday) : null} />
      </div>

      <div className="h-px bg-gray-100" />

      {/* Actions */}
      <div>
        <div className="flex items-center gap-1.5 text-emerald-500 mb-2">
          <Zap size={13} />
          <span className="text-xs font-medium">Actions</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Next action</div>
            <InlineField onSave={onUpdate} value={contact.next_action} field="next_action" contactId={contact.id} placeholder="Set next action..." className="text-xs font-medium text-gray-700" />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">Follow-up</div>
            <InlineField
              onSave={onUpdate}
              value={contact.follow_up_date || defaultFollowUp}
              field="follow_up_date"
              contactId={contact.id}
              placeholder="Set date"
              type="date"
              className={`text-xs font-medium ${(contact.follow_up_date || defaultFollowUp) && new Date(contact.follow_up_date || defaultFollowUp) <= new Date() ? 'text-amber-600' : 'text-gray-700'}`}
              displayValue={fmtShort(contact.follow_up_date || defaultFollowUp)}
            />
          </div>
        </div>
      </div>

      {/* Last meeting */}
      <div>
        <div className="text-[10px] text-gray-400 mb-0.5">Last meeting</div>
        <InlineField onSave={onUpdate} value={contact.last_meeting_note} field="last_meeting_note" contactId={contact.id} placeholder="What was your last meeting about?" className="text-xs text-gray-700 leading-relaxed" />
      </div>
    </div>
  );
}
