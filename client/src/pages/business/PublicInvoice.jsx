import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicInvoiceService } from '../../services/publicInvoiceService';
import { InvoiceSheet } from './BusinessInvoices';
import './PublicInvoice.css';

/* ─────────────────────────────────────────────────────────────
   Business Ministry — public, unauthenticated invoice view.
   Reached via a plain "Get shareable link" URL (#/invoice/:token,
   see BusinessInvoices.jsx). Reads a read-only snapshot from the
   top-level /publicInvoices/{token} collection — never the member's
   private order data — so no sign-in is required to view it.

   Deliberately its own minimal layout (NOT wrapped in BusinessShell
   or any authenticated nav) since a customer opening this link has
   no account and shouldn't see the app's internal navigation.
   ───────────────────────────────────────────────────────────── */
export default function PublicInvoice() {
  const { token } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    publicInvoiceService.getOne(token)
      .then(data => { if (!cancelled) setSnapshot(data); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Could not load this invoice.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="bzpi-root">
      <div className="bzpi-card">
        {loading ? (
          <div className="bzpi-status">Loading invoice…</div>
        ) : error || !snapshot ? (
          <div className="bzpi-status">This invoice link is no longer available.</div>
        ) : (
          <>
            <InvoiceSheet
              order={snapshot}
              business={{ name: snapshot.businessName, icon: snapshot.businessIcon }}
              totals={{ subtotal: snapshot.subtotal, total: snapshot.total, balance: snapshot.balance }}
            />
            <button type="button" className="bzpi-print-btn" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
          </>
        )}
      </div>
    </div>
  );
}
