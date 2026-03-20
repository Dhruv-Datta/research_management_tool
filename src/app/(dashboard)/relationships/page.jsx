'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Plus, Phone, Mail, MessageSquare, Video, FileText, StickyNote,
  Search, X, Edit3, Trash2, Link2, ExternalLink,
  Linkedin, ChevronRight,
} from 'lucide-react';
import Toast from '@/components/Toast';
import ConfirmModal from '@/components/ConfirmModal';

/* ─── helpers ─── */
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;
const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
const ahead = (n) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h); };
const seeded = (s) => (hash(s) % 10000) / 10000;

/* Urgency score: 0 (chill) → 1 (urgent). Drives bubble color. */
const getUrgency = (c) => {
  const d = daysSince(c.last_contacted_at);
  const overdue = c.follow_up_date && new Date(c.follow_up_date) <= new Date();
  const imp = c.importance || 3;
  // Never contacted = high urgency
  if (d === null) return Math.min(1, 0.5 + imp * 0.1);
  // Overdue follow-up = very urgent
  if (overdue) return Math.min(1, 0.7 + imp * 0.06);
  // Scale by days since contact + importance
  const dayFactor = Math.min(1, d / 45); // 0 at 0 days, 1 at 45+ days
  return Math.min(1, dayFactor * (0.5 + imp * 0.1));
};
/* Urgency → color: green(chill) → yellow → orange → red(urgent) */
const urgencyColor = (u) => {
  if (u < 0.25) return '#22c55e'; // green — chilling
  if (u < 0.45) return '#84cc16'; // lime
  if (u < 0.6) return '#eab308';  // yellow — should reach out soon
  if (u < 0.75) return '#f97316'; // orange
  return '#ef4444';                // red — urgent
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

/* Urgency → zone group. Respects manual override from drag-and-drop. */
const getUrgencyGroup = (c) => {
  if (c.urgency_override) return c.urgency_override; // 'low', 'medium', 'high'
  const u = getUrgency(c);
  if (u < 0.4) return 'low';
  if (u < 0.65) return 'medium';
  return 'high';
};

const ZONES = [
  { key: 'low', label: 'No Need to Contact', color: '#22c55e', bg: 'from-emerald-50/60 to-green-50/40', border: 'border-emerald-200/60', headerBg: 'bg-emerald-50', headerText: 'text-emerald-700' },
  { key: 'medium', label: 'Should Contact Soon', color: '#eab308', bg: 'from-yellow-50/60 to-amber-50/40', border: 'border-yellow-200/60', headerBg: 'bg-yellow-50', headerText: 'text-yellow-700' },
  { key: 'high', label: 'Urgently Contact', color: '#ef4444', bg: 'from-red-50/60 to-orange-50/40', border: 'border-red-200/60', headerBg: 'bg-red-50', headerText: 'text-red-700' },
];

const IMPORTANCE_LABELS = { 1: 'Low', 2: 'Minor', 3: 'Normal', 4: 'High', 5: 'Critical' };

const STRENGTHS = ['strong', 'warm', 'developing'];
const STATUSES = ['active', 'nurturing', 'cold', 'dormant'];
const ITYPES = [
  { v: 'meeting', l: 'Meeting', icon: Video },
  { v: 'call', l: 'Call', icon: Phone },
  { v: 'email', l: 'Email', icon: Mail },
  { v: 'text', l: 'Text', icon: MessageSquare },
  { v: 'linkedin', l: 'LinkedIn', icon: Linkedin },
  { v: 'note', l: 'Note', icon: StickyNote },
];
const QUICK_NEXT = ['Send recap', 'Follow up next week', 'Ask for intro', 'Share deck', 'Schedule coffee', 'Send thank you'];
const sBadge = (s) => ({ strong: 'bg-emerald-100 text-emerald-700', warm: 'bg-amber-100 text-amber-700', developing: 'bg-blue-100 text-blue-700' }[s] || 'bg-gray-100 text-gray-600');

/* ─── demo data ─── */
const DEMO_CONTACTS = [
  { id: 'demo-01', name: 'Sarah Chen', company: 'Sequoia Capital', role: 'Partner', relationship_type: 'investor', relationship_strength: 'strong', importance: 5, status: 'active', contact_method: 'email', contact_value: 'sarah.c@sequoiacap.com', city: 'San Francisco', summary: 'Key LP. Very responsive, strong rapport from Y Combinator days.', next_action: 'Send Q1 report', follow_up_date: ahead(2), last_contacted_at: ago(3), notes: 'Met at YC Demo Day 2023. Has since committed to Fund II.', tags: [] },
  { id: 'demo-02', name: 'James Morrison', company: 'Goldman Sachs', role: 'Managing Director', relationship_type: 'investor', relationship_strength: 'warm', importance: 4, status: 'active', contact_method: 'email', contact_value: 'jmorrison@gs.com', city: 'New York', summary: 'Institutional allocator, exploring emerging managers.', next_action: 'Schedule dinner at Cipriani', follow_up_date: null, last_contacted_at: ago(11), notes: '', tags: [] },
  { id: 'demo-03', name: 'Priya Patel', company: 'Andreessen Horowitz', role: 'Principal', relationship_type: 'advisor', relationship_strength: 'strong', importance: 5, status: 'active', contact_method: 'linkedin', contact_value: 'linkedin.com/in/priyap', city: 'Menlo Park', summary: 'Great sounding board for deal sourcing. Deep fintech expertise.', next_action: 'Ask about Series B deal', follow_up_date: ahead(-1), last_contacted_at: ago(5), notes: '', tags: [] },
  { id: 'demo-04', name: 'David Kim', company: 'Stripe', role: 'VP Engineering', relationship_type: 'recruit', relationship_strength: 'developing', importance: 3, status: 'nurturing', contact_method: 'email', contact_value: 'dkim@stripe.com', city: 'San Francisco', summary: 'Potential operating advisor. Brilliant infra mind.', next_action: 'Send article on fund thesis', follow_up_date: null, last_contacted_at: ago(18), notes: '', tags: [] },
  { id: 'demo-05', name: 'Elena Volkov', company: 'Tiger Global', role: 'Partner', relationship_type: 'investor', relationship_strength: 'developing', importance: 4, status: 'active', contact_method: 'email', contact_value: 'elena@tigerglobal.com', city: 'New York', summary: 'Warm intro from James M. Interested in our deal flow.', next_action: 'Share deck', follow_up_date: ahead(5), last_contacted_at: ago(14), notes: '', tags: [] },
  { id: 'demo-06', name: 'Marcus Thompson', company: 'Blackstone', role: 'Senior Analyst', relationship_type: 'partner', relationship_strength: 'warm', importance: 4, status: 'active', contact_method: 'phone', contact_value: '+1 212-555-0173', city: 'New York', summary: 'Co-invest partner for larger deals. Good at due diligence.', next_action: 'Discuss Acme deal', follow_up_date: null, last_contacted_at: ago(6), notes: '', tags: [] },
  { id: 'demo-07', name: 'Aisha Rahman', company: 'McKinsey', role: 'Senior Partner', relationship_type: 'advisor', relationship_strength: 'developing', importance: 2, status: 'nurturing', contact_method: 'email', contact_value: 'aisha_rahman@mckinsey.com', city: 'London', summary: 'Met at Davos. Deep ops transformation experience.', next_action: 'Rekindle relationship', follow_up_date: null, last_contacted_at: ago(45), notes: '', tags: [] },
  { id: 'demo-08', name: 'Tom Bradley', company: 'Wilson Sonsini', role: 'Partner', relationship_type: 'vendor', relationship_strength: 'strong', importance: 3, status: 'active', contact_method: 'email', contact_value: 'tbradley@wsgr.com', city: 'Palo Alto', summary: 'Outside counsel. Handles all fund formation docs.', next_action: '', follow_up_date: null, last_contacted_at: ago(9), notes: '', tags: [] },
  { id: 'demo-09', name: 'Nina Kowalski', company: 'Citadel', role: 'Portfolio Manager', relationship_type: 'investor', relationship_strength: 'developing', importance: 3, status: 'cold', contact_method: 'email', contact_value: 'nkowalski@citadel.com', city: 'Chicago', summary: 'Cold outreach via conference. Lukewarm initial response.', next_action: 'Follow up next week', follow_up_date: ahead(-5), last_contacted_at: ago(38), notes: '', tags: [] },
  { id: 'demo-10', name: 'Alex Reeves', company: 'Notion', role: 'CTO', relationship_type: 'recruit', relationship_strength: 'warm', importance: 3, status: 'active', contact_method: 'linkedin', contact_value: 'linkedin.com/in/alexreeves', city: 'San Francisco', summary: 'Potential portfolio advisor for SaaS investments.', next_action: 'Schedule coffee', follow_up_date: null, last_contacted_at: ago(4), notes: '', tags: [] },
  { id: 'demo-11', name: 'Rachel Foster', company: 'LP Advisory', role: 'Founder', relationship_type: 'partner', relationship_strength: 'developing', importance: 4, status: 'active', contact_method: 'email', contact_value: 'rachel@lpadvisory.com', city: 'Boston', summary: 'Placement agent. Helping with Fund III raise.', next_action: 'Review LP intro list', follow_up_date: ahead(3), last_contacted_at: ago(22), notes: '', tags: [] },
  { id: 'demo-12', name: 'Wei Zhang', company: 'SoftBank Vision', role: 'Director', relationship_type: 'investor', relationship_strength: 'developing', importance: 2, status: 'dormant', contact_method: 'email', contact_value: 'wei.z@softbank.com', city: 'Tokyo', summary: 'Met briefly at conference. No real engagement yet.', next_action: 'Send intro email', follow_up_date: null, last_contacted_at: null, notes: '', tags: [] },
  { id: 'demo-13', name: 'Olivia Hart', company: 'Deloitte', role: 'Tax Partner', relationship_type: 'vendor', relationship_strength: 'warm', importance: 2, status: 'active', contact_method: 'email', contact_value: 'ohart@deloitte.com', city: 'New York', summary: 'Handles fund tax compliance. Very thorough.', next_action: '', follow_up_date: null, last_contacted_at: ago(16), notes: '', tags: [] },
  { id: 'demo-14', name: 'Carlos Ruiz', company: 'Founders Fund', role: 'VP', relationship_type: 'advisor', relationship_strength: 'strong', importance: 5, status: 'active', contact_method: 'phone', contact_value: '+1 415-555-0298', city: 'San Francisco', summary: 'Long-time friend. Always gives sharp deal feedback.', next_action: 'Catch up over lunch', follow_up_date: null, last_contacted_at: ago(1), notes: 'Known each other since Stanford MBA.', tags: [] },
  { id: 'demo-15', name: 'Hannah Lee', company: 'Robinhood', role: 'Head of Product', relationship_type: 'other', relationship_strength: 'developing', importance: 1, status: 'nurturing', contact_method: 'email', contact_value: 'hlee@robinhood.com', city: 'Menlo Park', summary: 'Could be a future portfolio company exec hire.', next_action: 'Send article', follow_up_date: null, last_contacted_at: ago(25), notes: '', tags: [] },
];
const DEMO_IX = {
  'demo-01': [
    { id: 'dix-01a', contact_id: 'demo-01', type: 'meeting', summary: 'Quarterly review lunch. Discussed Fund II performance.', next_step: 'Send Q1 report', date: ago(3) },
    { id: 'dix-01b', contact_id: 'demo-01', type: 'email', summary: 'Sent updated portfolio breakdown.', next_step: '', date: ago(18) },
    { id: 'dix-01c', contact_id: 'demo-01', type: 'call', summary: 'Quick call about Acme co-invest.', next_step: 'Send Acme memo', date: ago(32) },
  ],
  'demo-03': [
    { id: 'dix-03a', contact_id: 'demo-03', type: 'call', summary: 'Discussed fintech landscape.', next_step: 'Ask about Series B deal', date: ago(5) },
    { id: 'dix-03b', contact_id: 'demo-03', type: 'meeting', summary: 'Coffee at Philz. Thesis refinements.', next_step: '', date: ago(21) },
  ],
  'demo-06': [
    { id: 'dix-06a', contact_id: 'demo-06', type: 'meeting', summary: 'Acme due diligence at BX office.', next_step: 'Discuss Acme deal', date: ago(6) },
  ],
  'demo-14': [
    { id: 'dix-14a', contact_id: 'demo-14', type: 'meeting', summary: 'Lunch at Nobu. Market views.', next_step: 'Catch up over lunch', date: ago(1) },
    { id: 'dix-14b', contact_id: 'demo-14', type: 'call', summary: 'FinCo Series C pricing take.', next_step: '', date: ago(12) },
    { id: 'dix-14c', contact_id: 'demo-14', type: 'email', summary: 'Shared annual letter for feedback.', next_step: 'Incorporate feedback', date: ago(28) },
  ],
  'demo-10': [
    { id: 'dix-10a', contact_id: 'demo-10', type: 'linkedin', summary: 'Connected after SaaStr conference.', next_step: 'Schedule coffee', date: ago(4) },
  ],
};

/* ─── force-directed bubble layout (per zone) ─── */
function computeZoneLayout(contacts, w, h) {
  if (!contacts.length) return {};

  const nodes = contacts.map(c => {
    const imp = c.importance || 3;
    const r = 26 + imp * 7;
    return {
      id: c.id, r,
      x: w / 2 + (seeded(c.id + 'x') - 0.5) * (w - r * 4),
      y: h / 2 + (seeded(c.id + 'y') - 0.5) * (h - r * 4),
    };
  });

  for (let iter = 0; iter < 150; iter++) {
    const a = 1 - iter / 150;
    // center gravity
    nodes.forEach(n => {
      n.x += (w / 2 - n.x) * 0.008 * a;
      n.y += (h / 2 - n.y) * 0.008 * a;
    });
    // collision avoidance
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const gap = nodes[i].r + nodes[j].r + 18;
        if (dist < gap) {
          const f = (gap - dist) / dist * 0.4;
          nodes[i].x -= dx * f; nodes[i].y -= dy * f;
          nodes[j].x += dx * f; nodes[j].y += dy * f;
        }
      }
    }
    // boundary
    nodes.forEach(n => {
      n.x = Math.max(n.r + 16, Math.min(w - n.r - 16, n.x));
      n.y = Math.max(n.r + 16, Math.min(h - n.r - 16, n.y));
    });
  }

  return Object.fromEntries(nodes.map(n => [n.id, { x: n.x, y: n.y, r: n.r }]));
}

