import { useMemo, useState, useEffect, useRef } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Outreach.css';

/* Youth → Outreach
   Storage:
     youth:outreach     — array of outreach event objects
     youth:outreachDocs — array of { id, outreachId, name, dataUrl, ... }
                          kept out of the outreach object so a few PDFs
                          can't bust Firestore's 1MB single-doc limit.
   Synced events go to: calendar-events (source: 'youth-outreach'). */

const ACCENT = '#b8410c';
const CAL_SOURCE = 'youth-outreach';
const MAX_DOC_BYTES = 500 * 1024; // 500 KB per file

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload  = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const TYPES = ['Service project', 'Community event', 'Evangelism', 'Fundraiser', 'Partnership', 'Other'];

/* Time-picker option arrays (used by <TimePicker>). */
const HOUR_OPTIONS   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTE_OPTIONS = ['00','05','10','15','20','25','30','35','40','45','50','55'];

/** Parse a stored time string ("9:00 AM" / "9:00AM" / "9 AM" / "")
 *  into its three parts. Returns sensible defaults so an empty
 *  string still renders the picker cleanly. */
function parseTime(s) {
  if (!s) return { hh: '', mm: '00', ap: 'AM' };
  const m = String(s).trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return { hh: '', mm: '00', ap: 'AM' };
  return {
    hh: m[1] || '',
    mm: m[2] || '00',
    ap: m[3] || 'AM',
  };
}
const formatTime = ({ hh, mm, ap }) => hh ? `${hh}:${mm || '00'} ${ap || 'AM'}` : '';

const DEFAULT = () => ({
  id:             'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
  name:           '',
  type:           'Service project',
  date:           new Date().toISOString().slice(0, 10),
  time:           '',
  location:       '',
  description:    '',
  contact:        '',
  contactPhone:   '',
  slotsTotal:     10,
  syncToCalendar: false,
  signups:        [],   // [{ id, name, role, note, studentId? }]
  notes:          '',
  /* Organize-tab content */
  schedule:       [],   // [{ id, time, duration, item, owner }]
  prepList:       [],   // [{ id, task, done }]
  materials:      [],   // [{ id, item, qty, source }]
  assignments:    [],   // [{ id, role, person }]
  logistics:      '',
  createdAt:      Date.now(),
});

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/** Defensive merge so older outreach docs (without the Organize-tab
 *  fields) don't blow up when the editor reaches for them. */
function normalize(item) {
  return {
    ...item,
    contactPhone: typeof item.contactPhone === 'string' ? item.contactPhone : '',
    signups:      Array.isArray(item.signups)     ? item.signups     : [],
    schedule:     Array.isArray(item.schedule)    ? item.schedule    : [],
    prepList:     Array.isArray(item.prepList)    ? item.prepList    : [],
    materials:    Array.isArray(item.materials)   ? item.materials   : [],
    assignments:  Array.isArray(item.assignments) ? item.assignments : [],
    logistics:    typeof item.logistics === 'string' ? item.logistics : '',
  };
}

