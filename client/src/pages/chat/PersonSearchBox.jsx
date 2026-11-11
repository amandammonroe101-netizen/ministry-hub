/* Search box for picking a person to invite into a channel — used by
   both NewChannelDialog and AddMemberDialog. Only matches people you
   already know: accepted Contacts connections and anyone you've
   invited before. Does not search the broader user directory. */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMyContactRequests } from '../../lib/contactRequests';
import { useMySentInvites } from '../../lib/chatInvites';

function initialsOf(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PersonSearchBox({ excludeUids = [], onPick, autoFocus = false }) {
  const { user } = useAuth();
  const { requests } = useMyContactRequests();
  const { invites: sentInvites } = useMySentInvites();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  /* People I already know, without a fresh lookup: accepted contacts
     plus anyone I've sent a chat invite to before ("past user ID"). */
  const knownPeople = useMemo(() => {
    const map = new Map();
    requests
      .filter(r => r.status === 'accepted')
      .forEach(r => {
        const uid = r.senderUid === user?.uid ? r.recipientUid : r.senderUid;
        const displayName = r.senderUid === user?.uid ? r.recipientName : r.senderName;
        if (uid) map.set(uid, { uid, displayName, source: 'Contact' });
      });
    sentInvites.forEach(inv => {
      if (inv.inviteeUid && !map.has(inv.inviteeUid)) {
        map.set(inv.inviteeUid, { uid: inv.inviteeUid, displayName: inv.inviteeName, source: 'Past invite' });
      }
    });
    return Array.from(map.values());
  }, [requests, sentInvites, user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = term.trim().toLowerCase();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const local = knownPeople.filter(p =>
        (p.displayName || '').toLowerCase().includes(q) || p.uid.toLowerCase().includes(q)
      );
      const excludeSet = new Set(excludeUids);
      if (user?.uid) excludeSet.add(user.uid);
      setResults(local.filter(p => !excludeSet.has(p.uid)).slice(0, 8));
      setSearching(false);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [term, knownPeople, excludeUids, user]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (person) => {
    onPick(person);
    setTerm('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="ch-person-search" ref={wrapRef}>
      <input
        type="text"
        className="ch-input"
        value={term}
        onChange={e => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search Contacts"
        autoFocus={autoFocus}
      />
      {open && term.trim() && (
        <div className="ch-person-results">
          {searching && <div className="ch-person-result-empty">Searching…</div>}
          {!searching && results.length === 0 && (
            <div className="ch-person-result-empty">No matches.</div>
          )}
          {!searching && results.map(p => (
            <button
              type="button"
              key={p.uid}
              className="ch-person-result"
              onClick={() => pick(p)}
            >
              <span className="ch-person-result-avatar">{initialsOf(p.displayName)}</span>
              <span className="ch-person-result-text">
                <span className="ch-person-result-name">{p.displayName || 'Member'}</span>
                {p.source && <span className="ch-person-result-sub">{p.source}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
