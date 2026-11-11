/* Shared Profile Modal.

   Mirrors the two-tab modal that Journal.jsx introduced (Profile ·
   Page Settings) so any page can reuse the same UX without
   re-implementing it. Each consumer provides:
     • its own Page Settings tab body (a React node)
     • the page tab label (e.g. "📋 Page Settings")

   Profile is identical across pages — it lives right here. Page
   Settings is rendered via the `pageSettings` prop so each page can
   keep its page-specific knobs co-located with the page that owns
   them. */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile, contactFields } from '../../lib/userProfile';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { CustomAvatar, AvatarBuilder, DEFAULT_AVATAR } from '../../pages/friends/Avatar';
import './ProfileModal.css';

/* Kept in sync with Chat / Journal lists. If this drifts long-term,
   lift to a shared module. */
const MINISTRY_TYPES = [
  'Worship', 'Youth', "Children's", 'Outreach', 'Small Groups',
  'Prayer', 'Tech / Production', 'Missions', 'Hospitality',
  'Discipleship', 'Pastoral / Teaching', 'Administration', 'Other',
];

export function getInitialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function copyText(value) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/* ── Tiny convenience hook returning the bits a page topbar needs
      to render the profile avatar: initials + the source name used
      as the tooltip label. */
export function useProfileTopbar() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const avatarSourceName = profile?.displayName || user?.displayName || user?.email || '';
  const initials = getInitialsFromName(avatarSourceName);
  return { user, profile, loading, avatarSourceName, initials };
}

/* ── Modal shell ─────────────────────────────────────────── */
export function ProfileModal({
  open, onClose,
  pageSettings,                  // React node — the page's settings body
  pageTabLabel = '📋 Page Settings',
  initialTab   = 'profile',      // 'profile' | 'page' | 'guide'
  showPageTab  = true,           // set false to hide the Page Settings tab entirely
  guide,                         // React node — a page's How-To Guide tab body (omit to hide the tab)
  guideTabLabel = '📘 How-To Guide',
}) {
  const { user, profile, loading } = useProfileTopbar();
  const showGuideTab = !!guide;
  const [tab, setTab] = useState(initialTab);

  /* Re-sync the active tab when the modal is re-opened — otherwise
     a previous tab choice would persist after the user closes and
     re-opens. */
  useEffect(() => {
    if (!open) return;
    const wanted = initialTab === 'page' && !showPageTab ? 'profile'
      : initialTab === 'guide' && !showGuideTab ? 'profile'
      : initialTab;
    setTab(wanted);
  }, [open, initialTab, showPageTab, showGuideTab]);

  if (!open) return null;

  return (
    <>
      <div className="pm-overlay" onClick={onClose}/>
      <div className="pm-modal" role="dialog" aria-label="Profile">
        <div className="pm-modal-hd">
          <div className="pm-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'profile'}
              className={`pm-tab ${tab === 'profile' ? 'active' : ''}`}
              onClick={() => setTab('profile')}
            >👤 Profile</button>
            {showPageTab && (
              <button
                role="tab"
                aria-selected={tab === 'page'}
                className={`pm-tab ${tab === 'page' ? 'active' : ''}`}
                onClick={() => setTab('page')}
              >{pageTabLabel}</button>
            )}
            {showGuideTab && (
              <button
                role="tab"
                aria-selected={tab === 'guide'}
                className={`pm-tab ${tab === 'guide' ? 'active' : ''}`}
                onClick={() => setTab('guide')}
              >{guideTabLabel}</button>
            )}
          </div>
          <button className="pm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {tab === 'profile' && (
          <ProfileTab
            profile={profile}
            loading={loading}
            user={user}
            onClose={onClose}
          />
        )}

        {showPageTab && tab === 'page' && (
          <div className="pm-body">{pageSettings}</div>
        )}

        {showGuideTab && tab === 'guide' && (
          <div className="pm-body">{guide}</div>
        )}
      </div>
    </>
  );
}