/* ─── urgency filter tabs ─── */
const URGENCY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low Urgency', color: '#22c55e' },
  { key: 'medium', label: 'Medium Urgency', color: '#eab308' },
  { key: 'high', label: 'High Urgency', color: '#ef4444' },
];


/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function RelationshipsPage() {
  const [contacts, setContacts] = useState(DEMO_CONTACTS);
  const [ix, setIx] = useState(DEMO_IX);
  const [cFiles, setCFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const [selId, setSelId] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(null);
  const [addingFile, setAddingFile] = useState(false);

  const [dragOverZone, setDragOverZone] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const emptyC = { name: '', company: '', role: '', importance: 3, contact_method: 'email', contact_value: '', city: '', summary: '' };
  const [cf, setCf] = useState(emptyC);
  const [lf, setLf] = useState({ type: 'meeting', summary: '', next_step: '', follow_up_date: '' });
  const [ff, setFf] = useState({ name: '', url: '', type: 'link' });

  const sel = contacts.find(c => c.id === selId);

  /* ─── data ─── */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/contacts');
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d) && d.length > 0) {
            // Merge: keep demo contacts alongside real ones
            setContacts([...DEMO_CONTACTS, ...d]);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const loadIx = async (id) => {
    if (id.startsWith('demo-')) return;
    try { const r = await fetch(`/api/interactions?contact_id=${id}`); const d = await r.json(); if (Array.isArray(d)) setIx(p => ({ ...p, [id]: d })); } catch {}
  };
  const loadFiles = async (id) => {
    if (id.startsWith('demo-')) return;
    try { const r = await fetch(`/api/contact-files?contact_id=${id}`); const d = await r.json(); if (Array.isArray(d)) setCFiles(p => ({ ...p, [id]: d })); } catch {}
  };
  useEffect(() => { if (selId) { loadIx(selId); loadFiles(selId); } }, [selId]);

  /* ─── filtered + grouped + positioned ─── */
  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.role?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q));
    }
    if (filter !== 'all') list = list.filter(c => getUrgencyGroup(c) === filter);
    return list;
  }, [contacts, search, filter]);

  const grouped = useMemo(() => {
    const g = { low: [], medium: [], high: [] };
    filtered.forEach(c => { const zone = getUrgencyGroup(c); g[zone].push(c); });
    return g;
  }, [filtered]);

  // Compute layout in a normalized space (percentages)
  const ZONE_W = 400, ZONE_H = 600;
  const zonePositions = useMemo(() => {
    const toPercent = (layout) => {
      const result = {};
      for (const [id, { x, y, r }] of Object.entries(layout)) {
        result[id] = { xPct: (x / ZONE_W) * 100, yPct: (y / ZONE_H) * 100, r };
      }
      return result;
    };
    return {
      low: toPercent(computeZoneLayout(grouped.low, ZONE_W, ZONE_H)),
      medium: toPercent(computeZoneLayout(grouped.medium, ZONE_W, ZONE_H)),
      high: toPercent(computeZoneLayout(grouped.high, ZONE_W, ZONE_H)),
    };
  }, [grouped]);

  /* ─── drag and drop ─── */
  const onDragStart = useCallback((e, contactId) => {
    e.dataTransfer.setData('text/plain', contactId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(contactId);
  }, []);
  const onDragOver = useCallback((e, zoneKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverZone(zoneKey);
  }, []);
  const onDragLeave = useCallback(() => setDragOverZone(null), []);
  const onDrop = useCallback((e, zoneKey) => {
    e.preventDefault();
    setDragOverZone(null);
    setDraggingId(null);
    const contactId = e.dataTransfer.getData('text/plain');
    if (!contactId) return;
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    const currentGroup = getUrgencyGroup(contact);
    if (currentGroup === zoneKey) return;
    update(contactId, { urgency_override: zoneKey });
  }, [contacts]);
  const onDragEnd = useCallback(() => { setDraggingId(null); setDragOverZone(null); }, []);

  /* ─── CRUD ─── */
  const create = async () => {
    if (!cf.name.trim()) return;
    try {
      const r = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cf) });
      if (r.ok) { const d = await r.json(); setContacts(p => [d, ...p]); setAdding(false); setCf(emptyC); setToast({ message: `Added ${d.name}`, type: 'success' }); }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const update = async (id, u) => {
    if (id.startsWith('demo-')) { setContacts(p => p.map(c => c.id === id ? { ...c, ...u } : c)); return; }
    try {
      const r = await fetch('/api/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...u }) });
      if (r.ok) { const d = await r.json(); setContacts(p => p.map(c => c.id === id ? d : c)); }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const del = async (id) => {
    if (id.startsWith('demo-')) { setContacts(p => p.filter(c => c.id !== id)); if (selId === id) setSelId(null); setToast({ message: 'Deleted', type: 'success' }); return; }
    try {
      const r = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      if (r.ok) { setContacts(p => p.filter(c => c.id !== id)); if (selId === id) setSelId(null); setToast({ message: 'Deleted', type: 'success' }); }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const logInteraction = async () => {
    if (!selId || !lf.summary.trim()) return;
    if (selId.startsWith('demo-')) {
      const fake = { id: 'dix-' + Date.now(), contact_id: selId, ...lf, date: new Date().toISOString() };
      setIx(p => ({ ...p, [selId]: [fake, ...(p[selId] || [])] }));
      setContacts(p => p.map(c => c.id === selId ? { ...c, last_contacted_at: new Date().toISOString(), next_action: lf.next_step || c.next_action, follow_up_date: lf.follow_up_date || c.follow_up_date } : c));
      setLogging(false); setLf({ type: 'meeting', summary: '', next_step: '', follow_up_date: '' }); setToast({ message: 'Logged', type: 'success' });
      return;
    }
    try {
      const payload = { contact_id: selId, ...lf };
      if (!payload.follow_up_date) delete payload.follow_up_date;
      const r = await fetch('/api/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) {
        const d = await r.json();
        setIx(p => ({ ...p, [selId]: [d, ...(p[selId] || [])] }));
        const cr = await fetch('/api/contacts'); const cd = await cr.json(); if (Array.isArray(cd)) setContacts(cd);
        setLogging(false); setLf({ type: 'meeting', summary: '', next_step: '', follow_up_date: '' }); setToast({ message: 'Logged', type: 'success' });
      }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const addFile = async () => {
    if (!selId || !ff.name.trim()) return;
    if (selId.startsWith('demo-')) { setCFiles(p => ({ ...p, [selId]: [{ id: 'df-' + Date.now(), ...ff, created_at: new Date().toISOString() }, ...(p[selId] || [])] })); setAddingFile(false); setFf({ name: '', url: '', type: 'link' }); return; }
    try {
      const r = await fetch('/api/contact-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: selId, ...ff }) });
      if (r.ok) { const d = await r.json(); setCFiles(p => ({ ...p, [selId]: [d, ...(p[selId] || [])] })); setAddingFile(false); setFf({ name: '', url: '', type: 'link' }); }
    } catch {}
  };
  const delFile = async (fid) => {
    if (fid.startsWith('df-')) { setCFiles(p => ({ ...p, [selId]: (p[selId] || []).filter(f => f.id !== fid) })); return; }
    try { await fetch(`/api/contact-files?id=${fid}`, { method: 'DELETE' }); setCFiles(p => ({ ...p, [selId]: (p[selId] || []).filter(f => f.id !== fid) })); } catch {}
  };
  const saveEdit = async () => { if (!editing) return; await update(editing.id, editing); setEditing(null); setToast({ message: 'Saved', type: 'success' }); };

  /* ─── render ─── */
  return (
    <div className="px-6 lg:px-12 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
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
            <Plus size={13} /> Add Contact
          </button>
        </div>
      </div>

      {/* Urgency Tabs */}
      <div className="flex items-center gap-1.5 mb-3">
        {URGENCY_TABS.map(t => {
          const count = t.key === 'all' ? contacts.length : contacts.filter(c => getUrgencyGroup(c) === t.key).length;
          return (
            <button key={t.key} onClick={() => setFilter(filter === t.key && t.key !== 'all' ? 'all' : t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                filter === t.key ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.color && <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />}
              {t.label}
              <span className="opacity-60">({count})</span>
            </button>
          );
        })}
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
            <div className="flex justify-end mt-4 gap-2">
              <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={create} disabled={!cf.name.trim()} className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-40 shadow-sm transition-colors">Add Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Main area — 3 zone columns + detail panel */}
      <div className="flex gap-0">
        <div className={`flex gap-3 transition-all duration-300 ${selId ? 'flex-1 min-w-0' : 'w-full'}`} style={{ height: 'calc(100vh - 200px)' }}>
          {ZONES.map(zone => {
            const zContacts = grouped[zone.key] || [];
            const zPos = zonePositions[zone.key] || {};
            const isOver = dragOverZone === zone.key;

            return (
              <div
                key={zone.key}
                className={`flex-1 flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 ${zone.border} ${isOver ? 'scale-[1.01]' : ''}`}
                style={isOver ? { boxShadow: `0 0 0 3px ${zone.color}40`, transform: 'scale(1.01)' } : {}}
                onDragOver={e => onDragOver(e, zone.key)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, zone.key)}
              >
                {/* Zone header */}
                <div className={`px-4 py-2.5 ${zone.headerBg} border-b ${zone.border} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: zone.color }} />
                    <span className={`text-xs font-bold ${zone.headerText}`}>{zone.label}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-400 bg-white/60 px-2 py-0.5 rounded-full">{zContacts.length}</span>
                </div>

                {/* Bubble area */}
                <div className={`flex-1 relative bg-gradient-to-br ${zone.bg} overflow-hidden`}>
                  {/* Subtle dot grid */}
                  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #64748b 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                  {/* Render bubbles */}
                  <div className="relative w-full h-full">
                    {zContacts.map(c => {
                      const pos = zPos[c.id];
                      if (!pos) return null;
                      const isSelected = c.id === selId;
                      const isDrag = c.id === draggingId;
                      const zColor = zone.color;
                      const imp = c.importance || 3;
                      const showAlert = zone.key === 'high' && imp >= 4;

                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={e => onDragStart(e, c.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => { setSelId(isSelected ? null : c.id); setLogging(false); setEditing(null); setAddingFile(false); }}
                          className={`absolute rounded-full flex flex-col items-center justify-center cursor-grab select-none group ${isDrag ? 'opacity-40' : ''}`}
                          style={{
                            left: `calc(${pos.xPct}% - ${pos.r}px)`, top: `calc(${pos.yPct}% - ${pos.r}px)`,
                            width: pos.r * 2, height: pos.r * 2,
                            background: `${zColor}12`,
                            border: `3px solid ${zColor}`,
                            boxShadow: isSelected
                              ? `0 0 0 3px ${zColor}35, 0 8px 30px rgba(0,0,0,0.12)`
                              : `0 0 12px ${zColor}18, 0 2px 10px rgba(0,0,0,0.05)`,
                            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isSelected ? 'scale(1.08)' : undefined,
                          }}
                        >
                          <span className="font-bold text-gray-800 leading-tight text-center truncate max-w-[85%]" style={{ fontSize: pos.r > 50 ? 12 : pos.r > 42 ? 10 : pos.r > 36 ? 8.5 : 7.5 }}>
                            {c.name}
                          </span>
                          {pos.r > 36 && (
                            <span className="text-gray-400 truncate max-w-[80%] leading-tight text-center mt-0.5" style={{ fontSize: pos.r > 46 ? 7.5 : 6.5 }}>
                              {c.company}
                            </span>
                          )}
                          {pos.r > 40 && (
                            <div className="flex gap-px mt-0.5">
                              {[1,2,3,4,5].map(n => (
                                <div key={n} className="rounded-full" style={{ width: 3, height: 3, background: n <= imp ? zColor : '#e5e7eb' }} />
                              ))}
                            </div>
                          )}
                          <div className="absolute inset-[-4px] rounded-full border-2 border-transparent group-hover:border-current opacity-25 transition-all duration-200" style={{ color: zColor }} />
                          {showAlert && (
                            <div className="absolute -top-1 -right-1 bg-red-600 rounded-full border-2 border-white flex items-center justify-center shadow-md" style={{ width: 20, height: 20 }}>
                              <span className="text-white text-[9px] font-black">!</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Empty zone state */}
                  {zContacts.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-gray-300 text-xs font-medium">Drop contacts here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${selId && sel ? 'w-[380px] ml-3 opacity-100' : 'w-0 ml-0 opacity-0'}`}>
          {sel && <DetailPanel />}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Bubble size = Importance</span>
        <div className="w-px h-3 bg-gray-200" />
        <span className="text-[9px] text-gray-400">Drag bubbles between zones to override urgency</span>
      </div>

      {confirm && <ConfirmModal {...confirm} />}
      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
    </div>
  );

  /* ═══════════════════════════════════════════
     DETAIL PANEL
     ═══════════════════════════════════════════ */
  function DetailPanel() {
    const d = daysSince(sel.last_contacted_at);
    const cIx = ix[selId] || [];
    const cF = cFiles[selId] || [];
    const urgency = getUrgency(sel);
    const zoneKey = getUrgencyGroup(sel);
    const zColor = (ZONES.find(z => z.key === zoneKey) || ZONES[0]).color;

    return (
      <div className="h-full bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md" style={{ background: zColor }}>
                {sel.name?.charAt(0)}
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">{sel.name}</h2>
                <div className="text-xs text-gray-500">{[sel.role, sel.company].filter(Boolean).join(' · ')}</div>
                {sel.city && <div className="text-xs text-gray-400 mt-0.5">{sel.city}</div>}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setEditing(editing ? null : { ...sel }); setLogging(false); setAddingFile(false); }}
                className={`p-1.5 rounded-lg transition-colors ${editing ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}><Edit3 size={14} /></button>
              <button onClick={() => setConfirm({ title: 'Delete Contact', message: `Delete ${sel.name}?`, onConfirm: () => { del(sel.id); setConfirm(null); }, onCancel: () => setConfirm(null) })}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              <button onClick={() => setSelId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${urgencyBg(urgency)}`}>{urgencyLabel(urgency)}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${sBadge(sel.relationship_strength)}`}>{sel.relationship_strength}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">{sel.status}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">★ {sel.importance || 3} {IMPORTANCE_LABELS[sel.importance || 3]}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><div className="text-gray-400 mb-0.5">Last contact</div><div className="font-semibold" style={{ color: zColor }}>{d === null ? 'never' : `${d}d ago`}</div></div>
            <div><div className="text-gray-400 mb-0.5">Next action</div><div className="font-medium text-gray-700 truncate">{sel.next_action || '—'}</div></div>
            <div><div className="text-gray-400 mb-0.5">Follow-up</div><div className={`font-medium ${sel.follow_up_date && new Date(sel.follow_up_date) <= new Date() ? 'text-amber-600' : 'text-gray-700'}`}>{sel.follow_up_date ? fmtShort(sel.follow_up_date) : '—'}</div></div>
          </div>

          {sel.summary && <div className="text-xs text-gray-500 mt-3 italic leading-relaxed">&ldquo;{sel.summary}&rdquo;</div>}
          {sel.contact_value && (
            <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              {sel.contact_method === 'email' ? <Mail size={10} /> : sel.contact_method === 'phone' ? <Phone size={10} /> : <Linkedin size={10} />}
              {sel.contact_value}
            </div>
          )}

          <div className="flex gap-1.5 mt-3">
            <select value={sel.importance || 3} onChange={e => update(sel.id, { importance: Number(e.target.value) })}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-700 outline-none cursor-pointer">
              {[1,2,3,4,5].map(n => <option key={n} value={n}>★{n} {IMPORTANCE_LABELS[n]}</option>)}
            </select>
            <select value={sel.relationship_strength} onChange={e => update(sel.id, { relationship_strength: e.target.value })}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-700 outline-none cursor-pointer">
              {STRENGTHS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={sel.status} onChange={e => update(sel.id, { status: e.target.value })}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-700 outline-none cursor-pointer">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {editing && <EditForm />}

          <div className="flex gap-1.5">
            <button onClick={() => { setLf({ type: 'meeting', summary: '', next_step: '', follow_up_date: '' }); setLogging(!logging); setEditing(null); setAddingFile(false); }}
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${logging ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
              <Plus size={11} /> Log
            </button>
            <button onClick={() => { setAddingFile(!addingFile); setLogging(false); setEditing(null); setFf({ name: '', url: '', type: 'link' }); }}
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${addingFile ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              <Link2 size={11} /> File
            </button>
          </div>

          {logging && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap gap-1">
                {ITYPES.map(({ v, l, icon: Ic }) => (
                  <button key={v} onClick={() => setLf({ ...lf, type: v })}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${lf.type === v ? 'bg-emerald-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                    <Ic size={10} /> {l}
                  </button>
                ))}
              </div>
              <textarea value={lf.summary} onChange={e => setLf({ ...lf, summary: e.target.value })} placeholder="What happened?"
                className="w-full px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none h-14" autoFocus />
              <input value={lf.next_step} onChange={e => setLf({ ...lf, next_step: e.target.value })} placeholder="What's next? (optional)"
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20" />
              <div className="flex flex-wrap gap-1">
                {QUICK_NEXT.map(a => (
                  <button key={a} onClick={() => setLf({ ...lf, next_step: a })} className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-emerald-600 bg-white hover:bg-emerald-50 rounded border border-gray-200 transition-colors">{a}</button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input type="date" value={lf.follow_up_date} onChange={e => setLf({ ...lf, follow_up_date: e.target.value })}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20 flex-1" />
                <button onClick={() => setLogging(false)} className="px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={logInteraction} disabled={!lf.summary.trim()} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors">Log</button>
              </div>
            </div>
          )}

          {addingFile && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <Inp placeholder="Name *" value={ff.name} onChange={v => setFf({ ...ff, name: v })} autoFocus />
              <Inp placeholder="URL (optional)" value={ff.url} onChange={v => setFf({ ...ff, url: v })} />
              <div className="flex gap-2">
                <select value={ff.type} onChange={e => setFf({ ...ff, type: e.target.value })} className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 outline-none flex-1">
                  {['link', 'document', 'deck', 'spreadsheet'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => setAddingFile(false)} className="px-2.5 py-1.5 text-[10px] text-gray-500">Cancel</button>
                <button onClick={addFile} disabled={!ff.name.trim()} className="px-3 py-1.5 bg-gray-700 text-white text-[10px] font-semibold rounded-lg disabled:opacity-40 transition-colors">Add</button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Timeline ({cIx.length})</div>
            {cIx.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">No interactions yet.</div>
            ) : (
              <div className="space-y-0">
                {cIx.map((item, idx) => {
                  const Ic = (ITYPES.find(x => x.v === item.type) || {}).icon || StickyNote;
                  return (
                    <div key={item.id} className="flex gap-2.5">
                      <div className="flex flex-col items-center">
                        <div className="p-1 rounded bg-gray-100 border border-gray-200"><Ic size={10} className="text-gray-500" /></div>
                        {idx < cIx.length - 1 && <div className="w-px flex-1 bg-gray-200 my-0.5" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase">{item.type}</span>
                          <span className="text-[9px] text-gray-400">{fmtShort(item.date)}</span>
                        </div>
                        <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{item.summary}</p>
                        {item.next_step && <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-0.5"><ChevronRight size={8} /> {item.next_step}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</div>
            <textarea
              value={sel.notes || ''}
              onChange={e => setContacts(p => p.map(c => c.id === selId ? { ...c, notes: e.target.value } : c))}
              onBlur={e => update(selId, { notes: e.target.value })}
              placeholder="Strategy notes, observations..."
              className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20 resize-y min-h-[80px] leading-relaxed"
            />
          </div>

          {/* Files */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Files & Links</span>
              <button onClick={() => { setFf({ name: '', url: '', type: 'link' }); setAddingFile(true); setLogging(false); setEditing(null); }} className="text-[10px] text-emerald-600 hover:text-emerald-500 font-medium">+ Add</button>
            </div>
            {cF.length === 0 ? (
              <div className="text-xs text-gray-400">None.</div>
            ) : (
              <div className="space-y-1">
                {cF.map(f => (
                  <div key={f.id} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded-lg group text-xs border border-gray-100">
                    {f.type === 'link' ? <Link2 size={10} className="text-gray-400 shrink-0" /> : <FileText size={10} className="text-gray-400 shrink-0" />}
                    <span className="text-gray-700 truncate flex-1">{f.name}</span>
                    {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-emerald-500 shrink-0"><ExternalLink size={10} /></a>}
                    <button onClick={() => delFile(f.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Edit form ─── */
  function EditForm() {
    const e = editing;
    const s = (k, v) => setEditing({ ...e, [k]: v });
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Inp label="Name" value={e.name} onChange={v => s('name', v)} />
          <Inp label="Company" value={e.company} onChange={v => s('company', v)} />
          <Inp label="Role" value={e.role} onChange={v => s('role', v)} />
          <Inp label="City" value={e.city} onChange={v => s('city', v)} />
          <Inp label="Contact" value={e.contact_value} onChange={v => s('contact_value', v)} />
        </div>
        <Inp label="Summary" value={e.summary || ''} onChange={v => s('summary', v)} placeholder="One-liner..." />
        <div>
          <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Importance</label>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button" onClick={() => s('importance', n)}
                className={`flex-1 py-1 rounded text-[10px] font-medium transition-all border ${
                  (e.importance || 3) === n ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Inp label="Next Action" value={e.next_action || ''} onChange={v => s('next_action', v)} />
          <Inp label="Follow-up" type="date" value={e.follow_up_date || ''} onChange={v => s('follow_up_date', v || null)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => setEditing(null)} className="px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={saveEdit} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-semibold rounded-lg hover:bg-emerald-600 transition-colors">Save</button>
        </div>
      </div>
    );
  }

  /* ─── Input ─── */
  function Inp({ label, value, onChange, placeholder, type = 'text', autoFocus }) {
    return (
      <div>
        {label && <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-0.5">{label}</label>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
      </div>
    );
  }
}
