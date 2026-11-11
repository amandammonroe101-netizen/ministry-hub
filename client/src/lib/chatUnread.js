/* ─────────────────────────────────────────────────────────────
   chatUnread — total unread-message count across every chat
   channel the current user belongs to, PLUS founder-request
   message threads (see founderRequestService.js / Chat.jsx's
   FounderRequestConversationView) — those live in a separate
   `founderRequests/{id}/messages` collection instead of `channels`,
   so they need their own subscription to be counted.

   Used by NavRail to render a notification badge on the Chat tab.
   Subscribes lazily (no work unless a user is signed in) and
   tears down all listeners when the user signs out or the
   channel set changes.

   "Unread" = messages with createdAt > my last-read timestamp for
   that channel/thread, authored by someone other than me. The same
   `chat:last-reads` kv key is used in the Chat page itself (keyed by
   channel id OR founder-request id — see Chat.jsx's markChannelRead),
   so opening a chat there clears its contribution to the total here
   automatically.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState, useMemo } from 'react';
import {
  collection, query as fsQuery, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';
import { useUserStoreKey } from './userStore';
import { isFounder } from './founder';

/* Unread count across every founderRequests thread the user can see —
   their own requests (matched by senderUid) if a regular member, or
   every thread across every sender if they're the founder. Mirrors
   the channel-unread subscription below, but messages are keyed by
   `senderUid` (not `authorUid`) — see founderRequestService.js. */
function useFounderRequestUnread(uid, isFounderUser, lastReads) {
  const [requestIds, setRequestIds] = useState([]);
  useEffect(() => {
    if (!uid || !db) {
      setRequestIds([]);
      return;
    }
    const base = collection(db, 'founderRequests');
    const q = isFounderUser ? base : fsQuery(base, where('senderUid', '==', uid));
    return onSnapshot(q, (snap) => {
      setRequestIds(snap.docs.map(d => d.id));
    }, () => setRequestIds([]));
  }, [uid, isFounderUser]);

  const [unreadByRequest, setUnreadByRequest] = useState({});
  const requestsKey = useMemo(() => [...requestIds].sort().join(','), [requestIds]);
  useEffect(() => {
    if (!uid || requestIds.length === 0) {
      setUnreadByRequest({});
      return;
    }
    const unsubs = [];
    for (const requestId of requestIds) {
      const q = fsQuery(
        collection(db, 'founderRequests', requestId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const unsub = onSnapshot(q, (snap) => {
        const cutoff = lastReads?.[requestId] || 0;
        let n = 0;
        snap.forEach(d => {
          const data = d.data();
          if (data.senderUid === uid) return;
          const ms = data.createdAt?.toMillis?.() || 0;
          if (ms > cutoff) n++;
        });
        setUnreadByRequest(prev => ({ ...prev, [requestId]: n }));
      }, () => {
        setUnreadByRequest(prev => ({ ...prev, [requestId]: 0 }));
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(u => u());
  }, [uid, requestsKey, lastReads]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => Object.values(unreadByRequest).reduce((a, b) => a + (b || 0), 0),
    [unreadByRequest],
  );
}

export function useTotalChatUnread() {
  const { user } = useAuth();
  const [lastReads] = useUserStoreKey('chat:last-reads', {});
  const founderUnread = useFounderRequestUnread(user?.uid, isFounder(user), lastReads);

  /* Channels I'm a member of — covers both private channels (where
     joining requires an invite) AND public channels I've explicitly
     joined. Excludes public channels I haven't joined, since those
     don't have a meaningful unread state for me. */
  const [memberChannelIds, setMemberChannelIds] = useState([]);
  useEffect(() => {
    if (!user?.uid || !db) {
      setMemberChannelIds([]);
      return;
    }
    const q = fsQuery(
      collection(db, 'channels'),
      where('memberUids', 'array-contains', user.uid),
    );
    return onSnapshot(q, (snap) => {
      setMemberChannelIds(snap.docs.map(d => d.id));
    }, () => setMemberChannelIds([]));
  }, [user]);

  /* Subscribe to the last 50 messages of each member-channel and
     keep a per-channel count of unread (not-mine, after lastRead).
     Re-subscribes when the channel set or lastReads change. */
  const [unreadByChannel, setUnreadByChannel] = useState({});
  /* Stable join key so the effect doesn't re-fire on every snapshot
     of the channels query (only when the set of IDs actually changes). */
  const channelsKey = useMemo(
    () => [...memberChannelIds].sort().join(','),
    [memberChannelIds],
  );
  useEffect(() => {
    if (!user?.uid || memberChannelIds.length === 0) {
      setUnreadByChannel({});
      return;
    }
    const unsubs = [];
    for (const channelId of memberChannelIds) {
      const q = fsQuery(
        collection(db, 'channels', channelId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const unsub = onSnapshot(q, (snap) => {
        const cutoff = lastReads?.[channelId] || 0;
        let n = 0;
        snap.forEach(d => {
          const data = d.data();
          if (data.authorUid === user.uid) return;
          const ms = data.createdAt?.toMillis?.() || 0;
          if (ms > cutoff) n++;
        });
        setUnreadByChannel(prev => ({ ...prev, [channelId]: n }));
      }, () => {
        setUnreadByChannel(prev => ({ ...prev, [channelId]: 0 }));
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(u => u());
  }, [user, channelsKey, lastReads]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Total = sum of every channel's unread count + every founder-request
     thread's unread count. Returns 0 when loading / signed out so the
     badge simply doesn't render. */
  const channelTotal = useMemo(
    () => Object.values(unreadByChannel).reduce((a, b) => a + (b || 0), 0),
    [unreadByChannel],
  );
  return channelTotal + founderUnread;
}
