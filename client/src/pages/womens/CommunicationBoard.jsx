/* CommunicationBoard — three-column board view for Women's
   Communication: Templates | Drafts | Sent. Mirrors the pattern in
   prayers/PrayerKanban.jsx (native HTML5 drag-and-drop, no extra
   deps), but drag between these columns means something different
   per pair — it's not one shared "status" field, so each transition
   maps to its own callback prop:

     Templates → Drafts   onDuplicateTemplateAsDraft(id)  (template stays)
     Drafts → Sent        onSendDraftNow(id)               (real send, draft removed)
     Drafts → Templates   onSaveDraftAsTemplate(id)        (draft stays, opens naming modal)
     Sent → Drafts        onDuplicateSentAsDraft(id)       (sent entry stays)
     Sent → Templates     onSaveSentAsTemplate(id)         (sent entry stays, opens naming modal)
     Templates → Sent     (no-op — nothing makes sense here)

   Renders inside the same .wa-root the parent page already wraps
   itself in, so it inherits the rose-gold --wa-3d-* custom
   properties without needing its own theme setup. */

import { useMemo, useState } from 'react';
import { channelIcon, channelName, audienceLabel } from './Communication';
import './CommunicationBoard.css';

const COLUMNS = [
  { kind: 'templates', label: 'Templates', emoji: '🏷️', sub: 'Reusable starting points' },
  { kind: 'drafts',    label: 'Drafts',    emoji: '📝', sub: 'In progress, not sent' },
  { kind: 'sent',      label: 'Sent',      emoji: '✅', sub: 'Logged broadcast history' },
];

