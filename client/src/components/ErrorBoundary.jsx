import { Component } from 'react';

/* ─────────────────────────────────────────────────────────────
   ErrorBoundary — catches uncaught errors in its child tree so
   one buggy page doesn't unmount the whole app. Shows a friendly
   error card with the message, a "Try again" reload, and a path
   to the page so users can navigate away.

   Usage:
     <ErrorBoundary pageName="Podcast Studio">
       <PodcastStudio />
     </ErrorBoundary>
   ───────────────────────────────────────────────────────────── */

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep this visible in the console even if the boundary swallows the crash
    console.error('[ErrorBoundary]', this.props.pageName || 'page', 'crashed:', error, info);
    this.setState({ info });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { error, info } = this.state;
    const pageName = this.props.pageName || 'this page';
    const stack = (info && info.componentStack) ? info.componentStack : '';

    return (
      <div style={errorWrap}>
        <div style={errorCard}>
          <div style={errorIcon}>⚠</div>
          <h1 style={errorTitle}>{pageName} hit a snag</h1>
          <p style={errorSub}>
            A page-level error stopped the UI from rendering. Your data is safe —
            this only affects the current view.
          </p>
          <pre style={errorMsg}>
            {String(error && (error.message || error))}
          </pre>
          {stack && (
            <details style={{ marginTop: 8 }}>
              <summary style={errorSummary}>Component stack</summary>
              <pre style={errorStack}>{stack}</pre>
            </details>
          )}
          <div style={errorActions}>
            <button style={btnPrimary} onClick={this.handleReset}>Try again</button>
            <button style={btnGhost}   onClick={() => window.location.reload()}>Hard reload</button>
            <button style={btnGhost}   onClick={() => { window.location.hash = ''; window.location.href = '/'; }}>Go home</button>
          </div>
        </div>
      </div>
    );
  }
}

const errorWrap = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(11,10,26,0.94)',
  zIndex: 9999,
};

const errorCard = {
  width: '100%',
  maxWidth: 600,
  padding: 28,
  borderRadius: 16,
  background: 'rgba(20,18,28,0.96)',
  border: '0.5px solid rgba(255,255,255,0.16)',
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)',
  color: '#f0f0f5',
  fontFamily: 'inherit',
};

const errorIcon = { fontSize: 40, lineHeight: 1, marginBottom: 8 };
const errorTitle = { fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.01em' };
const errorSub  = { fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55, margin: '0 0 16px' };

const errorMsg = {
  padding: '12px 14px',
  background: 'rgba(239,68,68,0.10)',
  border: '0.5px solid rgba(239,68,68,0.35)',
  borderRadius: 10,
  color: '#fca5a5',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12.5,
  lineHeight: 1.5,
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const errorSummary = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.62)',
  cursor: 'pointer',
};

const errorStack = {
  marginTop: 6,
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '0.5px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.74)',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11.5,
  lineHeight: 1.5,
  maxHeight: 240,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
};

const errorActions = { display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' };

const btnBase = {
  padding: '8px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  border: '0.5px solid',
  fontFamily: 'inherit',
};
const btnPrimary = { ...btnBase, background: 'rgba(251,113,133,0.18)', borderColor: 'rgba(251,113,133,0.5)', color: '#fb7185' };
const btnGhost   = { ...btnBase, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.84)' };
