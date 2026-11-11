import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdministrationShell from './AdministrationShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import AdministrationMenuSettings from './AdministrationMenuSettings';
import AdministrationOnboardingModal from './AdministrationOnboardingModal';
import { useUserStoreKey } from '../../lib/userStore';
import {
  getAdministrationPage,
  ADMINISTRATION_OVERVIEW,
  ADMINISTRATION_GROUPS,
  ADMINISTRATION_ACCENT,
} from './administrationConfig';
import { ADMINISTRATION_VISIBILITY_STORAGE_KEY, ADMINISTRATION_ONBOARDING_SEEN_KEY } from './administrationVisibilityConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Administration — generic "Coming Soon" page.

   Renders the bespoke AdministrationShell (nav + header) and a
   placeholder panel that introduces what the page will become.
   Reads its title / icon / description / accent from
   `administrationConfig.js` based on the current route, so a
   single route element can serve every Administration sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <AdminPayroll />).
     2. In App.jsx, swap the <AdministrationComingSoon /> on
        that route for the real component. Keep the entry in
        administrationConfig.js so the sidebar item stays
        consistent.
   ───────────────────────────────────────────────────────────── */

export default function AdministrationComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getAdministrationPage(pathname) || ADMINISTRATION_OVERVIEW;

  const isOverview = page.path === ADMINISTRATION_OVERVIEW.path;
  const accent     = page.accent || ADMINISTRATION_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* First-ever visit to the Overview: ask them which pages they want,
     then never show this again (see ADMINISTRATION_ONBOARDING_SEEN_KEY). */
  const [onboardingSeen, setOnboardingSeen, { loading: onboardingLoading }] =
    useUserStoreKey(ADMINISTRATION_ONBOARDING_SEEN_KEY, false);
  const [, setPageVisibility] = useUserStoreKey(ADMINISTRATION_VISIBILITY_STORAGE_KEY, {});
  const showOnboarding = isOverview && !onboardingLoading && !onboardingSeen;

  const finishOnboarding = (visibility) => {
    setPageVisibility(visibility);
    setOnboardingSeen(true);
  };

  return (
    <AdministrationShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="ac-root" style={{ '--ac-accent': accent }}>
        <div className="ac-shell">

          {!isOverview && (
            <section className="ac-card">
              <div className="ac-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="ac-card-title">This page is on the way</h2>
              <p className="ac-card-copy">
                The Administration tab is fully wired into the
                sidebar so each sub-page can be built independently.
                Pick another section from the menu, or jump back to
                the Overview to plan what to tackle next.
              </p>
              <div className="ac-card-actions">
                <button
                  type="button"
                  className="ac-btn ac-btn-primary"
                  onClick={() => navigate(ADMINISTRATION_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="ac-map">
              <h2 className="ac-map-title">Everything in Administration</h2>
              <p className="ac-map-sub">
                Click any card to open its page.
              </p>
              {ADMINISTRATION_GROUPS.map(group => (
                <div key={group.key} className="ac-map-group">
                  <h3 className="ac-map-group-title">
                    <span className="ac-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="ac-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="ac-map-card"
                        style={{ '--ac-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="ac-map-card-icon">{item.icon}</span>
                        <span className="ac-map-card-label">{item.label}</span>
                        <span className="ac-map-card-desc">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

        </div>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🏛 Customize Menu"
        pageSettings={<AdministrationMenuSettings />}
      />

      {showOnboarding && <AdministrationOnboardingModal onFinish={finishOnboarding} />}
    </AdministrationShell>
  );
}
