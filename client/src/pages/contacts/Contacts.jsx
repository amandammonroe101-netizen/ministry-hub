import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile, useProfileAvatars } from '../../lib/userProfile';
import {
  searchUsers, sendConnectionRequest, acceptRequest, deleteConnection,
  useMyContactRequests,
} from '../../lib/contactRequests';
import {
  acceptInfoShare, declineInfoShare, deleteInfoShareRequest,
  useMyInfoShareRequests,
} from '../../lib/infoShareRequests';
import { useContactsNotifications } from '../../lib/contactsNotifications';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { CustomAvatar } from '../friends/Avatar';
import PersonProfileModal from './PersonProfileModal';
import ChatConnectModal from './ChatConnectModal';
import contactsGuideDocxUrl from '../../assets/contacts-how-to-guide.docx?url';
import PageTourHost from '../../components/tour/PageTourHost';
import './Contacts.css';

const TABS = [
  { key: 'search',      label: 'Search',        emoji: '🔍' },
  { key: 'requests',    label: 'Requests',       emoji: '📨' },
  { key: 'connections', label: 'My Contacts',    emoji: '👥' },
  { key: 'info',        label: 'Info Requests',  emoji: '🔐' },
];

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Contacts() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const [tab, setTab] = useState('search');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [busyUid, setBusyUid] = useState(null);
  const [profileUid, setProfileUid] = useState(null);
  const [profileFallbackName, setProfileFallbackName] = useState('');
  const [chatContact, setChatContact] = useState(null);
  const debounceRef = useRef(null);

  const openProfile = (uid, name) => {
    setProfileUid(uid);
    setProfileFallbackName(name || '');
  };

  const openChat = (uid, name) => {
    setChatContact({ uid, displayName: name || '' });
  };

  const { requests, loading: requestsLoading } = useMyContactRequests();
  const { requests: infoRequests, loading: infoRequestsLoading } = useMyInfoShareRequests();
  const { newConnectionsCount, markConnectionsSeen } = useContactsNotifications();

  const myUid = user?.uid || null;

  const incoming = useMemo(
    () => requests.filter(r => r.status === 'pending' && r.recipientUid === myUid),
    [requests, myUid]
  );
  const outgoing = useMemo(
    () => requests.filter(r => r.status === 'pending' && r.senderUid === myUid),
    [requests, myUid]
  );
  const connections = useMemo(
    () => requests.filter(r => r.status === 'accepted'),
    [requests]
  );

  const incomingInfo = useMemo(
    () => infoRequests.filter(r => r.status === 'pending' && r.recipientUid === myUid),
    [infoRequests, myUid]
  );
  const outgoingInfo = useMemo(
    () => infoRequests
      .filter(r => r.senderUid === myUid)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
    [infoRequests, myUid]
  );

  /* Map every uid I already have SOME relationship with → that
     request, so search results can render the right button
     (Connect / Pending / Connected) instead of always "Connect". */
  const relationshipByUid = useMemo(() => {
    const map = new Map();
    for (const r of requests) {
      const otherUid = r.senderUid === myUid ? r.recipientUid : r.senderUid;
      map.set(otherUid, r);
    }
    return map;
  }, [requests, myUid]);

  /* Requests/connections docs only snapshot {uid, name} — not the
     other person's saved avatar — so fetch it separately for every
     uid shown across Requests / My Contacts / Info Requests. Search
     results already carry the full profile (incl. avatar), so they
     don't need this. */
  const otherUids = useMemo(() => {
    const uids = new Set();
    for (const r of requests) {
      uids.add(r.senderUid === myUid ? r.recipientUid : r.senderUid);
    }
    for (const r of infoRequests) {
      uids.add(r.senderUid === myUid ? r.recipientUid : r.senderUid);
    }
    uids.delete(myUid);
    uids.delete(undefined);
    return Array.from(uids);
  }, [requests, infoRequests, myUid]);
  const avatarsByUid = useProfileAvatars(otherUids);

  /* Debounced search — fires 300ms after the user stops typing. */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = term.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchUsers(q, myUid);
        setResults(matches);
        setSearchError(null);
      } catch (err) {
        setSearchError(err?.message || 'Search failed.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [term, myUid]);

  /* Opening My Contacts clears the "new connection" badge — both here
     and on the NavRail Contacts item, since they share the same
     last-seen timestamp via useContactsNotifications(). */
  useEffect(() => {
    if (tab === 'connections' && newConnectionsCount > 0) {
      markConnectionsSeen();
    }
  }, [tab, newConnectionsCount, markConnectionsSeen]);

  const handleConnect = async (target) => {
    if (!profile) return;
    setBusyUid(target.uid);
    try {
      await sendConnectionRequest(profile, target);
    } catch (err) {
      setSearchError(err?.message || 'Could not send request.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleAccept = async (req) => {
    setBusyUid(req.senderUid);
    try { await acceptRequest(req); }
    finally { setBusyUid(null); }
  };

  const handleDismiss = async (req) => {
    const otherUid = req.senderUid === myUid ? req.recipientUid : req.senderUid;
    setBusyUid(otherUid);
    try { await deleteConnection(req); }
    finally { setBusyUid(null); }
  };

  const handleAcceptInfo = async (req) => {
    setBusyUid(req.senderUid);
    try { await acceptInfoShare(req); }
    finally { setBusyUid(null); }
  };

  const handleDeclineInfo = async (req) => {
    setBusyUid(req.senderUid);
    try { await declineInfoShare(req); }
    finally { setBusyUid(null); }
  };

  const handleDismissInfo = async (req) => {
    const otherUid = req.senderUid === myUid ? req.recipientUid : req.senderUid;
    setBusyUid(otherUid);
    try { await deleteInfoShareRequest(req); }
    finally { setBusyUid(null); }
  };

  return (
    <div className="ct-root">
      <PageTourHost pageId="contacts" />

      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag contacts">Contacts</span>
        </div>
        <div className="app-tb-actions">
          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      <div className="ct-body">
        <div className="ct-search-wrap">
          <div className="ct-search-bar">
            <span className="ct-search-icon">🔍</span>
            <input
              type="text"
              className="ct-search-input"
              placeholder="Search people by name, email, or connect key…"
              value={term}
              onChange={(e) => { setTerm(e.target.value); setTab('search'); }}
            />
            {term && (
              <button className="ct-search-clear" onClick={() => setTerm('')} aria-label="Clear search">✕</button>
            )}
          </div>
          {profile?.identifyingKey && (
            <div className="ct-my-key">
              Your connect key: <strong>{profile.identifyingKey}</strong>
            </div>
          )}
        </div>

        <nav className="ct-tabs" role="tablist" aria-label="Contacts views">
          {TABS.map(t => {
            const badge = t.key === 'requests' ? incoming.length
              : t.key === 'connections' ? newConnectionsCount
              : t.key === 'info' ? incomingInfo.length
              : 0;
            return (
              <button
                key={t.key}
                role="tab" aria-selected={tab === t.key}
                className={`ct-tab ${tab === t.key ? 'on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="ct-tab-icon">{t.emoji}</span>
                <span>{t.label}</span>
                {badge > 0 && <span className="ct-tab-badge">{badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="ct-content">
          {tab === 'search' && (
            <SearchPane
              term={term}
              searching={searching}
              error={searchError}
              results={results}
              relationshipByUid={relationshipByUid}
              myUid={myUid}
              busyUid={busyUid}
              onConnect={handleConnect}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
              onOpenProfile={openProfile}
            />
          )}

          {tab === 'requests' && (
            <RequestsPane
              loading={requestsLoading}
              incoming={incoming}
              outgoing={outgoing}
              avatarsByUid={avatarsByUid}
              busyUid={busyUid}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
              onOpenProfile={openProfile}
            />
          )}

          {tab === 'connections' && (
            <ConnectionsPane
              loading={requestsLoading}
              connections={connections}
              avatarsByUid={avatarsByUid}
              myUid={myUid}
              busyUid={busyUid}
              onDismiss={handleDismiss}
              onOpenProfile={openProfile}
              onChat={openChat}
            />
          )}

          {tab === 'info' && (
            <InfoRequestsPane
              loading={infoRequestsLoading}
              incoming={incomingInfo}
              outgoing={outgoingInfo}
              avatarsByUid={avatarsByUid}
              busyUid={busyUid}
              onAccept={handleAcceptInfo}
              onDecline={handleDeclineInfo}
              onDismiss={handleDismissInfo}
              onOpenProfile={openProfile}
            />
          )}
        </div>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={<ContactsPageSettings />}
      />

      <PersonProfileModal
        open={Boolean(profileUid)}
        onClose={() => setProfileUid(null)}
        uid={profileUid}
        fallbackName={profileFallbackName}
        relationship={profileUid ? relationshipByUid.get(profileUid) : null}
        myUid={myUid}
        busy={busyUid === profileUid}
        onConnect={handleConnect}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
      />

      <ChatConnectModal
        open={Boolean(chatContact)}
        onClose={() => setChatContact(null)}
        contact={chatContact}
        myUid={myUid}
        myName={profile?.displayName}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Contacts Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab. Contacts doesn't have bespoke
   settings yet, but it follows the same sub-tab pill pattern as
   Friends/Prayers so the "How to Use" guide has a real home and
   future settings can slot in beside it without restructuring
   anything. */
function ContactsPageSettings() {
  const [activeSub, setActiveSub] = useState('general');
  const SUB_TABS = [
    { id: 'general', label: '⚙', name: 'General' },
    { id: 'howto',   label: '❓', name: 'How to Use' },
  ];

  return (
    <div className="ct-ps-root">
      <div className="pm-ps-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id} type="button"
            className={`pm-ps-subtab ${activeSub === t.id ? 'on' : ''}`}
            onClick={() => setActiveSub(t.id)}
          >
            <span className="pm-ps-subtab-icon">{t.label}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {activeSub === 'general' && (
        <div className="pm-body" style={{ alignItems:'center', textAlign:'center', padding:'28px 22px' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>⚙</div>
          <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,.85)', marginBottom:4 }}>
            No Contacts-specific settings yet.
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', maxWidth:340, lineHeight:1.55 }}>
            Future home for search visibility and connection-request defaults.
          </div>
        </div>
      )}

      {/* ───────── ❓ How to Use (howto sub-tab) ───────── */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="ct-ps-howto-header">
          <div className="pm-ps-section-title">❓ How to Use the Contacts Page</div>
          <a
            className="ct-ps-howto-download"
            href={contactsGuideDocxUrl}
            download="Contacts - How to Use.docx"
          >
            ⬇ Download as Word doc
          </a>
        </div>

        <div className="ct-ps-howto-feedback">
          <span className="ct-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="ct-ps-howto-intro">
          A full walkthrough of everything on this page — finding fellow members, sending and
          managing connection requests, and starting a chat once you're connected. Skim the
          headers below or read start to finish.
        </div>

        <div className="ct-ps-howto-block">
          <div className="ct-ps-howto-h">🔍 Search</div>
          <div className="ct-ps-howto-p">
            The default tab. Type a name, email, or someone's exact <b>connect key</b> into the
            search bar to find them (results load as you type). Your own connect key is shown
            just below the search bar — share it with someone so they can find you directly.
          </div>
          <ul className="ct-ps-howto-list">
            <li>Each result card shows an avatar, name, and email (if they've made it visible).</li>
            <li>Click a card to open that person's read-only profile — name, ministry name, ministry
              type(s), bio, and connect key, each with a copy button.</li>
            <li>The button on a card changes based on your relationship with them: <b>+ Connect</b>,
              <b>Cancel request</b> (already sent), <b>Accept request</b> (they invited you), or
              <b>✓ Connected</b>.</li>
          </ul>
        </div>

        <div className="ct-ps-howto-block">
          <div className="ct-ps-howto-h">📨 Requests</div>
          <div className="ct-ps-howto-p">
            Shows two lists: <b>Incoming</b> requests from people who want to connect with you, and
            <b> Sent</b> requests you're still waiting on.
          </div>
          <ul className="ct-ps-howto-list">
            <li>Incoming — click <b>Accept</b> to connect, or <b>Decline</b> to dismiss.</li>
            <li>Sent — shows a <b>Pending</b> pill; click <b>Cancel</b> to withdraw the request.</li>
            <li>A badge with the incoming count appears on the Requests tab whenever you have
              unanswered requests.</li>
          </ul>
        </div>

        <div className="ct-ps-howto-block">
          <div className="ct-ps-howto-h">👥 My Contacts</div>
          <div className="ct-ps-howto-p">
            Everyone whose connection request has been accepted, on either side.
          </div>
          <ul className="ct-ps-howto-list">
            <li>Click a name to view their profile.</li>
            <li><b>💬 Chat</b> — starts a private 1:1 chat with that contact on the Chat page (or
              lets you invite them into a public channel you already belong to). It reuses Chat's
              own invitation flow, so the invite shows up on their Chat page exactly like any other
              channel invite.</li>
            <li><b>Remove</b> — ends the connection. It disappears from both people's My Contacts.</li>
            <li>A badge appears on the My Contacts tab when a new connection has been made that you
              haven't seen yet; opening the tab clears it (also clears the matching badge on the
              nav rail).</li>
          </ul>
        </div>

        <div className="ct-ps-howto-block">
          <div className="ct-ps-howto-h">🔗 Integrations</div>
          <ul className="ct-ps-howto-list">
            <li><b>Chat</b> — the 💬 Chat button on a contact starts or reuses a private channel; it
              stays hidden on their side until they accept the invite.</li>
            <li><b>Friends</b> — typing a name on the Friends page that matches an accepted Contacts
              connection auto-fills their church, photo, and tags.</li>
          </ul>
        </div>

        <div className="ct-ps-howto-block">
          <div className="ct-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="ct-ps-howto-list">
            <li><b>No matches for "…"</b> — try a different name, email, or their exact connect key
              (partial keys won't match).</li>
            <li><b>No contacts yet</b> — accepted connection requests will show up on this tab; send
              a request from Search first.</li>
            <li>Buttons show <b>…</b> or <b>Sending…</b> while a request is in flight — wait for it
              to finish before retrying.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}

/* ── Search results ─────────────────────────────────────────── */
function SearchPane({ term, searching, error, results, relationshipByUid, myUid, busyUid, onConnect, onAccept, onDismiss, onOpenProfile }) {
  if (!term.trim()) {
    return (
      <div className="ct-empty">
        <div className="ct-empty-icon">🔍</div>
        <div className="ct-empty-title">Find people</div>
        <div className="ct-empty-sub">
          Search by name, email, or their connect key to find fellow members
          and request to connect.
        </div>
      </div>
    );
  }

  if (searching) {
    return <div className="ct-loading">Searching…</div>;
  }

  if (error) {
    return <div className="ct-error">{error}</div>;
  }

  if (results.length === 0) {
    return (
      <div className="ct-empty">
        <div className="ct-empty-icon">🙈</div>
        <div className="ct-empty-title">No matches for “{term}”</div>
        <div className="ct-empty-sub">Try a different name, email, or their exact connect key.</div>
      </div>
    );
  }

  return (
    <div className="ct-grid">
      {results.map(p => {
        const rel = relationshipByUid.get(p.uid);
        return (
          <PersonCard
            key={p.uid}
            person={p}
            busy={busyUid === p.uid}
            relationship={rel}
            myUid={myUid}
            onConnect={() => onConnect(p)}
            onAccept={rel ? () => onAccept(rel) : undefined}
            onDismiss={rel ? () => onDismiss(rel) : undefined}
            onOpenProfile={() => onOpenProfile(p.uid, p.displayName)}
          />
        );
      })}
    </div>
  );
}

/* ── Requests (incoming + outgoing) ─────────────────────────── */
function RequestsPane({ loading, incoming, outgoing, avatarsByUid, busyUid, onAccept, onDismiss, onOpenProfile }) {
  if (loading) return <div className="ct-loading">Loading…</div>;

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="ct-empty">
        <div className="ct-empty-icon">📨</div>
        <div className="ct-empty-title">No pending requests</div>
        <div className="ct-empty-sub">Search for someone to send a connection request.</div>
      </div>
    );
  }

  return (
    <div className="ct-req-sections">
      {incoming.length > 0 && (
        <section className="ct-req-section">
          <h3 className="ct-req-heading">Incoming ({incoming.length})</h3>
          <div className="ct-list">
            {incoming.map(r => (
              <RequestRow
                key={r.id}
                uid={r.senderUid}
                name={r.senderName}
                avatar={avatarsByUid?.[r.senderUid]}
                keyLabel={r.senderKey}
                busy={busyUid === r.senderUid}
                primaryLabel="Accept"
                onPrimary={() => onAccept(r)}
                onDismiss={() => onDismiss(r)}
                dismissLabel="Decline"
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="ct-req-section">
          <h3 className="ct-req-heading">Sent ({outgoing.length})</h3>
          <div className="ct-list">
            {outgoing.map(r => (
              <RequestRow
                key={r.id}
                uid={r.recipientUid}
                name={r.recipientName}
                avatar={avatarsByUid?.[r.recipientUid]}
                keyLabel={r.recipientKey}
                busy={busyUid === r.recipientUid}
                pendingLabel="Pending"
                onDismiss={() => onDismiss(r)}
                dismissLabel="Cancel"
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Connections (accepted) ─────────────────────────────────── */
function ConnectionsPane({ loading, connections, avatarsByUid, myUid, busyUid, onDismiss, onOpenProfile, onChat }) {
  if (loading) return <div className="ct-loading">Loading…</div>;

  if (connections.length === 0) {
    return (
      <div className="ct-empty">
        <div className="ct-empty-icon">👥</div>
        <div className="ct-empty-title">No contacts yet</div>
        <div className="ct-empty-sub">Accepted connection requests will show up here.</div>
      </div>
    );
  }

  return (
    <div className="ct-list">
      {connections.map(r => {
        const otherUid = r.senderUid === myUid ? r.recipientUid : r.senderUid;
        const otherName = r.senderUid === myUid ? r.recipientName : r.senderName;
        const otherKey = r.senderUid === myUid ? r.recipientKey : r.senderKey;
        return (
          <RequestRow
            key={r.id}
            uid={otherUid}
            name={otherName}
            avatar={avatarsByUid?.[otherUid]}
            keyLabel={otherKey}
            busy={busyUid === otherUid}
            onDismiss={() => onDismiss(r)}
            dismissLabel="Remove"
            onOpenProfile={onOpenProfile}
            onChat={onChat}
          />
        );
      })}
    </div>
  );
}

/* ── Info-share requests (email/phone, request-and-consent) ──── */
function wantedFieldsLabel(r) {
  if (r.wantEmail && r.wantPhone) return 'your email and phone number';
  if (r.wantEmail) return 'your email';
  if (r.wantPhone) return 'your phone number';
  return 'your contact info';
}

function InfoRequestsPane({ loading, incoming, outgoing, avatarsByUid, busyUid, onAccept, onDecline, onDismiss, onOpenProfile }) {
  if (loading) return <div className="ct-loading">Loading…</div>;

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="ct-empty">
        <div className="ct-empty-icon">🔐</div>
        <div className="ct-empty-title">No info requests</div>
        <div className="ct-empty-sub">
          When another member's email or phone is hidden, other pages (like a Business
          Ministry order) can ask them to share it here — nothing is ever shared without
          your Accept.
        </div>
      </div>
    );
  }

  return (
    <div className="ct-req-sections">
      {incoming.length > 0 && (
        <section className="ct-req-section">
          <h3 className="ct-req-heading">Incoming ({incoming.length})</h3>
          <div className="ct-list">
            {incoming.map(r => (
              <div key={r.id} className="ct-row">
                <button type="button" className="ct-row-clickable" onClick={() => onOpenProfile(r.senderUid, r.senderName)}>
                  <RowAvatar name={r.senderName} avatar={avatarsByUid?.[r.senderUid]} />
                  <div className="ct-row-body">
                    <div className="ct-row-name">{r.senderName} requests {wantedFieldsLabel(r)}</div>
                    {r.context && <div className="ct-row-sub">{r.context}</div>}
                    {r.message && <div className="ct-row-sub ct-row-message">“{r.message}”</div>}
                  </div>
                </button>
                <div className="ct-row-actions">
                  <button className="app-btn primary" disabled={busyUid === r.senderUid} onClick={() => onAccept(r)}>
                    {busyUid === r.senderUid ? '…' : 'Accept'}
                  </button>
                  <button className="ct-btn-ghost" disabled={busyUid === r.senderUid} onClick={() => onDecline(r)}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="ct-req-section">
          <h3 className="ct-req-heading">Sent ({outgoing.length})</h3>
          <div className="ct-list">
            {outgoing.map(r => (
              <div key={r.id} className="ct-row">
                <button type="button" className="ct-row-clickable" onClick={() => onOpenProfile(r.recipientUid, r.recipientName)}>
                  <RowAvatar name={r.recipientName} avatar={avatarsByUid?.[r.recipientUid]} />
                  <div className="ct-row-body">
                    <div className="ct-row-name">{r.recipientName}</div>
                    {r.status === 'pending' && (
                      <div className="ct-row-sub">Waiting for a reply — asked for {wantedFieldsLabel(r)}</div>
                    )}
                    {r.status === 'pending' && r.message && <div className="ct-row-sub ct-row-message">“{r.message}”</div>}
                    {r.status === 'declined' && <div className="ct-row-sub">Declined to share.</div>}
                    {r.status === 'accepted' && (
                      <div className="ct-row-sub">
                        {r.sharedEmail && <>Email: {r.sharedEmail}</>}
                        {r.sharedEmail && r.sharedPhone && ' · '}
                        {r.sharedPhone && <>Phone: {r.sharedPhone}</>}
                      </div>
                    )}
                  </div>
                </button>
                <div className="ct-row-actions">
                  {r.status === 'pending' && <span className="ct-pill">Pending</span>}
                  {r.status === 'accepted' && <span className="ct-pill">✓ Shared</span>}
                  <button className="ct-btn-ghost" disabled={busyUid === r.recipientUid} onClick={() => onDismiss(r)}>
                    {busyUid === r.recipientUid ? '…' : r.status === 'pending' ? 'Cancel' : 'Dismiss'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Avatar for search/request/connection rows — renders the other
      person's saved Guy/Gal/Emoji avatar when known, initials otherwise. */
function RowAvatar({ name, avatar, className = 'ct-row-avatar' }) {
  return (
    <div className={`${className}${avatar ? ' has-img' : ''}`}>
      {avatar ? <CustomAvatar avatar={avatar} /> : initialsOf(name)}
    </div>
  );
}

/* ── Shared row for requests/connections lists ──────────────── */
function RequestRow({ uid, name, avatar, keyLabel, busy, primaryLabel, onPrimary, pendingLabel, onDismiss, dismissLabel, onOpenProfile, onChat }) {
  return (
    <div className="ct-row">
      <button
        type="button"
        className="ct-row-clickable"
        onClick={() => onOpenProfile?.(uid, name)}
      >
        <RowAvatar name={name} avatar={avatar} />
        <div className="ct-row-body">
          <div className="ct-row-name">{name}</div>
          {keyLabel && <div className="ct-row-sub">{keyLabel}</div>}
        </div>
      </button>
      <div className="ct-row-actions">
        {pendingLabel && <span className="ct-pill">{pendingLabel}</span>}
        {primaryLabel && (
          <button className="app-btn primary" disabled={busy} onClick={onPrimary}>
            {busy ? '…' : primaryLabel}
          </button>
        )}
        {onChat && (
          <button
            className="ct-btn-ghost"
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); onChat(uid, name); }}
          >
            💬 Chat
          </button>
        )}
        <button className="ct-btn-ghost" disabled={busy} onClick={onDismiss}>
          {busy ? '…' : dismissLabel}
        </button>
      </div>
    </div>
  );
}

/* ── Card for search results ────────────────────────────────── */
function PersonCard({ person, busy, relationship, myUid, onConnect, onAccept, onDismiss, onOpenProfile }) {
  let state = 'none';
  if (relationship) {
    if (relationship.status === 'accepted') state = 'connected';
    else if (relationship.senderUid === myUid) state = 'sent';
    else state = 'incoming';
  }

  return (
    <div className="ct-card">
      <button type="button" className="ct-card-clickable" onClick={onOpenProfile}>
        <RowAvatar name={person.displayName} avatar={person.avatar} className="ct-card-avatar" />
        <div className="ct-card-name">{person.displayName || 'Member'}</div>
        {person.emailVisible !== false && person.email && (
          <div className="ct-card-sub">{person.email}</div>
        )}
      </button>

      {state === 'none' && (
        <button className="app-btn primary ct-card-btn" disabled={busy} onClick={onConnect}>
          {busy ? 'Sending…' : '+ Connect'}
        </button>
      )}
      {state === 'sent' && (
        <button className="ct-btn-ghost ct-card-btn" disabled={busy} onClick={onDismiss}>
          {busy ? '…' : 'Cancel request'}
        </button>
      )}
      {state === 'incoming' && (
        <button className="app-btn primary ct-card-btn" disabled={busy} onClick={onAccept}>
          {busy ? '…' : 'Accept request'}
        </button>
      )}
      {state === 'connected' && (
        <span className="ct-pill ct-card-btn">✓ Connected</span>
      )}
    </div>
  );
}
