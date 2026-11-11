import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Crafts & Activities
   Storage: childrens:crafts — searchable catalog. */

const ACCENT = 'var(--accent-teal, #2dd4bf)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const AGE_BANDS = ['Nursery (0-2)', 'Toddler (2-3)', 'Preschool (3-5)', 'K-2nd', '3rd-5th', 'All ages'];
const PREP_LEVELS  = ['Low', 'Medium', 'High'];
const MESS_LEVELS  = ['Low', 'Medium', 'High'];
const KINDS = ['Craft', 'Game', 'Snack', 'Object lesson', 'Movement', 'Worship'];

const DEFAULT_CRAFT = () => ({
  id:           makeId('cr'),
  name:         '',
  kind:         'Craft',
  ageBand:      'K-2nd',
  prepLevel:    'Medium',
  messLevel:    'Medium',
  prepMinutes:  10,
  supplies:     '',
  instructions: '',
  notes:        '',
  createdAt:    Date.now(),
});

export default function ChildrensCrafts() {
  const [crafts, setCrafts, { loading }] = useUserStoreKey('childrens:crafts', []);
  const list = Array.isArray(crafts) ? crafts : [];

  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState('All');
  const [kindFilter, setKindFilter] = useState('All');
  const [messFilter, setMessFilter] = useState('All');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(c => bandFilter === 'All' ? true : c.ageBand === bandFilter)
      .filter(c => kindFilter === 'All' ? true : c.kind === kindFilter)
      .filter(c => messFilter === 'All' ? true : c.messLevel === messFilter)
      .filter(c => !q || (c.name || '').toLowerCase().includes(q) ||
                         (c.supplies || '').toLowerCase().includes(q) ||
                         (c.instructions || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query, bandFilter, kindFilter, messFilter]);

  const add = () => {
    const c = DEFAULT_CRAFT();
    setCrafts(prev => [...(prev || []), c]);
    setOpenId(c.id);
  };
  const update = (id, patch) =>
    setCrafts(prev => (prev || []).map(c => c.id === id ? { ...c, ...patch } : c));
  const remove = (id) => {
    if (!confirm('Delete this activity?')) return;
    setCrafts(prev => (prev || []).filter(c => c.id !== id));
    if (openId === id) setOpenId(null);
  };

  const open = openId ? list.find(c => c.id === openId) : null;

  return (
    <ChildrensShell
      groupLabel="Curriculum" groupIcon="📖"
      icon="✂" title="Crafts & Activities"
      accent={ACCENT}
      subtitle="Filterable catalog by age, prep time, mess level, supplies."
      actions={<button className="yps-add-btn" onClick={add}>＋ New activity</button>}
      stats={[
        { n: list.length, label: 'in catalog' },
        { n: list.filter(c => c.prepLevel === 'Low').length, label: 'low prep' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input className="yps-input" placeholder="Search by name, supplies…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="cm-chips">
        <span className="cm-chip-label">Age:</span>
        <button className={`yps-chip ${bandFilter === 'All' ? 'on' : ''}`} onClick={() => setBandFilter('All')}>All</button>
        {AGE_BANDS.map(b => <button key={b} className={`yps-chip ${bandFilter === b ? 'on' : ''}`} onClick={() => setBandFilter(b)}>{b}</button>)}
      </div>
      <div className="cm-chips">
        <span className="cm-chip-label">Kind:</span>
        <button className={`yps-chip ${kindFilter === 'All' ? 'on' : ''}`} onClick={() => setKindFilter('All')}>All</button>
        {KINDS.map(k => <button key={k} className={`yps-chip ${kindFilter === k ? 'on' : ''}`} onClick={() => setKindFilter(k)}>{k}</button>)}
      </div>
      <div className="cm-chips">
        <span className="cm-chip-label">Mess:</span>
        <button className={`yps-chip ${messFilter === 'All' ? 'on' : ''}`} onClick={() => setMessFilter('All')}>All</button>
        {MESS_LEVELS.map(m => <button key={m} className={`yps-chip ${messFilter === m ? 'on' : ''}`} onClick={() => setMessFilter(m)}>{m}</button>)}
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">✂</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">✂</div><div className="cm-empty-title">{list.length === 0 ? 'No activities yet' : 'No matches'}</div><div className="cm-empty-sub">{list.length === 0 ? 'Build your first one.' : 'Try different filters.'}</div></div>
      ) : (
        <div className="cm-grid">
          {visible.map(c => (
            <article key={c.id} className="cm-card" onClick={() => setOpenId(c.id)}>
              <div className="cm-card-hd">
                <h3 className="cm-card-title">{c.name || 'Untitled'}</h3>
                <span className="yps-pill">{c.kind}</span>
              </div>
              <div className="cm-card-meta">
                <span className="yps-pill">{c.ageBand}</span>
                <span className={`yps-pill ${c.prepLevel === 'Low' ? 'cm-good' : c.prepLevel === 'Medium' ? 'cm-warn' : 'cm-bad'}`}>Prep: {c.prepLevel}</span>
                <span className={`yps-pill ${c.messLevel === 'Low' ? 'cm-good' : c.messLevel === 'Medium' ? 'cm-warn' : 'cm-bad'}`}>Mess: {c.messLevel}</span>
                {c.prepMinutes > 0 && <span className="yps-pill">{c.prepMinutes}m</span>}
              </div>
              {c.supplies && <div className="cm-card-sub"><b>Need:</b> {c.supplies}</div>}
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.name || 'New activity'}</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div className="cm-modal-body">
              <Field label="Name" full><input className="yps-input" value={open.name} onChange={e => update(open.id, { name: e.target.value })} /></Field>
              <Field label="Kind">
                <select className="yps-select" value={open.kind} onChange={e => update(open.id, { kind: e.target.value })}>
                  {KINDS.map(k => <option key={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="Age band">
                <select className="yps-select" value={open.ageBand} onChange={e => update(open.id, { ageBand: e.target.value })}>
                  {AGE_BANDS.map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Prep level">
                <select className="yps-select" value={open.prepLevel} onChange={e => update(open.id, { prepLevel: e.target.value })}>
                  {PREP_LEVELS.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Mess level">
                <select className="yps-select" value={open.messLevel} onChange={e => update(open.id, { messLevel: e.target.value })}>
                  {MESS_LEVELS.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Prep minutes"><input type="number" min={0} className="yps-input" value={open.prepMinutes} onChange={e => update(open.id, { prepMinutes: Number(e.target.value) || 0 })} /></Field>
              <Field label="Supplies" full><input className="yps-input" value={open.supplies} onChange={e => update(open.id, { supplies: e.target.value })} placeholder="Paper plates, glue, washable markers…" /></Field>
              <Field label="Instructions" full>
                <textarea className="yps-textarea" rows={6} value={open.instructions} onChange={e => update(open.id, { instructions: e.target.value })} placeholder="Step-by-step." />
              </Field>
              <Field label="Notes" full><textarea className="yps-textarea" rows={2} value={open.notes} onChange={e => update(open.id, { notes: e.target.value })} /></Field>
            </div>
            <footer className="cm-modal-ft">
              <button className="yps-btn danger" onClick={() => remove(open.id)}>🗑 Delete</button>
              <button className="yps-add-btn" onClick={() => setOpenId(null)}>Done</button>
            </footer>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`cm-field ${full ? 'full' : ''}`}>
      <span className="cm-field-label">{label}</span>
      {children}
    </label>
  );
}
