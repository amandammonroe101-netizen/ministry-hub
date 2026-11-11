import { useState } from 'react';
import { OUTREACH_GROUPS } from './outreachConfig';
import { ALL_OUTREACH_TOGGLEABLE_PATHS } from './outreachVisibilityConfig';
import './OutreachOnboardingModal.css';

/* ─────────────────────────────────────────────────────────────
   Outreach Ministry — one-time "pick your pages" modal.
   Shown the first time a member lands on the Overview (gated in
   ComingSoon.jsx via OUTREACH_ONBOARDING_SEEN_KEY). Everything
   starts checked; they uncheck what they don't need. Saving
   writes the resulting map straight to OUTREACH_VISIBILITY_STORAGE_KEY
   (same shape OutreachMenuSettings reads/writes later), so this is
   really just that same settings screen, asked once up front.
   ───────────────────────────────────────────────────────────── */

export default function OutreachOnboardingModal({ onFinish }) {
  const [visibility, setVisibility] = useState(() => {
    const init = {};
    ALL_OUTREACH_TOGGLEABLE_PATHS.forEach(p => { init[p] = true; });
    return init;
  });

  const toggle = (path) => setVisibility(prev => ({ ...prev, [path]: !prev[path] }));
  const finish = () => onFinish?.(visibility);

  return (
    <div
      className="oob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your Outreach Ministry menu"
      onClick={finish}
    >
      <div className="oob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="oob-head">
          <div className="oob-emoji" aria-hidden="true">🤲</div>
          <div className="oob-eyebrow">Welcome</div>
          <h2 className="oob-title">Make This Space Yours</h2>
          <p className="oob-lead">
            Choose which pages show up in your Outreach Ministry menu.
            Everything starts checked — uncheck anything you don't need right now.
          </p>
        </header>

        <div className="oob-body">
          {OUTREACH_GROUPS.map(group => (
            <PageGroup
              key={group.key}
              title={`${group.icon} ${group.label}`}
              items={group.items}
              visibility={visibility}
              onToggle={toggle}
            />
          ))}
        </div>

        <footer className="oob-foot">
          <button type="button" className="oob-btn" onClick={finish}>
            Save &amp; Continue
          </button>
          <p className="oob-foot-note">
            You can always change this later from the 🤲 profile circle in the top right.
          </p>
        </footer>
      </div>
    </div>
  );
}

function PageGroup({ title, items, visibility, onToggle }) {
  return (
    <div className="oob-group">
      <div className="oob-group-title">{title}</div>
      <div className="oob-grid">
        {items.map(item => {
          const on = !!visibility[item.path];
          return (
            <label key={item.path} className={`oob-row${on ? ' on' : ''}`}>
              <input
                type="checkbox"
                className="oob-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="oob-row-icon" aria-hidden="true">{item.icon}</span>
              <div className="oob-row-text">
                <span className="oob-row-label">{item.label}</span>
                <span className="oob-row-desc">{item.description}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
