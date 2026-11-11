/* PageTourHost — mounts a first-time-user SpotlightTour on a single
   standalone page. Drop `<PageTourHost pageId="journal" />` once,
   anywhere, in a page's top-level render.

   "Seen" state is a single per-user Firestore doc (one boolean per
   page id) so the tour fires exactly once per page, syncs across
   devices, and never re-appears once dismissed or completed — same
   pattern as the one-time Welcome popup in App.jsx. */

import { useEffect, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { PAGE_TOURS } from '../../lib/pageTours';
import SpotlightTour from './SpotlightTour';

const TOURS_SEEN_KEY = 'onboarding:tours-seen';

export default function PageTourHost({ pageId }) {
  const [seenMap, setSeenMap, { loading }] = useUserStoreKey(TOURS_SEEN_KEY, {});
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (loading || active || seenMap?.[pageId]) return;
    // Small delay so the page has finished its first paint before we
    // start measuring elements to spotlight.
    const t = setTimeout(() => setActive(true), 700);
    return () => clearTimeout(t);
  }, [loading, seenMap, pageId, active]);

  const steps = PAGE_TOURS[pageId];
  if (!active || !steps?.length) return null;

  const dismiss = () => {
    setActive(false);
    setSeenMap(m => ({ ...(m || {}), [pageId]: true }));
  };

  return <SpotlightTour steps={steps} onFinish={dismiss} onSkip={dismiss} />;
}