/* ── Profile tab body ─────────────────────────────────────
      Editable profile form. Saves to /users/{uid}. */
function ProfileTab({ profile, loading, user, onClose }) {
  const [displayName, setDisplayName]     = useState(profile?.displayName || '');
  const [ministryName, setMinistryName]   = useState(profile?.ministryName || '');
  const [logo, setLogo]                   = useState(profile?.logo || '');
  const [logoErr, setLogoErr]             = useState('');
  const [avatar, setAvatar]               = useState(profile?.avatar || null);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [ministryTypes, setMinistryTypes] = useState(
    Array.isArray(profile?.ministryTypes)
      ? profile.ministryTypes
      : profile?.ministryType ? [profile.ministryType] : []
  );
  const [bio, setBio]                     = useState(profile?.bio || '');
  const [emailVisible, setEmailVisible]   = useState(profile?.emailVisible !== false);
  const [phone, setPhone]                 = useState(profile?.phone || '');
  const [phoneVisible, setPhoneVisible]   = useState(profile?.phoneVisible !== false);
  const [busy, setBusy]                   = useState(false);
  const [err, setErr]                     = useState('');
  const [copied, setCopied]               = useState(false);
  const [toast, setToast]                 = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setMinistryName(profile.ministryName || '');
    setLogo(profile.logo || '');
    setAvatar(profile.avatar || null);
    setMinistryTypes(
      Array.isArray(profile.ministryTypes)
        ? profile.ministryTypes
        : profile.ministryType ? [profile.ministryType] : []
    );
    setBio(profile.bio || '');
    setEmailVisible(profile.emailVisible !== false);
    setPhone(profile.phone || '');
    setPhoneVisible(profile.phoneVisible !== false);
  }, [profile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleType = (t) => {
    setMinistryTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const onLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoErr('');
    try {
      setLogo(await fileToResizedDataUrl(file, { maxSize: 256 }));
    } catch (ex) {
      setLogoErr(ex?.message || 'Could not use that image.');
    }
  };

  const copyKey = async () => {
    if (!profile?.identifyingKey) return;
    const ok = await copyText(profile.identifyingKey);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!displayName.trim()) { setErr('Display name is required.'); return; }
    if (!profile?.uid)        { setErr('Profile not loaded yet.'); return; }
    setBusy(true); setErr('');
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName:  displayName.trim(),
        ministryName: ministryName.trim(),
        logo:         logo || '',
        avatar:       avatar || null,
        ministryTypes,
        bio:          bio.trim(),
        ...contactFields({ emailVisible, phone, phoneVisible }),
      });
      setToast('Profile saved.');
      setTimeout(() => { setToast(''); onClose?.(); }, 800);
    } catch (ex) {
      setErr(ex?.message || 'Failed to save profile.');
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="pm-body"><div className="pm-loading">Loading profile…</div></div>;
  }
  if (!profile) {
    return (
      <div className="pm-body">
        <div className="pm-loading">
          No profile found yet. It will appear here after you visit Chat once.
        </div>
      </div>
    );
  }

  return (
    <>
    <form className="pm-body" onSubmit={submit}>
      {err   && <div className="pm-err">{err}</div>}
      {toast && <div className="pm-toast">{toast}</div>}

      <div className="pm-meta">
        <button
          type="button"
          className="pm-avatar-edit-btn"
          onClick={() => setAvatarEditorOpen(true)}
          title="Build your own avatar — other members will see this on your profile"
        >
          <div className={`pm-avatar-lg ${avatar ? 'has-img' : ''}`}>
            {avatar
              ? <CustomAvatar avatar={avatar} />
              : getInitialsFromName(displayName || profile?.displayName)}
          </div>
          <span className="pm-avatar-edit-badge" aria-hidden="true">🎨</span>
        </button>
        <div className="pm-meta-text">
          {profile.email && <div className="pm-email">{profile.email}</div>}
          {avatar && (
            <button
              type="button"
              className="pm-avatar-remove"
              onClick={() => setAvatar(null)}
            >Remove avatar</button>
          )}
          {profile.identifyingKey && (
            <button
              type="button"
              className={`pm-keychip ${copied ? 'copied' : ''}`}
              onClick={copyKey}
              title="Click to copy your identifying key"
            >
              <span className="pm-keychip-lbl">Your key</span>
              <span className="pm-keychip-val">{profile.identifyingKey}</span>
              <span className="pm-keychip-act">{copied ? '✓' : '⧉'}</span>
            </button>
          )}
        </div>
      </div>

      {profile.email && (
        <label className="pm-toggle">
          <input
            type="checkbox"
            checked={emailVisible}
            onChange={e => setEmailVisible(e.target.checked)}
          />
          <span>Show my email to other members</span>
        </label>
      )}

      <label className="pm-field">
        <span className="pm-lbl">Phone number</span>
        <input
          type="tel" className="pm-input"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="e.g. (555) 123-4567"
        />
      </label>

      {phone.trim() && (
        <label className="pm-toggle">
          <input
            type="checkbox"
            checked={phoneVisible}
            onChange={e => setPhoneVisible(e.target.checked)}
          />
          <span>Show my phone number to other members</span>
        </label>
      )}

      <label className="pm-field">
        <span className="pm-lbl">Display name</span>
        <input
          type="text" className="pm-input"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
        />
      </label>

      <label className="pm-field">
        <span className="pm-lbl">Ministry name</span>
        <input
          type="text" className="pm-input"
          value={ministryName}
          onChange={e => setMinistryName(e.target.value)}
          placeholder="e.g. Trinity Church Worship Team"
        />
      </label>

      <div className="pm-field">
        <span className="pm-lbl">Ministry logo <span className="pm-lbl-hint">— shown in your header</span></span>
        <div className="pm-logo-row">
          <div className="pm-logo-preview">
            {logo
              ? <img src={logo} alt="Ministry logo preview" />
              : <span className="pm-logo-placeholder" aria-hidden="true">⛪</span>}
          </div>
          <div className="pm-logo-actions">
            <label className="pm-logo-btn">
              {logo ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/*" onChange={onLogoPick} hidden />
            </label>
            {logo && (
              <button type="button" className="pm-logo-remove" onClick={() => { setLogo(''); setLogoErr(''); }}>
                Remove
              </button>
            )}
          </div>
        </div>
        {logoErr && <div className="pm-err">{logoErr}</div>}
      </div>

      <div className="pm-field">
        <span className="pm-lbl">
          Type of ministry <span className="pm-lbl-hint">— pick any that apply</span>
        </span>
        <div className="pm-chips">
          {MINISTRY_TYPES.map(t => {
            const on = ministryTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={`pm-chip ${on ? 'on' : ''}`}
                onClick={() => toggleType(t)}
                aria-pressed={on}
              >
                {on && <span aria-hidden="true">✓ </span>}{t}
              </button>
            );
          })}
        </div>
      </div>

      <label className="pm-field">
        <span className="pm-lbl">About you</span>
        <textarea
          className="pm-input pm-textarea"
          rows={4}
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="A short bio that other members will see."
        />
      </label>

      <div className="pm-actions">
        <button type="button" className="pm-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="pm-save" disabled={busy}>
          {busy ? 'Saving…' : '💾 Save Profile'}
        </button>
      </div>
    </form>

    {avatarEditorOpen && (
      <AvatarBuilder
        initial={avatar || DEFAULT_AVATAR}
        name={displayName || profile?.displayName}
        onSave={(cfg) => { setAvatar(cfg); setAvatarEditorOpen(false); }}
        onCancel={() => setAvatarEditorOpen(false)}
      />
    )}
    </>
  );
}
