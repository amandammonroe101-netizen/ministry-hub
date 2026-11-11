import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { firebaseErrorMessage } from '../../lib/firebaseErrors';
import FirstRunWizard from '../../components/onboarding/FirstRunWizard';
import './Auth.css';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  /* After a successful signup we hold the new user here and show the
     first-run setup wizard IN PLACE of navigating straight in. The
     wizard persists the user's choices, then calls onDone to enter. */
  const [newUser, setNewUser] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email, and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await register({ name: name.trim(), email: email.trim(), password });
      setNewUser(created); // show the setup wizard instead of navigating
    } catch (err) {
      setError(firebaseErrorMessage(err));
      setSubmitting(false);
    }
  };

  if (newUser) {
    return (
      <FirstRunWizard
        uid={newUser.uid}
        displayName={newUser.displayName}
        onDone={(landing) => navigate(landing || '/journal', { replace: true })}
      />
    );
  }

  return (
    <div className="auth-root">
      <div className="auth-bg" aria-hidden="true" />
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-cross">✝</span>
          <span className="auth-brand-name">Ministry</span>
          <span className="auth-brand-sub">Hub</span>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Sign up to start collaborating with your team.</p>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <label className="auth-field">
            <span className="auth-label">Your name</span>
            <input
              className="auth-input"
              type="text"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
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
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <span className="auth-hint">Use 8 or more characters. Mix letters and numbers for a stronger password.</span>
          </label>

          <label className="auth-field">
            <span className="auth-label">Confirm password</span>
            <input
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
          </label>

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-foot">
          Already have an account?
          <Link to="/login" className="auth-foot-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
