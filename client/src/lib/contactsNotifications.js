/* Shared Contacts notifications hook.

   Surfaces "things needing your attention" on the Contacts feature so
   the page's own tab badge and the NavRail "Contacts" badge render
   from the same source instead of duplicating the math:

     • Incoming — pending requests addressed to me. Naturally clears
       itself as each one is accepted/declined (no "seen" tracking
       needed, it's just a live pending count).
     • New connections — accepted connections I haven't looked at yet.
       Tracked against a persisted `contacts-connections-last-seen`
       timestamp (Firestore, via useUserStoreKey) so it survives
       reloads and only clears once the My Contacts tab is opened. */

import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserStoreKey } from './userStore';
import { useMyContactRequests } from './contactRequests';
import { useMyInfoShareRequests } from './infoShareRequests';

const LAST_SEEN_KEY = 'contacts-connections-last-seen';

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'string') return new Date(ts).getTime() || 0;
  return 0;
}

export function useContactsNotifications() {
  const { user } = useAuth();
  const myUid = user?.uid || null;
  const { requests } = useMyContactRequests();
  const { requests: infoRequests } = useMyInfoShareRequests();
  const [lastSeenAt, setLastSeenAt] = useUserStoreKey(LAST_SEEN_KEY, null);

  const incoming = useMemo(
    () => requests.filter(r => r.status === 'pending' && r.recipientUid === myUid),
    [requests, myUid]
  );
  const incomingInfoRequests = useMemo(
    () => infoRequests.filter(r => r.status === 'pending' && r.recipientUid === myUid),
    [infoRequests, myUid]
  );
  const connections = useMemo(
    () => requests.filter(r => r.status === 'accepted'),
    [requests]
  );

  const lastSeenMs = toMillis(lastSeenAt);
  const newConnections = useMemo(
    () => connections.filter(r => toMillis(r.respondedAt) > lastSeenMs),
    [connections, lastSeenMs]
  );

  const markConnectionsSeen = () => setLastSeenAt(new Date().toISOString());

  return {
    incomingCount: incoming.length,
    incomingInfoRequestsCount: incomingInfoRequests.length,
    newConnectionsCount: newConnections.length,
    badgeCount: incoming.length + incomingInfoRequests.length + newConnections.length,
    markConnectionsSeen,
  };
}
