import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* Wrap any element that requires a signed-in Firebase user. While
   onAuthStateChanged is hydrating (loading=true) we show a thin neutral
   shell so we don't flash the login page for users with a valid session. */
export default function ProtectedRoute({ children }) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();

  /* Friendly setup screen when env vars are missing — beats a blank page
     or a cryptic Firebase "no project" error. */
  if (!configured) {
    return (
      <div className="fb-setup-screen">
        <div className="fb-setup-card">
          <h1 className="fb-setup-title">⚡ Firebase setup required</h1>
          <p className="fb-setup-text">
            This app uses Firebase Auth + Firestore for per-user data. Set up
            your project, then paste your config into <code>client/.env</code>.
          </p>
          <ol className="fb-setup-steps">
            <li>Open <strong>Firebase Console</strong> → create a project.</li>
            <li><strong>Authentication</strong> → Sign-in method → enable <strong>Email/Password</strong>.</li>
            <li><strong>Firestore Database</strong> → Create database → start in <em>production mode</em>.</li>
            <li><strong>Project settings</strong> → Your apps → Web → copy the config.</li>
            <li>Copy <code>client/.env.example</code> → <code>client/.env</code> and paste the values.</li>
            <li>Restart <code>npm run dev</code>.</li>
          </ol>
        </div>
        <style>{`
          .fb-setup-screen {
            width: 100vw; height: 100vh;
            display: flex; align-items: center; justify-content: center;
            background: #0f0e0c; color: #f5f5f4;
            font-family: system-ui, -apple-system, sans-serif;
            padding: 24px;
          }
          .fb-setup-card {
            max-width: 520px;
            padding: 32px;
            background: rgba(20, 18, 17, 0.88);
            border: 0.5px solid rgba(255, 255, 255, 0.10);
            border-radius: 16px;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
          }
          .fb-setup-title { margin: 0 0 12px; font-size: 20px; font-weight: 800; }
          .fb-setup-text  { margin: 0 0 16px; font-size: 14px; line-height: 1.55; color: rgba(255,255,255,0.75); }
          .fb-setup-steps { margin: 0; padding-left: 22px; font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.78); }
          .fb-setup-steps code { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
        `}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0e0c',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 14,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
