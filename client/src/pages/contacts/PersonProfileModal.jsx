/* Read-only profile viewer for OTHER members, opened by clicking a
   person anywhere on the Contacts page (search results, requests,
   connections). Styled to match the Chat page's other-member profile
   dialog (Chat.jsx MemberProfileDialog / ch-modal* classes) — a
   centered dark card over a blurred backdrop — rather than the shared
   pm-* ProfileModal shell used elsewhere. It has no edit controls;
   instead it surfaces the same connect/accept/remove actions the row
   it was opened from already offered. */

import { useState, useEffect } from 'react';
import { getProfileByUid } from '../../lib/userProfile';
import { CustomAvatar } from '../friends/Avatar';

function getInitials(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function copyToClipboard(value) {
  const text = String(value ?? '');
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className={`ct-copy-btn${copied ? ' copied' : ''}`}
      onClick={copy}
      aria-label={`Copy ${label || 'value'}`}
      title={copied ? 'Copied!' : `Copy ${label || 'value'}`}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

function relationshipState(relationship, myUid) {
  if (!relationship) return 'none';
  if (relationship.status === 'accepted') return 'connected';
  return relationship.senderUid === myUid ? 'sent' : 'incoming';
}

export default function PersonProfileModal({
  open, onClose, uid, fallbackName,
  relationship, myUid, busy,
  onConnect, onAccept, onDismiss,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !uid) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    getProfileByUid(uid).then(p => {
      if (!cancelled) { setProfile(p); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [open, uid]);

  if (!open) return null;

  const name = profile?.displayName || fallbackName || 'Member';
  const state = relationshipState(relationship, myUid);
  const types = Array.isArray(profile?.ministryTypes) ? profile.ministryTypes : [];
  const emailShown = profile?.emailVisible !== false && profile?.email;
  const phoneShown = profile?.phoneVisible !== false && profile?.phone;

  return (
    <div className="ct-profile-backdrop" onClick={onClose}>
      <div className="ct-profile-modal" role="dialog" aria-label={`${name}'s profile`} onClick={e => e.stopPropagation()}>
        <div className="ct-profile-modal-head">
          <span className="ct-profile-modal-title">{loading ? 'Loading profile…' : name}</span>
          <button type="button" className="ct-profile-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ct-profile-modal-body">
          {loading && <div className="ct-profile-hint">Loading…</div>}

          {!loading && !profile && (
            <div className="ct-profile-hint">This profile could not be found.</div>
          )}

          {!loading && profile && (
            <>
              <div className="ct-profile-meta">
                <div className="ct-profile-meta-row">
                  <div className={`ct-profile-avatar ${(profile.avatar || profile.logo) ? 'ct-profile-avatar-img' : ''}`}>
                    {profile.avatar
                      ? <CustomAvatar avatar={profile.avatar} />
                      : profile.logo
                      ? <img src={profile.logo} alt="" />
                      : getInitials(profile.displayName)}
                  </div>
                  <div className="ct-profile-meta-text">
                    <div className="ct-profile-headname">{profile.displayName || 'Member'}</div>
                    {emailShown && <div className="ct-profile-email-sm">{profile.email}</div>}
                  </div>
                </div>
              </div>

              <div className="ct-profile-section">
                <div className="ct-field-lbl">Display name</div>
                <div className="ct-profile-value">
                  {profile.displayName || <span className="ct-profile-empty">—</span>}
                </div>
              </div>

              {emailShown && (
                <div className="ct-profile-section">
                  <div className="ct-field-lbl">Email</div>
                  <div className="ct-profile-value-row">
                    <div className="ct-profile-value">{profile.email}</div>
                    <CopyButton value={profile.email} label="email" />
                  </div>
                </div>
              )}

              {phoneShown && (
                <div className="ct-profile-section">
                  <div className="ct-field-lbl">Phone</div>
                  <div className="ct-profile-value-row">
                    <div className="ct-profile-value">{profile.phone}</div>
                    <CopyButton value={profile.phone} label="phone number" />
                  </div>
                </div>
              )}

              <div className="ct-profile-section">
                <div className="ct-field-lbl">Ministry name</div>
                <div className="ct-profile-value">
                  {profile.ministryName || <span className="ct-profile-empty">—</span>}
                </div>
              </div>

              <div className="ct-profile-section">
                <div className="ct-field-lbl">Type of ministry</div>
                {types.length > 0 ? (
                  <div className="ct-profile-types">
                    {types.map(t => (
                      <span key={t} className="ct-profile-role">{t}</span>
                    ))}
                  </div>
                ) : (
                  <div className="ct-profile-value"><span className="ct-profile-empty">—</span></div>
                )}
              </div>

              <div className="ct-profile-section">
                <div className="ct-field-lbl">About</div>
                {profile.bio
                  ? <div className="ct-profile-bio">{profile.bio}</div>
                  : <div className="ct-profile-value"><span className="ct-profile-empty">—</span></div>}
              </div>

              {profile.identifyingKey && (
                <div className="ct-profile-section">
                  <div className="ct-field-lbl">Identifying key</div>
                  <div className="ct-profile-value-row">
                    <div className="ct-profile-value ct-profile-mono">{profile.identifyingKey}</div>
                    <CopyButton value={profile.identifyingKey} label="identifying key" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && profile && (
          <div className="ct-profile-modal-actions">
            {state === 'none' && (
              <button className="app-btn primary" disabled={busy} onClick={() => onConnect(profile)}>
                {busy ? 'Sending…' : '+ Connect'}
              </button>
            )}
            {state === 'sent' && (
              <button className="ct-btn-ghost" disabled={busy} onClick={() => onDismiss(relationship)}>
                {busy ? '…' : 'Cancel request'}
              </button>
            )}
            {state === 'incoming' && (
              <>
                <button className="ct-btn-ghost" disabled={busy} onClick={() => onDismiss(relationship)}>
                  {busy ? '…' : 'Decline'}
                </button>
                <button className="app-btn primary" disabled={busy} onClick={() => onAccept(relationship)}>
                  {busy ? '…' : 'Accept request'}
                </button>
              </>
            )}
            {state === 'connected' && (
              <>
                <span className="ct-pill">✓ Connected</span>
                <button className="ct-btn-ghost" disabled={busy} onClick={() => onDismiss(relationship)}>
                  {busy ? '…' : 'Remove'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
