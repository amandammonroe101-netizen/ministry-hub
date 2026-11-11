import { useState } from 'react';
import { WOMENS_GROUPS } from './womensConfig';
import { WOMENS_TOGGLEABLE_TOP_LINKS, ALL_WOMENS_TOGGLEABLE_PATHS } from './womensVisibilityConfig';
import './WomensOnboardingModal.css';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — one-time "pick your pages" modal.
   Shown the first time a woman lands on the Overview (gated in
   ComingSoon.jsx via WOMENS_ONBOARDING_SEEN_KEY). Everything
   starts checked; she unchecks what she doesn't need. Saving
   writes the resulting map straight to WOMENS_VISIBILITY_STORAGE_KEY
   (same shape WomensMenuSettings reads/writes later), so this is
   really just that same settings screen, asked once up front.
   ───────────────────────────────────────────────────────────── */

export default function WomensOnboardingModal({ onFinish }) {
  const [visibility, setVisibility] = useState(() => {
    const init = {};
    ALL_WOMENS_TOGGLEABLE_PATHS.forEach(p => { init[p] = true; });
    return init;
  });

  const toggle = (path) => setVisibility(prev => ({ ...prev, [path]: !prev[path] }));
  const finish = () => onFinish?.(visibility);

  return (
    <div
      className="wob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your Women's Ministry menu"
      onClick={finish}
    >
      <div className="wob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wob-head">
          <div className="wob-emoji" aria-hidden="true">🌷</div>
          <div className="wob-eyebrow">Welcome</div>
          <h2 className="wob-title">Make This Space Yours</h2>
          <p className="wob-lead">
            Choose which pages show up in your Women's Ministry menu.
            Everything starts checked — uncheck anything you don't need right now.
          </p>
        </header>

        <div className="wob-body">
          <PageGroup title="Menu" items={WOMENS_TOGGLEABLE_TOP_LINKS} visibility={visibility} onToggle={toggle} />
          {WOMENS_GROUPS.map(group => (
            <PageGroup
              key={group.key}
              title={`${group.icon} ${group.label}`}
              items={group.items}
              visibility={visibility}
              onToggle={toggle}
            />
          ))}
        </div>

        <footer className="wob-foot">
          <button type="button" className="wob-btn" onClick={finish}>
            Save &amp; Continue
          </button>
          <p className="wob-foot-note">
            You can always change this later from the 🌸 profile circle in the top right.
          </p>
        </footer>
      </div>
    </div>
  );
}

function PageGroup({ title, items, visibility, onToggle }) {
  return (
    <div className="wob-group">
      <div className="wob-group-title">{title}</div>
      <div className="wob-grid">
        {items.map(item => {
          const on = !!visibility[item.path];
          return (
            <label key={item.path} className={`wob-row${on ? ' on' : ''}`}>
              <input
                type="checkbox"
                className="wob-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="wob-row-icon" aria-hidden="true">{item.icon}</span>
              <div className="wob-row-text">
                <span className="wob-row-label">{item.label}</span>
                <span className="wob-row-desc">{item.description}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
