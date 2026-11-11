import { useCallback, useMemo, useState } from 'react';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { useBibleStudies, usePrayerGroups, useLifeStages } from './womensListsConfig';
import CommunicationBoard from './CommunicationBoard';
/* Reuse the shared page shell (.wa-root/.wa-directory/.wa-stats-bar/
   .wa-filter-row/.wa-filter-chip…) from AllWomen.css and the .ys-*
   form primitives from youth/AllStudents.css — same pattern every
   other Women's page follows. Mounting under .wa-root (not just
   .wa-directory) is what activates AllWomen.css's rose-gold/emboss
   retint (see "Ports the Life Stages page's bespoke treatment" note
   at the top of AllWomen.css) so this page matches Life Stages. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Communication.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Communication

   Broadcast composer (Email / SMS / Mail) with opt-in audience
   groups — All Women, Life Stage, Bible Study, Prayer Group, or
   Leaders — reusable templates, saved drafts, and a logged sent
   history taggable by campaign. No message actually leaves the
   app: like Children's/Youth Parent Communication, this composes
   the message, resolves the live recipient list from the shared
   'womens:women' directory, and hands off to the device's own
   mail / messages app (mailto: / sms: links), a printable mailing
   list (physical Mail has no digital handoff), or the clipboard.

   Storage:
     history   (this page): useUserStoreKey('womens:communication', [])
     drafts    (this page): useUserStoreKey('womens:communication-drafts', [])
     templates (this page): useUserStoreKey('womens:communication-templates', [])
     women (read only):     useUserStoreKey('womens:women', [])
     bible studies:         useBibleStudies()  — womens:bible-studies
     prayer groups:         usePrayerGroups()  — womens:prayer-groups

   A woman counts as reachable on a channel if she's active and has
   a non-empty email (Email), phone (SMS), or address (Mail) on her
   record.
   ───────────────────────────────────────────────────────────── */

const ACCENT = 'var(--accent-green, #6ee7b7)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* HTML-escape helper for the mailing-list printable — keeps a
   woman's name/address from breaking the markup. */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[c]));

const CHANNELS = [
  { id: 'email', label: 'Email', icon: '📧' },
  { id: 'sms',   label: 'SMS',   icon: '💬' },
  { id: 'mail',  label: 'Mail',  icon: '📬' },
];

const AUDIENCE_TYPES = [
  { id: 'all',     label: 'All Women',    icon: '👥' },
  { id: 'stage',   label: 'Life Stage',   icon: '🌱' },
  { id: 'study',   label: 'Bible Study',  icon: '📖' },
  { id: 'prayer',  label: 'Prayer Group', icon: '🙏' },
  { id: 'leaders', label: 'Leaders',      icon: '🧑‍🏫' },
];
const NEEDS_VALUE = new Set(['stage', 'study', 'prayer']);

/* A tracked message counts as overdue once it's been out this many
   days with at least one recipient still pending. */
const OVERDUE_DAYS = 7;

export function audienceLabel(type, value) {
  const t = AUDIENCE_TYPES.find(a => a.id === type) || AUDIENCE_TYPES[0];
  if (!NEEDS_VALUE.has(type)) return t.label;
  return value ? `${t.label}: ${value}` : t.label;
}

export const channelIcon = (ch) => (ch === 'sms' ? '💬' : ch === 'mail' ? '📬' : '📧');
export const channelName  = (ch) => (ch === 'sms' ? 'SMS' : ch === 'mail' ? 'Mail' : 'Email');

/* A woman's contact value for a given channel — shared by recipient
   resolution and by the response-checklist snapshot taken at send
   time (see logSend / sendDraftNow below). */
const contactValue = (ch, w) => {
  const raw = ch === 'email' ? w.email : ch === 'sms' ? w.phone : w.address;
  return (raw || '').trim();
};

/* Printable mailing list — physical Mail has no mailto:/sms:-style
   handoff, so instead this opens a print-ready window with a
   Name/Address table (plus the letter body, if any written), the
   same "new window + auto window.print()" pattern used by the
   Children's Age Groups printables. */
