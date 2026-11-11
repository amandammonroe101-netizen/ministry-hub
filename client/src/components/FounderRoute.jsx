import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isFounder } from '../lib/founder';

/* Wrap the Founder Dashboard route. Nested INSIDE <ProtectedRoute>, so a
   signed-in-but-not-founder user is simply bounced home rather than to
   the login screen. The real enforcement lives in docs/firestore.rules —
   this is just so non-founder accounts never see the page render. */
export default function FounderRoute({ children }) {
  const { user } = useAuth();
  if (!isFounder(user)) return <Navigate to="/calendar" replace />;
  return children;
}
