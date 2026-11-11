import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BusinessShell from './BusinessShell';
import { businessService } from '../../services/businessService';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import {
  getBusinessPage,
  businessPagePath,
  BUSINESS_GROUPS,
  BUSINESS_OVERVIEW,
  BUSINESS_ACCENT,
} from './businessConfig';
import './BusinessComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Business — generic "Coming Soon" page.

   Fallback for every Business sub-page that hasn't been built yet
   (Orders, Invoices, Customers, Finances, ...). Renders the bespoke
   BusinessShell (nav + header) plus a placeholder panel, and a map
   of every other page in this business so a member can jump around
   while the rest of the module is filled in one page at a time.

   To replace this with a real page later:
     1. Build the real component (e.g. <BusinessOrders />).
     2. In App.jsx, swap <BusinessComingSoon /> for it on that route.
        Keep the entry in businessConfig.js so the nav stays
        consistent.
   ───────────────────────────────────────────────────────────── */

export default function BusinessComingSoon() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { businessId } = useParams();
  const page = getBusinessPage(pathname);
  const accent = page?.accent || BUSINESS_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [business, setBusiness] = useState(null);

  useEffect(() => {
    let cancelled = false;
    businessService.getOne(businessId)
      .then(res => { if (!cancelled) setBusiness(res.data.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [businessId]);

  return (
    <BusinessShell
      title={page?.label || 'Business'}
      icon={page?.icon}
      subtitle={page?.description}
      businessName={business?.name}
      businessIcon={business?.icon}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="bcs-root" style={{ '--bcs-accent': accent }}>
        <div className="bcs-shell">
          <section className="bcs-card">
            <div className="bcs-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="bcs-card-title">This page is on the way</h2>
            <p className="bcs-card-copy">
              This section of {business?.name || 'the business'} is fully wired into the
              menu so it can be built out independently. Pick another section below,
              or jump back to the Product Catalog.
            </p>
            <div className="bcs-card-actions">
              <button
                type="button"
                className="bcs-btn bcs-btn-primary"
                onClick={() => navigate(businessPagePath(businessId, '/business/:businessId/catalog'))}
              >
                🛍 Product Catalog
              </button>
              <button
                type="button"
                className="bcs-btn bcs-btn-ghost"
                onClick={() => navigate(BUSINESS_OVERVIEW.path)}
              >
                ⇄ Switch Business
              </button>
            </div>
          </section>

          <section className="bcs-map">
            <h2 className="bcs-map-title">Everything in {business?.name || 'this business'}</h2>
            <p className="bcs-map-sub">Click any card to open its page.</p>
            {BUSINESS_GROUPS.map(group => (
              <div key={group.key} className="bcs-map-group">
                <h3 className="bcs-map-group-title">
                  <span className="bcs-map-group-icon">{group.icon}</span>
                  {group.label}
                </h3>
                <div className="bcs-map-grid">
                  {group.items.map(item => {
                    const href = businessPagePath(businessId, item.path);
                    return (
                      <button
                        key={item.path}
                        type="button"
                        className={`bcs-map-card${pathname === href ? ' is-active' : ''}`}
                        style={{ '--bcs-card-accent': item.accent || group.color }}
                        onClick={() => navigate(href)}
                      >
                        <span className="bcs-map-card-icon">{item.icon}</span>
                        <span className="bcs-map-card-label">{item.label}</span>
                        <span className="bcs-map-card-desc">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </BusinessShell>
  );
}