export default function CommunicationBoard({
  templates = [],
  drafts = [],
  sent = [],
  historyFilter, setHistoryFilter,
  historyCampaignFilter, setHistoryCampaignFilter,
  campaignsInHistory = [],
  onNewMessage,
  onUseTemplate,
  onEditDraft,
  onDeleteTemplate,
  onDeleteDraft,
  onDeleteSent,
  onDuplicateTemplateAsDraft,
  onDuplicateSentAsDraft,
  onSendDraftNow,
  onSaveDraftAsTemplate,
  onSaveSentAsTemplate,
}) {
  const [expandedSent, setExpandedSent] = useState(null);
  const [dragging, setDragging] = useState(null); // { kind, id }
  const [hoverKind, setHoverKind] = useState(null);

  const filteredTemplates = useMemo(
    () => templates.filter(t => historyFilter === 'all' || t.channel === historyFilter),
    [templates, historyFilter]
  );
  const filteredDrafts = useMemo(
    () => drafts.filter(d =>
      (historyFilter === 'all' || d.channel === historyFilter) &&
      (!historyCampaignFilter || d.campaign === historyCampaignFilter)
    ),
    [drafts, historyFilter, historyCampaignFilter]
  );
  const filteredSent = useMemo(
    () => sent.filter(h =>
      (historyFilter === 'all' || h.channel === historyFilter) &&
      (!historyCampaignFilter || h.campaign === historyCampaignFilter)
    ),
    [sent, historyFilter, historyCampaignFilter]
  );

  const grouped = { templates: filteredTemplates, drafts: filteredDrafts, sent: filteredSent };
  const totalCount = templates.length + drafts.length + sent.length;

  const handleDragStart = (e, kind, id) => {
    setDragging({ kind, id });
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
    try { e.dataTransfer.setData('text/plain', String(id)); } catch { /* noop */ }
  };
  const handleDragEnd = () => { setDragging(null); setHoverKind(null); };
  const handleDragOver = (e, kind) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
    if (hoverKind !== kind) setHoverKind(kind);
  };
  const handleDragLeave = (kind) => { if (hoverKind === kind) setHoverKind(null); };
  const handleDrop = (e, targetKind) => {
    e.preventDefault();
    setHoverKind(null);
    const from = dragging;
    setDragging(null);
    if (!from || from.kind === targetKind) return;
    const { kind, id } = from;
    if (kind === 'templates' && targetKind === 'drafts')  return onDuplicateTemplateAsDraft?.(id);
    if (kind === 'drafts'    && targetKind === 'sent')    return onSendDraftNow?.(id);
    if (kind === 'drafts'    && targetKind === 'templates') return onSaveDraftAsTemplate?.(id);
    if (kind === 'sent'      && targetKind === 'drafts')  return onDuplicateSentAsDraft?.(id);
    if (kind === 'sent'      && targetKind === 'templates') return onSaveSentAsTemplate?.(id);
    /* templates → sent: no meaningful transition, ignored. */
  };

  return (
    <div className="wcb-root">
      <div className="wcb-hd">
        <div className="wcb-hd-left">
          <div className="wcb-hd-title">🗂️ Communication Board</div>
          <div className="wcb-hd-sub">
            {totalCount === 0
              ? 'Compose a message to get started — drag cards between columns as they move through the workflow.'
              : 'Drag cards between columns: templates → drafts, drafts → sent, or drag back to save as a template.'}
          </div>
        </div>
        <button type="button" className="app-btn primary" onClick={onNewMessage}>✎ New message</button>
      </div>

      <div className="wcb-filters">
        <div className="wa-filter-row">
          <button type="button" className={`wa-filter-chip ${historyFilter === 'all' ? 'on' : ''}`}   onClick={() => setHistoryFilter('all')}>All</button>
          <button type="button" className={`wa-filter-chip ${historyFilter === 'email' ? 'on' : ''}`} onClick={() => setHistoryFilter('email')}>📧 Email</button>
          <button type="button" className={`wa-filter-chip ${historyFilter === 'sms' ? 'on' : ''}`}   onClick={() => setHistoryFilter('sms')}>💬 SMS</button>
          <button type="button" className={`wa-filter-chip ${historyFilter === 'mail' ? 'on' : ''}`}  onClick={() => setHistoryFilter('mail')}>📬 Mail</button>
        </div>
        {campaignsInHistory.length > 0 && (
          <select
            className="wc-campaign-filter ys-inp"
            value={historyCampaignFilter}
            onChange={e => setHistoryCampaignFilter(e.target.value)}
          >
            <option value="">All campaigns</option>
            {campaignsInHistory.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="wcb-empty">
          <div className="wcb-empty-icon">📨</div>
          <div className="wcb-empty-title">Nothing here yet.</div>
          <div className="wcb-empty-sub">Compose a message, save it as a draft or template, and it'll show up here.</div>
          <button type="button" className="app-btn primary" onClick={onNewMessage}>✎ New message</button>
        </div>
      ) : (
        <div className="wcb-columns">
          {COLUMNS.map(col => {
            const items = grouped[col.kind] || [];
            const isHover = hoverKind === col.kind;
            return (
              <section
                key={col.kind}
                className={`wcb-col wcb-col-${col.kind} ${isHover ? 'hover' : ''}`}
                onDragOver={(e) => handleDragOver(e, col.kind)}
                onDragLeave={() => handleDragLeave(col.kind)}
                onDrop={(e) => handleDrop(e, col.kind)}
              >
                <header className="wcb-col-hd">
                  <span className="wcb-col-emoji">{col.emoji}</span>
                  <span className="wcb-col-title">{col.label}</span>
                  {items.length > 0 && <span className="wcb-col-count">{items.length}</span>}
                </header>
                <div className="wcb-col-sub">{col.sub}</div>

                <div className="wcb-col-body">
                  {items.length === 0 ? (
                    <div className="wcb-col-empty">
                      {col.kind === 'templates' && 'Drag a draft or sent message here to save it as a template.'}
                      {col.kind === 'drafts' && 'Drag a template here to start a new draft from it.'}
                      {col.kind === 'sent' && 'Drag a draft here to send it now.'}
                    </div>
                  ) : col.kind === 'templates' ? (
                    items.map(t => (
                      <article
                        key={t.id}
                        className={`wcb-card ${dragging?.kind === 'templates' && dragging.id === t.id ? 'dragging' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'templates', t.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onUseTemplate?.(t)}
                        title="Click to use in composer · Drag to duplicate as a draft or delete"
                      >
                        <div className="wcb-card-top">
                          <span className="wcb-pill">{channelIcon(t.channel)} {channelName(t.channel)}</span>
                          <button type="button" className="wcb-card-del" onClick={(e) => { e.stopPropagation(); onDeleteTemplate?.(t.id); }} aria-label={`Delete template ${t.name}`}>✕</button>
                        </div>
                        <div className="wcb-card-title">{t.name}</div>
                        {t.subject && <div className="wcb-card-snip">{t.subject}</div>}
                      </article>
                    ))
                  ) : col.kind === 'drafts' ? (
                    items.map(d => (
                      <article
                        key={d.id}
                        className={`wcb-card ${dragging?.kind === 'drafts' && dragging.id === d.id ? 'dragging' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'drafts', d.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onEditDraft?.(d)}
                        title="Click to edit in composer · Drag to send now or save as template"
                      >
                        <div className="wcb-card-top">
                          <span className="wcb-pill">{channelIcon(d.channel)} {channelName(d.channel)}</span>
                          {d.campaign && <span className="wcb-pill wcb-pill-campaign">🏷️ {d.campaign}</span>}
                          <button type="button" className="wcb-card-del" onClick={(e) => { e.stopPropagation(); onDeleteDraft?.(d.id); }} aria-label="Delete draft">✕</button>
                        </div>
                        <div className="wcb-card-title">{d.subject || audienceLabel(d.audienceType, d.audienceValue)}</div>
                        {d.body && <div className="wcb-card-snip">{d.body.slice(0, 90)}{d.body.length > 90 ? '…' : ''}</div>}
                        <div className="wcb-card-foot">{audienceLabel(d.audienceType, d.audienceValue)}</div>
                      </article>
                    ))
                  ) : (
                    items.map(h => (
                      <article
                        key={h.id}
                        className={`wcb-card ${dragging?.kind === 'sent' && dragging.id === h.id ? 'dragging' : ''} ${expandedSent === h.id ? 'expanded' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'sent', h.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setExpandedSent(v => v === h.id ? null : h.id)}
                        title="Click to expand · Drag to duplicate as a draft or save as template"
                      >
                        <div className="wcb-card-top">
                          <span className="wcb-pill">{channelIcon(h.channel)} {channelName(h.channel)}</span>
                          {h.campaign && <span className="wcb-pill wcb-pill-campaign">🏷️ {h.campaign}</span>}
                          {h.needsResponse && Array.isArray(h.responses) && h.responses.length > 0 && (
                            <span className="wcb-pill wcb-pill-campaign">
                              {h.responses.filter(r => r.status === 'done').length}/{h.responses.length} {h.responseType === 'response' ? 'responded' : 'confirmed'}
                            </span>
                          )}
                          <button type="button" className="wcb-card-del" onClick={(e) => { e.stopPropagation(); onDeleteSent?.(h.id); }} aria-label="Remove">✕</button>
                        </div>
                        <div className="wcb-card-title">{h.subject || h.audienceLabel}</div>
                        {expandedSent === h.id && h.body && <div className="wcb-card-snip wcb-card-snip-full">{h.body}</div>}
                        <div className="wcb-card-foot">
                          {h.recipientCount} recipient{h.recipientCount === 1 ? '' : 's'} · {new Date(h.sentAt).toLocaleDateString()}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
