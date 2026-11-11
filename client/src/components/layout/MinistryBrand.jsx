/* MinistryBrand — the ministry logo + name cluster shown at the
   left of a page's topbar, just before the page tag pill.

   Renders nothing unless the user has set a logo and/or ministry
   name (via account creation or their profile). Because the
   `.app-brand` styles live globally in index.css, this component
   can be dropped into any page's bespoke `.app-logo` block as well
   as the shared AppHeader. */

import { useProfileTopbar } from '../profile/ProfileModal';

export default function MinistryBrand() {
  const { profile } = useProfileTopbar();
  const ministryName = profile?.ministryName?.trim();
  const logo = profile?.logo;
  if (!logo && !ministryName) return null;

  return (
    <span className="app-brand" title={ministryName || 'Your ministry'}>
      {logo && <img className="app-brand-logo" src={logo} alt="" />}
      {ministryName && <span className="app-brand-name">{ministryName}</span>}
      <span className="app-brand-sep" aria-hidden="true">›</span>
    </span>
  );
}
