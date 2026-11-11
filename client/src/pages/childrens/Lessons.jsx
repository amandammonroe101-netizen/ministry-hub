import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Lessons & Series
   Storage: childrens:lessons — array of lesson objects. Lighter
   weight than Youth Lessons (no series/many-to-many) since
   children's curriculum is usually flatter. */

const ACCENT = 'var(--accent-teal, #2dd4bf)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const AGE_BANDS = ['Nursery (0-2)', 'Toddler (2-3)', 'Preschool (3-5)', 'K-2nd', '3rd-5th', 'All ages'];

const DEFAULT_LESSON = () => ({
  id:             makeId('ls'),
  title:          '',
  ageBand:        'K-2nd',
  series:         '',
  bigIdea:        '',
  scripture:      '',
  story:          '',
  application:    '',
  memoryVerse:    '',
  prayer:         '',
  notes:          '',
  taughtCount:    0,
  lastTaught:     '',
  active:         true,
  createdAt:      Date.now(),
});

export default function ChildrensLessons() {
  const [lessons, setLessons, { loading }] = useUserStoreKey('childrens:lessons', []);
  const list = Array.isArray(lessons) ? lessons : [];

  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState('All');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(l => bandFilter === 'All' ? true : l.ageBand === bandFilter)
      .filter(l => !q || (l.title || '').toLowerCase().includes(q) ||
                          (l.bigIdea || '').toLowerCase().includes(q) ||
                          (l.scripture || '').toLowerCase().includes(q) ||
                          (l.series || '').toLowerCase().includes(q))
      .sort((a, b) => (a.series || '').localeCompare(b.series || '') || (a.title || '').localeCompare(b.title || ''));
  }, [list, query, bandFilter]);

  const add = () => {
    const l = DEFAULT_LESSON();
    setLessons(prev => [...(prev || []), l]);
    setOpenId(l.id);
  };
  const update = (id, patch) =>
    setLessons(prev => (prev || []).map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id) => {
    if (!confirm('Delete this lesson?')) return;
    setLessons(prev => (prev || []).filter(l => l.id !== id));
    if (openId === id) setOpenId(null);
  };
  const markTaught = (id) => {
    const l = list.find(x => x.id === id);
    update(id, {
      taughtCount: (l.taughtCount || 0) + 1,
      lastTaught: new Date().toISOString().slice(0, 10),
    });
  };

  const open = openId ? list.find(l => l.id === openId) : null;

  return (
    <ChildrensShell
      groupLabel="Curriculum" groupIcon="📖"
      icon="📚" title="Lessons & Series"
      accent={ACCENT}
      subtitle="Age-banded teaching — big idea, scripture, Bible story, application, memory verse, and prayer."
      actions={<button className="yps-add-btn" onClick={add}>＋ New lesson</button>}
      stats={[
        { n: list.length, label: 'lessons in library' },
        { n: list.filter(l => l.taughtCount > 0).length, label: 'taught at least once' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input className="yps-input" placeholder="Search title, big idea, scripture, series…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="cm-chips">
        <span className="cm-chip-label">Age:</span>
        <button className={`yps-chip ${bandFilter === 'All' ? 'on' : ''}`} onClick={() => setBandFilter('All')}>All</button>
        {AGE_BANDS.map(b => (
          <button key={b} className={`yps-chip ${bandFilter === b ? 'on' : ''}`} onClick={() => setBandFilter(b)}>{b}</button>
        ))}
      </div>

      {loading && list.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📚</div><div className="cm-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📚</div><div className="cm-empty-title">No lessons yet</div><div className="cm-empty-sub">Build your first lesson — title, scripture, big idea, application.</div></div>
      ) : (
        <div className="cm-grid">
          {visible.map(l => (
            <article key={l.id} className="cm-card" onClick={() => setOpenId(l.id)}>
              <div className="cm-card-hd">
                <h3 className="cm-card-title">{l.title || 'Untitled'}</h3>
                {l.taughtCount > 0 && <span className="yps-pill cm-good">✓ {l.taughtCount}×</span>}
              </div>
              {l.series && <div className="cm-card-sub">📁 {l.series}</div>}
              {l.bigIdea && <div className="cm-card-sub">💡 {l.bigIdea}</div>}
              {l.scripture && <div className="cm-card-sub">📖 {l.scripture}</div>}
              <div className="cm-card-meta">
                <span className="yps-pill">{l.ageBand}</span>
                {l.memoryVerse && <span className="yps-pill cm-info">📝 verse</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.title || 'New lesson'}</h2>
              <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
            </header>
            <div className="cm-modal-body">
              <Field label="Title" full><input className="yps-input" value={open.title} onChange={e => update(open.id, { title: e.target.value })} /></Field>
              <Field label="Age band">
                <select className="yps-select" value={open.ageBand} onChange={e => update(open.id, { ageBand: e.target.value })}>
                  {AGE_BANDS.map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Series"><input className="yps-input" value={open.series} onChange={e => update(open.id, { series: e.target.value })} placeholder="e.g. Stories of Jesus" /></Field>
              <Field label="Scripture" full><input className="yps-input" value={open.scripture} onChange={e => update(open.id, { scripture: e.target.value })} placeholder="e.g. Mark 4:35-41" /></Field>
              <Field label="Big idea" full><input className="yps-input" value={open.bigIdea} onChange={e => update(open.id, { bigIdea: e.target.value })} placeholder="One sentence — what should they remember?" /></Field>
              <Field label="Bible story" full>
                <textarea className="yps-textarea" rows={6} value={open.story} onChange={e => update(open.id, { story: e.target.value })} placeholder="Tell the story in kid-friendly language. Outline key moments." />
              </Field>
              <Field label="Application" full>
                <textarea className="yps-textarea" rows={4} value={open.application} onChange={e => update(open.id, { application: e.target.value })} placeholder="How does this apply to kids' lives this week?" />
              </Field>
              <Field label="Memory verse" full><input className="yps-input" value={open.memoryVerse} onChange={e => update(open.id, { memoryVerse: e.target.value })} /></Field>
              <Field label="Closing prayer" full>
                <textarea className="yps-textarea" rows={2} value={open.prayer} onChange={e => update(open.id, { prayer: e.target.value })} />
              </Field>
              <Field label="Leader notes" full>
                <textarea className="yps-textarea" rows={3} value={open.notes} onChange={e => update(open.id, { notes: e.target.value })} />
              </Field>

              <div className="cm-field full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="yps-btn" onClick={() => markTaught(open.id)}>✓ Mark taught today</button>
                {open.taughtCount > 0 && <span className="cm-field-label">Taught {open.taughtCount}× · last {open.lastTaught}</span>}
              </div>
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
