import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useBands, suggestBandForBirthday } from './bandsConfig';
/* Reuse the All Students two-pane styling so the two roster pages
   feel identical across ministries. Same .ys-* class system, just
   wired to children's data + a kids-specific accent. */
import '../youth/AllStudents.css';
import './AllKids.css';

/* Children's → All Kids
   Storage: childrens:kids — same two-pane shell as All Students,
   with allergy / parent / pickup / medical fields tailored for
   the under-12 set. */

const ACCENT = 'var(--accent-blue, #60a5fa)';
const GRADES = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th'];
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* Birthday → calendar sync. Pink so it visually reads as a
   celebration rather than a routine youth event. Mirrors the
   leader-renewal sync pattern from Parents/Leaders. */
const CAL_SOURCE = 'children-kid';
const CAL_COLOR  = '#f472b6';

/* Salvation / Baptism live under a Spiritual Milestones section
   that only surfaces once the kid hits these grades. Younger kids
   keep the form clean — those questions tend to get asked once a
   child can engage with the ideas themselves. */
const SPIRITUAL_GRADES = new Set(['4th', '5th']);

function nextAnniversaryISO(iso) {
  if (!iso) return '';
  /* Parse YYYY-MM-DD as LOCAL midnight, not UTC. `new Date('2018-05-15')`
     parses as midnight UTC; in any negative-UTC timezone the local
     month/day shift back by a day, which would put the birthday on
     the wrong calendar square (or skip it entirely for late-month
     birthdays). Splitting the parts dodges the whole problem. */
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const month = Number(m[2]) - 1;
  const day   = Number(m[3]);
  const now = new Date();
  const t0  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next  = new Date(now.getFullYear(), month, day);
  if (next.getTime() < t0.getTime()) {
    next = new Date(now.getFullYear() + 1, month, day);
  }
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

const DEFAULT_KID = () => ({
  id:               makeId('k'),
  name:             '',
  birthday:         '',
  syncBirthdayToCalendar: false,    // opt-in per kid (parents have to opt in to surface birthdays)
  ageBand:          '',             // assigned when user picks (or auto-suggest from birthday)
  grade:            '',
  parentName:       '',
  parentPhone:      '',
  parentEmail:      '',
  pickupAdults:     [],            // [{ id, name, phone, relationship }]
  emergencyContact: '',
  allergies:        '',
  medications:      '',
  medicalNotes:     '',
  notes:            '',
  active:           true,
  joinedDate:       new Date().toISOString().slice(0, 10),
  salvationDate:    '',
  baptismDate:      '',
  firstAttended:    '',
  lastAttended:     '',
  preferredLanguage:'',
  createdAt:        Date.now(),
});

export default function ChildrensAllKids() {
  const [kids, setKids, { loading }] = useUserStoreKey('childrens:kids', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const [bands] = useBands();
  const list = Array.isArray(kids) ? kids : [];
  /* Labels of currently-configured bands — used to detect kids
     whose stored band has been removed (orphans). */
  const knownLabels = useMemo(() => new Set(bands.map(b => b.label)), [bands]);

  /** Rebuild this kid's birthday calendar event from scratch. When
   *  the toggle is off (or there's no birthday), the event is just
   *  removed. Idempotent — safe to call on every update. */
  const syncBirthdayCalendarFor = (kid) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const sourceId = `${kid.id}__bday`;
      const others = evList.filter(e => !(e.source === CAL_SOURCE && e.source_id === sourceId));
      if (!kid.syncBirthdayToCalendar || !kid.birthday) return others;
      const date = nextAnniversaryISO(kid.birthday);
      if (!date) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_bday_' + Math.random().toString(36).slice(2, 6),
        created_at: new Date().toISOString(),
        title:        `🎂 ${kid.name || 'Kid'}'s birthday`,
        description:  kid.birthday ? `Born ${kid.birthday}.` : '',
        event_date:   date,
        end_date:     '',
        event_time:   '',
        color:        CAL_COLOR,
        category:     'children',
        source:       CAL_SOURCE,
        source_id:    sourceId,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeBirthdayCalendarFor = (kidId) => {
    setCalendarEvents(prev => (prev || []).filter(e =>
      !(e.source === CAL_SOURCE && (e.source_id || '').startsWith(`${kidId}__`))
    ));
  };

  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');   // 'name' | 'age' | 'joined'

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* Derived: filtered + sorted list shown in the left column. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(k =>
          (k.name || '').toLowerCase().includes(q) ||
          (k.parentName || '').toLowerCase().includes(q) ||
          (k.ageBand || '').toLowerCase().includes(q))
      : list;
    out = [...out];
    if (sortBy === 'name')   out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'age')    out.sort((a, b) => AGE_BANDS.indexOf(a.ageBand || '') - AGE_BANDS.indexOf(b.ageBand || ''));
    if (sortBy === 'joined') out.sort((a, b) => (b.joinedDate || '').localeCompare(a.joinedDate || ''));
    return out;
  }, [list, query, sortBy]);

  const selected = useMemo(
    () => list.find(k => k.id === selectedId) || null,
    [list, selectedId]
  );

  /* ── Actions ────────────────────────────────────────────── */
  const addKid = () => {
    /* Seed the new kid's band from the first configured band so the
       dropdown isn't empty. */
    const k = { ...DEFAULT_KID(), ageBand: bands[0]?.label || '' };
    setKids(prev => [...(prev || []), k]);
    setSelectedId(k.id);
  };
  const updateKid = (id, patch) => {
    /* Pure setter — no side effects in the updater (StrictMode
       runs updaters twice in dev, which would either drop or
       duplicate the calendar event). The sync runs AFTER the
       setter is queued, using the current closure of `list` to
       compose what the kid will look like post-patch. */
    setKids(prev => (prev || []).map(k => k.id === id ? { ...k, ...patch } : k));
    const current = list.find(k => k.id === id);
    if (current) syncBirthdayCalendarFor({ ...current, ...patch });
  };
  const removeKid = (id) => {
    setKids(prev => (prev || []).filter(k => k.id !== id));
    removeBirthdayCalendarFor(id);
    if (selectedId === id) setSelectedId(null);
  };

  /* Stats: total + how many have any medical flag. */
  const stats = useMemo(() => ({
    total: list.length,
    medical: list.filter(k => (k.allergies || '').trim() || (k.medications || '').trim() || (k.medicalNotes || '').trim()).length,
  }), [list]);

  return (
    <ChildrensShell
      groupLabel="Kids" groupIcon="👶"
      icon="🧒" title="All Kids"
      accent={ACCENT}
      actions={
        <button type="button" className="ys-add-btn" onClick={addKid}>
          ＋ Add kid
        </button>
      }
      stats={[
        { n: stats.total, label: 'total' },
        { n: stats.medical, label: 'with medical flags' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {/* Two-pane body: list on the left, detail on the right */}
      <section className="ys-body">

            {/* Left: list */}
            <aside className="ys-list-pane">
              <div className="ys-list-tools">
                <input
                  type="text"
                  className="ys-search"
                  placeholder="Search by name, parent, age band…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <select
                  className="ys-sort"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  title="Sort"
                >
                  <option value="name">Name (A–Z)</option>
                  <option value="age">Age band</option>
                  <option value="joined">Recently joined</option>
                </select>
              </div>

              <div className="ys-list">
                {loading && list.length === 0 && (
                  <div className="ys-list-empty">Loading…</div>
                )}
                {!loading && visible.length === 0 && (
                  <div className="ys-list-empty">
                    {list.length === 0
                      ? 'No kids yet. Click "＋ Add kid" to start your roster.'
                      : 'No matches for your search.'}
                  </div>
                )}
                {visible.map(k => {
                  const isOn = selectedId === k.id;
                  const flagged = !!(k.allergies || '').trim();
                  const orphan = k.ageBand && !knownLabels.has(k.ageBand);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      className={`ys-row${isOn ? ' on' : ''}`}
                      onClick={() => setSelectedId(k.id)}
                    >
                      <span className="ys-row-avatar" aria-hidden="true">
                        {(k.name || '?').trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <span className="ys-row-info">
                        <span className="ys-row-name">{k.name || '(no name)'}</span>
                        <span className="ys-row-sub">
                          {k.ageBand || '(no band)'}{k.grade ? ` · ${k.grade}` : ''}
                        </span>
                      </span>
                      {orphan && (
                        <span className="ys-row-tag" title={`"${k.ageBand}" isn't a current band — reassign in the form.`} style={{ background: 'rgba(251,191,36,0.26)', color: '#92400e' }}>
                          NEEDS BAND
                        </span>
                      )}
                      {flagged && !orphan && (
                        <span className="ys-row-tag" title={k.allergies} style={{ background: 'rgba(239,68,68,0.18)', color: '#b91c1c' }}>
                          ⚠ ALLERGY
                        </span>
                      )}
                      {!k.active && !flagged && !orphan && (
                        <span className="ys-row-tag">PAUSED</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right: detail / editor */}
            <section className="ys-detail">
              {!selected ? (
                <div className="ys-empty">
                  <div className="ys-empty-icon" aria-hidden="true">🧒</div>
                  <h2 className="ys-empty-title">Pick a kid</h2>
                  <p className="ys-empty-copy">
                    Select someone from the list to view + edit their info, or
                    click <b>＋ Add kid</b> above to create a new entry.
                  </p>
                </div>
              ) : (
                <KidForm
                  key={selected.id}
                  kid={selected}
                  bands={bands}
                  onChange={(patch) => updateKid(selected.id, patch)}
                  onDelete={() => removeKid(selected.id)}
                />
              )}
            </section>
          </section>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

/* ── Detail / edit form for one kid ────────────────────────── */
function KidForm({ kid, bands, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  /* Compute a band suggestion from the birthday. If it differs from
     the current ageBand AND a birthday is set, show a one-click
     "Apply" chip. Skips when the band is already correct or empty
     (no birthday = nothing to suggest). */
  const suggestedBand = suggestBandForBirthday(kid.birthday, bands);
  const showSuggest = !!kid.birthday && !!suggestedBand && suggestedBand !== kid.ageBand;
  const knownLabels = new Set(bands.map(b => b.label));
  const isOrphan = !!kid.ageBand && !knownLabels.has(kid.ageBand);

  /* Pickup-adult mutations — kept on the kid object so the data
     travels with the rest of the record. */
  const addAdult = () => {
    const adult = { id: 'pa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), name: '', phone: '', relationship: '' };
    onChange({ pickupAdults: [...(kid.pickupAdults || []), adult] });
  };
  const patchAdult = (adultId, patch) =>
    onChange({
      pickupAdults: (kid.pickupAdults || []).map(a => a.id === adultId ? { ...a, ...patch } : a),
    });
  const removeAdult = (adultId) =>
    onChange({ pickupAdults: (kid.pickupAdults || []).filter(a => a.id !== adultId) });

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <h2 className="ys-form-title">{kid.name || '(unnamed)'}</h2>
        <button
          type="button"
          className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onDelete(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >
          {confirmDel ? 'Click again to delete' : '🗑 Delete'}
        </button>
      </div>

      <Section title="Basics">
        <Row>
          <Field label="Name">
            <input type="text" className="ys-inp" value={kid.name || ''} onChange={set('name')} />
          </Field>
          <Field label="Age band">
            <select className="ys-inp" value={kid.ageBand || ''} onChange={set('ageBand')}>
              <option value="">— Pick a band</option>
              {bands.map(b => <option key={b.id || b.label} value={b.label}>{b.label}</option>)}
              {/* If the kid has an orphan band that's no longer in the
                  bands list, keep it as an option so the dropdown
                  still reflects the stored value until they pick a real one. */}
              {isOrphan && <option value={kid.ageBand}>{kid.ageBand} (removed)</option>}
            </select>
            {showSuggest && (
              <button
                type="button"
                className="ck-suggest"
                onClick={() => onChange({ ageBand: suggestedBand })}
                title={`Based on birthday ${kid.birthday}, this kid likely fits "${suggestedBand}"`}
              >
                💡 Suggest: <b>{suggestedBand}</b>
              </button>
            )}
            {isOrphan && (
              <div className="ck-orphan-hint">
                ⚠ "{kid.ageBand}" isn't a current band. Pick a new one from the list above.
              </div>
            )}
          </Field>
        </Row>
        <Row>
          <Field label="Grade">
            <select className="ys-inp" value={kid.grade || ''} onChange={set('grade')}>
              <option value="">—</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Birthday">
            <input type="date" className="ys-inp" value={kid.birthday || ''} onChange={set('birthday')} />
            {/* Sync this kid's birthday to the Calendar (annual event,
                pink). Disabled until a birthday is set since there'd
                be nothing to sync. */}
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 9px', marginTop: 4,
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(30,41,59,0.12)',
                borderRadius: 8, fontSize: 12,
                cursor: kid.birthday ? 'pointer' : 'not-allowed',
                opacity: kid.birthday ? 1 : 0.55,
                color: kid.syncBirthdayToCalendar ? 'var(--ys-accent)' : 'var(--text-secondary)',
              }}
              title={kid.birthday ? 'Add this birthday as a yearly Calendar event' : 'Pick a birthday first'}
            >
              <input
                type="checkbox"
                checked={!!kid.syncBirthdayToCalendar}
                disabled={!kid.birthday}
                onChange={set('syncBirthdayToCalendar')}
                style={{ accentColor: 'var(--ys-accent)' }}
              />
              <span>📆 Sync birthday to Calendar</span>
            </label>
          </Field>
        </Row>
        <Row>
          <Field label="Active">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 9, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(30,41,59,0.14)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!kid.active} onChange={set('active')} />
              <span>Currently in program</span>
            </label>
          </Field>
        </Row>
      </Section>

      <Section title="Parent / Guardian">
        <Row>
          <Field label="Name">
            <input type="text" className="ys-inp" value={kid.parentName || ''} onChange={set('parentName')} />
          </Field>
        </Row>
        <Row>
          <Field label="Phone">
            <input type="tel" className="ys-inp" value={kid.parentPhone || ''} onChange={set('parentPhone')} />
          </Field>
          <Field label="Email">
            <input type="email" className="ys-inp" value={kid.parentEmail || ''} onChange={set('parentEmail')} />
          </Field>
        </Row>
        <Row>
          <Field label="Preferred language">
            <select className="ys-inp" value={kid.preferredLanguage || ''} onChange={set('preferredLanguage')}>
              <option value="">— (default)</option>
              <option value="English">🇺🇸 English</option>
              <option value="Spanish">🇪🇸 Español</option>
            </select>
          </Field>
          <Field label="Emergency contact">
            <input type="text" className="ys-inp" value={kid.emergencyContact || ''} onChange={set('emergencyContact')} placeholder="Name + phone" />
          </Field>
        </Row>
      </Section>

      <Section title="Pickup Authorization">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
          The primary parent is always authorized. Add grandparents, godparents, after-school caregivers, etc. here.
        </div>
        {(kid.pickupAdults || []).length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0 8px' }}>
            No extra adults yet.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kid.pickupAdults.map(a => (
              <li key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr auto', gap: 6, alignItems: 'center' }}>
                <input type="text" className="ys-inp" placeholder="Full name" value={a.name} onChange={e => patchAdult(a.id, { name: e.target.value })} />
                <input type="tel"  className="ys-inp" placeholder="Phone" value={a.phone} onChange={e => patchAdult(a.id, { phone: e.target.value })} />
                <input type="text" className="ys-inp" placeholder="Relationship" value={a.relationship} onChange={e => patchAdult(a.id, { relationship: e.target.value })} />
                <button type="button" className="ys-del-btn" style={{ padding: '6px 10px' }} onClick={() => removeAdult(a.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addAdult}>＋ Add adult</button>
      </Section>

      <Section title="Medical">
        <Field label="Allergies">
          <input type="text" className="ys-inp" value={kid.allergies || ''} onChange={set('allergies')} placeholder="Peanuts, dairy, etc." />
        </Field>
        <Field label="Medications">
          <input type="text" className="ys-inp" value={kid.medications || ''} onChange={set('medications')} placeholder="Inhaler, EpiPen, etc." />
        </Field>
        <Field label="Medical / other notes">
          <textarea className="ys-inp ys-textarea" rows={2} value={kid.medicalNotes || ''} onChange={set('medicalNotes')} placeholder="Special needs, behavioral notes, anything important…" />
        </Field>
      </Section>

      <Section title="Milestones">
        <Row>
          <Field label="Joined">
            <input type="date" className="ys-inp" value={kid.joinedDate || ''} onChange={set('joinedDate')} />
          </Field>
        </Row>
        {/* Spiritual milestones are gated by grade — Salvation +
            Baptism fields surface only once the kid is in 4th grade
            or beyond. Keeps the form clean for the under-9 crowd
            where those questions don't usually apply yet. */}
        {SPIRITUAL_GRADES.has(kid.grade) && (
          <Row>
            <Field label="Salvation">
              <input type="date" className="ys-inp" value={kid.salvationDate || ''} onChange={set('salvationDate')} />
            </Field>
            <Field label="Baptism">
              <input type="date" className="ys-inp" value={kid.baptismDate || ''} onChange={set('baptismDate')} />
            </Field>
          </Row>
        )}
        {!SPIRITUAL_GRADES.has(kid.grade) && (kid.salvationDate || kid.baptismDate) && (
          /* Quiet hint if older dates exist but the grade is now
             below the threshold — usually means a grade typo. */
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 6 }}>
            Salvation / Baptism dates are stored but hidden — they show once the grade is 4th or higher.
          </div>
        )}
      </Section>

      <Section title="Attendance">
        <Row>
          <Field label="First attended">
            <input type="date" className="ys-inp" value={kid.firstAttended || ''} onChange={set('firstAttended')} />
          </Field>
          <Field label="Last attended">
            <input type="date" className="ys-inp" value={kid.lastAttended || ''} onChange={set('lastAttended')} />
          </Field>
        </Row>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', fontStyle: 'italic', marginTop: 6 }}>
          Auto-updated when you check kids in on the Check-In Station.
        </div>
      </Section>

      <Section title="Notes">
        <Field label="General notes">
          <textarea className="ys-inp ys-textarea" rows={3} value={kid.notes || ''} onChange={set('notes')} />
        </Field>
      </Section>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <section className="ys-section">
      <h3 className="ys-section-title">{title}</h3>
      <div className="ys-section-body">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