const PRINT_CSS = `
  @page { size: Letter; margin: 0.6in; }
  body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #111; line-height: 1.4; }
  h1 { font-size: 18pt; margin: 0 0 4px; color: #7a1f3d; }
  h2 { font-size: 13pt; margin: 22px 0 8px; color: #7a1f3d; border-bottom: 2px solid #e8b4a0; padding-bottom: 4px; }
  .meta { color: #6b7280; font-size: 10pt; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f6ede7; font-weight: 700; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 11pt; }
  .print-btn { margin-bottom: 14px; padding: 8px 16px; background: #c2426a; color: #fff; border: 0; border-radius: 6px; font-size: 13pt; cursor: pointer; }
  @media print { .print-btn { display: none; } }
`;
function openPrintWindow(title, bodyHtml) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><button class="print-btn" onclick="window.print()">🖨 Print this list</button>${bodyHtml}</body></html>`;
  const w = window.open('', '_blank', 'width=820,height=680');
  if (!w) { alert('Popup blocked — please allow popups for this site so the printable can open.'); return; }
  w.document.write(html);
  w.document.close();
  /* Small delay so the doc fully renders before triggering print. */
  setTimeout(() => { try { w.print(); } catch { /* user can use the on-page button */ } }, 350);
}

export default function Communication() {
  const [history, setHistory] = useUserStoreKey('womens:communication', []);
  const [drafts, setDrafts] = useUserStoreKey('womens:communication-drafts', []);
  const [templates, setTemplates] = useUserStoreKey('womens:communication-templates', []);
  const [women] = useUserStoreKey('womens:women', []);
  const [leaders] = useUserStoreKey('womens:leaders', []);
  const [studies] = useBibleStudies();
  const [prayerGroups] = usePrayerGroups();
  const lifeStages = useLifeStages();
  const list = Array.isArray(history) ? history : [];
  const draftList = Array.isArray(drafts) ? drafts : [];
  const templateList = Array.isArray(templates) ? templates : [];
  const womenList = Array.isArray(women) ? women : [];
  const leaderList = Array.isArray(leaders) ? leaders : [];
  const studyList = Array.isArray(studies) ? studies : [];
  const groupList = Array.isArray(prayerGroups) ? prayerGroups : [];

  /* Leaders roster (womens:leaders) stores name + an optional link
     (womanId) back to the shared women directory — no contact info
     of its own. A leader is reachable here only once linked to a
     woman record with an email/phone/address. */
  const leaderWomen = useMemo(() => {
    const byId = new Map(womenList.map(w => [w.id, w]));
    return leaderList
      .map(l => (l.womanId ? byId.get(l.womanId) : null))
      .filter(Boolean);
  }, [leaderList, womenList]);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [channel, setChannel] = useState('email');
  const [audienceType, setAudienceType] = useState('all');
  const [audienceValue, setAudienceValue] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [campaign, setCampaign] = useState('');
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyCampaignFilter, setHistoryCampaignFilter] = useState('');
  const [templateDraft, setTemplateDraft] = useState(null); // { value } while naming a new template
  const [pendingTemplateSource, setPendingTemplateSource] = useState(null); // null = composer, else { type: 'draft'|'sent', id }
  const [needsResponse, setNeedsResponse] = useState(false);
  const [responseType, setResponseType] = useState('confirmation'); // 'confirmation' | 'response'
  const [view, setView] = useState('board'); // 'board' | 'list' | 'responses'

  const activeWomen = useMemo(() => womenList.filter(w => w.active !== false), [womenList]);

  const audienceValueOptions = useMemo(() => {
    if (audienceType === 'stage')  return lifeStages.stages;
    if (audienceType === 'study')  return studyList.map(s => s.label).filter(Boolean);
    if (audienceType === 'prayer') return groupList.map(g => g.label).filter(Boolean);
    return [];
  }, [audienceType, studyList, groupList, lifeStages.stages]);

  /* Unified recipient resolution — given any (channel, audienceType,
     audienceValue) triple, returns the matched women, the subset
     reachable on that channel, their deduped contact values, and the
     count missing a contact. Used both by the live composer (below,
     via the current state values) and by board actions that need to
     resolve a *different* saved draft/entry's own channel+audience
     without touching composer state (e.g. sendDraftNow). */
  const resolveRecipients = useCallback((ch, at, av) => {
    const contactOf = (w) => contactValue(ch, w);
    let matched;
    if (at === 'all')          matched = activeWomen;
    else if (at === 'leaders') matched = leaderWomen.filter(w => w.active !== false);
    else if (!av)               matched = [];
    else if (at === 'stage')   matched = activeWomen.filter(w => w.lifeStage === av);
    else if (at === 'study')   matched = activeWomen.filter(w => w.bibleStudy === av);
    else if (at === 'prayer')  matched = activeWomen.filter(w => w.prayerGroup === av);
    else                        matched = [];
    /* Un-deduped rows so the mailing-list printable can show one row
       per woman even if two share an address. */
    const withContact = matched.filter(w => contactOf(w));
    /* Deduped contact values — what actually goes into mailto:/sms:
       links and the "copy addresses/numbers" clipboard text. */
    const recipients = Array.from(new Set(withContact.map(contactOf)));
    return { matched, withContact, recipients, missing: matched.length - withContact.length };
  }, [activeWomen, leaderWomen]);

  const { matched: matchedWomen, withContact: matchedWithContact, recipients, missing: missingContact } = useMemo(
    () => resolveRecipients(channel, audienceType, audienceValue),
    [resolveRecipients, channel, audienceType, audienceValue]
  );
  const contactNoun = channel === 'email' ? 'email address' : channel === 'sms' ? 'phone number' : 'mailing address';

  const canSend = channel === 'mail'
    ? recipients.length > 0
    : (channel === 'email' ? (!!subject.trim() || !!body.trim()) : !!body.trim()) && recipients.length > 0;

  const pickAudienceType = (id) => {
    setAudienceType(id);
    setAudienceValue('');
  };

  const resetComposer = () => {
    setChannel('email'); setAudienceType('all'); setAudienceValue('');
    setSubject(''); setBody(''); setCampaign(''); setEditingDraftId(null);
    setNeedsResponse(false); setResponseType('confirmation');
  };

  const logSend = () => {
    const entry = {
      id:             makeId('wc'),
      channel,
      audienceType,
      audienceValue,
      audienceLabel:  audienceLabel(audienceType, audienceValue),
      subject:        channel === 'email' ? subject : '',
      body,
      campaign:       campaign.trim(),
      recipientCount: recipients.length,
      sentAt:         new Date().toISOString(),
      needsResponse,
      responseType,
      responses: needsResponse
        ? matchedWithContact.map(w => ({
            key: w.id || contactValue(channel, w),
            name: w.name || '',
            contact: contactValue(channel, w),
            status: 'pending',
          }))
        : [],
    };
    setHistory(prev => [entry, ...(Array.isArray(prev) ? prev : [])]);
    if (editingDraftId) {
      setDrafts(prev => (Array.isArray(prev) ? prev : []).filter(d => d.id !== editingDraftId));
    }
    setSubject(''); setBody(''); setCampaign(''); setEditingDraftId(null);
    setNeedsResponse(false); setResponseType('confirmation');
  };

  const saveDraft = () => {
    const payload = { channel, audienceType, audienceValue, subject, body, campaign: campaign.trim(), needsResponse, responseType };
    if (editingDraftId) {
      setDrafts(prev => (Array.isArray(prev) ? prev : []).map(d =>
        d.id === editingDraftId ? { ...d, ...payload, savedAt: new Date().toISOString() } : d
      ));
    } else {
      const id = makeId('wcd');
      setDrafts(prev => [{ id, ...payload, savedAt: new Date().toISOString() }, ...(Array.isArray(prev) ? prev : [])]);
      setEditingDraftId(id);
    }
  };

  const editDraft = (d) => {
    setChannel(d.channel || 'email');
    setAudienceType(d.audienceType || 'all');
    setAudienceValue(d.audienceValue || '');
    setSubject(d.subject || '');
    setBody(d.body || '');
    setCampaign(d.campaign || '');
    setEditingDraftId(d.id);
    setNeedsResponse(!!d.needsResponse);
    setResponseType(d.responseType || 'confirmation');
    setView('list');
  };

  const removeDraft = (id) => {
    if (!confirm('Delete this draft?')) return;
    setDrafts(prev => (Array.isArray(prev) ? prev : []).filter(d => d.id !== id));
    if (editingDraftId === id) setEditingDraftId(null);
  };

  const applyTemplate = (t) => {
    setChannel(t.channel || 'email');
    setSubject(t.subject || '');
    setBody(t.body || '');
    setView('list');
  };
  const startSaveTemplate = () => {
    if (!subject.trim() && !body.trim()) return;
    setPendingTemplateSource(null);
    setTemplateDraft({ value: '' });
  };
  /* Board entry points into the same naming modal — save a draft or a
     sent entry as a template without disturbing the live composer. */
  const openSaveTemplateFromDraft = (id) => {
    setPendingTemplateSource({ type: 'draft', id });
    setTemplateDraft({ value: '' });
  };
  const openSaveTemplateFromSent = (id) => {
    setPendingTemplateSource({ type: 'sent', id });
    setTemplateDraft({ value: '' });
  };
  const commitTemplate = () => {
    const name = (templateDraft?.value || '').trim();
    if (!name) return;
    let source = { channel, subject, body };
    if (pendingTemplateSource?.type === 'draft') {
      const d = draftList.find(x => x.id === pendingTemplateSource.id);
      if (d) source = { channel: d.channel, subject: d.subject, body: d.body };
    } else if (pendingTemplateSource?.type === 'sent') {
      const h = list.find(x => x.id === pendingTemplateSource.id);
      if (h) source = { channel: h.channel, subject: h.subject, body: h.body };
    }
    setTemplates(prev => [{ id: makeId('wct'), name, channel: source.channel, subject: source.subject, body: source.body }, ...(Array.isArray(prev) ? prev : [])]);
    setTemplateDraft(null);
    setPendingTemplateSource(null);
  };
  const cancelTemplateDraft = () => { setTemplateDraft(null); setPendingTemplateSource(null); };
  const removeTemplate = (id) => {
    if (!confirm('Delete this template?')) return;
    setTemplates(prev => (Array.isArray(prev) ? prev : []).filter(t => t.id !== id));
  };

  /* Board drag actions — Templates/Drafts/Sent transitions. */
  const duplicateTemplateAsDraft = (id) => {
    const t = templateList.find(x => x.id === id);
    if (!t) return;
    setDrafts(prev => [{
      id: makeId('wcd'), channel: t.channel || 'email', audienceType: 'all', audienceValue: '',
      subject: t.subject || '', body: t.body || '', campaign: '', savedAt: new Date().toISOString(),
    }, ...(Array.isArray(prev) ? prev : [])]);
  };
  const duplicateSentAsDraft = (id) => {
    const h = list.find(x => x.id === id);
    if (!h) return;
    setDrafts(prev => [{
      id: makeId('wcd'), channel: h.channel, audienceType: h.audienceType, audienceValue: h.audienceValue,
      subject: h.subject || '', body: h.body || '', campaign: h.campaign || '', savedAt: new Date().toISOString(),
      needsResponse: !!h.needsResponse, responseType: h.responseType || 'confirmation',
    }, ...(Array.isArray(prev) ? prev : [])]);
  };
  /* Sends a saved draft using its own channel/audience (not the live
     composer state) — real hand-off (mailto/sms/print), then logs to
     history and drops the draft, mirroring logSend + the channel
     actions below but driven entirely from the draft record. */
  const sendDraftNow = (id) => {
    const d = draftList.find(x => x.id === id);
    if (!d) return;
    const { withContact, recipients: rcpts } = resolveRecipients(d.channel, d.audienceType, d.audienceValue);
    if (rcpts.length === 0) { alert("No reachable recipients for this draft's audience yet."); return; }
    if (d.channel === 'mail') {
      const rows = withContact.map(w => `<tr><td>${esc(w.name)}</td><td>${esc(w.address)}</td></tr>`).join('');
      const bodyHtml = `
        <h1>Mailing list${d.campaign?.trim() ? ` — ${esc(d.campaign.trim())}` : ''}</h1>
        <div class="meta">${withContact.length} recipient${withContact.length === 1 ? '' : 's'} · ${esc(audienceLabel(d.audienceType, d.audienceValue))} · ${new Date().toLocaleDateString()}</div>
        <table><thead><tr><th>Name</th><th>Address</th></tr></thead><tbody>${rows}</tbody></table>
        ${d.body?.trim() ? `<h2>Letter</h2><pre>${esc(d.body)}</pre>` : ''}
      `;
      openPrintWindow('Mailing list', bodyHtml);
    } else if (d.channel === 'sms') {
      const sep = rcpts.length > 1 ? '&' : '?';
      const a = document.createElement('a');
      a.href = `sms:${rcpts.join(',')}${sep}body=${encodeURIComponent(d.body || '')}`;
      a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } else {
      const bcc = encodeURIComponent(rcpts.join(','));
      const url = `mailto:?bcc=${bcc}${d.subject ? `&subject=${encodeURIComponent(d.subject)}` : ''}${d.body ? `&body=${encodeURIComponent(d.body)}` : ''}`;
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    const entry = {
      id: makeId('wc'),
      channel: d.channel,
      audienceType: d.audienceType,
      audienceValue: d.audienceValue,
      audienceLabel: audienceLabel(d.audienceType, d.audienceValue),
      subject: d.channel === 'email' ? (d.subject || '') : '',
      body: d.body || '',
      campaign: (d.campaign || '').trim(),
      recipientCount: rcpts.length,
      sentAt: new Date().toISOString(),
      needsResponse: !!d.needsResponse,
      responseType: d.responseType || 'confirmation',
      responses: d.needsResponse
        ? withContact.map(w => ({
            key: w.id || contactValue(d.channel, w),
            name: w.name || '',
            contact: contactValue(d.channel, w),
            status: 'pending',
          }))
        : [],
    };
    setHistory(prev => [entry, ...(Array.isArray(prev) ? prev : [])]);
    setDrafts(prev => (Array.isArray(prev) ? prev : []).filter(x => x.id !== id));
    if (editingDraftId === id) setEditingDraftId(null);
  };
  const newMessage = () => { resetComposer(); setView('list'); };

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
  const printMailingList = () => {
    if (matchedWithContact.length === 0) return;
    const rows = matchedWithContact
      .map(w => `<tr><td>${esc(w.name)}</td><td>${esc(w.address)}</td></tr>`)
      .join('');
    const bodyHtml = `
      <h1>Mailing list${campaign.trim() ? ` — ${esc(campaign.trim())}` : ''}</h1>
      <div class="meta">${matchedWithContact.length} recipient${matchedWithContact.length === 1 ? '' : 's'} · ${esc(audienceLabel(audienceType, audienceValue))} · ${new Date().toLocaleDateString()}</div>
      <table><thead><tr><th>Name</th><th>Address</th></tr></thead><tbody>${rows}</tbody></table>
      ${body.trim() ? `<h2>Letter</h2><pre>${esc(body)}</pre>` : ''}
    `;
    openPrintWindow('Mailing list', bodyHtml);
  };
  const copyContacts = async () => {
    if (recipients.length === 0) return;
    try {
      await navigator.clipboard.writeText(recipients.join(channel === 'email' ? ', ' : '\n'));
      alert(`${recipients.length} ${contactNoun}${recipients.length === 1 ? '' : 'es'} copied.`);
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
    setHistory(prev => (Array.isArray(prev) ? prev : []).filter(e => e.id !== id));
  };

  const campaignsInHistory = useMemo(
    () => Array.from(new Set(list.map(h => h.campaign).filter(Boolean))),
    [list]
  );

  /* Sent entries flagged at compose time as needing a confirmation or
     a response — surfaced on the Responses tab so a leader can track,
     per recipient, who's checked in yet. */
  const needsResponseEntries = useMemo(
    () => list.filter(h => h.needsResponse && Array.isArray(h.responses) && h.responses.length > 0),
    [list]
  );

  const toggleResponse = (entryId, key) => {
    setHistory(prev => (Array.isArray(prev) ? prev : []).map(h => {
      if (h.id !== entryId || !Array.isArray(h.responses)) return h;
      return {
        ...h,
        responses: h.responses.map(r => r.key === key ? { ...r, status: r.status === 'done' ? 'pending' : 'done' } : r),
      };
    }));
  };

  /* One-off follow-up hand-off for a single still-pending recipient —
     same mailto:/sms: pattern as the composer's send actions, just
     scoped to one contact instead of the whole recipient list. Mail
     (physical) has no digital follow-up, so it's skipped. */
  const followUpContact = (ch, contact) => {
    if (!contact || ch === 'mail') return;
    const a = document.createElement('a');
    a.href = ch === 'sms' ? `sms:${contact}` : `mailto:${contact}`;
    a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <WomensShell
      title="Communication"
      icon="📨"
      subtitle="Broadcast composer (Email / SMS / Mail), opt-in groups, templates, drafts, and sent history."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wa-root wc-page">
        <div className="wa-directory">
          {view === 'list' ? (
            <div className="wc-view-switch">
              <button type="button" className="wa-filter-chip" onClick={() => setView('board')}>← Back to board</button>
            </div>
          ) : (
            <div className="wc-view-switch">
              <button type="button" className={`wa-filter-chip ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}>🗂️ Board</button>
              <button type="button" className={`wa-filter-chip ${view === 'responses' ? 'on' : ''}`} onClick={() => setView('responses')}>
                ✅ Responses{needsResponseEntries.length > 0 && ` (${needsResponseEntries.length})`}
              </button>
            </div>
          )}

          {view === 'board' && (
            <CommunicationBoard
              templates={templateList}
              drafts={draftList}
              sent={list}
              historyFilter={historyFilter}
              setHistoryFilter={setHistoryFilter}
              historyCampaignFilter={historyCampaignFilter}
              setHistoryCampaignFilter={setHistoryCampaignFilter}
              campaignsInHistory={campaignsInHistory}
              onNewMessage={newMessage}
              onUseTemplate={applyTemplate}
              onEditDraft={editDraft}
              onDeleteTemplate={removeTemplate}
              onDeleteDraft={removeDraft}
              onDeleteSent={removeEntry}
              onDuplicateTemplateAsDraft={duplicateTemplateAsDraft}
              onDuplicateSentAsDraft={duplicateSentAsDraft}
              onSendDraftNow={sendDraftNow}
              onSaveDraftAsTemplate={openSaveTemplateFromDraft}
              onSaveSentAsTemplate={openSaveTemplateFromSent}
            />
          )}

          {view === 'responses' && (
            <section className="wc-responses-section">
              <h2 className="wc-h2">✅ Confirmations &amp; Responses</h2>
              {needsResponseEntries.length === 0 ? (
                <div className="wc-responses-empty">
                  No tracked messages yet. Check "Track who has confirmed or responded" in the composer before sending a message to start a checklist here.
                </div>
              ) : (
                <div className="wc-response-list">
                  {needsResponseEntries.map(h => {
                    const doneCount = h.responses.filter(r => r.status === 'done').length;
                    const verb = h.responseType === 'response' ? 'responded' : 'confirmed';
                    const pending = h.responses.filter(r => r.status !== 'done');
                    const daysSince = (Date.now() - new Date(h.sentAt).getTime()) / 86400000;
                    const isOverdue = pending.length > 0 && daysSince > OVERDUE_DAYS;
                    const sortedRows = [...h.responses].sort((a, b) =>
                      (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0)
                    );
                    const pendingNames = pending.map(r => r.name || r.contact || 'Unnamed');
                    const pendingPreview = pendingNames.slice(0, 6).join(', ')
                      + (pendingNames.length > 6 ? `, +${pendingNames.length - 6} more` : '');
                    return (
                      <article key={h.id} className={`wc-response-entry ${isOverdue ? 'overdue' : ''}`}>
                        <div className="wc-response-meta">
                          <span className="wc-response-pill">{channelIcon(h.channel)} {channelName(h.channel)}</span>
                          {h.campaign && <span className="wc-response-pill wc-response-pill-campaign">🏷️ {h.campaign}</span>}
                          <span className="wc-response-date">{new Date(h.sentAt).toLocaleDateString()}</span>
                          <span className="wc-response-progress">{doneCount}/{h.responses.length} {verb}</span>
                          {isOverdue && <span className="wc-response-pill wc-response-pill-overdue">⚠️ Overdue</span>}
                        </div>
                        {h.subject && <div className="wc-response-subject">{h.subject}</div>}
                        {pending.length > 0 && (
                          <div className="wc-response-pending-summary">Pending: {pendingPreview}</div>
                        )}
                        <div className="wc-response-rows">
                          {sortedRows.map(r => (
                            <div key={r.key} className={`wc-response-row ${r.status === 'done' ? 'done' : ''}`}>
                              <button
                                type="button"
                                className="wc-response-toggle"
                                onClick={() => toggleResponse(h.id, r.key)}
                              >
                                <span className="wc-response-check">{r.status === 'done' ? '✅' : '⬜'}</span>
                                <span className="wc-response-name">{r.name || 'Unnamed'}</span>
                                {r.contact && <span className="wc-response-contact">{r.contact}</span>}
                              </button>
                              {r.status !== 'done' && r.contact && h.channel !== 'mail' && (
                                <button
                                  type="button"
                                  className="wc-response-followup"
                                  onClick={() => followUpContact(h.channel, r.contact)}
                                  title={`Follow up via ${channelName(h.channel)}`}
                                  aria-label={`Follow up with ${r.name || 'recipient'}`}
                                >{h.channel === 'sms' ? '💬' : '📧'}</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {view === 'list' && (
          <>

          <section className="wc-composer">
            <div className="wc-composer-head">
              <h2 className="wc-h2">Compose</h2>
              {editingDraftId && (
                <span className="wc-editing-note">
                  ✏️ Editing a saved draft
                  <button type="button" className="wc-editing-clear" onClick={resetComposer}>Start new message</button>
                </span>
              )}
            </div>

            <div className="wa-filter-row">
              {CHANNELS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`wa-filter-chip ${channel === c.id ? 'on' : ''}`}
                  onClick={() => setChannel(c.id)}
                >{c.icon} {c.label}</button>
              ))}
            </div>

            <div className="wc-field">
              <span className="wc-field-lbl">Audience</span>
              <div className="wa-filter-row">
                {AUDIENCE_TYPES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`wa-filter-chip ${audienceType === t.id ? 'on' : ''}`}
                    onClick={() => pickAudienceType(t.id)}
                  >{t.icon} {t.label}</button>
                ))}
              </div>
              {NEEDS_VALUE.has(audienceType) && (
                audienceValueOptions.length === 0 ? (
                  <div className="wc-hint">No {audienceType === 'stage' ? 'life stages' : audienceType === 'study' ? 'Bible studies' : 'prayer groups'} yet.</div>
                ) : (
                  <div className="wa-filter-row">
                    {audienceValueOptions.map(v => (
                      <button
                        key={v}
                        type="button"
                        className={`wa-filter-chip ${audienceValue === v ? 'on' : ''}`}
                        onClick={() => setAudienceValue(v)}
                      >{v}</button>
                    ))}
                  </div>
                )
              )}
              {audienceType === 'leaders' && leaderList.length > leaderWomen.length && (
                <div className="wc-hint">{leaderList.length - leaderWomen.length} leader{leaderList.length - leaderWomen.length === 1 ? '' : 's'} not linked to a woman record — link them on the Leaders page to reach them here.</div>
              )}
            </div>

            {templateList.length > 0 && (
              <div className="wc-field">
                <span className="wc-field-lbl">Templates</span>
                <div className="wa-filter-row">
                  {templateList.map(t => (
                    <span key={t.id} className="wc-template-chip">
                      <button type="button" className="wa-filter-chip" onClick={() => applyTemplate(t)}>
                        {channelIcon(t.channel)} {t.name}
                      </button>
                      <button type="button" className="wc-template-del" onClick={() => removeTemplate(t.id)} aria-label={`Delete template ${t.name}`}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="wc-field">
              <span className="wc-field-lbl">Campaign / label (optional)</span>
              <input
                className="ys-inp"
                list="wc-campaign-list"
                placeholder="e.g. Fall Retreat, Weekly reminder…"
                value={campaign}
                onChange={e => setCampaign(e.target.value)}
              />
              <datalist id="wc-campaign-list">
                {campaignsInHistory.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div className="wc-field">
              <label className="wc-track-toggle">
                <input
                  type="checkbox"
                  checked={needsResponse}
                  onChange={e => setNeedsResponse(e.target.checked)}
                />
                Track who has confirmed or responded
              </label>
              {needsResponse && (
                <div className="wa-filter-row">
                  <button type="button" className={`wa-filter-chip ${responseType === 'confirmation' ? 'on' : ''}`} onClick={() => setResponseType('confirmation')}>Needs confirmation</button>
                  <button type="button" className={`wa-filter-chip ${responseType === 'response' ? 'on' : ''}`} onClick={() => setResponseType('response')}>Needs a response</button>
                </div>
              )}
            </div>

            <div className="wc-recip-note">
              ✨ <b>{recipients.length}</b> {contactNoun}{recipients.length === 1 ? '' : 'es'} will receive this
              {matchedWomen.length > 0 && ` (${matchedWomen.length} matched)`}.
              {missingContact > 0 && (
                <span className="wc-recip-warn"> {missingContact} matched {missingContact === 1 ? 'woman is' : 'women are'} missing a {contactNoun}.</span>
              )}
            </div>

            {channel === 'email' && (
              <input className="ys-inp" placeholder="Subject line…" value={subject} onChange={e => setSubject(e.target.value)} />
            )}
            <textarea
              className="ys-inp ys-textarea"
              rows={channel === 'sms' ? 5 : 8}
              placeholder={channel === 'email' ? 'Hi ladies,\n\n…' : channel === 'sms' ? 'Short message — under 160 chars works best.' : 'Dear …\n\n…'}
              value={body}
              onChange={e => setBody(e.target.value)}
            />

            <div className="wc-actions">
              {channel === 'email' && (
                <button type="button" className="app-btn primary" onClick={openInMail} disabled={!canSend}>📧 Open in mail app</button>
              )}
              {channel === 'sms' && (
                <button type="button" className="app-btn primary" onClick={openInSms} disabled={!canSend}>💬 Open in messages</button>
              )}
              {channel === 'mail' && (
                <button type="button" className="app-btn primary" onClick={printMailingList} disabled={!canSend}>🖨 Print mailing list</button>
              )}
              <button type="button" className="app-btn" onClick={copyContacts} disabled={recipients.length === 0}>
                📋 Copy {channel === 'sms' ? 'numbers' : 'addresses'}
              </button>
              {channel !== 'mail' && (
                <button type="button" className="app-btn" onClick={copyBody} disabled={!canSend}>📋 Copy message</button>
              )}
              <button type="button" className="app-btn" onClick={startSaveTemplate} disabled={!subject.trim() && !body.trim()}>🏷️ Save as template</button>
              <button type="button" className="app-btn" onClick={saveDraft} disabled={!subject.trim() && !body.trim() && !campaign.trim()}>
                💾 {editingDraftId ? 'Update draft' : 'Save draft'}
              </button>
              <button type="button" className="app-btn primary" onClick={logSend} disabled={!canSend}>
                ✓ {channel === 'mail' ? 'Log as mailed' : 'Log on send'}
              </button>
            </div>
          </section>
          </>
          )}
        </div>
      </div>

      {templateDraft && (
        <div className="wc-modal-scrim" onClick={cancelTemplateDraft}>
          <div className="wc-modal" role="dialog" onClick={e => e.stopPropagation()}>
            <h3>Save as template</h3>
            <input
              autoFocus
              className="ys-inp"
              placeholder="Template name…"
              value={templateDraft.value}
              onChange={e => setTemplateDraft(d => ({ ...d, value: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') commitTemplate(); else if (e.key === 'Escape') cancelTemplateDraft(); }}
            />
            <div className="wc-modal-actions">
              <button type="button" className="app-btn" onClick={cancelTemplateDraft}>Cancel</button>
              <button type="button" className="app-btn primary" onClick={commitTemplate} disabled={!templateDraft.value.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}
