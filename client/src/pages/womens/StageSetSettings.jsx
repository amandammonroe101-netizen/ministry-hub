import { useState } from 'react';
import './LifeStagesPageSettings.css';

/* ─────────────────────────────────────────────────────────────
   Generic "customizable named stage set" settings panel — the
   describe/reorder/add/remove UI shared by Life Stages and Faith
   Journey (and any future set built on womensListsConfig's
   useStageSet). Fully generic: everything page-specific is passed
   in as props, so `LifeStagesPageSettings.jsx` and
   `FaithJourneyPageSettings.jsx` are just thin wrappers around this
   with different copy/icon choices.
   ───────────────────────────────────────────────────────────── */

const DEFAULT_ICON_CHOICES = ['🌱', '💍', '🤱', '🍂', '🕊️', '🌷', '✨', '📖', '🤝', '☕', '🎓', '🌸'];

export default function StageSetSettings({
  stageSet,
  hint,
  itemNoun = 'stage',
  iconChoices = DEFAULT_ICON_CHOICES,
  namePlaceholder,
  descPlaceholder = 'Description (optional)',
}) {
  const { stages, getStageMeta, setStageDescription, setStageIcon, addStage, removeStage, reorderStage } = stageSet;
  const [drafts, setDrafts] = useState({});
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [iconPickerFor, setIconPickerFor] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const draftFor = (stage) => (drafts[stage] !== undefined ? drafts[stage] : (getStageMeta(stage)?.short || ''));

  const commitDescription = (stage) => {
    const value = (drafts[stage] ?? '').trim();
    setStageDescription(stage, value);
    setDrafts(prev => { const next = { ...prev }; delete next[stage]; return next; });
  };

  const handleAddStage = () => {
    const label = newLabel.trim();
    if (!label) return;
    addStage(label, newDesc.trim());
    setNewLabel(''); setNewDesc('');
  };

  return (
    <div className="wls-set-body">
      <p className="wls-set-hint">{hint}</p>

      <div className="wls-set-group">
        <div className="wls-set-group-title">Describe each {itemNoun}</div>
        <p className="wls-set-hint">Drag by the ⠿ handle to reorder the journey; click a {itemNoun}'s icon to change it.</p>
        <div className="wls-set-list">
          {stages.map((stage, idx) => {
            const meta = getStageMeta(stage) || {};
            return (
              <div
                key={stage}
                className={`wls-set-row${dragIdx === idx ? ' is-dragging' : ''}${overIdx === idx ? ' is-drag-over' : ''}`}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
                onDragLeave={() => setOverIdx(cur => (cur === idx ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null && dragIdx !== idx) reorderStage?.(dragIdx, idx);
                  setDragIdx(null); setOverIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              >
                <div className="wls-set-row-head">
                  <span className="wls-set-row-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
                  <button type="button" className="wls-set-row-icon-btn" onClick={() => setIconPickerFor(cur => (cur === stage ? null : stage))} title="Change icon">
                    {meta.icon || '🌸'}
                  </button>
                  <span className="wls-set-row-label">{stage}</span>
                  <button type="button" className="wls-set-remove-btn" onClick={() => removeStage(stage)} title={`Remove this ${itemNoun}`}>🗑</button>
                </div>
                {iconPickerFor === stage && (
                  <div className="wls-set-icon-picker">
                    {iconChoices.map(ic => (
                      <button key={ic} type="button" className={`wls-set-icon-choice${(meta.icon || '🌸') === ic ? ' selected' : ''}`} onClick={() => { setStageIcon(stage, ic); setIconPickerFor(null); }}>
                        {ic}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  className="wls-set-inp"
                  placeholder={`Short description shown next to this ${itemNoun}…`}
                  value={draftFor(stage)}
                  onChange={(e) => setDrafts(prev => ({ ...prev, [stage]: e.target.value }))}
                  onBlur={() => commitDescription(stage)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="wls-set-group">
        <div className="wls-set-group-title">Add a {itemNoun}</div>
        <div className="wls-set-add-row">
          <input type="text" className="wls-set-inp" placeholder={namePlaceholder} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <input type="text" className="wls-set-inp" placeholder={descPlaceholder} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <button type="button" className="wls-set-add-btn" onClick={handleAddStage} disabled={!newLabel.trim()}>+ Add</button>
        </div>
      </div>
    </div>
  );
}
