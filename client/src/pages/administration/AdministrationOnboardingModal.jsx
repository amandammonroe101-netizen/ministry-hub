import { useState } from 'react';
import { ADMINISTRATION_GROUPS } from './administrationConfig';
import { ALL_ADMINISTRATION_TOGGLEABLE_PATHS } from './administrationVisibilityConfig';
import './AdministrationOnboardingModal.css';

/* ─────────────────────────────────────────────────────────────
   Administration Ministry — one-time "pick your pages" modal.
   Shown the first time a member lands on the Overview (gated in
   ComingSoon.jsx via ADMINISTRATION_ONBOARDING_SEEN_KEY). Everything
   starts checked; they uncheck what they don't need. Saving
   writes the resulting map straight to ADMINISTRATION_VISIBILITY_STORAGE_KEY
   (same shape AdministrationMenuSettings reads/writes later), so this is
   really just that same settings screen, asked once up front.
   ───────────────────────────────────────────────────────────── */

export default function AdministrationOnboardingModal({ onFinish }) {
  const [visibility, setVisibility] = useState(() => {
    const init = {};
    ALL_ADMINISTRATION_TOGGLEABLE_PATHS.forEach(p => { init[p] = true; });
    return init;
  });

  const toggle = (path) => setVisibility(prev => ({ ...prev, [path]: !prev[path] }));
  const finish = () => onFinish?.(visibility);

  return (
    <div
      className="adob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your Administration menu"
      onClick={finish}
    >
      <div className="adob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="adob-head">
          <div className="adob-emoji" aria-hidden="true">🏛</div>
          <div className="adob-eyebrow">Welcome</div>
          <h2 className="adob-title">Make This Space Yours</h2>
          <p className="adob-lead">
            Choose which pages show up in your Administration menu.
            Everything starts checked — uncheck anything you don't need right now.
          </p>
        </header>

        <div className="adob-body">
          {ADMINISTRATION_GROUPS.map(group => (
            <PageGroup
              key={group.key}
              title={`${group.icon} ${group.label}`}
              items={group.items}
              visibility={visibility}
              onToggle={toggle}
            />
          ))}
        </div>

        <footer className="adob-foot">
          <button type="button" className="adob-btn" onClick={finish}>
            Save &amp; Continue
          </button>
          <p className="adob-foot-note">
            You can always change this later from the 🏛 profile circle in the top right.
          </p>
        </footer>
      </div>
    </div>
  );
}

function PageGroup({ title, items, visibility, onToggle }) {
  return (
    <div className="adob-group">
      <div className="adob-group-title">{title}</div>
      <div className="adob-grid">
        {items.map(item => {
          const on = !!visibility[item.path];
          return (
            <label key={item.path} className={`adob-row${on ? ' on' : ''}`}>
              <input
                type="checkbox"
                className="adob-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="adob-row-icon" aria-hidden="true">{item.icon}</span>
              <div className="adob-row-text">
                <span className="adob-row-label">{item.label}</span>
                <span className="adob-row-desc">{item.description}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
