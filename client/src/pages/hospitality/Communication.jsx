import { useMemo, useState } from 'react';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts, ROLES } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Operations → Communication

   Broadcast composer (email + SMS) with an audience picker — All
   Hosts or by Role — resolved live from the shared 'hospitality:
   hosts' directory. Follows the same pattern as Women's/Youth
   Parent Communication: no message actually leaves the app, this
   composes it and hands off to the device's mail/messages app
   (mailto:/sms: links) or the clipboard, and logs a sent history.

   Storage:
     history: useUserStoreKey('hospitality:communication', [])
     hosts:   useHosts() (read only, shared directory)
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function Communication() {
  const [history, setHistory, { loading }] = useUserStoreKey('hospitality:communication', []);
  const [hosts] = useHosts();
  const historyList = Array.isArray(history) ? history : [];
  const hostList = Array.isArray(hosts) ? hosts : [];
  const activeHosts = useMemo(() => hostList.filter(h => h.status !== 'on-leave'), [hostList]);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [channel, setChannel] = useState('email');
  const [audience, setAudience] = useState('all');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');

  const matchedHosts = useMemo(() => {
    if (audience === 'all') return activeHosts;
    return activeHosts.filter(h => (h.roles || []).includes(audience));
  }, [activeHosts, audience]);

  const contactFor = (h) => ((channel === 'email' ? h.email : h.phone) || '').trim();
  const recipients = useMemo(() => {
    const set = new Set();
    matchedHosts.forEach(h => { const v = contactFor(h); if (v) set.add(v); });
    return Array.from(set);
  }, [matchedHosts, channel]);
  const missingContact = matchedHosts.filter(h => !contactFor(h)).length;
  const canSend = (channel === 'sms' ? !!body.trim() : (!!subject.trim() || !!body.trim())) && recipients.length > 0;

  const audienceLabel = (id) => id === 'all' ? 'All Hosts' : `Role: ${ROLES.find(r => r.key === id)?.label || id}`;

  const logSend = () => {
    const entry = { id: makeId('hc'), channel, audience, audienceLabel: audienceLabel(audience), subject: channel === 'email' ? subject : '', body, recipientCount: recipients.length, sentAt: new Date().toISOString() };
    setHistory(prev => [entry, ...(Array.isArray(prev) ? prev : [])]);
    setSubject(''); setBody('');
  };

  const openInMail = () => {
    if (recipients.length === 0) return;
    const bcc = encodeURIComponent(recipients.join(','));
    const subj = encodeURIComponent(subject);
    const bd = encodeURIComponent(body);
    const a = document.createElement('a');
    a.href = `mailto:?bcc=${bcc}${subject ? `&subject=${subj}` : ''}${body ? `&body=${bd}` : ''}`;
    a.rel = 'noopener';
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
    try { await navigator.clipboard.writeText(recipients.join(channel === 'email' ? ', ' : '\n')); alert(`${recipients.length} ${channel === 'email' ? 'email addresses' : 'phone numbers'} copied.`); } catch { alert('Copy failed.'); }
  };
  const copyBody = async () => {
    try { await navigator.clipboard.writeText(channel === 'email' ? `Subject: ${subject}\n\n${body}` : body); alert('Message copied.'); } catch { alert('Copy failed.'); }
  };
  const removeEntry = (id) => setHistory(prev => (Array.isArray(prev) ? prev : []).filter(e => e.id !== id));

  const visibleHistory = historyFilter === 'all' ? historyList : historyList.filter(h => h.channel === historyFilter);
  const emailReachable = useMemo(() => activeHosts.filter(h => (h.email || '').trim()).length, [activeHosts]);
  const smsReachable = useMemo(() => activeHosts.filter(h => (h.phone || '').trim()).length, [activeHosts]);

  return (
    <HospitalityShell
      title="Communication"
      icon="📨"
      subtitle="Broadcast composer (email + SMS) for team announcements, schedule reminders, and weekly hospitality huddles."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{historyList.length}</span><span className="ha-stat-lbl">Broadcasts sent</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{emailReachable}</span><span className="ha-stat-lbl">Reachable by email</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{smsReachable}</span><span className="ha-stat-lbl">Reachable by SMS</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">📨 Compose</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={`app-btn ${channel === 'email' ? 'primary' : 'ghost'}`} onClick={() => setChannel('email')}>📧 Email</button>
                    <button type="button" className={`app-btn ${channel === 'sms' ? 'primary' : 'ghost'}`} onClick={() => setChannel('sms')}>💬 SMS</button>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>Audience</div>
                  <select className="ys-inp" value={audience} onChange={e => setAudience(e.target.value)}>
                    <option value="all">👥 All Hosts</option>
                    {ROLES.map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
                  </select>

                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    ✨ <b>{recipients.length}</b> {channel === 'email' ? 'email address' : 'phone number'}{recipients.length === 1 ? '' : 'es'} will receive this
                    {matchedHosts.length > 0 && ` (${matchedHosts.length} matched)`}.
                    {missingContact > 0 && <span style={{ color: '#fdba74' }}> {missingContact} matched host{missingContact === 1 ? ' is' : 's are'} missing a {channel === 'email' ? 'email address' : 'phone number'}.</span>}
                  </div>

                  {channel === 'email' && <input className="ys-inp" placeholder="Subject line…" value={subject} onChange={e => setSubject(e.target.value)} />}
                  <textarea className="ys-inp ys-textarea" rows={channel === 'email' ? 8 : 5} placeholder={channel === 'email' ? 'Hi team,\n\n…' : 'Short message — under 160 chars works best.'} value={body} onChange={e => setBody(e.target.value)} />

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="app-btn primary" onClick={channel === 'email' ? openInMail : openInSms} disabled={!canSend}>{channel === 'email' ? '📧 Open in mail app' : '💬 Open in messages'}</button>
                    <button type="button" className="app-btn ghost" onClick={copyContacts} disabled={recipients.length === 0}>📋 Copy {channel === 'email' ? 'addresses' : 'numbers'}</button>
                    <button type="button" className="app-btn ghost" onClick={copyBody} disabled={!canSend}>📋 Copy message</button>
                    <button type="button" className="app-btn primary" onClick={logSend} disabled={!canSend}>✓ Log on send</button>
                  </div>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📜 Sent history</h3>
                <div className="ys-section-body">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={`app-btn ${historyFilter === 'all' ? 'primary' : 'ghost'}`} onClick={() => setHistoryFilter('all')}>All</button>
                    <button type="button" className={`app-btn ${historyFilter === 'email' ? 'primary' : 'ghost'}`} onClick={() => setHistoryFilter('email')}>📧 Email</button>
                    <button type="button" className={`app-btn ${historyFilter === 'sms' ? 'primary' : 'ghost'}`} onClick={() => setHistoryFilter('sms')}>💬 SMS</button>
                  </div>
                  {visibleHistory.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{historyList.length === 0 ? 'Nothing sent yet.' : 'No broadcasts on this channel.'}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {visibleHistory.map(h => (
                        <div key={h.id} className="ha-archive-section" style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{h.channel === 'email' ? '📧 Email' : '💬 SMS'}</span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{h.audienceLabel}</span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{new Date(h.sentAt).toLocaleString()}</span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{h.recipientCount} recipient{h.recipientCount === 1 ? '' : 's'}</span>
                            <button type="button" className="app-btn ghost" style={{ marginLeft: 'auto' }} onClick={() => removeEntry(h.id)}>✕</button>
                          </div>
                          {h.subject && <div style={{ fontSize: 13, marginTop: 4 }}><b>Subject:</b> {h.subject}</div>}
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{h.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