export default function Outreach() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [items, setItems, { loading }] = useUserStoreKey('youth:outreach', []);
  const [calendarEvents, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const [students]      = useUserStoreKey('youth:students', []);
  const [leaders]       = useUserStoreKey('youth:leaders', []);
  const [friends]       = useUserStoreKey('friends', []);
  const [docs, setDocs] = useUserStoreKey('youth:outreachDocs', []);
  const list        = Array.isArray(items)    ? items    : [];
  const studentList = Array.isArray(students) ? students : [];
  const leaderList  = Array.isArray(leaders)  ? leaders  : [];
  const friendList  = Array.isArray(friends)  ? friends  : [];
  const docList     = Array.isArray(docs)     ? docs     : [];

  const [openId, setOpenId] = useState(null);
  const [mode,   setMode]   = useState('view'); // 'view' | 'edit'
  const [filter, setFilter] = useState('upcoming');

  /* Reset to view mode whenever a new event is opened. */
  useEffect(() => { if (openId) setMode('view'); }, [openId]);

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => {
    const filtered = list.filter(o =>
      filter === 'upcoming' ? (o.date || '') >= today :
      filter === 'past'     ? (o.date || '') <  today : true
    );
    return [...filtered].sort((a, b) =>
      filter === 'past'
        ? (b.date || '').localeCompare(a.date || '')
        : (a.date || '').localeCompare(b.date || '')
    );
  }, [list, filter, today]);

  const open = openId ? normalize(list.find(o => o.id === openId)) : null;

  /* ── Calendar sync helpers ──────────────────────────────────
     Push a deterministic event keyed by source_id = outreach.id so
     repeated syncs upsert in place instead of duplicating. */
  const upsertCalendarFor = (o) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const payload = {
        title:           o.name || `Outreach ${o.date}`,
        description:     [o.type, o.location, o.description].filter(Boolean).join(' — '),
        event_date:      o.date || '',
        end_date:        '',
        event_time:      o.time || '',
        color:           '#b8410c',
        category:        'youth',
        source:          CAL_SOURCE,
        source_id:       o.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      };
      const idx = evList.findIndex(e => e.source === CAL_SOURCE && e.source_id === o.id);
      if (idx >= 0) {
        const next = [...evList];
        next[idx] = { ...evList[idx], ...payload };
        return next;
      }
      return [
        { id: 'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          created_at: new Date().toISOString(),
          ...payload },
        ...evList,
      ];
    });
  };
  const removeCalendarFor = (id) =>
    setCalendarEvents(prev => (prev || []).filter(e => !(e.source === CAL_SOURCE && e.source_id === id)));

  const add = () => {
    const o = DEFAULT();
    setItems(prev => [o, ...(prev || [])]);
    setOpenId(o.id);
    setMode('edit');
  };

  const update = (id, patch) => {
    const current = list.find(o => o.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setItems(prev => (prev || []).map(o => o.id === id ? next : o));
    if (next.syncToCalendar) upsertCalendarFor(next);
  };

  const remove = (id) => {
    if (!confirm('Remove this outreach?')) return;
    setItems(prev => (prev || []).filter(o => o.id !== id));
    removeCalendarFor(id);
    setDocs(prev => (prev || []).filter(d => d.outreachId !== id));
    if (openId === id) setOpenId(null);
  };

  /* ── Attachment upload / remove (stored separately) ────────── */
  const addDoc = async (outreachId, file) => {
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      alert(`File "${file.name}" is too large (${Math.round(file.size/1024)} KB). Max ${Math.round(MAX_DOC_BYTES/1024)} KB.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const doc = {
        id:         'od_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        outreachId,
        name:       file.name,
        dataUrl,
        size:       file.size,
        type:       file.type,
        uploadedAt: new Date().toISOString(),
      };
      setDocs(prev => [doc, ...(prev || [])]);
    } catch (err) {
      console.error('[Outreach] upload failed:', err);
      alert('Upload failed.');
    }
  };
  const removeDoc = (docId) => {
    setDocs(prev => (prev || []).filter(d => d.id !== docId));
  };

  const toggleSync = (id) => {
    const current = list.find(o => o.id === id);
    if (!current) return;
    const willSync = !current.syncToCalendar;
    const next = { ...current, syncToCalendar: willSync };
    setItems(prev => (prev || []).map(o => o.id === id ? next : o));
    if (willSync) upsertCalendarFor(next);
    else          removeCalendarFor(id);
  };

  const stats = useMemo(() => ({
    upcoming: list.filter(o => (o.date || '') >= today).length,
    past:     list.filter(o => (o.date || '') <  today).length,
    signups:  list.reduce((s, o) => s + (o.signups?.length || 0), 0),
  }), [list, today]);

  return (
    <YouthShell
      groupLabel="Events" groupIcon="📅"
      icon="🤲" title="Outreach"
      accent={ACCENT}
      subtitle="Service projects, community events, and other ways your youth show up for the world."
      actions={<button className="yps-add-btn" onClick={add}>＋ New outreach</button>}
      stats={[
        { n: stats.upcoming, label: 'upcoming' },
        { n: stats.past,     label: 'past' },
        { n: stats.signups,  label: 'sign-ups total' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yo-tabs">
        <button className={`yps-chip ${filter === 'upcoming' ? 'on' : ''}`} onClick={() => setFilter('upcoming')}>📅 Upcoming</button>
        <button className={`yps-chip ${filter === 'past'     ? 'on' : ''}`} onClick={() => setFilter('past')}>🗄 Past</button>
        <button className={`yps-chip ${filter === 'all'      ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>

      {loading && list.length === 0 ? (
        <div className="yps-empty"><div className="yps-empty-icon">🤲</div><div className="yps-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">🤲</div>
          <div className="yps-empty-title">{list.length === 0 ? 'No outreaches scheduled' : 'Nothing in this view'}</div>
          <div className="yps-empty-sub">{list.length === 0 ? 'Tap "＋ New outreach" to plan your first.' : 'Try switching filter.'}</div>
        </div>
      ) : (
        <div className="yo-grid">
          {visible.map(o => {
            const filled = o.signups?.length || 0;
            const pct = o.slotsTotal ? Math.min(100, Math.round((filled / o.slotsTotal) * 100)) : 0;
            return (
              <article
                key={o.id}
                className="yo-card"
                onDoubleClick={() => { setOpenId(o.id); setMode('view'); }}
                title="Double-click to view"
              >
                <header className="yo-card-hd">
                  <span className="yps-pill accent">{o.type}</span>
                  <span className="yo-card-date">{o.date || 'TBD'} {o.time && <>· {o.time}</>}</span>
                </header>
                <h3 className="yo-card-name">{o.name || 'Untitled outreach'}</h3>
                {o.location && <div className="yo-card-loc">📍 {o.location}</div>}
                <div className="yo-card-slots">
                  <div className="yo-card-slots-track">
                    <div className="yo-card-slots-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="yo-card-slots-n">{filled} / {o.slotsTotal} signed up</span>
                </div>
                <div className="yo-row-actions" onClick={e => e.stopPropagation()}>
                  <label className="yo-sync" title="Sync this outreach to the Calendar">
                    <input type="checkbox" checked={!!o.syncToCalendar} onChange={() => toggleSync(o.id)} />
                    <span>📆 Sync</span>
                  </label>
                  <button type="button" className="yo-delete-btn" onClick={() => remove(o.id)} title="Delete this outreach">🗑</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <OutreachEditor
          item={open}
          mode={mode}
          students={studentList}
          leaders={leaderList}
          friends={friendList}
          docs={docList.filter(d => d.outreachId === open.id)}
          onSetMode={setMode}
          onChange={(p) => update(open.id, p)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
          onToggleSync={() => toggleSync(open.id)}
          onAddDoc={(file) => addDoc(open.id, file)}
          onRemoveDoc={removeDoc}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

function OutreachEditor({
  item, mode, students, leaders, friends, docs,
  onSetMode, onChange, onDelete, onClose, onToggleSync,
  onAddDoc, onRemoveDoc,
}) {
  const [tab, setTab] = useState('details');

  return (
    <div className="yo-modal-backdrop" onClick={onClose}>
      <div className="yo-modal" onClick={e => e.stopPropagation()}>
        <header className="yo-modal-hd">
          <div className="yo-modal-hd-main">
            <div className="yo-modal-hd-crumb">
              {mode === 'view' ? '👁 Viewing' : '✎ Editing'} · {item.date || 'No date'}{item.time && ` · ${item.time}`}
            </div>
            <h2>{item.name || 'New outreach'}</h2>
          </div>
          <div className="yo-modal-hd-actions">
            <label className="yo-sync yo-sync-modal" title="Sync this outreach to the Calendar">
              <input type="checkbox" checked={!!item.syncToCalendar} onChange={onToggleSync} />
              <span>📆 Sync</span>
            </label>
            <button className="yps-btn ghost" onClick={onClose}>✕</button>
          </div>
        </header>

        {mode === 'view' ? (
          <OutreachView item={item} students={students} docs={docs} />
        ) : (
          <>
            <nav className="yo-tabstrip">
              <button className={`yps-chip ${tab === 'details'  ? 'on' : ''}`} onClick={() => setTab('details')}>📋 Details</button>
              <button className={`yps-chip ${tab === 'organize' ? 'on' : ''}`} onClick={() => setTab('organize')}>🗂 Organize</button>
            </nav>
            {tab === 'details'  && (
              <DetailsTab
                item={item}
                onChange={onChange}
                students={students}
                leaders={leaders}
                friends={friends}
                docs={docs}
                onAddDoc={onAddDoc}
                onRemoveDoc={onRemoveDoc}
              />
            )}
            {tab === 'organize' && <OrganizeTab item={item} onChange={onChange} />}
          </>
        )}

        <footer className="yo-modal-ft">
          <button className="yps-btn danger" onClick={onDelete}>🗑 Delete</button>
          <div className="yo-modal-ft-right">
            {mode === 'view' ? (
              <button className="yps-add-btn" onClick={() => onSetMode('edit')}>✎ Edit</button>
            ) : (
              <button className="yps-add-btn" onClick={() => onSetMode('view')}>✓ Done editing</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   View mode — read-only, hides empty sections.
   Mirrors the Weekly Nights view pattern.
   ───────────────────────────────────────────────────────────── */
function OutreachView({ item, students, docs }) {
  const hasSignups   = (item.signups || []).length > 0;
  const hasSchedule  = (item.schedule || []).some(r => r.time || r.item || r.owner);
  const hasPrep      = (item.prepList || []).some(r => r.task);
  const hasMaterials = (item.materials || []).some(r => r.item || r.qty || r.source);
  const hasRoles     = (item.assignments || []).some(r => r.role || r.person);
  const hasOrganize  = hasSchedule || hasPrep || hasMaterials || hasRoles || (item.logistics && item.logistics.trim().length > 0);
  const filled = item.signups?.length || 0;
  const pct = item.slotsTotal ? Math.min(100, Math.round((filled / item.slotsTotal) * 100)) : 0;

  return (
    <div className="yo-view">
      <section className="yo-view-hero">
        <div className="yo-view-meta">
          <span className="yps-pill accent">{item.type}</span>
          <span className="yo-view-date">
            📅 {item.date || 'TBD'}{item.time && <> · {item.time}</>}
          </span>
        </div>
        {item.location && <div className="yo-view-loc">📍 {item.location}</div>}
        {(item.contact || item.contactPhone) && (
          <div className="yo-view-contact">
            👤 {item.contact || '—'}
            {item.contactPhone && <> · 📞 {item.contactPhone}</>}
          </div>
        )}
        {item.description && <p className="yo-view-desc">{item.description}</p>}
      </section>

      {(item.slotsTotal > 0 || filled > 0) && (
        <section className="yo-view-section">
          <h3 className="yo-view-section-title">👥 Sign-ups</h3>
          <div className="yo-card-slots" style={{ marginBottom: 10 }}>
            <div className="yo-card-slots-track">
              <div className="yo-card-slots-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="yo-card-slots-n">{filled} / {item.slotsTotal} signed up</span>
          </div>
          {hasSignups && (
            <ul className="yo-view-list">
              {item.signups.map(s => {
                const stu = s.studentId ? students.find(x => x.id === s.studentId) : null;
                const phone       = s.phone       || stu?.phone       || '';
                const parentName  = s.parentName  || stu?.parentName  || '';
                const parentPhone = s.parentPhone || stu?.parentPhone || '';
                const hasContact  = phone || parentName || parentPhone;
                return (
                  <li key={s.id} className="yo-view-signup">
                    <div className="yo-view-signup-main">
                      <span className="yo-view-name">{s.name || '(unnamed)'}</span>
                      {stu && <span className="yps-pill accent">student</span>}
                      {s.role && <span className="yps-pill">{s.role}</span>}
                    </div>
                    {hasContact && (
                      <div className="yo-view-parent">
                        {phone       && <span>📞 <b>{phone}</b></span>}
                        {parentName  && <span>👤 Parent: <b>{parentName}</b></span>}
                        {parentPhone && <span>📞 {parentPhone}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {hasOrganize && (
        <ViewBlock
          title="Organization Plan"
          emoji="🗂"
          action={
            <button
              className="yps-btn"
              onClick={() => downloadOrganizePlan(item)}
            >📥 Download as Word</button>
          }
        >
          {hasSchedule && (
            <ViewSub title="Schedule" emoji="📋">
              <ul className="yo-view-run">
                {item.schedule.filter(r => r.time || r.item || r.owner).map(r => (
                  <li key={r.id} className="yo-view-run-row">
                    <span className="yo-view-run-time">{r.time || '—'}</span>
                    <span className="yo-view-run-dur">{r.duration ? `${r.duration}m` : ''}</span>
                    <span className="yo-view-run-item">{r.item || <em className="yps-muted">—</em>}</span>
                    {r.owner && <span className="yo-view-run-owner">{r.owner}</span>}
                  </li>
                ))}
              </ul>
            </ViewSub>
          )}

          {hasPrep && (
            <ViewSub title="Prep List" emoji="📝">
              <ol className="yo-view-numlist">
                {item.prepList.filter(p => p.task).map(p => (
                  <li key={p.id}>{p.task}</li>
                ))}
              </ol>
            </ViewSub>
          )}

          {hasMaterials && (
            <ViewSub title="Materials" emoji="📦">
              <ul className="yo-view-list">
                {item.materials.filter(m => m.item || m.qty || m.source).map(m => (
                  <li key={m.id} className="yo-view-list-row">
                    <span>{m.item || '—'}</span>
                    {m.qty && <span className="yps-pill">{m.qty}</span>}
                    {m.source && <span className="yps-muted">— {m.source}</span>}
                  </li>
                ))}
              </ul>
            </ViewSub>
          )}

          {hasRoles && (
            <ViewSub title="Role Assignments" emoji="👥">
              <ul className="yo-view-list">
                {item.assignments.filter(a => a.role || a.person).map(a => (
                  <li key={a.id} className="yo-view-list-row">
                    <span className="yo-view-name">{a.role || '—'}</span>
                    <span className="yps-muted">— {a.person || '(unassigned)'}</span>
                  </li>
                ))}
              </ul>
            </ViewSub>
          )}

          {item.logistics && item.logistics.trim() && (
            <ViewSub title="Logistics Notes" emoji="📝">
              <div className="yo-view-text">{item.logistics}</div>
            </ViewSub>
          )}
        </ViewBlock>
      )}

      {item.notes && (
        <section className="yo-view-section">
          <h3 className="yo-view-section-title">📝 Notes</h3>
          <div className="yo-view-text">{item.notes}</div>
        </section>
      )}

      {docs && docs.length > 0 && (
        <section className="yo-view-section">
          <h3 className="yo-view-section-title">📎 Attachments</h3>
          <ul className="yo-doc-list">
            {docs.map(d => (
              <li key={d.id} className="yo-doc-row yo-doc-row-view">
                <a
                  className="yo-doc-link"
                  href={d.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`${d.name} — ${(d.size / 1024).toFixed(0)} KB`}
                >
                  <span className="yo-doc-icon">{fileEmoji(d.type, d.name)}</span>
                  <span className="yo-doc-name">{d.name}</span>
                  <span className="yo-doc-size">{(d.size / 1024).toFixed(0)} KB</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!item.location && !item.contact && !item.description && !hasSignups
        && !hasOrganize && !item.notes && !(docs && docs.length) && (
        <div className="yo-view-empty">
          Nothing filled in yet — click <b>Edit</b> below to start planning this outreach.
        </div>
      )}
    </div>
  );
}

function ViewBlock({ title, emoji, action, children }) {
  return (
    <section className="yo-view-section">
      <header className="yo-view-section-hd">
        <h3 className="yo-view-section-title">{emoji} {title}</h3>
        {action}
      </header>
      <div className="yo-view-block-body">{children}</div>
    </section>
  );
}
function ViewSub({ title, emoji, children }) {
  return (
    <div className="yo-view-sub">
      <h4 className="yo-view-sub-title">{emoji} {title}</h4>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Details tab — the original flat editor with sign-ups + notes
   ───────────────────────────────────────────────────────────── */
function DetailsTab({ item, onChange, students, leaders, friends, docs, onAddDoc, onRemoveDoc }) {
  /* Contact picker — fills both `contact` (name) and `contactPhone`
     from a Leader or Friend in one click. Resets the select after. */
  const pickContact = (key) => {
    if (!key) return;
    const [src, id] = key.split(':');
    let person = null;
    if (src === 'leader') person = leaders.find(l => l.id === id);
    if (src === 'friend') person = friends.find(f => f.id === id);
    if (!person) return;
    onChange({
      contact:      person.name || '',
      contactPhone: person.phone || '',
    });
  };

  const removeSignup = (id) =>
    onChange({ signups: (item.signups || []).filter(s => s.id !== id) });

  const addSignup = (signup) => {
    onChange({ signups: [...(item.signups || []), { id: makeId('su'), ...signup }] });
  };

  return (
    <>
      <div className="yo-grid">
        <Field label="Name" full>
          <input className="yps-input" value={item.name} onChange={e => onChange({ name: e.target.value })} />
        </Field>

        <Field label="Type">
          <select className="yps-select" value={item.type} onChange={e => onChange({ type: e.target.value })}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="yps-input" value={item.date} onChange={e => onChange({ date: e.target.value })} />
        </Field>
        <Field label="Time">
          <TimePicker value={item.time} onChange={(t) => onChange({ time: t })} />
        </Field>

        <Field label="Location">
          <input className="yps-input" value={item.location} onChange={e => onChange({ location: e.target.value })} />
        </Field>
        <Field label="Total slots">
          <input type="number" className="yps-input" value={item.slotsTotal} onChange={e => onChange({ slotsTotal: Math.max(0, Number(e.target.value)) })} />
        </Field>

        {/* Contact picker + name + phone, full width. */}
        <Field label="Contact" full>
          <div className="yo-contact-block">
            <select
              className="yps-select"
              defaultValue=""
              onChange={e => { pickContact(e.target.value); e.target.value = ''; }}
            >
              <option value="">＋ Pick from contacts (auto-fills name + phone)…</option>
              {leaders.length > 0 && (
                <optgroup label="Leaders">
                  {leaders.map(l => (
                    <option key={l.id} value={`leader:${l.id}`}>
                      {l.name || '(unnamed)'}{l.phone ? ` · ${l.phone}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {friends.length > 0 && (
                <optgroup label="Friends">
                  {friends.map(f => (
                    <option key={f.id} value={`friend:${f.id}`}>
                      {f.name || '(unnamed)'}{f.phone ? ` · ${f.phone}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="yo-contact-fields">
              <input
                className="yps-input"
                placeholder="Contact name"
                value={item.contact}
                onChange={e => onChange({ contact: e.target.value })}
              />
              <input
                className="yps-input"
                placeholder="📞 Phone"
                value={item.contactPhone}
                onChange={e => onChange({ contactPhone: e.target.value })}
              />
            </div>
          </div>
        </Field>

        <Field label="Description" full>
          <textarea className="yps-textarea" rows={4} value={item.description} onChange={e => onChange({ description: e.target.value })} placeholder="What we're doing, why, who it's for…" />
        </Field>
      </div>

      <section className="yo-section">
        <h3 className="yo-section-title">Sign-ups ({item.signups?.length || 0} / {item.slotsTotal})</h3>
        <SignupAdder students={students} onAdd={addSignup} />
        {(item.signups || []).length === 0 ? (
          <div className="yps-muted yo-signup-empty">No sign-ups yet.</div>
        ) : (
          <ul className="yo-signup-list">
            {item.signups.map(s => (
              <SignupRow
                key={s.id}
                signup={s}
                student={s.studentId ? students.find(st => st.id === s.studentId) : null}
                onRemove={() => removeSignup(s.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="yo-section">
        <h3 className="yo-section-title">Notes</h3>
        <textarea className="yps-textarea" rows={3} value={item.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="Logistics, partner contacts, lessons learned…" />
      </section>

      <section className="yo-section">
        <header className="yo-section-hd">
          <h3 className="yo-section-title">Attachments</h3>
          <DocUploader onAddDoc={onAddDoc} />
        </header>
        {!docs || docs.length === 0 ? (
          <div className="yps-muted yo-doc-empty">
            No files attached yet. Upload permission slips, flyers, partner
            agreements, or photos — up to {Math.round(MAX_DOC_BYTES/1024)} KB each.
          </div>
        ) : (
          <ul className="yo-doc-list">
            {docs.map(d => (
              <li key={d.id} className="yo-doc-row">
                <a
                  className="yo-doc-link"
                  href={d.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`${d.name} — ${(d.size / 1024).toFixed(0)} KB`}
                >
                  <span className="yo-doc-icon">{fileEmoji(d.type, d.name)}</span>
                  <span className="yo-doc-name">{d.name}</span>
                  <span className="yo-doc-size">{(d.size / 1024).toFixed(0)} KB</span>
                </a>
                <button
                  type="button"
                  className="yo-doc-x"
                  onClick={() => onRemoveDoc(d.id)}
                  title="Remove this file"
                >✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* Pick an emoji based on file type / extension so the file list
   is scannable at a glance. */
function fileEmoji(mime, name = '') {
  const m = (mime || '').toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith('image/'))  return '🖼';
  if (m.startsWith('video/'))  return '🎬';
  if (m.startsWith('audio/'))  return '🎵';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return '📄';
  if (n.endsWith('.doc') || n.endsWith('.docx'))    return '📝';
  if (n.endsWith('.xls') || n.endsWith('.xlsx') || n.endsWith('.csv')) return '📊';
  if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z'))   return '🗜';
  return '📎';
}

/* Multi-file upload button. Files are read sequentially so concurrent
   writes to the same Firestore doc don't race. */
function DocUploader({ onAddDoc }) {
  const inputRef = useRef(null);
  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      await onAddDoc(f);
    }
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <label className="yo-doc-upload">
      <input ref={inputRef} type="file" multiple onChange={onPick} />
      <span>📎 Upload files</span>
    </label>
  );
}

/* Add-a-sign-up control — toggle between picking a student from
   the Students roster vs entering a custom name. When a student is
   picked we auto-populate three editable fields (student phone,
   parent name, parent phone) from the youth:students record so the
   organizer doesn't have to retype them. All fields are saved on
   the sign-up so the data travels with the outreach event even if
   the student record changes later. */
function SignupAdder({ students, onAdd }) {
  const [source,    setSource]    = useState('student'); // 'student' | 'custom'
  const [studentId, setStudentId] = useState('');
  const [name,      setName]      = useState('');
  const [phone,        setPhone]        = useState('');
  const [parentName,   setParentName]   = useState('');
  const [parentPhone,  setParentPhone]  = useState('');
  const [role,         setRole]         = useState('');

  /* When the picked student changes, auto-fill the three contact
     fields from the student's record. The user can still edit them
     before clicking ＋ Add. */
  const handleStudentPick = (id) => {
    setStudentId(id);
    const stu = students.find(s => s.id === id);
    if (stu) {
      setPhone(stu.phone || '');
      setParentName(stu.parentName || '');
      setParentPhone(stu.parentPhone || '');
    } else {
      setPhone(''); setParentName(''); setParentPhone('');
    }
  };

  const reset = () => {
    setStudentId(''); setName('');
    setPhone(''); setParentName(''); setParentPhone('');
    setRole('');
  };

  const submit = () => {
    if (source === 'student' && studentId) {
      const stu = students.find(s => s.id === studentId);
      if (!stu) return;
      onAdd({
        studentId:   stu.id,
        name:        stu.name || '(unnamed)',
        phone:       phone.trim(),
        parentName:  parentName.trim(),
        parentPhone: parentPhone.trim(),
        role:        role.trim(),
        note:        '',
      });
    } else if (source === 'custom' && name.trim()) {
      onAdd({
        name:        name.trim(),
        phone:       phone.trim(),
        parentName:  parentName.trim(),
        parentPhone: parentPhone.trim(),
        role:        role.trim(),
        note:        '',
      });
    } else {
      return;
    }
    reset();
  };

  const canSubmit = source === 'student' ? !!studentId : !!name.trim();

  return (
    <div className="yo-signup-add-wrap">
      <div className="yo-signup-source">
        <button
          className={`yps-chip ${source === 'student' ? 'on' : ''}`}
          onClick={() => { setSource('student'); }}
        >🧒 From students</button>
        <button
          className={`yps-chip ${source === 'custom' ? 'on' : ''}`}
          onClick={() => { setSource('custom'); reset(); }}
        >＋ Custom name</button>
      </div>

      <div className="yo-signup-add">
        {source === 'student' ? (
          <select
            className="yps-select"
            value={studentId}
            onChange={e => handleStudentPick(e.target.value)}
          >
            <option value="">— pick a student —</option>
            {students.length === 0 && <option disabled>No students in roster yet</option>}
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || '(unnamed)'}{s.grade ? ` · ${s.grade}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="yps-input"
            placeholder="Name (not in roster)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        )}
      </div>

      {/* Contact fields — shown for both student-picked and custom
          sign-ups. For students, auto-populated from the student
          record (editable to override per-event). For custom names,
          start empty and let the organizer type. */}
      {(source === 'custom' || (source === 'student' && studentId)) && (
        <div className="yo-signup-student-fields">
          <Field label="📞 Phone">
            <input
              className="yps-input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={source === 'student' ? '(auto-filled)' : 'Phone'}
            />
          </Field>
          <Field label="👤 Parent name">
            <input
              className="yps-input"
              value={parentName}
              onChange={e => setParentName(e.target.value)}
              placeholder={source === 'student' ? '(auto-filled)' : 'Parent name'}
            />
          </Field>
          <Field label="📞 Parent phone">
            <input
              className="yps-input"
              value={parentPhone}
              onChange={e => setParentPhone(e.target.value)}
              placeholder={source === 'student' ? '(auto-filled)' : 'Parent phone'}
            />
          </Field>
        </div>
      )}

      <div className="yo-signup-finalize">
        <input
          className="yps-input"
          placeholder="Role (optional)"
          value={role}
          onChange={e => setRole(e.target.value)}
        />
        <button className="yps-add-btn" onClick={submit} disabled={!canSubmit}>＋ Add</button>
      </div>
    </div>
  );
}

/* A single sign-up row. Student contact fields prefer the values
   stored on the sign-up (so the organizer's per-event edits stick)
   and fall back to live youth:students lookups when the sign-up
   has nothing stored yet — gives older sign-ups a graceful upgrade
   without re-picking the student. */
function SignupRow({ signup, student, onRemove }) {
  const phone       = signup.phone       || student?.phone       || '';
  const parentName  = signup.parentName  || student?.parentName  || '';
  const parentPhone = signup.parentPhone || student?.parentPhone || '';
  const parentEmail = student?.parentEmail || '';
  const hasAny      = phone || parentName || parentPhone || parentEmail;

  return (
    <li className="yo-signup-row">
      <div className="yo-signup-main">
        <span className="yo-signup-name">{signup.name || '(unnamed)'}</span>
        {student && <span className="yps-pill accent">student</span>}
        {!student && signup.studentId && <span className="yps-pill" title="Student record no longer found">student (removed)</span>}
        {signup.role && <span className="yps-pill">{signup.role}</span>}
        <button className="yps-btn ghost" onClick={onRemove}>✕</button>
      </div>
      {hasAny && (
        <div className="yo-signup-parent">
          {phone        && <span>📞 <b>{phone}</b></span>}
          {parentName   && <span>👤 Parent: <b>{parentName}</b></span>}
          {parentPhone  && <span>📞 {parentPhone}</span>}
          {parentEmail  && <span>✉️ {parentEmail}</span>}
        </div>
      )}
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────
   Organize tab — schedule, prep checklist, materials,
   role assignments, logistics notes. Downloads to a Word document.
   ───────────────────────────────────────────────────────────── */
function OrganizeTab({ item, onChange }) {
  const setList = (key, items) => onChange({ [key]: items });

  return (
    <div className="yo-organize">
      <div className="yo-organize-hd">
        <div>
          <h3 className="yo-section-title" style={{ margin: 0 }}>Organization plan</h3>
          <div className="yo-organize-sub">
            Schedule, prep, materials, and roles in one place — download it before the event.
          </div>
        </div>
        <button
          className="yps-add-btn"
          onClick={() => downloadOrganizePlan(item)}
          disabled={!hasAnyOrganizeContent(item)}
          title={hasAnyOrganizeContent(item) ? 'Download as Microsoft Word document' : 'Fill in at least one section first'}
        >📥 Download as Word</button>
      </div>

      {/* Schedule / run-of-show */}
      <ListBlock
        label="📋 Schedule / Run-of-show"
        items={item.schedule}
        onChange={(v) => setList('schedule', v)}
        shape={() => ({ id: makeId('sc'), time: '', duration: '', item: '', owner: '' })}
        emptyText="No schedule items yet. Build a timeline — doors open → activity → closing."
        head={<><span>Time</span><span>Min</span><span>Item</span><span>Owner</span><span /></>}
        render={(row, set) => (
          <>
            <div className="yo-block-time">
              <TimePicker compact value={row.time} onChange={(t) => set({ time: t })} />
            </div>
            <input className="yps-input yo-w-xs" value={row.duration} onChange={e => set({ duration: e.target.value })} placeholder="30" />
            <input className="yps-input"         value={row.item}     onChange={e => set({ item: e.target.value })} placeholder="What's happening" />
            <input className="yps-input yo-w-md" value={row.owner}    onChange={e => set({ owner: e.target.value })} placeholder="Owner" />
          </>
        )}
      />

      {/* Prep checklist — numbered, no checkboxes */}
      <ListBlock
        label="📝 Prep list"
        items={item.prepList}
        onChange={(v) => setList('prepList', v)}
        shape={() => ({ id: makeId('pp'), task: '' })}
        emptyText="No prep tasks yet."
        render={(row, set, i) => (
          <>
            <span className="yo-num">{i + 1}.</span>
            <input
              className="yps-input"
              value={row.task}
              onChange={e => set({ task: e.target.value })}
              placeholder="Reserve venue, send permission slips, etc."
            />
          </>
        )}
      />

      {/* Materials */}
      <ListBlock
        label="📦 Materials"
        items={item.materials}
        onChange={(v) => setList('materials', v)}
        shape={() => ({ id: makeId('mt'), item: '', qty: '', source: '' })}
        emptyText="No materials listed yet."
        head={<><span>Item</span><span>Qty</span><span>Source</span><span /></>}
        render={(row, set) => (
          <>
            <input className="yps-input"         value={row.item}   onChange={e => set({ item: e.target.value })} placeholder="What you need" />
            <input className="yps-input yo-w-xs" value={row.qty}    onChange={e => set({ qty: e.target.value })}  placeholder="qty" />
            <input className="yps-input yo-w-md" value={row.source} onChange={e => set({ source: e.target.value })} placeholder="Church / purchase / donated" />
          </>
        )}
      />

      {/* Role assignments — Person field is a datalist of every
          name signed up to this outreach, so the organizer can pick
          a signed-up person without retyping. Free-text entry is
          still allowed for guests / volunteers outside the sign-up. */}
      <ListBlock
        label="👥 Role assignments"
        items={item.assignments}
        onChange={(v) => setList('assignments', v)}
        shape={() => ({ id: makeId('as'), role: '', person: '' })}
        emptyText="No role assignments yet."
        head={<><span>Role</span><span>Person</span><span /></>}
        render={(row, set) => (
          <>
            <input className="yps-input" value={row.role} onChange={e => set({ role: e.target.value })} placeholder="Setup lead, MC, prayer point…" />
            <input
              className="yps-input"
              list={`yo-people-${item.id}`}
              value={row.person}
              onChange={e => set({ person: e.target.value })}
              placeholder="Pick a signed-up person or type custom"
            />
          </>
        )}
      />
      <datalist id={`yo-people-${item.id}`}>
        {(item.signups || []).map(s => (
          <option key={s.id} value={s.name || ''} />
        ))}
      </datalist>

      {/* Logistics notes */}
      <section className="yo-section yo-section-flat">
        <h3 className="yo-section-title">📝 Logistics notes</h3>
        <textarea
          className="yps-textarea"
          rows={4}
          value={item.logistics}
          onChange={e => onChange({ logistics: e.target.value })}
          placeholder="Parking, weather backup, dietary needs, key contacts, anything else worth printing…"
        />
      </section>
    </div>
  );
}

/* Returns true if any of the Organize-tab fields has user content. */
function hasAnyOrganizeContent(item) {
  return (
    (item.schedule    || []).some(r => r.time || r.item || r.owner) ||
    (item.prepList    || []).some(r => r.task) ||
    (item.materials   || []).some(r => r.item || r.qty || r.source) ||
    (item.assignments || []).some(r => r.role || r.person) ||
    (item.logistics  && item.logistics.trim().length > 0)
  );
}

/* Build a Microsoft-Word-compatible document and trigger a download.
   Strategy: HTML-content with a .doc extension and the msword MIME
   type — Word opens this natively and renders our CSS. No npm dep
   required, and the file remains editable in Word like any other doc. */
function downloadOrganizePlan(item) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sections = [];

  /* Header */
  const meta = [];
  if (item.date || item.time) meta.push([item.date, item.time].filter(Boolean).join(' · '));
  if (item.location)          meta.push(`📍 ${item.location}`);
  if (item.contact || item.contactPhone) {
    const phone = item.contactPhone ? ` · 📞 ${esc(item.contactPhone)}` : '';
    meta.push(`👤 ${esc(item.contact || '—')}${phone}`);
  }
  const header = `
    <h1 style="margin:0 0 4px;font-family:'Calibri',sans-serif;font-size:22pt;color:#222;">
      ${esc(item.name || 'Untitled outreach')}
    </h1>
    <div style="font-size:11pt;color:#666;margin-bottom:6px;">Organization Plan</div>
    ${meta.length
      ? `<div style="font-size:11pt;color:#444;margin-bottom:18px;">${meta.map(esc).join('<br/>')}</div>`
      : ''}
  `;

  /* Schedule */
  const sched = (item.schedule || []).filter(r => r.time || r.item || r.owner);
  if (sched.length) {
    sections.push(`
      <h2 style="font-family:'Calibri',sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:18px;">Schedule</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">
        <thead><tr style="background:#f3f3f3;">
          <th style="text-align:left;padding:6px;border:1px solid #ccc;width:90px;">Time</th>
          <th style="text-align:left;padding:6px;border:1px solid #ccc;width:60px;">Min</th>
          <th style="text-align:left;padding:6px;border:1px solid #ccc;">Item</th>
          <th style="text-align:left;padding:6px;border:1px solid #ccc;width:130px;">Owner</th>
        </tr></thead>
        <tbody>
          ${sched.map(r => `
            <tr>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.time || '—')}</td>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.duration || '')}</td>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.item || '—')}</td>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.owner || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `);
  }

  /* Prep list — numbered */
  const prep = (item.prepList || []).filter(r => r.task);
  if (prep.length) {
    sections.push(`
      <h2 style="font-family:'Calibri',sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:18px;">Prep List</h2>
      <ol style="font-size:11pt;padding-left:24px;">
        ${prep.map(r => `<li style="margin-bottom:4px;">${esc(r.task)}</li>`).join('')}
      </ol>
    `);
  }

  /* Materials */
  const mats = (item.materials || []).filter(r => r.item || r.qty || r.source);
  if (mats.length) {
    sections.push(`
      <h2 style="font-family:'Calibri',sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:18px;">Materials</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">
        <thead><tr style="background:#f3f3f3;">
          <th style="text-align:left;padding:6px;border:1px solid #ccc;">Item</th>
          <th style="text-align:left;padding:6px;border:1px solid #ccc;width:80px;">Qty</th>
          <th style="text-align:left;padding:6px;border:1px solid #ccc;width:160px;">Source</th>
        </tr></thead>
        <tbody>
          ${mats.map(r => `
            <tr>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.item || '—')}</td>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.qty || '')}</td>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.source || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `);
  }

  /* Role assignments */
  const roles = (item.assignments || []).filter(r => r.role || r.person);
  if (roles.length) {
    sections.push(`
      <h2 style="font-family:'Calibri',sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:18px;">Role Assignments</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">
        <thead><tr style="background:#f3f3f3;">
          <th style="text-align:left;padding:6px;border:1px solid #ccc;width:40%;">Role</th>
          <th style="text-align:left;padding:6px;border:1px solid #ccc;">Person</th>
        </tr></thead>
        <tbody>
          ${roles.map(r => `
            <tr>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.role || '—')}</td>
              <td style="padding:6px;border:1px solid #ccc;">${esc(r.person || '(unassigned)')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `);
  }

  /* Sign-ups */
  const signups = (item.signups || []);
  if (signups.length) {
    sections.push(`
      <h2 style="font-family:'Calibri',sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:18px;">Sign-ups (${signups.length}/${item.slotsTotal})</h2>
      <ul style="font-size:11pt;padding-left:22px;">
        ${signups.map(s => {
          const role = s.role ? ` <em style="color:#666;">[${esc(s.role)}]</em>` : '';
          const contactBits = [
            s.phone       && `📞 ${esc(s.phone)}`,
            s.parentName  && `👤 Parent: ${esc(s.parentName)}`,
            s.parentPhone && `📞 ${esc(s.parentPhone)}`,
          ].filter(Boolean);
          const contact = contactBits.length
            ? `<div style="color:#555;font-size:10pt;margin-left:6px;">${contactBits.join(' · ')}</div>`
            : '';
          return `<li style="margin-bottom:5px;">${esc(s.name)}${role}${contact}</li>`;
        }).join('')}
      </ul>
    `);
  }

  /* Logistics */
  if (item.logistics && item.logistics.trim()) {
    sections.push(`
      <h2 style="font-family:'Calibri',sans-serif;font-size:14pt;color:#333;border-bottom:2px solid #888;padding-bottom:2px;margin-top:18px;">Logistics Notes</h2>
      <p style="font-size:11pt;white-space:pre-wrap;">${esc(item.logistics.trim())}</p>
    `);
  }

  /* Word-friendly HTML doc. The xmlns:o/xmlns:w hints + the
     ProgId/Generator meta ensure Word treats this as a proper
     Word document instead of a plain web page. */
  const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="Microsoft Word 15" />
  <meta name="Originator" content="Microsoft Word 15" />
  <title>${esc(item.name || 'Outreach')} — Organization Plan</title>
  <style>
    @page { size: Letter; margin: 0.75in; }
    body  { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; color: #222; }
  </style>
</head>
<body>
${header}
${sections.join('\n')}
</body>
</html>`;

  /* application/msword + .doc extension is the long-standing
     way to deliver HTML content that Word opens natively. */
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = slugify(item.name || 'outreach') + '-organization-plan.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slugify(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'outreach';
}

/* ─────────────────────────────────────────────────────────────
   Tiny reusable list editor used by every Organize section.
   ───────────────────────────────────────────────────────────── */
function ListBlock({ label, items, onChange, shape, render, emptyText, head }) {
  const add = () => onChange([...(items || []), shape()]);
  const update = (id, patch) => onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id) => onChange(items.filter(i => i.id !== id));

  return (
    <section className="yo-section yo-section-flat">
      <header className="yo-block-hd">
        <h3 className="yo-section-title">{label}</h3>
        <button className="yps-btn" onClick={add}>＋ Add</button>
      </header>
      {(!items || items.length === 0) ? (
        <div className="yps-muted yo-block-empty">{emptyText}</div>
      ) : (
        <ul className="yo-block-list">
          {head && <li className="yo-block-row yo-block-row-head">{head}</li>}
          {items.map((row, i) => (
            <li key={row.id} className="yo-block-row">
              {render(row, (patch) => update(row.id, patch), i)}
              <button className="yps-btn ghost" onClick={() => remove(row.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`yo-field ${full ? 'full' : ''}`}>
      <span className="yo-field-label">{label}</span>
      {children}
    </label>
  );
}

/* Three-select time picker: Hours / Minutes / AM-PM. Reads from
   and writes back the same "9:00 AM" string the rest of the app
   already uses, so it drops into any existing time field. */
function TimePicker({ value, onChange, compact }) {
  const p = parseTime(value);
  const setPart = (patch) => onChange(formatTime({ ...p, ...patch }));
  return (
    <div className={`yo-tp ${compact ? 'yo-tp-compact' : ''}`}>
      <select
        className="yps-select yo-tp-hh"
        value={p.hh}
        onChange={e => setPart({ hh: e.target.value })}
        aria-label="Hour"
      >
        <option value="">—</option>
        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="yo-tp-sep">:</span>
      <select
        className="yps-select yo-tp-mm"
        value={p.mm}
        onChange={e => setPart({ mm: e.target.value })}
        aria-label="Minute"
      >
        {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        className="yps-select yo-tp-ap"
        value={p.ap}
        onChange={e => setPart({ ap: e.target.value })}
        aria-label="AM/PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
