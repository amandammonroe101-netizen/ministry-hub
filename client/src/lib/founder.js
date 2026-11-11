/* founder — identifies the single founder account that gets access to
   the Founder Dashboard (see pages/founder/FounderDashboard.jsx).

   Deliberately hardcoded rather than a Firestore flag: it's a single,
   permanent owner account, not a role that gets assigned/revoked, so
   there's nothing to manage in the database. The Firestore rules
   (docs/firestore.rules) check the same email off the auth token, so
   the gate holds even if someone edits the client bundle. */
export const FOUNDER_EMAIL = 'amandammonroe101@gmail.com';

export function isFounder(user) {
  return !!user?.email && user.email.toLowerCase() === FOUNDER_EMAIL;
}
