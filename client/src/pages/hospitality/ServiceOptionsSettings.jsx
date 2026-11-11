import { useState } from 'react';
import { useServiceOptions, DEFAULT_SERVICE_OPTIONS } from './hospitalityListsConfig';

/* ─────────────────────────────────────────────────────────────
   Profile circle → Page Settings panel for Hospitality's "Service
   preference" dropdown (see AllHosts.jsx). Add / reorder / remove
   the options offered — changes here flow straight into every
   host's Service preference select via useServiceOptions().
   ───────────────────────────────────────────────────────────── */
export default function ServiceOptionsSettings() {
  const [options, setOptions, { error }] = useServiceOptions();
  const list = Array.isArray(options) && options.length ? options : DEFAULT_SERVICE_OPTIONS;
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  const addOption = () => {
    const v = draft.trim();
    if (!v) return;
    if (list.some(o => o.toLowerCase() === v.toLowerCase())) {
      setNotice(`"${v}" is already in the list below.`);
      setTimeout(() => setNotice(''), 2500);
      return;
    }
    setOptions([...list, v]);
    setDraft('');
  };
  const removeOption = (v) => setOptions(list.filter(o => o !== v));
  const move = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[idx], next[to]] = [next[to], next[idx]];
    setOptions(next);
  };

  return (
    <div className="ha-svcset-body">
      <p className="ha-svcset-hint">
        Customize the options offered on a host's "Service preference" dropdown —
        add your own service times, remove ones you don't use, or reorder them.
      </p>
      <div className="ha-svcset-list">
        {list.map((opt, idx) => (
          <div key={opt} className="ha-svcset-row">
            <span className="ha-svcset-label">{opt}</span>
            <div className="ha-svcset-actions">
              <button type="button" className="ha-svcset-icon-btn" disabled={idx === 0} onClick={() => move(idx, -1)} title="Move up">↑</button>
              <button type="button" className="ha-svcset-icon-btn" disabled={idx === list.length - 1} onClick={() => move(idx, 1)} title="Move down">↓</button>
              <button type="button" className="ha-svcset-icon-btn danger" onClick={() => removeOption(opt)} title="Remove">🗑</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="ha-svcset-empty">No options yet — add one below.</div>}
      </div>
      <div className="ha-svcset-add-row">
        <input
          type="text"
          className="ys-inp"
          placeholder='e.g. "5:00 PM" or "First service"'
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
        />
        <button type="button" className="ha-svcset-add-btn" onClick={addOption} disabled={!draft.trim()}>+ Add</button>
      </div>
      {notice && <div className="ha-svcset-notice">{notice}</div>}
      {error && <div className="ha-svcset-notice error">Couldn't save that change — check your connection and try again.</div>}
    </div>
  );
}
