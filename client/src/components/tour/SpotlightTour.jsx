/* SpotlightTour — a generic, reusable step-through walkthrough.
   Dims the page and cuts a highlighted "spotlight" hole around a
   real on-screen element (found via a `data-tour="..."` attribute),
   with a tooltip card of title/body text and Next/Back/Skip
   controls. Steps with no `selector` render as a centered card with
   no spotlight (for a welcome/closing step).

   Used by PageTourHost to walk a first-time user through a page's
   key controls — see pageTours.js for each page's step content. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './SpotlightTour.css';

const PAD = 8; // spotlight padding around the target element, in px

function measure(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { el, rect: r };
}

export default function SpotlightTour({ steps, onFinish, onSkip }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  /* Locate + measure the current step's target. If the selector
     doesn't resolve to a visible element (e.g. a collapsed sidebar,
     or a step authored for a slightly different page state), skip
     straight past it rather than showing a spotlight pointing at
     nothing. */
  useLayoutEffect(() => {
    let cancelled = false;

    const tryMeasure = () => {
      if (!step.selector) { setRect(null); return true; }
      const found = measure(step.selector);
      if (!found) return false;
      found.el.scrollIntoView({ block: 'center', behavior: 'auto' });
      // Re-measure one frame later — scrollIntoView can shift layout.
      requestAnimationFrame(() => {
        if (cancelled) return;
        const r = measure(step.selector);
        setRect(r ? r.rect : null);
      });
      return true;
    };

    if (!tryMeasure()) {
      // Target not present — skip this step automatically.
      if (index < steps.length - 1) setIndex(i => i + 1);
      else onFinish?.();
      return () => { cancelled = true; };
    }

    const onResize = () => {
      const found = measure(step.selector);
      setRect(found ? found.rect : null);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step.selector]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onSkip?.();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const next = () => {
    if (isLast) onFinish?.();
    else setIndex(i => i + 1);
  };
  const back = () => setIndex(i => Math.max(0, i - 1));

  const cardStyle = cardPosition(rect, cardRef.current);

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div
        className={`tour-card${rect ? '' : ' tour-card-center'}`}
        style={cardStyle}
        ref={cardRef}
      >
        <div className="tour-card-step">{index + 1} of {steps.length}</div>
        <div className="tour-card-title">{step.title}</div>
        <div className="tour-card-body">{step.body}</div>
        <div className="tour-card-foot">
          <button type="button" className="tour-btn tour-btn-ghost" onClick={onSkip}>Skip tour</button>
          <div className="tour-card-foot-right">
            {index > 0 && (
              <button type="button" className="tour-btn tour-btn-ghost" onClick={back}>← Back</button>
            )}
            <button type="button" className="tour-btn tour-btn-primary" onClick={next}>
              {isLast ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Places the tooltip card below the target when there's room,
   above it otherwise, clamped so it never runs off-screen. Falls
   back to a centered card (via CSS) when there's no target rect. */
function cardPosition(rect) {
  if (!rect) return {};
  const cardW = 320;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = rect.bottom + PAD + 14;
  const spaceBelow = vh - rect.bottom;
  if (spaceBelow < 200 && rect.top > 220) {
    top = rect.top - PAD - 14; // place above, anchored by bottom below
  }

  let left = rect.left + rect.width / 2 - cardW / 2;
  left = Math.max(16, Math.min(left, vw - cardW - 16));

  const placeAbove = spaceBelow < 200 && rect.top > 220;
  return placeAbove
    ? { left, bottom: vh - rect.top + PAD + 14 }
    : { left, top };
}
