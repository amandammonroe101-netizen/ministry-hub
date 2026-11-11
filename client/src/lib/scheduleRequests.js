/* ─────────────────────────────────────────────────────────────
   scheduleRequests — pending recording-session requests addressed
   to the current user.

   Sender side: the SchedulingRec page creates a doc at
     /scheduleRequests/{id}
   with `recipientUid` set to the collaborator. This hook is the
   recipient's read side — it subscribes to those incoming docs
   and is consumed by:

     - NavRail        → red badge with the count on the Calendar tab
     - Calendar page  → bell icon in the topbar + dropdown panel

   The rule (in docs/firestore.rules) permits the recipient to
   READ docs where they're the recipient (and the sender to read
   docs where they're the sender). Both sides can delete; only the
   sender can create.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import {
  collection, query as fsQuery, where, onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

/** Subscribe to all pending schedule requests addressed to the
 *  current user. Returns an array sorted newest-first. */
export function usePendingScheduleRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!user?.uid || !db) {
      setRequests([]);
      return;
    }
    const q = fsQuery(
      collection(db, 'scheduleRequests'),
      where('recipientUid', '==', user.uid),
    );
    return onSnapshot(q,
      (snap) => {
        /* Client-side status filter so we don't need a composite
           Firestore index. The list is small enough that this is
           cheap. */
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r => !r.status || r.status === 'pending');
        list.sort((a, b) => {
          const ax = a.createdAt?.toMillis?.() || 0;
          const bx = b.createdAt?.toMillis?.() || 0;
          return bx - ax;
        });
        setRequests(list);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[scheduleRequests] subscription failed:', err?.code || err?.message || err);
        setRequests([]);
      }
    );
  }, [user]);

  return requests;
}
