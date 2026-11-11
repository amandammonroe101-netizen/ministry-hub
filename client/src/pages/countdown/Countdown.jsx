/* ─────────────────────────────────────────────────────────────
   Countdown — pre-service timer for projectors / confidence monitors
   Naming: .cd-*
   ───────────────────────────────────────────────────────────── */

import { useState, useEffect, useRef, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import './Countdown.css';

// ── Theme definitions ────────────────────────────────────────
const THEMES = {
  dark:   { bg: '#07070a',                                                 text: '#f0f0f5', accent: '#14b8a6', sub: 'rgba(255,255,255,0.35)' },
  light:  { bg: '#f5f5f0',                                                 text: '#0a0a0f', accent: '#1d4ed8', sub: 'rgba(0,0,0,0.45)'       },
  blue:   { bg: 'linear-gradient(135deg, #0a1628 0%, #0a0f2e 100%)',       text: '#e8f0ff', accent: '#60a5fa', sub: 'rgba(232,240,255,0.4)'   },
  warm:   { bg: 'linear-gradient(135deg, #1a0a00 0%, #2d1500 100%)',       text: '#fff5e0', accent: '#f59e0b', sub: 'rgba(255,245,224,0.4)'   },
  cinema: { bg: '#000000',                                                  text: '#ffffff', accent: '#dc2626', sub: 'rgba(255,255,255,0.3)'   },
};

// Preview swatch colors for the theme buttons
const THEME_SWATCHES = {
  dark:   { swatch: '#07070a',  border: '#14b8a6', label: 'Dark'     },
  light:  { swatch: '#f5f5f0',  border: '#1d4ed8', label: 'Light'    },
  blue:   { swatch: '#0a1628',  border: '#60a5fa', label: 'Blue'     },
  warm:   { swatch: '#1a0a00',  border: '#f59e0b', label: 'Warm'     },
  cinema: { swatch: '#000000',  border: '#dc2626', label: 'Cinema'   },
};

// ── Font styles ──────────────────────────────────────────────
const FONTS = {
  classic: { family: 'ui-monospace, monospace',  weight: 400, label: 'Classic' },
  bold:    { family: 'system-ui, sans-serif',    weight: 900, label: 'Bold'    },
  thin:    { family: 'system-ui, sans-serif',    weight: 100, label: 'Thin'    },
};

// ── Helpers ──────────────────────────────────────────────────
/**
 * Convert HH:MM time string to total seconds since midnight.
 */
function timeStrToSeconds(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 3600 + m * 60;
}

/**
 * Current time as seconds since midnight.
 */
function nowSeconds() {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/**
 * Format remaining seconds as a display string.
 * > 1 hour  → H:MM:SS
 * < 1 hour  → MM:SS
 * Negative  → handled by caller
 */
function formatCountdown(totalSec, showSeconds) {
  const abs = Math.abs(totalSec);
  const h   = Math.floor(abs / 3600);
  const m   = Math.floor((abs % 3600) / 60);
  const s   = Math.floor(abs % 60);

  if (h > 0) {
    // Always show seconds when hours are present — gives full precision
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (showSeconds) {
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:00`;
}

/**
 * Format the current wall-clock time as HH:MM:SS AM/PM.
 */
function formatWallClock(date) {
  let h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`;
}

// ── Component ────────────────────────────────────────────────
export default function Countdown() {
  // Setup state
  const [targetTime,     setTargetTime]     = useState('10:30');
  const [preMsg,         setPreMsg]         = useState('Welcome! Service begins at 10:30 AM');
  const [postMsg,        setPostMsg]        = useState("We're getting started!");
  const [theme,          setTheme]          = useState('dark');
  const [fontStyle,      setFontStyle]      = useState('classic');
  const [showSeconds,    setShowSeconds]    = useState(true);
  const [showPreMsg,     setShowPreMsg]     = useState(true);

  // Runtime state
  const [isLive,         setIsLive]         = useState(false);
  const [remaining,      setRemaining]      = useState(null); // seconds
  const [wallClock,      setWallClock]      = useState(new Date());
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [showHint,       setShowHint]       = useState(false);

  const liveRef     = useRef(null);
  const intervalRef = useRef(null);
  const clickTimer  = useRef(null);
  const hintTimer   = useRef(null);

  // ── Tick ──────────────────────────────────────────────────
  const tick = useCallback(() => {
    const target = timeStrToSeconds(targetTime);
    const now    = nowSeconds();
    setRemaining(target - now);
    setWallClock(new Date());
  }, [targetTime]);

  useEffect(() => {
    if (!isLive) return;
    tick(); // immediate first tick
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [isLive, tick]);

  // ── Fullscreen API ────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement && liveRef.current) {
      try { await liveRef.current.requestFullscreen(); } catch (_) { /* not fatal */ }
    } else {
      try { await document.exitFullscreen(); } catch (_) { /* not fatal */ }
    }
  }, []);

  // ── Derived values ────────────────────────────────────────
  const t        = THEMES[theme];
  const f        = FONTS[fontStyle];
  const started  = remaining !== null && remaining <= 0;
  const absRem   = remaining !== null ? Math.abs(remaining) : 0;
  const clockStr = remaining !== null ? formatCountdown(remaining, showSeconds) : formatCountdown(timeStrToSeconds(targetTime) - nowSeconds(), showSeconds);

  // Inline bg style (handles both solid colors and gradients)
  const bgStyle = t.bg.includes('gradient')
    ? { background: t.bg }
    : { backgroundColor: t.bg };

  // ── Handlers ──────────────────────────────────────────────
  function handleGoLive() {
    setIsLive(true);
  }

  function handleEdit() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsLive(false);
    clearInterval(intervalRef.current);
  }

  // ── Tap gestures (live mode) ──────────────────────────────
  // Single tap → exit live mode; double tap → toggle fullscreen.
  // 250ms debounce window distinguishes the two.
  function handleStageClick() {
    if (clickTimer.current) {
      // Second click within window — treat as double-click
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      handleFullscreen();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        handleEdit();
      }, 250);
    }
  }

  // Briefly show the on-screen hint, then fade it out.
  function revealHint() {
    setShowHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => {
      setShowHint(false);
      hintTimer.current = null;
    }, 2000);
  }

  // Cleanup tap + hint timers on unmount / when leaving live mode
  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      if (hintTimer.current) {
        clearTimeout(hintTimer.current);
        hintTimer.current = null;
      }
    };
  }, []);

  // When entering live mode, flash the hint once so users know what to do.
  useEffect(() => {
    if (isLive) revealHint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  // ── Render: Setup mode ────────────────────────────────────
  if (!isLive) {
    return (
      <WorshipShell
        title="Countdown"
        icon="⏱"
        subtitle="Pre-service countdown timer for the stage and lobby screens."
      >
      <div className="cd-root">
        <main className="cd-main">
          <div className="cd-setup">
            <h1 className="cd-page-title">Service Countdown</h1>

            {/* Target time */}
            <div className="cd-field">
              <label className="cd-section-label">Service Start Time</label>
              <input
                type="time"
                className="cd-time-input"
                value={targetTime}
                onChange={e => setTargetTime(e.target.value)}
              />
            </div>

            {/* Pre-service message */}
            <div className="cd-field">
              <div className="cd-label-row">
                <label className="cd-section-label">Pre-Service Message</label>
                <label className="cd-toggle-label">
                  <span>Show on screen</span>
                  <button
                    type="button"
                    className={`cd-toggle ${showPreMsg ? 'cd-toggle--on' : ''}`}
                    onClick={() => setShowPreMsg(v => !v)}
                    aria-pressed={showPreMsg}
                  >
                    <span className="cd-toggle-thumb" />
                  </button>
                </label>
              </div>
              <textarea
                className="cd-textarea"
                rows={2}
                value={preMsg}
                onChange={e => setPreMsg(e.target.value)}
                placeholder="e.g. Welcome! Service begins at 10:30 AM"
              />
            </div>

            {/* Post-countdown message */}
            <div className="cd-field">
              <label className="cd-section-label">Post-Countdown Message</label>
              <textarea
                className="cd-textarea"
                rows={2}
                value={postMsg}
                onChange={e => setPostMsg(e.target.value)}
                placeholder="e.g. We're getting started!"
              />
            </div>

            {/* Theme picker */}
            <div className="cd-field">
              <label className="cd-section-label">Background Theme</label>
              <div className="cd-theme-btns">
                {Object.entries(THEME_SWATCHES).map(([key, sw]) => (
                  <button
                    key={key}
                    type="button"
                    className={`cd-theme-btn ${theme === key ? 'cd-theme-btn--active' : ''}`}
                    style={{ backgroundColor: sw.swatch, borderColor: theme === key ? sw.border : 'transparent' }}
                    onClick={() => setTheme(key)}
                    title={sw.label}
                    aria-pressed={theme === key}
                  >
                    <span className="cd-theme-dot" style={{ backgroundColor: sw.border }} />
                    <span className="cd-theme-label">{sw.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font style */}
            <div className="cd-field">
              <label className="cd-section-label">Clock Font</label>
              <div className="cd-font-btns">
                {Object.entries(FONTS).map(([key, fnt]) => (
                  <button
                    key={key}
                    type="button"
                    className={`cd-font-btn ${fontStyle === key ? 'cd-font-btn--active' : ''}`}
                    style={{ fontFamily: fnt.family, fontWeight: fnt.weight }}
                    onClick={() => setFontStyle(key)}
                    aria-pressed={fontStyle === key}
                  >
                    {fnt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Show seconds toggle */}
            <div className="cd-field cd-field--row">
              <label className="cd-section-label" style={{ margin: 0 }}>Show Seconds</label>
              <button
                type="button"
                className={`cd-toggle ${showSeconds ? 'cd-toggle--on' : ''}`}
                onClick={() => setShowSeconds(v => !v)}
                aria-pressed={showSeconds}
              >
                <span className="cd-toggle-thumb" />
              </button>
            </div>

            {/* Preview badge */}
            <div className="cd-preview-badge" style={{ color: THEMES[theme].accent, fontFamily: FONTS[fontStyle].family, fontWeight: FONTS[fontStyle].weight }}>
              Preview: {formatCountdown(timeStrToSeconds(targetTime) - nowSeconds(), showSeconds)}
            </div>

            {/* Go Live */}
            <button type="button" className="cd-go-btn" onClick={handleGoLive}>
              Go Live
            </button>
          </div>
        </main>
      </div>
      </WorshipShell>
    );
  }

  // ── Render: Live mode ─────────────────────────────────────
  return (
    <WorshipShell
      title="Countdown"
      icon="⏱"
      subtitle="Pre-service countdown timer for the stage and lobby screens."
    >
    <div className="cd-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>
      <main className="cd-main">
        <div
          className="cd-live"
          ref={liveRef}
          onClick={handleStageClick}
          onMouseMove={revealHint}
          role="button"
          tabIndex={-1}
          aria-label="Tap to exit live mode, double-tap to toggle fullscreen"
        >
          {/* Full-area background */}
          <div className="cd-bg" style={bgStyle} />

          {/* Content layer */}
          <div className="cd-content" style={{ color: t.text }}>

            {/* Pre-service message */}
            {showPreMsg && !started && preMsg.trim() && (
              <p className="cd-pre-msg" style={{ color: t.sub }}>
                {preMsg}
              </p>
            )}

            {started ? (
              /* ── Service started ── */
              <div className="cd-started">
                <p
                  className="cd-started-msg"
                  style={{
                    color:       t.accent,
                    fontFamily:  f.family,
                    fontWeight:  f.weight,
                  }}
                >
                  {postMsg}
                </p>
              </div>
            ) : (
              /* ── Countdown running ── */
              <>
                <div
                  className="cd-clock"
                  style={{
                    color:       t.accent,
                    fontFamily:  f.family,
                    fontWeight:  f.weight,
                  }}
                >
                  {clockStr}
                </div>
                <p className="cd-sub-msg" style={{ color: t.sub }}>
                  Until service begins
                </p>
              </>
            )}
          </div>

          {/* Wall clock — bottom-right */}
          <div className="cd-current-time" style={{ color: t.sub }}>
            {formatWallClock(wallClock)}
          </div>

          {/* Tap hint — fades in/out based on showHint */}
          <div
            className={`cd-tap-hint ${showHint ? 'cd-tap-hint--visible' : ''}`}
            style={{ color: t.sub }}
            aria-hidden="true"
          >
            Tap to exit · Double-tap fullscreen
          </div>
        </div>
      </main>
    </div>
    </WorshipShell>
  );
}
