import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { firebaseErrorMessage } from '../../lib/firebaseErrors';
import './Auth.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /* When ProtectedRoute bounces a user here, it stashes their original
     destination in state.from so we can send them back after a successful
     login. Defaults to /journal (the app's first standalone page). */
  const redirectTo = location.state?.from?.pathname || '/journal';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-bg" aria-hidden="true" />
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-cross">✝</span>
          <span className="auth-brand-name">Ministry</span>
          <span className="auth-brand-sub">Hub</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue building your ministry.</p>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@church.org"
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <input
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-foot">
          New here?
          <Link to="/register" className="auth-foot-link">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
