import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Take-Home Sheets
   Read-only-ish derived view from childrens:lessons. Each lesson
   gets a printable parent take-home with recap, family devotional,
   and conversation starters. Print button opens a clean window
   ready for letter-size paper. */

const ACCENT = 'var(--accent-teal, #2dd4bf)';

export default function ChildrensTakeHome() {
  const [lessons] = useUserStoreKey('childrens:lessons', []);
  const list = Array.isArray(lessons) ? lessons : [];

  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(l => !q || (l.title || '').toLowerCase().includes(q) || (l.scripture || '').toLowerCase().includes(q))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [list, query]);

  const open = openId ? list.find(l => l.id === openId) : null;

  const printSheet = (l) => {
    const html = takeHomeHtml(l);
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { alert('Popup blocked — enable popups to print the take-home sheet.'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <ChildrensShell
      groupLabel="Curriculum" groupIcon="📖"
      icon="🏠" title="Take-Home Sheets"
      accent={ACCENT}
      subtitle="A printable parent take-home for each lesson. Slip one into the kid's pickup bag — recap, family devotional, conversation starters."
      stats={[
        { n: list.length, label: 'lessons available' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input className="yps-input" placeholder="Search lessons…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      {visible.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🏠</div><div className="cm-empty-title">{list.length === 0 ? 'No lessons in the curriculum yet' : 'No matches'}</div><div className="cm-empty-sub">Build lessons on the Lessons page; take-home sheets are auto-generated.</div></div>
      ) : (
        <div className="cm-grid">
          {visible.map(l => (
            <article key={l.id} className="cm-card" onClick={() => setOpenId(l.id)}>
              <div className="cm-card-hd">
                <h3 className="cm-card-title">{l.title || 'Untitled'}</h3>
                <span className="yps-pill">{l.ageBand}</span>
              </div>
              {l.scripture && <div className="cm-card-sub">📖 {l.scripture}</div>}
              {l.bigIdea && <div className="cm-card-sub">💡 {l.bigIdea}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button className="yps-btn" onClick={(e) => { e.stopPropagation(); printSheet(l); }}>🖨 Print</button>
                <button className="yps-btn ghost" onClick={(e) => { e.stopPropagation(); setOpenId(l.id); }}>👁 Preview</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="cm-modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="cm-modal" onClick={e => e.stopPropagation()}>
            <header className="cm-modal-hd">
              <h2>{open.title} — Take-home preview</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="yps-btn" onClick={() => printSheet(open)}>🖨 Print</button>
                <button className="yps-btn ghost" onClick={() => setOpenId(null)}>✕</button>
              </div>
            </header>
            <div style={{ padding: 20, lineHeight: 1.6, fontSize: 'var(--fs-md)' }}>
              <PreviewBody lesson={open} />
            </div>
          </div>
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

function PreviewBody({ lesson }) {
  return (
    <>
      <h2 style={{ marginTop: 0 }}>{lesson.title}</h2>
      {lesson.scripture && <p><b>Scripture:</b> {lesson.scripture}</p>}
      {lesson.bigIdea && <p style={{ fontStyle: 'italic' }}>💡 {lesson.bigIdea}</p>}
      <hr style={{ opacity: 0.3 }} />
      <h3>📖 Today's story</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{lesson.story || '(No story written yet — add one on the Lessons page.)'}</p>
      {lesson.memoryVerse && (
        <>
          <h3>📝 Memory verse</h3>
          <blockquote style={{ borderLeft: '3px solid #2dd4bf', paddingLeft: 12, margin: '8px 0' }}>
            {lesson.memoryVerse}
          </blockquote>
        </>
      )}
      <h3>💬 Talk about it as a family</h3>
      <ol>
        <li>What part of today's story stood out to you?</li>
        <li>How does <em>{lesson.bigIdea || 'this idea'}</em> show up in our family this week?</li>
        <li>Is there something you want our family to pray about together?</li>
      </ol>
      {lesson.application && (
        <>
          <h3>✨ Try this week</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{lesson.application}</p>
        </>
      )}
      {lesson.prayer && (
        <>
          <h3>🙏 Closing prayer</h3>
          <p style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>{lesson.prayer}</p>
        </>
      )}
    </>
  );
}

/* Build a clean, printable HTML document for the take-home. */
function takeHomeHtml(l) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(l.title)} — Take-Home</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #222; line-height: 1.55; }
  h1   { color: #0d9488; border-bottom: 2px solid #2dd4bf; padding-bottom: 4px; margin: 0 0 4px; font-size: 24pt; }
  h2   { color: #0f766e; font-size: 14pt; margin-top: 18px; }
  blockquote { border-left: 3px solid #2dd4bf; margin: 8px 0; padding: 4px 12px; background: #f0fdfa; }
  .meta { color: #6b7280; font-size: 10pt; }
  .footer { margin-top: 26px; font-size: 9pt; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head><body>
  <h1>${esc(l.title || 'Lesson')}</h1>
  <div class="meta">${esc(l.ageBand || '')}${l.scripture ? ' · ' + esc(l.scripture) : ''}</div>
  ${l.bigIdea ? `<p style="font-style:italic;font-size:12pt;margin:10px 0 0;">💡 ${esc(l.bigIdea)}</p>` : ''}
  <h2>📖 Today's story</h2>
  <p>${esc(l.story || '(See teacher.)').replace(/\n/g, '<br/>')}</p>
  ${l.memoryVerse ? `<h2>📝 Memory verse</h2><blockquote>${esc(l.memoryVerse)}</blockquote>` : ''}
  <h2>💬 Talk about it as a family</h2>
  <ol>
    <li>What part of today's story stood out to you?</li>
    <li>How does <em>${esc(l.bigIdea || 'this idea')}</em> show up in our family this week?</li>
    <li>Is there something you want our family to pray about together?</li>
  </ol>
  ${l.application ? `<h2>✨ Try this week</h2><p>${esc(l.application).replace(/\n/g, '<br/>')}</p>` : ''}
  ${l.prayer ? `<h2>🙏 Closing prayer</h2><p style="font-style:italic;">${esc(l.prayer)}</p>` : ''}
  <div class="footer">Take-home from Children's Ministry · Save this for your fridge!</div>
</body></html>`;
}
