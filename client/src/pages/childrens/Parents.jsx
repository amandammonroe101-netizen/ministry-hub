import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Parent Communication
   Storage: childrens:parentComms — broadcast history.
   Simpler than Youth Parents — single composer that pulls parent
   contacts from childrens:kids and lets the user open in mail app
   or copy + paste. */

const ACCENT = 'var(--accent-green, #6ee7b7)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const AGE_BANDS = ['All', 'Nursery (0-2)', 'Toddler (2-3)', 'Preschool (3-5)', 'K-2nd', '3rd-5th'];

export default function ChildrensParents() {
  const [history, setHistory, { loading }] = useUserStoreKey('childrens:parentComms', []);
  const [kids] = useUserStoreKey('childrens:kids', []);
  const list = Array.isArray(history) ? history : [];
  const kidList = Array.isArray(kids) ? kids : [];

  const [channel, setChannel] = useState('email');
  const [audience, setAudience] = useState('All');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const recipients = useMemo(() => {
    const filtered = kidList.filter(k => k.active && (audience === 'All' || k.ageBand === audience));
    const set = new Set();
    filtered.forEach(k => {
      const v = channel === 'email' ? (k.parentEmail || '') : (k.parentPhone || '');
      if (v) set.add(v);
    });
    return Array.from(set);
  }, [kidList, audience, channel]);

  const canSend = (channel === 'sms' ? !!body : (!!subject || !!body)) && recipients.length > 0;

  const logSend = () => {
    const entry = {
      id: makeId('pc'),
      channel,
      audience,
      subject: channel === 'email' ? subject : '',
      body,
      recipientCount: recipients.length,
      sentAt: new Date().toISOString(),
    };
    setHistory(prev => [entry, ...(prev || [])]);
    setSubject(''); setBody('');
  };

  const openInMail = () => {
    if (recipients.length === 0) return;
    const bcc = encodeURIComponent(recipients.join(','));
    const subj = encodeURIComponent(subject);
    const bd = encodeURIComponent(body);
    const url = `mailto:?bcc=${bcc}${subject ? `&subject=${subj}` : ''}${body ? `&body=${bd}` : ''}`;
    const a = document.createElement('a');
    a.href = url; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const openInSms = () => {
    if (recipients.length === 0) return;
    const sep = recipients.length > 1 ? '&' : '?';
    const a = document.createElement('a');
    a.href = `sms:${recipients.join(',')}${sep}body=${encodeURIComponent(body)}`;
    a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const copyContacts = async () => {
    if (recipients.length === 0) return;
    try {
      await navigator.clipboard.writeText(recipients.join(channel === 'email' ? ', ' : '\n'));
      alert(`${recipients.length} ${channel === 'email' ? 'email addresses' : 'phone numbers'} copied.`);
    } catch { alert('Copy failed.'); }
  };
  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(channel === 'email' ? `Subject: ${subject}\n\n${body}` : body);
      alert('Message copied.');
    } catch { alert('Copy failed.'); }
  };

  const removeEntry = (id) => {
    if (!confirm('Remove this from history?')) return;
    setHistory(prev => (prev || []).filter(e => e.id !== id));
  };

  return (
    <ChildrensShell
      groupLabel="Team" groupIcon="🙋"
      icon="📨" title="Parent Communication"
      accent={ACCENT}
      subtitle="Compose a broadcast, pick your audience, open in your mail / messages app, log it."
      stats={[
        { n: list.length, label: 'broadcasts logged' },
        { n: kidList.length, label: 'kids in roster' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <section style={{ background: 'var(--bg-glass)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button className={`yps-chip ${channel === 'email' ? 'on' : ''}`} onClick={() => setChannel('email')}>📧 Email</button>
          <button className={`yps-chip ${channel === 'sms' ? 'on' : ''}`}   onClick={() => setChannel('sms')}>💬 SMS</button>
        </div>
        <div className="cm-chips" style={{ marginBottom: 10 }}>
          <span className="cm-chip-label">Audience:</span>
          {AGE_BANDS.map(b => (
            <button key={b} className={`yps-chip ${audience === b ? 'on' : ''}`} onClick={() => setAudience(b)}>{b}</button>
          ))}
        </div>
        <div className="cm-card-sub" style={{ marginBottom: 10 }}>
          ✨ <b>{recipients.length}</b> household{recipients.length === 1 ? '' : 's'} will receive this.
        </div>
        {channel === 'email' && (
          <input className="yps-input" placeholder="Subject line…" value={subject} onChange={e => setSubject(e.target.value)} style={{ marginBottom: 8 }} />
        )}
        <textarea className="yps-textarea" rows={channel === 'email' ? 8 : 5}
          placeholder={channel === 'email' ? 'Hi parents,\n\n…' : 'Short message — under 160 chars works best.'}
          value={body} onChange={e => setBody(e.target.value)} style={{ marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="yps-btn" onClick={channel === 'email' ? openInMail : openInSms} disabled={!canSend}>
            {channel === 'email' ? '📧 Open in mail app' : '💬 Open in messages'}
          </button>
          <button className="yps-btn" onClick={copyContacts} disabled={recipients.length === 0}>📋 Copy {channel === 'email' ? 'addresses' : 'numbers'}</button>
          <button className="yps-btn" onClick={copyBody} disabled={!canSend}>📋 Copy message</button>
          <button className="yps-add-btn" onClick={logSend} disabled={!canSend}>✓ Log on Send</button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Sent history</h2>
        {loading && list.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📨</div><div className="cm-empty-title">Loading…</div></div>
        ) : list.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📨</div><div className="cm-empty-title">Nothing logged yet</div><div className="cm-empty-sub">Send your first broadcast and tap Log on Send.</div></div>
        ) : (
          <div className="cm-rows">
            {list.map(h => (
              <div key={h.id} className="cm-row" style={{ alignItems: 'flex-start', flexDirection: 'column', cursor: 'default', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
                  <span className="yps-pill">{h.channel === 'email' ? '📧 Email' : '💬 SMS'}</span>
                  <span className="yps-pill">{h.audience}</span>
                  <span className="cm-row-sub">{new Date(h.sentAt).toLocaleString()}</span>
                  <span className="cm-row-sub" style={{ marginLeft: 'auto' }}>{h.recipientCount} households</span>
                  <button className="yps-btn ghost" onClick={() => removeEntry(h.id)}>✕</button>
                </div>
                {h.subject && <div className="cm-row-sub" style={{ width: '100%' }}><b>Subject:</b> {h.subject}</div>}
                <div className="cm-row-sub" style={{ width: '100%', whiteSpace: 'pre-wrap' }}>{h.body}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
