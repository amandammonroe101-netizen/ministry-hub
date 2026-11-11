import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { studioProjectService } from '../../services/studioProjectService';
import { songService } from '../../services/songService';
import { useUserStoreKey } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  collection, doc, addDoc, query as fsQuery, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { sharedStudioProjectService, cloneProjectForSharing } from '../../services/sharedStudioProjectService';
import { studioShareService } from '../../services/studioShareService';
import {
  MultitrackPlayer, decodeTrack, dropFromCache, computePeaks,
  clipDuration, projectDuration, playCountIn, startMicRecording,
  calibrateLatency, mixdown, encodeWav, blobToDataUrl, DEFAULT_FX, getCtx,
  gridMetrics, snapToGrid,
  analyzePitch, autotuneRender, SCALES, NOTE_NAMES, midiToName,
} from './engine';
import { VOICE_LIST, playNote, playNoteExpressive, playAcousticGuitar, getRecordStream, midiToNoteName } from '../studio/synth';
import './Multitrack.css';

const TRACK_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#fb923c'];
const RULER_H = 28;
const TRACK_H = 92;

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const fmtPrecise = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return `${m}:${r.padStart(4, '0')}`;
};
/** Seconds → "bar.beat" given a tempo grid. */
const fmtBarsBeats = (s, grid) => {
  if (!grid || !grid.beatSec || !isFinite(s) || s < 0) return '1.1';
  const totalBeats = s / grid.beatSec;
  const bar  = Math.floor(totalBeats / grid.beatsPerBar) + 1;
  const beat = Math.floor(totalBeats % grid.beatsPerBar) + 1;
  return `${bar}.${beat}`;
};

const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8'];

// Keyboard-shortcut legend shown in the floating Studio Console
const SHORTCUTS = [
  { key: 'Space', desc: 'Play / Stop',        cat: 'transport' },
  { key: 'R',     desc: 'Record (overdub)',   cat: 'transport' },
  { key: 'Home',  desc: 'Return to start',    cat: 'transport' },
  { key: 'S',     desc: 'Split at playhead',  cat: 'edit' },
];

/* ─────────────────────────────────────────────────────────────
   Share-project-to-chat dialog
   Subscribes to every chat channel the current user belongs to,
   shows them as a selectable list, and posts a "Shared project"
   message to the chosen channel. Optional personal note.

   Declared BEFORE Multitrack so React Fast Refresh sees it on the
   first HMR pass when Multitrack references it (declaring it after
   was triggering "ReferenceError: ShareProjectToChatDialog is not
   defined" during rapid HMR cycles).
   ───────────────────────────────────────────────────────────── */
function ShareProjectToChatDialog({ project, onClose, onToast }) {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote]         = useState('');
  const [sending, setSending]   = useState(false);
  /* Share mode: 'message' (default, just a chat note), 'copy'
     (recipient can Import their own editable copy), 'live'
     (real-time collaborative editing — both users see the same
     shared project doc). */
  const [mode, setMode] = useState('message');

  /* Esc to dismiss */
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Live list of my chat channels (private + public-joined). */
  useEffect(() => {
    if (!user?.uid || !db) { setLoading(false); return; }
    const q = fsQuery(
      collection(db, 'channels'),
      where('memberUids', 'array-contains', user.uid),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setChannels(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  const send = async () => {
    if (!selectedId || !user?.uid || sending) return;
    const channel = channels.find(c => c.id === selectedId);
    setSending(true);
    try {
      const count     = project.tracks?.length || 0;
      const trackText = `${count} track${count === 1 ? '' : 's'}`;
      const senderName = user.displayName || (user.email || 'Member').split('@')[0];

      /* Build message + side-effects per chosen mode */
      let extra = null;      // extra field stored on the chat message
      let lead;              // first line of the message
      let toastMsg;

      if (mode === 'message') {
        /* Attach the first available clip's audio so recipients
           can hit Play and hear it right inside the chat. For
           multi-track projects this only sends the first track —
           recipients who want the full mix can use "Send a copy"
           or "Collaborate live". */
        const firstTrack = project.tracks?.[0];
        const firstClip  = firstTrack?.clips?.[0];
        const audioSrc   = firstClip?.audio_url || firstClip?.audio_data;
        if (audioSrc) {
          extra = {
            attachment: {
              type:     'audio',
              url:      audioSrc,
              path:     null,
              fileName: `${project.name}${firstTrack?.name ? ` — ${firstTrack.name}` : ''}.webm`,
              fileSize: 0,
              mimeType: 'audio/webm',
              source:   'studio-share',
            },
            studioShare: {
              kind:        'message',
              projectName: project.name,
              trackCount:  count,
              senderName,
            },
          };
        }
        lead = `🎚 Shared a Studio project: "${project.name}" — ${trackText}`;
        toastMsg = `Shared "${project.name}" to "${channel?.name || 'chat'}".`;
      }
      else if (mode === 'copy') {
        /* Recipient needs their uid baked in so they can claim the
           snapshot from /studioShares. For DMs / private channels
           this is unambiguous (= the other member), but a public
           channel may have many members. For v1 we share to every
           OTHER member of the channel as a single broadcast — the
           message lists the share id once; whoever clicks Import
           first claims and deletes it. */
        const otherMembers = (channel?.memberUids || []).filter(u => u !== user.uid);
        if (otherMembers.length === 0) {
          throw new Error('Pick a chat with other members first.');
        }
        const shareId = await studioShareService.createShare({
          project,
          senderName,
          recipientUid: otherMembers[0],
        });
        extra = {
          studioShare: {
            kind:      'copy',
            shareId,
            projectName: project.name,
            trackCount:  count,
            senderName,
          },
        };
        lead = `🎚 Sent you a copy of "${project.name}" (${trackText}) — open this chat in your Studio to import.`;
        toastMsg = `Sent a copy of "${project.name}" to "${channel?.name || 'chat'}".`;
      }
      else if (mode === 'live') {
        /* Create the collaborative shared project doc. The recipient
           sees the chat card right away; the project only joins
           their Studio's Collaborate section after they accept by
           double-clicking the card. */
        const otherMembers = (channel?.memberUids || []).filter(u => u !== user.uid);
        if (otherMembers.length === 0) {
          throw new Error('Pick a chat with other members first.');
        }
        const shared = cloneProjectForSharing(project, user.uid, otherMembers);
        await sharedStudioProjectService.create(shared);
        extra = {
          studioShare: {
            kind:       'live',
            sharedId:   shared.id,
            projectName: project.name,
            trackCount:  count,
            senderName,
          },
        };
        lead = `🎚 Invited you to collaborate on "${project.name}" (${trackText}) — open your Studio to edit it live together.`;
        toastMsg = `Started a collaboration on "${project.name}" in "${channel?.name || 'chat'}".`;
      }

      const text = note.trim() ? `${lead}\n\n${note.trim()}` : lead;
      await addDoc(collection(db, 'channels', selectedId, 'messages'), {
        authorUid:  user.uid,
        authorName: senderName,
        text,
        attachment: null,
        ...(extra || {}),
        createdAt:  serverTimestamp(),
      });
      onToast?.(toastMsg);
      onClose();
    } catch (err) {
      onToast?.(`Could not share: ${err?.message || 'unknown error'}`);
      setSending(false);
    }
  };

  return (
    <div className="mt-share-backdrop" onClick={onClose}>
      <div className="mt-share-modal" onClick={e => e.stopPropagation()}>
        <div className="mt-share-head">
          <span className="mt-share-title">
            Share "{project.name}" to a chat
          </span>
          <button
            type="button"
            className="mt-share-close"
            onClick={onClose}
            aria-label="Close"
          >✕</button>
        </div>
        <div className="mt-share-body">
          {/* Share mode picker */}
          <div className="mt-share-field">
            <span className="mt-share-label">How do you want to share?</span>
            <div className="mt-share-modes">
              <label className={`mt-share-mode${mode === 'message' ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="mt-share-mode"
                  value="message"
                  checked={mode === 'message'}
                  onChange={() => setMode('message')}
                />
                <div className="mt-share-mode-text">
                  <div className="mt-share-mode-title">Just share</div>
                  <div className="mt-share-mode-desc">Send a chat message mentioning this project. Recipients can't open or edit it.</div>
                </div>
              </label>
              <label className={`mt-share-mode${mode === 'copy' ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="mt-share-mode"
                  value="copy"
                  checked={mode === 'copy'}
                  onChange={() => setMode('copy')}
                />
                <div className="mt-share-mode-text">
                  <div className="mt-share-mode-title">Send a copy</div>
                  <div className="mt-share-mode-desc">Recipient gets their own editable copy in their Studio. Each of you edits independently after.</div>
                </div>
              </label>
              <label className={`mt-share-mode${mode === 'live' ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="mt-share-mode"
                  value="live"
                  checked={mode === 'live'}
                  onChange={() => setMode('live')}
                />
                <div className="mt-share-mode-text">
                  <div className="mt-share-mode-title">Collaborate live</div>
                  <div className="mt-share-mode-desc">One shared project. Both of you edit it in real time, like a Google Doc.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-share-field">
            <span className="mt-share-label">Choose a chat</span>
            {loading ? (
              <div className="mt-share-hint">Loading your chats…</div>
            ) : channels.length === 0 ? (
              <div className="mt-share-hint">
                You're not in any chats yet. Go to the Chat tab to
                join or create one first.
              </div>
            ) : (
              <ul className="mt-share-list">
                {channels.map(c => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`mt-share-option${selectedId === c.id ? ' on' : ''}`}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <span className="mt-share-option-icon">
                        {c.type === 'private' ? '🔒' : '#'}
                      </span>
                      <span className="mt-share-option-name">{c.name}</span>
                      <span className="mt-share-option-meta">
                        {c.memberUids?.length || 0} member{(c.memberUids?.length || 0) === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="mt-share-field">
            <span className="mt-share-label">Add a note (optional)</span>
            <textarea
              className="mt-share-note"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={`Why are you sharing "${project.name}"?`}
            />
          </label>
        </div>
        <div className="mt-share-actions">
          <button
            type="button"
            className="mt-share-cancel"
            onClick={onClose}
            disabled={sending}
          >Cancel</button>
          <button
            type="button"
            className="mt-share-send"
            onClick={send}
            disabled={!selectedId || sending || channels.length === 0}
          >
            {sending
              ? 'Sharing…'
              : mode === 'copy'  ? 'Send a copy'
              : mode === 'live'  ? 'Start collaboration'
              :                    'Share to chat'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Multitrack() {
  /* Currently signed-in user — needed for the "owner can delete a
     shared project" check in the project list, and a few other
     places that gate UI on the user's uid. */
  const { user } = useAuth();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* Live-synced via Firestore. The third return value carries the
     loading/error state of the underlying onSnapshot subscription —
     we use its `loading` flag to drive the "Loading…" placeholder
     in the project list. (Previously this was a local state that
     was never flipped off, leaving the page stuck on "Loading…".) */
  const [projects, setProjects, projectsMeta] = useUserStoreKey('studio-projects', []);

  /* Per-user list of archived project IDs. Covers both personal
     projects (stored in the user's kv) and shared/collaborative
     projects (stored in /sharedStudioProjects). Using a single
     list keeps archive state on the user's side — collaborators
     don't see each other's archive state. */
  const [archivedIds, setArchivedIds] = useUserStoreKey('studio-archived-ids', []);
  const archivedSet = useMemo(() => new Set(archivedIds || []), [archivedIds]);
  const archiveProject = useCallback((id) => {
    setArchivedIds(prev => Array.from(new Set([...(prev || []), id])));
  }, [setArchivedIds]);
  const unarchiveProject = useCallback((id) => {
    setArchivedIds(prev => (prev || []).filter(x => x !== id));
  }, [setArchivedIds]);

  /* Sidebar list of archived projects (collapsed by default) */
  const [archiveOpen, setArchiveOpen] = useState(false);

  /* leaveSharedProject is defined further down, after `selected`
     is declared — JavaScript's temporal dead zone means we can't
     reference `selected` here. See its definition near the other
     project-mutation helpers. */
  /* Collaborative shared projects this user is an editor on — lives
     in the /sharedStudioProjects collection. Subscribed via the
     shared service so any edit from another collaborator streams in
     here automatically. */
  const [sharedProjects, setSharedProjects] = useState([]);
  useEffect(() => {
    /* Wait until we have a uid before subscribing — the service's
       `uid()` helper throws when unauthenticated, and a single throw
       on first mount used to leave the subscription permanently
       unset (no retry on auth-resolve). Keying the effect on
       user?.uid re-runs it once auth resolves and on any uid
       change, which also gives us a clean teardown when the user
       signs out. */
    if (!user?.uid) {
      setSharedProjects([]);
      return;
    }
    let active = true;
    let unsub  = null;
    try {
      unsub = sharedStudioProjectService.subscribeMine((list) => {
        if (active) setSharedProjects(list);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[multitrack] sharedStudioProjects subscription failed:', e);
    }
    return () => { active = false; if (unsub) unsub(); };
  }, [user?.uid]);

  /* Auto-open hook: when the user double-clicks a Studio-share card
     in chat, the chat handler writes the project id to sessionStorage
     and navigates to /multitrack. We pick it up here once on mount,
     open the project, and clear the flag so it doesn't re-trigger. */
  const sharedAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (sharedAutoOpenedRef.current) return;
    const sharedId = sessionStorage.getItem('mt:open-shared');
    if (sharedId) {
      sharedAutoOpenedRef.current = true;
      sessionStorage.removeItem('mt:open-shared');
      /* Wait one tick so the subscription has a chance to populate
         sharedProjects (purely cosmetic — loadSharedProject works
         on its own anyway). */
      setTimeout(() => loadSharedProject(sharedId), 100);
    }
  }, [sharedProjects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Same auto-open hook for personal projects (used when an
     imported "Send a copy" share lands). Personal projects come in
     via useUserStoreKey which only re-renders when the kv reloads;
     waiting for projects.length > 0 ensures the project we just
     wrote has been observed before we try to open it. */
  const personalAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (personalAutoOpenedRef.current) return;
    const pid = sessionStorage.getItem('mt:open-personal');
    if (!pid) return;
    const found = projects.find(p => p.id === pid);
    if (!found) return; // wait for it to land
    personalAutoOpenedRef.current = true;
    sessionStorage.removeItem('mt:open-personal');
    setTimeout(() => loadProject(pid), 100);
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected]   = useState(null);   // full project with .tracks (db shape)
  const [buffers, setBuffers]     = useState({});      // trackId → { buffer, peaks }
  const loading                    = Boolean(projectsMeta?.loading);
  const [error, setError]         = useState(null);

  /* Non-owner collaborator action: leave a shared project. Removes
     the user from editorUids + acceptedUids on the shared doc so
     it disappears from their sidebar and they lose edit access.
     Other collaborators (and the owner) keep editing as before.

     Declared here (after `selected` is in scope) rather than next
     to its declaration up above, because referencing `selected`
     earlier in the function body hits a temporal-dead-zone error. */
  const leaveSharedProject = useCallback(async (project) => {
    if (!project?.id) return;
    if (project.ownerUid === user?.uid) {
      setError('Owners can\'t leave their own project. Use Delete instead.');
      return;
    }
    const ok = window.confirm(
      `Leave "${project.name}"? You won't be able to open or edit it ` +
      `unless someone re-invites you. The project itself stays for everyone else.`
    );
    if (!ok) return;
    try {
      await sharedStudioProjectService.leaveCollaboration(project.id);
      if (selected?.id === project.id) setSelected(null);
      unarchiveProject(project.id);
    } catch (err) {
      setError(`Could not leave: ${err?.message || 'unknown error'}`);
    }
  }, [user, selected, unarchiveProject]);

  const [playing, setPlaying]     = useState(false);
  const [recording, setRecording] = useState(null);   // null | 'arming' | 'recording'
  const [playhead, setPlayhead]   = useState(0);
  const [pxPerSec, setPxPerSec]   = useState(80);
  const [countIn, setCountIn]     = useState(true);
  const [rulerMode, setRulerMode] = useState('bars'); // 'bars' | 'time'
  const [snap, setSnap]           = useState('beat'); // 'off' | 'bar' | 'beat'
  const [showMixer, setShowMixer] = useState(false);
  /* Inside the Mixer drawer: when true, render the AutotuneWorkbench
     instead of the channel strips. Toggled via the "Open Autotune"
     button in the MixerControls bar. */
  const [showAutotune, setShowAutotune] = useState(false);

  /* Which existing track should the next take be recorded onto?
     - null  → original behavior (recording creates a NEW track)
     - tid   → recording appends a clip to that track instead.
     Set by clicking ＋ above the track list or tapping a track head. */
  const [recordTargetTrackId, setRecordTargetTrackId] = useState(null);

  /* Set during a clip drag to the id of the lane the cursor is
     currently hovering over. Lets us paint a soft highlight on
     the destination lane so cross-track moves feel deliberate. */
  const [hoverLaneId, setHoverLaneId] = useState(null);
  const [showConsole, setShowConsole] = useState(false);
  const [consolePos, setConsolePos]   = useState({ x: 70, y: 90 });
  const [consoleSize, setConsoleSize] = useState({ w: 940, h: 580 });
  const [consoleView, setConsoleView] = useState('board');   // mirrors the console's inner view
  const [instRecording, setInstRecording] = useState(null);  // null | 'arming' | 'recording'
  const [loopOn, setLoopOn]           = useState(false);     // Stream-deck Loop
  const [automationOn, setAutomationOn] = useState(false);   // Stream-deck Automation (auto fade)
  const [levels, setLevels]       = useState({});
  const [monitorInput, setMonitorInput]   = useState(false);
  const [recSettingsOpen, setRecSettingsOpen] = useState(false);
  const [calibStatus, setCalibStatus]      = useState(null); // null | 'running' | {ms} | {error}

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  /* Project currently being shared to a chat — null when the dialog
     is closed. Set by the per-project share button. */
  const [sharingProject, setSharingProject] = useState(null);
  /* Tiny toast for share-success/error feedback. */
  const [shareToast, setShareToast] = useState('');
  useEffect(() => {
    if (!shareToast) return;
    const t = setTimeout(() => setShareToast(''), 3500);
    return () => clearTimeout(t);
  }, [shareToast]);
  const [mixdownState, setMixdownState]     = useState(null); // null | 'rendering' | { blob, dataUrl }
  const [songs, setSongs]                   = useUserStoreKey('songs', []);
  const [armedDelete, setArmedDelete]       = useState(null); // key of a delete awaiting a 2nd confirming click
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem('mt:seen-intro'));

  const playerRef    = useRef(null);
  const rafRef       = useRef(null);
  const recorderRef  = useRef(null);
  const recStartRef  = useRef(0);
  const recLeadInRef = useRef(0);     // seconds recorded before playback began (count-in + pre-roll)
  const countInTimerRef = useRef(null);
  const inputRafRef  = useRef(null);  // input-meter RAF while arming (pre-playback)
  const instRecorderRef     = useRef(null);   // { mr, chunks } for synth recording
  const instRecStartRef     = useRef(0);      // playhead where the instrument take begins
  const instLeadInRef       = useRef(0);      // seconds recorded before playback started
  const instRecStartWallRef = useRef(0);      // performance.now() when MediaRecorder started
  const instCountInTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const clipFileInputRef   = useRef(null);
  const clipTargetTrackRef = useRef(null);
  const scrollRef    = useRef(null);
  const dragRef        = useRef(null);
  const saveTimers     = useRef({});
  const masterSaveTimer = useRef(null);
  const latencySaveTimer = useRef(null);
  const keyHandlerRef    = useRef(null);   // latest keydown handler (stable listener wrapper)
  const armTimerRef      = useRef(null);   // auto-disarm timer for two-step deletes
  const armAtRef         = useRef(0);      // timestamp the current delete was armed
  const armedRef         = useRef(null);   // synchronous mirror of the armed key
  const lastInvokeRef    = useRef({ key: null, t: 0 }); // collapses a click's burst of handler fires
  const playStartRef     = useRef(0);      // project time playback last started at (for Loop)
  const loopRef          = useRef(false);  // synchronous mirror of loopOn
  const automationRef    = useRef(false);  // synchronous mirror of automationOn
  loopRef.current = loopOn;
  automationRef.current = automationOn;

  /* No initial fetch for projects/songs — useUserStoreKey loads via onSnapshot. */
  // Mark the first-time intro banner as seen the moment the user opens
  // this page — so even navigating away without dismissing it counts.
  useEffect(() => { localStorage.setItem('mt:seen-intro', '1'); }, []);

  const fetchProjects = async () => {
    try {
      const res = await studioProjectService.getAll();
      setProjects(res.data.data);
    } catch { setError('Could not load projects.'); }
  };

  /* Project mutation dispatcher. Studio supports two kinds of
     projects with slightly different service shapes:

     - PERSONAL (kind undefined): /users/{uid}/kv/studio-projects.
       Methods return { data: { data: ... } } (legacy Express-shaped
       envelope).
     - SHARED (kind: 'shared'): /sharedStudioProjects/{id}. Methods
       return values directly.

     `projOps` exposes a single async-friendly API for both. Every
     mutation call site below uses these helpers instead of touching
     studioProjectService / sharedStudioProjectService directly, so
     edits to a collaborative project flow to the shared doc and
     stream to every other editor via the subscription. */
  const projOps = useMemo(() => ({
    isShared: () => selected?.kind === 'shared',
    async updateMeta(patch) {
      if (this.isShared()) {
        return sharedStudioProjectService.updateMeta(selected.id, patch);
      }
      return studioProjectService.update(selected.id, patch);
    },
    async deleteProject(id, kind) {
      if (kind === 'shared') return sharedStudioProjectService.deleteProject(id);
      return studioProjectService.delete(id);
    },
    async addTrack(data) {
      if (this.isShared()) {
        return sharedStudioProjectService.addTrack(selected.id, data);
      }
      const res = await studioProjectService.addTrack(selected.id, data);
      return res?.data?.data ?? res;
    },
    async updateTrack(trackId, patch) {
      if (this.isShared()) {
        return sharedStudioProjectService.updateTrack(selected.id, trackId, patch);
      }
      return studioProjectService.updateTrack(selected.id, trackId, patch);
    },
    async removeTrack(trackId) {
      if (this.isShared()) {
        return sharedStudioProjectService.removeTrack(selected.id, trackId);
      }
      return studioProjectService.removeTrack(selected.id, trackId);
    },
    async addClip(trackId, data) {
      if (this.isShared()) {
        return sharedStudioProjectService.addClip(selected.id, trackId, data);
      }
      return studioProjectService.addClip(selected.id, trackId, data);
    },
    async updateClip(trackId, clipId, patch) {
      if (this.isShared()) {
        return sharedStudioProjectService.updateClip(selected.id, trackId, clipId, patch);
      }
      return studioProjectService.updateClip(selected.id, trackId, clipId, patch);
    },
    async removeClip(trackId, clipId) {
      if (this.isShared()) {
        return sharedStudioProjectService.removeClip(selected.id, trackId, clipId);
      }
      return studioProjectService.removeClip(selected.id, trackId, clipId);
    },
  }), [selected]);

  /* Load a COLLABORATIVE shared project. Same buffer-decode flow
     as loadProject but reads from /sharedStudioProjects. The
     `kind: 'shared'` tag on the result tells mutation handlers
     elsewhere to route writes through sharedStudioProjectService
     instead of the personal one. Real-time updates from other
     collaborators come in through the parent subscription which
     refreshes the `sharedProjects` array — when the open project
     is shared, we re-apply incoming changes below. */
  const loadSharedProject = async (id) => {
    try {
      stopAll();
      armedRef.current = null;
      setArmedDelete(null);
      clearTimeout(armTimerRef.current);
      const proj = await sharedStudioProjectService.getOne(id);
      if (!proj) { setError('That shared project no longer exists.'); return; }
      proj.kind = 'shared';
      setSelected(proj);
      setPlayhead(0);
      const next = {};
      for (const t of (proj.tracks || [])) {
        for (const c of (t.clips || [])) {
          const src = c.audio_url || c.audio_data;
          if (!src) continue;
          try {
            const buffer = await decodeTrack(`clip-${c.id}`, src);
            next[`clip-${c.id}`] = { buffer, peaks: computePeaks(buffer, 2000) };
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[multitrack/shared] decode failed for clip', c.id, e?.message || e);
          }
        }
      }
      setBuffers(next);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[multitrack/shared] loadSharedProject failed:', e);
      setError('Could not open shared project.');
    }
  };

  /* Real-time sync: when the open project is a shared one, mirror
     incoming changes from the subscription into `selected`. Skips
     the very first snapshot (when the project was just loaded) to
     avoid clobbering an unsaved in-flight edit. */
  useEffect(() => {
    if (selected?.kind !== 'shared') return;
    const live = sharedProjects.find(p => p.id === selected.id);
    if (!live) return;
    if ((live.updated_at || '') === (selected.updated_at || '')) return;
    /* Apply only the safe-to-replace fields. Don't blow away local
       decoded buffers — the buffers map is keyed by clip id and
       new clips will be decoded next time the project is opened. */
    setSelected(prev => prev ? { ...live, kind: 'shared' } : prev);
  }, [sharedProjects, selected]);

  const loadProject = async (id) => {
    try {
      stopAll();
      armedRef.current = null;
      setArmedDelete(null);
      clearTimeout(armTimerRef.current);
      const res = await studioProjectService.getOne(id);
      const proj = res.data.data;
      setSelected(proj);
      setPlayhead(0);
      // Decode every clip on every track (keyed by clip id). The
      // Firestore service stores the audio location as `audio_url`
      // — could be a Firebase Storage download URL (when Storage
      // works) or an inline `data:audio/webm;base64,...` URL (when
      // it falls back due to Storage being broken). Either form
      // works with fetch() inside decodeTrack().
      //
      // Older saved clips may still use the legacy `audio_data`
      // field name from before the Firebase migration — fall back
      // to that so existing recordings keep playing.
      const next = {};
      for (const t of proj.tracks) {
        for (const c of (t.clips || [])) {
          const src = c.audio_url || c.audio_data;
          if (!src) continue;
          try {
            const buffer = await decodeTrack(`clip-${c.id}`, src);
            next[`clip-${c.id}`] = { buffer, peaks: computePeaks(buffer, 2000) };
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[multitrack] could not decode clip', c.id, e?.message || e);
          }
        }
      }
      setBuffers(next);
    } catch { setError('Could not open project.'); }
  };

  /* ── project mutations ───────────────────────────────────── */
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await studioProjectService.create({ name: newProjectName.trim() });
      setNewProjectName('');
      setShowNewProject(false);
      await fetchProjects();
      loadProject(res.data.data.id);
    } catch { setError('Failed to create project.'); }
  };

  const doDeleteProject = async (id) => {
    try {
      await studioProjectService.delete(id);
      if (selected?.id === id) setSelected(null);
      await fetchProjects();
    } catch { setError('Failed to delete project.'); }
  };
  const deleteProject = (id) =>
    armOrRun(`project-${id}`, () => doDeleteProject(id));

  /* ── track persistence (debounced) ───────────────────────── */
  const patchTrackLocal = (trackId, patch) => {
    setSelected(s => s ? {
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, ...patch } : t),
    } : s);
  };
  const saveTrack = (trackId, patch) => {
    clearTimeout(saveTimers.current[trackId]);
    saveTimers.current[trackId] = setTimeout(() => {
      projOps.updateTrack(trackId, patch).catch(() => {});
    }, 400);
  };
  const updateTrack = (trackId, patch) => {
    patchTrackLocal(trackId, patch);
    saveTrack(trackId, patch);
    if (patch.volume !== undefined || patch.pan !== undefined) {
      playerRef.current?.updateTrackMix(trackId, patch);
    }
  };

  const updateTrackFx = (trackId, fxPatch) => {
    const track = selected.tracks.find(t => t.id === trackId);
    const nextFx = { ...DEFAULT_FX, ...(track?.effects || {}), ...fxPatch };
    patchTrackLocal(trackId, { effects: nextFx });
    saveTrack(trackId, { effects: nextFx });
    playerRef.current?.updateTrackFx(trackId, nextFx);
  };

  /* ── clip persistence (debounced) ────────────────────────── */
  const patchClipLocal = (trackId, clipId, patch) => {
    setSelected(s => s ? {
      ...s,
      tracks: s.tracks.map(t => t.id !== trackId ? t : {
        ...t,
        clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c),
      }),
    } : s);
  };
  const saveClip = (trackId, clipId, patch) => {
    const key = `clip-${clipId}`;
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      projOps.updateClip(trackId, clipId, patch).catch(() => {});
    }, 400);
  };
  const updateClip = (trackId, clipId, patch) => {
    patchClipLocal(trackId, clipId, patch);
    saveClip(trackId, clipId, patch);
  };

  /* ── Two-step delete guard ───────────────────────────────────
     A single click only ARMS a delete (shows "Delete?"); a second,
     deliberate click on the SAME control within 4 s actually does
     it. The second click must land >300 ms after arming. This makes
     stray / synthetic / harness clicks structurally unable to
     destroy data — no native confirm() that an environment can
     auto-accept. */
  const disarm = () => {
    armedRef.current = null;
    clearTimeout(armTimerRef.current);
    setArmedDelete(null);
  };
  const armOrRun = (key, run) => {
    const now = Date.now();
    // A single user click can fire this handler many times in one tick
    // (React dev double-invoke, etc.). Collapse that burst — only the
    // first invocation for a key within 60 ms counts.
    if (lastInvokeRef.current.key === key && now - lastInvokeRef.current.t < 60) return;
    lastInvokeRef.current = { key, t: now };

    // armedRef is updated synchronously, so it's reliable even mid-burst.
    if (armedRef.current === key && now - armAtRef.current > 300) {
      disarm();
      run();                       // second, deliberate click → actually delete
    } else {
      armedRef.current = key;      // first click → just arm it
      armAtRef.current = now;
      clearTimeout(armTimerRef.current);
      setArmedDelete(key);
      armTimerRef.current = setTimeout(disarm, 4000);
    }
  };

  const doRemoveClip = async (trackId, clipId) => {
    try {
      await projOps.removeClip(trackId, clipId);
      dropFromCache(`clip-${clipId}`);
      setSelected(s => ({
        ...s,
        tracks: s.tracks.map(t => t.id !== trackId ? t : {
          ...t, clips: t.clips.filter(c => c.id !== clipId),
        }),
      }));
      setBuffers(b => { const n = { ...b }; delete n[`clip-${clipId}`]; return n; });
    } catch { setError('Failed to delete clip.'); }
  };
  const removeClip = (trackId, clipId) =>
    armOrRun(`clip-${clipId}`, () => doRemoveClip(trackId, clipId));

  const updateMasterVolume = (v) => {
    setSelected(s => s ? { ...s, master_volume: v } : s);
    playerRef.current?.setMasterVolume(v);
    clearTimeout(masterSaveTimer.current);
    masterSaveTimer.current = setTimeout(() => {
      projOps.updateMeta({ master_volume: v }).catch(() => {});
    }, 400);
  };

  const doRemoveTrack = async (trackId) => {
    try {
      const track = selected.tracks.find(t => t.id === trackId);
      const clipIds = (track?.clips || []).map(c => c.id);
      await projOps.removeTrack(trackId);
      clipIds.forEach(id => dropFromCache(`clip-${id}`));
      setSelected(s => ({ ...s, tracks: s.tracks.filter(t => t.id !== trackId) }));
      setBuffers(b => {
        const n = { ...b };
        clipIds.forEach(id => delete n[`clip-${id}`]);
        return n;
      });
    } catch { setError('Failed to delete track.'); }
  };
  const removeTrack = (trackId) =>
    armOrRun(`track-${trackId}`, () => doRemoveTrack(trackId));

  /* Create an empty track (no audio yet) and auto-select it as
     the recording target so the user can immediately hit ⏺ Record
     and have the take land in this lane. */
  const addEmptyTrack = async () => {
    if (!selected) return;
    try {
      const created = await projOps.addTrack({
        name: `Track ${selected.tracks.length + 1}`,
      });
      const newId = created?.id;
      /* Reload so the new (empty) track is in `selected.tracks` for
         the click handlers + visual highlight to find by id. */
      if (selected.kind === 'shared') await loadSharedProject(selected.id);
      else                            await loadProject(selected.id);
      if (newId) setRecordTargetTrackId(newId);
    } catch {
      setError('Could not add a new track.');
    }
  };

  /* If the currently-targeted track gets deleted (or the project
     changes), fall back to "new track on record" so we never try
     to addClip onto a missing id. */
  useEffect(() => {
    if (!recordTargetTrackId) return;
    const exists = selected?.tracks?.some(t => t.id === recordTargetTrackId);
    if (!exists) setRecordTargetTrackId(null);
  }, [selected?.tracks, recordTargetTrackId]);

  /* ── engine track builder ────────────────────────────────── */
  const engineTracks = useCallback(() => {
    if (!selected) return [];
    return selected.tracks.map(t => ({
      id: t.id,
      volume: t.volume,
      pan: t.pan,
      muted: !!t.is_muted,
      solo: !!t.is_solo,
      effects: t.effects || {},
      clips: (t.clips || []).map(c => ({
        id: c.id,
        buffer: buffers[`clip-${c.id}`]?.buffer || null,
        clipOffset: c.clip_offset,
        trimStart: c.trim_start,
        trimEnd: c.trim_end,
      })),
    }));
  }, [selected, buffers]);

  /* ── transport ───────────────────────────────────────────── */
  /** Automated master fade-in / fade-out over the playing span (Automation deck key). */
  const applyMasterAutomation = (player, from) => {
    try {
      const ctx = getCtx();
      const g = player.masterGain.gain;
      const base = selected?.master_volume ?? 1;
      const total = projectDuration(engineTracks());
      const remain = Math.max(0.2, total - from);
      const fade = Math.min(1.5, remain / 3);
      const t0 = ctx.currentTime + 0.08;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(0.0001, t0);
      g.linearRampToValueAtTime(base, t0 + fade);
      g.setValueAtTime(base, t0 + Math.max(fade, remain - fade));
      g.linearRampToValueAtTime(0.0001, t0 + remain);
    } catch { /* automation is best-effort */ }
  };

  const startPlayback = (from) => {
    cancelAnimationFrame(rafRef.current);   // guard against loop re-entry
    playStartRef.current = from;
    const player = new MultitrackPlayer(selected?.master_volume ?? 1);
    playerRef.current = player;
    if (automationRef.current) applyMasterAutomation(player, from);
    player.play(engineTracks(), from, () => {
      if (loopRef.current && playerRef.current === player) {
        startPlayback(playStartRef.current);   // Loop deck key — restart the span
      } else {
        setPlaying(false);
        /* Only freeze the playhead if we're NOT recording. If a take
           is still in progress (overdub past the end of the existing
           tracks, or recording onto an empty project), keep the RAF
           running so the playhead continues advancing — otherwise the
           UI looks frozen and the user thinks recording stopped at
           the project's old duration. */
        if (!recorderRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
      }
    });
    setPlaying(true);
    const tick = () => {
      const p   = playerRef.current;
      const rec = recorderRef.current;
      let t;
      if (p && p.playing) {
        /* Normal case — playback is live, use the player's clock. */
        t = p.now();
      } else if (rec?.recStartCtxTime != null) {
        /* Playback ended but we're still recording. Derive the
           playhead from the audio context's clock relative to when
           the recorder started, minus the lead-in (count-in + the
           tiny pre-roll captured before playback began). */
        const elapsed = getCtx().currentTime - rec.recStartCtxTime;
        t = recStartRef.current + Math.max(0, elapsed - (recLeadInRef.current || 0));
      } else if (p) {
        t = p.now();
      } else {
        return; // nothing left to advance
      }
      setPlayhead(t);
      const lv = (p && p.getLevels) ? p.getLevels() : { input: 0 };
      if (rec?.getLevel) lv.input = rec.getLevel();
      setLevels(lv);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  /* input-only meter loop — runs while arming, before playback's RAF starts */
  const startInputMeter = () => {
    cancelAnimationFrame(inputRafRef.current);
    const loop = () => {
      const lvl = recorderRef.current?.getLevel?.() ?? 0;
      setLevels(prev => ({ ...prev, input: lvl }));
      inputRafRef.current = requestAnimationFrame(loop);
    };
    inputRafRef.current = requestAnimationFrame(loop);
  };
  const stopInputMeter = () => cancelAnimationFrame(inputRafRef.current);

  const stopPlayback = () => {
    playerRef.current?.stop();
    playerRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setLevels({});
  };

  const stopAll = () => {
    stopPlayback();
    stopInputMeter();
    if (countInTimerRef.current) { clearTimeout(countInTimerRef.current); countInTimerRef.current = null; }
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch {}   // releases the mic stream
      recorderRef.current = null;
    }
    setRecording(null);
  };

  const handlePlayStop = () => {
    if (playing) stopPlayback();
    else if (selected && selected.tracks.length) startPlayback(playhead);
  };

  const handleRecord = async () => {
    if (recording) return stopRecording();
    if (!selected) return;
    setRecording('arming');
    // Open the mic up front so the input meter is live during the count-in.
    let rec;
    try {
      rec = await startMicRecording({ monitor: monitorInput });
    } catch {
      setError('Microphone unavailable or permission denied.');
      setRecording(null);
      return;
    }
    recorderRef.current = rec;
    startInputMeter();
    const begin = () => {
      countInTimerRef.current = null;
      recStartRef.current = playhead;
      // how much audio was captured before playback actually started
      recLeadInRef.current = getCtx().currentTime - rec.recStartCtxTime;
      stopInputMeter();          // playback's RAF takes over input metering
      startPlayback(playhead);   // overdub: existing tracks play while we record
      setRecording('recording');
    };
    if (countIn) {
      const dur = playCountIn(selected.tempo || 100, 4);
      countInTimerRef.current = setTimeout(begin, dur * 1000);
    } else {
      begin();
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (countInTimerRef.current) { clearTimeout(countInTimerRef.current); countInTimerRef.current = null; }
    stopInputMeter();
    const wasRecording = recording === 'recording';
    stopPlayback();
    setRecording('arming');   // "saving…"
    if (!rec) { setRecording(null); return; }
    try {
      const dataUrl = await rec.stop();
      if (!wasRecording || !dataUrl) { setRecording(null); return; }  // stopped during count-in
      // Trim off the count-in / pre-roll, plus latency compensation, from the take's head.
      const latencySec = (selected.record_latency_ms || 0) / 1000;
      const trimStart  = Math.max(0, recLeadInRef.current + latencySec);

      /* Two paths:
         - If the user picked an existing track as the recording
           target (clicked ＋ or tapped a track head), append the
           take as a CLIP on that track so overdubs / multi-takes
           stack within one lane.
         - Otherwise keep the original behavior: each take becomes
           its own brand-new track. */
      const targetId   = recordTargetTrackId;
      const targetTrk  = targetId ? selected.tracks.find(t => t.id === targetId) : null;
      if (targetTrk) {
        await projOps.addClip(targetId, {
          name:         `Take ${(targetTrk.clips || []).length + 1}`,
          audio_data:   dataUrl,
          clip_offset:  recStartRef.current,
          trim_start:   trimStart,
          trim_end:     0,
        });
      } else {
        await projOps.addTrack({
          name:         `Track ${selected.tracks.length + 1}`,
          audio_data:   dataUrl,
          clip_offset:  recStartRef.current,
          trim_start:   trimStart,
        });
      }
      /* Personal projects need explicit reload; shared projects
         auto-refresh through the snapshot subscription. */
      if (selected.kind === 'shared') await loadSharedProject(selected.id);
      else                            await loadProject(selected.id);
    } catch { setError('Failed to save recording.'); }
    setRecording(null);
  };

  /* ── recording settings: monitoring + latency calibration ───── */
  const toggleMonitor = () => {
    setMonitorInput(on => {
      const next = !on;
      recorderRef.current?.setMonitor?.(next);
      return next;
    });
  };

  const updateRecLatency = (ms) => {
    const v = Math.max(0, Math.min(500, Math.round(ms) || 0));
    setSelected(s => s ? { ...s, record_latency_ms: v } : s);
    clearTimeout(latencySaveTimer.current);
    latencySaveTimer.current = setTimeout(() => {
      projOps.updateMeta({ record_latency_ms: v }).catch(() => {});
    }, 400);
  };

  const runCalibration = async () => {
    if (!selected) return;
    setCalibStatus('running');
    try {
      const ms = await calibrateLatency();
      updateRecLatency(ms);
      setCalibStatus({ ms });
    } catch (err) {
      setCalibStatus({ error: err.message || 'Calibration failed.' });
    }
  };

  const handleAddFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    try {
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.readAsDataURL(file);
      });
      await projOps.addTrack({
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported',
        audio_data: dataUrl,
        clip_offset: playhead,
      });
      if (selected.kind === 'shared') await loadSharedProject(selected.id);
      else                            await loadProject(selected.id);
    } catch { setError('Could not import that file.'); }
  };

  /* ── multi-clip: add a clip to an existing track ─────────── */
  const triggerAddClip = (trackId) => {
    clipTargetTrackRef.current = trackId;
    clipFileInputRef.current?.click();
  };
  const handleAddClipFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const trackId = clipTargetTrackRef.current;
    clipTargetTrackRef.current = null;
    if (!file || !selected || !trackId) return;
    try {
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.readAsDataURL(file);
      });
      await projOps.addClip(trackId, {
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '',
        audio_data: dataUrl,
        clip_offset: playhead,
      });
      if (selected.kind === 'shared') await loadSharedProject(selected.id);
      else                            await loadProject(selected.id);
    } catch { setError('Could not add that clip.'); }
  };

  /* ── multi-clip: split every clip crossing the playhead ──── */
  const splitAtPlayhead = async () => {
    if (!selected) return;
    const P = playhead;
    const ops = [];
    for (const t of selected.tracks) {
      for (const c of (t.clips || [])) {
        const buf = buffers[`clip-${c.id}`]?.buffer;
        if (!buf) continue;
        const effDur = clipDuration({ buffer: buf, trimStart: c.trim_start, trimEnd: c.trim_end });
        const start = c.clip_offset;
        const end = start + effDur;
        if (P > start + 0.02 && P < end - 0.02) {
          ops.push({ trackId: t.id, clip: c, splitPoint: c.trim_start + (P - start), full: buf.duration });
        }
      }
    }
    if (!ops.length) return;
    try {
      for (const op of ops) {
        // left part: end the existing clip at the playhead
        await projOps.updateClip(op.trackId, op.clip.id, {
          trim_end: op.full - op.splitPoint,
        });
        /* Right part: a new clip starting at the playhead, sharing
           the same audio. */
        const src = op.clip.audio_url || op.clip.audio_data;
        await projOps.addClip(op.trackId, {
          name: op.clip.name,
          audio_url:    src,
          storage_path: op.clip.storage_path,
          clip_offset: P,
          trim_start: op.splitPoint,
          trim_end: op.clip.trim_end,
        });
      }
      await loadProject(selected.id);
    } catch { setError('Split failed.'); }
  };

  /* ── Stream-deck actions: Solo / Quantize ─────────────────────
     (Loop + Automation are toggles handled in startPlayback.) */
  const soloCount = selected ? selected.tracks.filter(t => t.is_solo).length : 0;
  const clearSolos = () => {
    if (!selected) return;
    selected.tracks.forEach(t => { if (t.is_solo) updateTrack(t.id, { is_solo: 0 }); });
  };
  // Snap every clip's start to the nearest beat. Non-destructive — clips
  // only move; audio is never touched. Returns how many clips shifted.
  const quantizeClips = () => {
    if (!selected) return 0;
    const g = gridMetrics(selected.tempo, selected.time_signature);
    if (!g.beatSec) return 0;
    let moved = 0;
    selected.tracks.forEach(t => {
      (t.clips || []).forEach(c => {
        const snapped = snapToGrid(c.clip_offset, g.beatSec);
        if (Math.abs(snapped - c.clip_offset) > 0.001) {
          updateClip(t.id, c.id, { clip_offset: snapped });
          moved++;
        }
      });
    });
    return moved;
  };

  /* ── Autotune (Console Phase 2) — fully non-destructive ───── */
  // Analyse a track's clips and return an aggregated tuning report.
  const analyzeTrack = (trackId) => new Promise((resolve) => {
    setTimeout(() => {                       // defer so the UI can paint "Analysing…"
      const track = selected?.tracks.find(t => t.id === trackId);
      if (!track || !(track.clips || []).length) { resolve({ stats: null }); return; }
      let voiced = [];
      for (const c of track.clips) {
        const buf = buffers[`clip-${c.id}`]?.buffer;
        if (!buf) continue;
        const { frames } = analyzePitch(buf);
        voiced = voiced.concat(frames.filter(f => f.voiced));
      }
      if (!voiced.length) { resolve({ stats: { empty: true } }); return; }
      let absC = 0, sgnC = 0, inTune = 0, lo = Infinity, hi = -Infinity;
      for (const f of voiced) {
        absC += Math.abs(f.cents); sgnC += f.cents;
        if (Math.abs(f.cents) <= 20) inTune++;
        if (f.midi < lo) lo = f.midi;
        if (f.midi > hi) hi = f.midi;
      }
      resolve({ stats: {
        voicedCount: voiced.length,
        avgCents:  Math.round(absC / voiced.length),
        biasCents: Math.round(sgnC / voiced.length),
        inTunePct: Math.round((100 * inTune) / voiced.length),
        lowNote:  midiToName(lo),
        highNote: midiToName(hi),
      } });
    }, 30);
  });

  // Render a pitch-corrected copy of every clip on a track into a NEW
  // track named "<name> (tuned)". The original track is never touched.
  const applyAutotuneToTrack = (trackId, opts) => new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const track = selected?.tracks.find(t => t.id === trackId);
        if (!track || !(track.clips || []).length) {
          resolve({ ok: false, message: 'That track has no audio to tune.' });
          return;
        }
        const rendered = [];
        for (const c of track.clips) {
          const buf = buffers[`clip-${c.id}`]?.buffer;
          if (!buf) continue;
          const outBuf = autotuneRender(buf, opts);          // brand-new buffer
          const dataUrl = await blobToDataUrl(encodeWav(outBuf));
          rendered.push({ clip: c, dataUrl });
        }
        if (!rendered.length) { resolve({ ok: false, message: 'Could not render that track.' }); return; }
        const first = rendered[0];
        const newTrack = await projOps.addTrack({
          name: `${track.name} (tuned)`,
          audio_data: first.dataUrl,
          clip_offset: first.clip.clip_offset,
          trim_start: first.clip.trim_start,
          trim_end: first.clip.trim_end,
        });
        const newTrackId = newTrack.id;
        for (let i = 1; i < rendered.length; i++) {
          await projOps.addClip(newTrackId, {
            name: rendered[i].clip.name,
            audio_data: rendered[i].dataUrl,
            clip_offset: rendered[i].clip.clip_offset,
            trim_start: rendered[i].clip.trim_start,
            trim_end: rendered[i].clip.trim_end,
          });
        }
        if (selected.kind === 'shared') await loadSharedProject(selected.id);
        else                            await loadProject(selected.id);
        await fetchProjects();
        resolve({ ok: true, message: `Created "${track.name} (tuned)" — your original track is untouched.` });
      } catch {
        resolve({ ok: false, message: 'Autotune render failed.' });
      }
    }, 30);
  });

  /* ── Instrument recording (Console Phase 3) ──────────────── */
  // Records the studio synth's output (getRecordStream) into a new track,
  // with count-in + overdub playback, just like the mic flow.
  const startInstrumentRecording = () => {
    if (instRecording) return stopInstrumentRecording();
    if (!selected || recording) return;            // not while a mic take is live
    setInstRecording('arming');
    let stream;
    try {
      stream = getRecordStream();                  // synth output MediaStream (persistent)
    } catch {
      setError('Could not access the instrument output.');
      setInstRecording(null);
      return;
    }
    const chunks = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mr.start();
    instRecStartWallRef.current = performance.now();
    instRecorderRef.current = { mr, chunks };
    const begin = () => {
      instCountInTimerRef.current = null;
      instRecStartRef.current = playhead;
      instLeadInRef.current = (performance.now() - instRecStartWallRef.current) / 1000;
      startPlayback(playhead);                     // overdub — hear the project while you play
      setInstRecording('recording');
    };
    if (countIn) {
      const dur = playCountIn(selected.tempo || 100, 4);
      instCountInTimerRef.current = setTimeout(begin, dur * 1000);
    } else {
      begin();
    }
  };

  const stopInstrumentRecording = async () => {
    const rec = instRecorderRef.current;
    instRecorderRef.current = null;
    if (instCountInTimerRef.current) { clearTimeout(instCountInTimerRef.current); instCountInTimerRef.current = null; }
    const wasRecording = instRecording === 'recording';
    stopPlayback();
    setInstRecording('arming');                    // "saving…"
    if (!rec) { setInstRecording(null); return; }
    try {
      const dataUrl = await new Promise((resolve) => {
        rec.mr.onstop = () => {
          const blob = new Blob(rec.chunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        };
        try { rec.mr.stop(); } catch { resolve(null); }
      });
      if (!wasRecording || !dataUrl) { setInstRecording(null); return; }
      const trimStart = Math.max(0, instLeadInRef.current);   // drop the count-in / pre-roll
      await projOps.addTrack({
        name: `Instrument ${selected.tracks.length + 1}`,
        audio_data: dataUrl,
        clip_offset: instRecStartRef.current,
        trim_start: trimStart,
      });
      if (selected.kind === 'shared') await loadSharedProject(selected.id);
      else                            await loadProject(selected.id);
    } catch { setError('Failed to save the instrument take.'); }
    setInstRecording(null);
  };

  // cleanup
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(inputRafRef.current);
    if (countInTimerRef.current) clearTimeout(countInTimerRef.current);
    if (instCountInTimerRef.current) clearTimeout(instCountInTimerRef.current);
    playerRef.current?.stop();
    if (recorderRef.current) { try { recorderRef.current.stop(); } catch {} }
    if (instRecorderRef.current) { try { instRecorderRef.current.mr.stop(); } catch {} }
  }, []);

  /* ── mixdown ─────────────────────────────────────────────── */
  const handleMixdown = async () => {
    if (!selected || selected.tracks.length === 0) return;
    setMixdownState('rendering');
    try {
      const rendered = await mixdown(engineTracks(), selected?.master_volume ?? 1);
      if (!rendered) { setMixdownState(null); return; }
      const blob = encodeWav(rendered);
      const dataUrl = await blobToDataUrl(blob);
      setMixdownState({ blob, dataUrl });
    } catch { setError('Mixdown failed.'); setMixdownState(null); }
  };
  const downloadMix = () => {
    const url = URL.createObjectURL(mixdownState.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(selected.name || 'mix').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.wav`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const saveMixToSong = async (songId) => {
    try {
      await songService.addRecording(songId, {
        label: `${selected.name} (mixdown)`,
        audio_data: mixdownState.dataUrl,
        duration: projectDuration(engineTracks()),
      });
      setMixdownState(null);
      setError(null);
      alert('Mixdown saved to song.');
    } catch { setError('Failed to save to song.'); }
  };

  /* ── timeline geometry ───────────────────────────────────── */
  const totalDur = useMemo(() => {
    const d = projectDuration(engineTracks());
    return Math.max(d, 20);   // minimum 20s of canvas
  }, [engineTracks]);
  const timelineW = totalDur * pxPerSec;

  /* tempo grid */
  const grid = useMemo(
    () => gridMetrics(selected?.tempo, selected?.time_signature),
    [selected?.tempo, selected?.time_signature]
  );
  const snapSec = snap === 'bar' ? grid.barSec : snap === 'beat' ? grid.beatSec : 0;
  const applySnap = useCallback((t) => snapToGrid(t, snapSec), [snapSec]);

  /* vertical beat / bar gridlines drawn behind the lanes */
  const gridLines = useMemo(() => {
    if (!selected || !grid.beatSec) return [];
    const beatPx = grid.beatSec * pxPerSec;
    const lines = [];
    if (beatPx >= 7) {
      const n = Math.min(4000, Math.ceil(totalDur / grid.beatSec) + 1);
      for (let i = 0; i < n; i++)
        lines.push({ x: i * grid.beatSec, bar: i % grid.beatsPerBar === 0 });
    } else {
      const n = Math.min(2000, Math.ceil(totalDur / grid.barSec) + 1);
      for (let i = 0; i < n; i++) lines.push({ x: i * grid.barSec, bar: true });
    }
    return lines;
  }, [selected, grid, totalDur, pxPerSec]);

  /* ruler ticks — bar numbers or seconds depending on mode */
  const rulerTicks = useMemo(() => {
    if (rulerMode === 'bars') {
      if (!grid.barSec) return [];
      const barPx = grid.barSec * pxPerSec;
      const every = barPx >= 44 ? 1 : barPx >= 22 ? 2 : barPx >= 11 ? 4 : 8;
      const bars = Math.min(2000, Math.ceil(totalDur / grid.barSec) + 1);
      const ticks = [];
      for (let b = 0; b < bars; b++)
        if (b % every === 0) ticks.push({ t: b * grid.barSec, label: String(b + 1) });
      return ticks;
    }
    const step = pxPerSec >= 120 ? 1 : pxPerSec >= 50 ? 2 : 5;
    const ticks = [];
    for (let t = 0; t <= totalDur; t += step) ticks.push({ t, label: fmt(t) });
    return ticks;
  }, [rulerMode, grid, totalDur, pxPerSec]);

  const seekFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    const t = applySnap(Math.max(0, x / pxPerSec));
    if (playing) { stopPlayback(); }
    setPlayhead(Math.max(0, t));
  };

  /* ── clip drag (offset) + trim handles ───────────────────────
     Move drags are FREE — no bar / beat snapping — so the user
     can place a clip wherever it sounds right. The snap toggle
     still works for the Quantize action; only live drags ignore it.

     Move drags also support VERTICAL movement: while dragging,
     we hit-test the lane under the cursor and on mouseup move
     the clip to that track (remove from origin, add to destination).
     ─────────────────────────────────────────────────────────── */
  const beginClipDrag = (e, trackId, clip, mode) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      trackId,
      origTrackId:  trackId,
      hoverTrackId: trackId,
      clipId:       clip.id,
      mode,
      startX:       e.clientX,
      base:         { offset: clip.clip_offset, trimStart: clip.trim_start, trimEnd: clip.trim_end },
      sourceClip:   clip,     // captured so we can re-create on the destination track
    };
    if (mode === 'move') setHoverLaneId(trackId);
    window.addEventListener('mousemove', onClipDrag);
    window.addEventListener('mouseup', endClipDrag);
  };
  const onClipDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / pxPerSec;
    const buf = buffers[`clip-${d.clipId}`]?.buffer;
    if (!buf) return;
    let patch;
    if (d.mode === 'move') {
      /* Free horizontal placement — no snap. */
      patch = { clip_offset: Math.max(0, d.base.offset + dx) };

      /* Hit-test for the lane under the cursor. */
      const el   = document.elementFromPoint(e.clientX, e.clientY);
      const lane = el?.closest?.('.mt-lane');
      const newTid = lane?.dataset?.trackId;
      if (newTid && newTid !== d.hoverTrackId) {
        d.hoverTrackId = newTid;
        setHoverLaneId(newTid);
      }
    } else if (d.mode === 'trim-start') {
      const max = buf.duration - d.base.trimEnd - 0.05;
      const ts = Math.min(Math.max(0, d.base.trimStart + dx), max);
      // keep the clip's left visual edge anchored to audio: also shift offset
      patch = {
        trim_start: ts,
        clip_offset: Math.max(0, d.base.offset + (ts - d.base.trimStart)),
      };
    } else if (d.mode === 'trim-end') {
      const max = buf.duration - d.base.trimStart - 0.05;
      patch = { trim_end: Math.min(Math.max(0, d.base.trimEnd - dx), max) };
    }
    if (patch) {
      d.lastPatch = patch;            // remember for the save on mouseup (avoids stale closure)
      patchClipLocal(d.trackId, d.clipId, patch);
    }
  };
  const endClipDrag = async () => {
    const d = dragRef.current;
    window.removeEventListener('mousemove', onClipDrag);
    window.removeEventListener('mouseup', endClipDrag);
    dragRef.current = null;
    setHoverLaneId(null);
    if (!d) return;

    /* If the user dropped the clip on a different track, MOVE it:
       remove from the source track, add to the destination with
       the same audio + (possibly adjusted) offset + trim. */
    if (d.mode === 'move' && d.hoverTrackId && d.hoverTrackId !== d.origTrackId) {
      const src = d.sourceClip;
      const finalOffset = d.lastPatch?.clip_offset ?? src.clip_offset;
      try {
        await projOps.addClip(d.hoverTrackId, {
          name:         src.name || '',
          audio_url:    src.audio_url || '',
          storage_path: src.storage_path || '',
          clip_offset:  finalOffset,
          trim_start:   src.trim_start || 0,
          trim_end:     src.trim_end   || 0,
        });
        await projOps.removeClip(d.origTrackId, d.clipId);
        if (selected.kind === 'shared') await loadSharedProject(selected.id);
        else                            await loadProject(selected.id);
      } catch (err) {
        setError('Failed to move clip across tracks.');
      }
      return;
    }

    /* Same-track edit (move / trim) — just save whatever local
       patch the last mousemove produced. */
    if (d.lastPatch) saveClip(d.trackId, d.clipId, d.lastPatch);
  };

  /* ── keyboard shortcuts ──────────────────────────────────── */
  // keyHandlerRef holds a fresh closure every render; a stable wrapper is bound once.
  keyHandlerRef.current = (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (!selected) return;
    if (e.metaKey || e.ctrlKey) return;   // leave OS / browser shortcuts alone
    if (showConsole && (consoleView === 'piano' || consoleView === 'drum')) return;  // the synth pads own the keys
    switch (e.key) {
      case ' ':     e.preventDefault(); handlePlayStop(); break;
      case 'r': case 'R': e.preventDefault(); handleRecord(); break;
      case 's': case 'S': e.preventDefault(); splitAtPlayhead(); break;
      case 'Home':  e.preventDefault(); stopPlayback(); setPlayhead(0); break;
      default: break;
    }
  };
  useEffect(() => {
    const handler = (e) => keyHandlerRef.current?.(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <WorshipShell title="Studio" icon="🎚" subtitle="Multitrack recording studio — record, mix, and produce worship tracks.">
    <div className="mt-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <div className="app-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag multitrack">Multitrack</span>
        </div>
        <div className="app-tb-actions">
          <span className="mt-tb-hint">Record layers · overdub · edit · mix down</span>
          <button
            className="pm-tb-avatar"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />

      <div className="mt-body">
        {/* ── Project sidebar ── */}
        <aside className="mt-sidebar">
          <div className="app-panel-header">
            <span className="app-panel-title">Projects</span>
          </div>
          {error && (
            <div className="mt-error">{error}<button onClick={() => setError(null)}>✕</button></div>
          )}
          <div className="mt-project-list">
            {loading ? (
              <div className="mt-muted">Loading…</div>
            ) : (() => {
              /* Filter out archived items from the active list.
                 They render in the collapsible Archive section
                 below. */
              const activeProjects = projects.filter(p => !archivedSet.has(p.id));
              if (activeProjects.length === 0) {
                return <div className="mt-muted">No projects yet.</div>;
              }
              return activeProjects.map(p => {
                const isArmed = armedDelete === `project-${p.id}`;
                /* Outer tile is a div with role="button" rather than a
                   <button>, because HTML doesn't allow buttons inside
                   buttons and we need the action buttons to be their
                   own buttons. Keyboard support manually preserved. */
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className={`mt-project ${selected?.id === p.id ? 'sel' : ''}`}
                    onClick={() => loadProject(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        loadProject(p.id);
                      }
                    }}
                  >
                    <div className="mt-project-name">🎚 {p.name}</div>
                    <div className="mt-project-meta">{p.tracks?.length || 0} track{(p.tracks?.length || 0) === 1 ? '' : 's'}</div>
                    <button
                      type="button"
                      className="mt-project-share"
                      title={`Share "${p.name}" to a chat`}
                      onClick={e => { e.stopPropagation(); setSharingProject(p); }}
                    >
                      📤
                    </button>
                    <button
                      type="button"
                      className="mt-project-archive"
                      title={`Archive "${p.name}"`}
                      onClick={e => { e.stopPropagation(); archiveProject(p.id); }}
                    >
                      📦
                    </button>
                    <button
                      type="button"
                      className={`mt-project-del ${isArmed ? 'armed' : ''}`}
                      title={isArmed ? 'Click again to confirm delete' : 'Delete project'}
                      onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                    >
                      {isArmed ? 'Delete?' : '✕'}
                    </button>
                  </div>
                );
              });
            })()}

            {showNewProject ? (
              <div className="mt-new-project">
                <input
                  className="mt-inp"
                  placeholder="Project name…"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createProject()}
                  autoFocus
                />
                <div className="mt-new-project-btns">
                  <button className="app-btn ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
                  <button className="app-btn primary" onClick={createProject} disabled={!newProjectName.trim()}>Create</button>
                </div>
              </div>
            ) : (
              <button className="mt-project mt-project-add" onClick={() => setShowNewProject(true)}>
                <div className="mt-project-name">+ New project</div>
              </button>
            )}
          </div>

          {/* ── Collaborate section ────────────────────────────────
              A dedicated panel for collaborative shared projects.
              Visually mirrors the "Projects" panel above so it reads
              as a peer category, not a footnote. Empty state shows a
              short helper line so users know what this section is. */}
          <div className="app-panel-header mt-collab-header">
            <span className="app-panel-title">
              <span aria-hidden="true">🤝</span> Collaborate
            </span>
          </div>
          <div className="mt-project-list mt-collab-list">
            {(() => {
              const activeShared = sharedProjects.filter(p => !archivedSet.has(p.id));
              if (activeShared.length === 0) {
                return (
                  <div className="mt-muted mt-collab-empty">
                    No collaborations yet. Share a project from chat
                    with <b>Collaborate live</b> to start one — or accept
                    an invitation by double-clicking the collaboration
                    card in a chat.
                  </div>
                );
              }
              return activeShared.map(p => (
                <div
                  key={`shared-${p.id}`}
                  role="button"
                  tabIndex={0}
                  className={`mt-project mt-project-shared ${selected?.id === p.id ? 'sel' : ''}`}
                  onClick={() => loadSharedProject(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      loadSharedProject(p.id);
                    }
                  }}
                >
                  <div className="mt-project-name">🤝 {p.name}</div>
                  <div className="mt-project-meta">
                    {p.tracks?.length || 0} track{(p.tracks?.length || 0) === 1 ? '' : 's'}
                    {' · '}
                    {(p.editorUids?.length || 0)} editor{(p.editorUids?.length || 0) === 1 ? '' : 's'}
                  </div>
                  <button
                    type="button"
                    className="mt-project-archive"
                    title={`Archive "${p.name}" (only on your side)`}
                    onClick={e => { e.stopPropagation(); archiveProject(p.id); }}
                  >📦</button>
                  {/* Owner: ✕ deletes the project for everyone.
                      Non-owner: 🚪 leaves the collaboration. */}
                  {p.ownerUid === user?.uid ? (
                    <button
                      type="button"
                      className="mt-project-del"
                      title="Delete shared project for everyone"
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(`Delete shared project "${p.name}" for everyone collaborating on it?`)) {
                          sharedStudioProjectService.deleteProject(p.id).catch(() => {});
                        }
                      }}
                    >✕</button>
                  ) : (
                    <button
                      type="button"
                      className="mt-project-leave"
                      title={`Leave "${p.name}" — you'll lose access`}
                      onClick={e => { e.stopPropagation(); leaveSharedProject(p); }}
                    >🚪</button>
                  )}
                </div>
              ));
            })()}
          </div>

          {/* ── Archive section — collapsible, contains both archived
                personal and archived shared projects. ──────────────── */}
          {(() => {
            const archivedPersonal = projects.filter(p => archivedSet.has(p.id));
            const archivedShared   = sharedProjects.filter(p => archivedSet.has(p.id));
            const totalArchived    = archivedPersonal.length + archivedShared.length;
            if (totalArchived === 0) return null;
            return (
              <>
                <button
                  type="button"
                  className={`mt-archive-toggle${archiveOpen ? ' open' : ''}`}
                  onClick={() => setArchiveOpen(o => !o)}
                  aria-expanded={archiveOpen}
                >
                  <span className="mt-archive-chevron" aria-hidden="true">{archiveOpen ? '▾' : '▸'}</span>
                  <span className="mt-archive-label">📦 Archive</span>
                  <span className="mt-archive-count">{totalArchived}</span>
                </button>
                {archiveOpen && (
                  <div className="mt-project-list mt-archive-list">
                    {archivedPersonal.map(p => (
                      <div
                        key={`arch-${p.id}`}
                        role="button"
                        tabIndex={0}
                        className={`mt-project mt-project-archived ${selected?.id === p.id ? 'sel' : ''}`}
                        onClick={() => loadProject(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            loadProject(p.id);
                          }
                        }}
                      >
                        <div className="mt-project-name">🎚 {p.name}</div>
                        <div className="mt-project-meta">
                          {p.tracks?.length || 0} track{(p.tracks?.length || 0) === 1 ? '' : 's'}
                          <span className="mt-archive-tag"> · archived</span>
                        </div>
                        <button
                          type="button"
                          className="mt-project-archive on"
                          title={`Unarchive "${p.name}"`}
                          onClick={e => { e.stopPropagation(); unarchiveProject(p.id); }}
                        >↩</button>
                      </div>
                    ))}
                    {archivedShared.map(p => (
                      <div
                        key={`arch-shared-${p.id}`}
                        role="button"
                        tabIndex={0}
                        className={`mt-project mt-project-shared mt-project-archived ${selected?.id === p.id ? 'sel' : ''}`}
                        onClick={() => loadSharedProject(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            loadSharedProject(p.id);
                          }
                        }}
                      >
                        <div className="mt-project-name">🤝 {p.name}</div>
                        <div className="mt-project-meta">
                          {p.tracks?.length || 0} track{(p.tracks?.length || 0) === 1 ? '' : 's'}
                          <span className="mt-archive-tag"> · archived</span>
                        </div>
                        <button
                          type="button"
                          className="mt-project-archive on"
                          title={`Unarchive "${p.name}"`}
                          onClick={e => { e.stopPropagation(); unarchiveProject(p.id); }}
                        >↩</button>
                        {/* Even from the archive, non-owners can
                            permanently leave the collaboration. */}
                        {p.ownerUid !== user?.uid && (
                          <button
                            type="button"
                            className="mt-project-leave"
                            title={`Leave "${p.name}" — you'll lose access`}
                            onClick={e => { e.stopPropagation(); leaveSharedProject(p); }}
                          >🚪</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </aside>

        {/* ── Main workspace ── */}
        <main className="mt-main">
          {!selected ? (
            <div className="app-empty mt-empty">
              <div className="app-empty-icon">🎚</div>
              <div className="app-empty-title">Multitrack recording studio</div>
              <div className="app-empty-sub">
                Record layer after layer — each new take plays the previous tracks back so you
                can build a full arrangement. Trim, nudge, mix, and export.
              </div>
              {showIntro && (
                <div className="mt-start-steps">
                  <div className="mt-start-title">First time? Try this:</div>
                  <ol className="mt-start-list">
                    <li><b>Create a project</b> in the sidebar.</li>
                    <li><b>Hit Record</b> — sing or play your first layer (count-in optional).</li>
                    <li><b>Record again</b> — track 1 plays back while you add track 2.</li>
                    <li><b>Trim &amp; nudge</b> the clips to line up, then <b>Mix Down</b> to a WAV.</li>
                  </ol>
                </div>
              )}
              <button className="app-btn primary" onClick={() => setShowNewProject(true)}>
                ✦ Create New Project
              </button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="mt-toolbar">
                <input
                  className="mt-project-title"
                  value={selected.name}
                  onChange={e => {
                    setSelected(s => ({ ...s, name: e.target.value }));
                  }}
                  onBlur={e => projOps.updateMeta({ name: e.target.value }).then(() => {
                    /* personal projects need the list refreshed
                       so the new name shows; shared projects sync
                       through the subscription automatically. */
                    if (selected?.kind !== 'shared') fetchProjects();
                  })}
                />
                <label className="mt-tempo">
                  <input
                    type="number" min="40" max="240"
                    value={selected.tempo}
                    onChange={e => {
                      const tempo = parseInt(e.target.value, 10) || 100;
                      setSelected(s => ({ ...s, tempo }));
                    }}
                    onBlur={e => projOps.updateMeta({ tempo: parseInt(e.target.value, 10) || 100 }).catch(() => {})}
                  />
                  <span>BPM</span>
                </label>
                <label className="mt-tempo mt-timesig">
                  <select
                    value={selected.time_signature || '4/4'}
                    onChange={e => {
                      const ts = e.target.value;
                      setSelected(s => ({ ...s, time_signature: ts }));
                      projOps.updateMeta({ time_signature: ts }).catch(() => {});
                    }}
                  >
                    {TIME_SIGS.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                  </select>
                </label>
                <div className="mt-toolbar-spacer" />
                <button className="app-btn ghost" onClick={() => fileInputRef.current?.click()}>
                  ⬆ Add track from file
                </button>
                <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleAddFile} />
                <input ref={clipFileInputRef} type="file" accept="audio/*" hidden onChange={handleAddClipFile} />
                <button
                  className={`app-btn ${showMixer ? 'primary' : 'ghost'}`}
                  onClick={() => setShowMixer(v => !v)}
                  title="Toggle mixing console"
                >🎛 Mixer</button>
                {/* 🖥 Console button removed — the floating console
                    has been retired. All its controls now live in
                    the Mixer drawer below. */}
                <button
                  className="app-btn primary"
                  onClick={handleMixdown}
                  disabled={selected.tracks.length === 0 || mixdownState === 'rendering'}
                >
                  {mixdownState === 'rendering' ? 'Rendering…' : '⬇ Mix Down'}
                </button>
                <div className="mt-grid-ctrl">
                  <button
                    className="mt-grid-toggle"
                    onClick={() => setRulerMode(m => (m === 'bars' ? 'time' : 'bars'))}
                    title="Ruler: bars or time"
                  >{rulerMode === 'bars' ? '𝄞 Bars' : '⏱ Time'}</button>
                  <label className="mt-snap">
                    <span>Snap</span>
                    <select value={snap} onChange={e => setSnap(e.target.value)}>
                      <option value="off">Off</option>
                      <option value="beat">Beat</option>
                      <option value="bar">Bar</option>
                    </select>
                  </label>
                </div>
                <div className="mt-zoom">
                  <button className="mt-zoom-btn" onClick={() => setPxPerSec(p => Math.max(20, p - 20))}>−</button>
                  <span className="mt-zoom-lbl">zoom</span>
                  <button className="mt-zoom-btn" onClick={() => setPxPerSec(p => Math.min(240, p + 20))}>+</button>
                </div>
              </div>

              {/* Transport */}
              <div className="mt-transport">
                <button className="mt-tp-btn" onClick={() => { stopPlayback(); setPlayhead(0); }} title="Return to start (Home)">⏮</button>
                <button
                  className={`mt-tp-btn ${playing ? 'on' : ''}`}
                  onClick={handlePlayStop}
                  disabled={recording !== null}
                  title="Play / Stop (Space)"
                >{playing ? '⏹' : '▶'}</button>
                <button
                  className={`mt-tp-btn mt-tp-rec ${recording ? 'on' : ''}`}
                  onClick={handleRecord}
                  title="Record · overdub (R)"
                >
                  {recording === 'arming' ? '…' : recording === 'recording' ? '⏹' : '⏺'}
                </button>
                <button
                  className={`mt-tp-btn mt-tp-gear ${recSettingsOpen ? 'on' : ''}`}
                  onClick={() => setRecSettingsOpen(v => !v)}
                  title="Recording settings"
                >⚙</button>
                <button
                  className="mt-tp-btn mt-tp-split"
                  onClick={splitAtPlayhead}
                  disabled={playing || recording !== null}
                  title="Split clips at the playhead (S)"
                >✂</button>
                <div className="mt-tp-time">{fmtPrecise(playhead)}</div>
                <div className="mt-tp-bars" title="Bar . beat">{fmtBarsBeats(playhead, grid)}</div>
                <label className="mt-countin">
                  <input type="checkbox" checked={countIn} onChange={e => setCountIn(e.target.checked)} />
                  Count-in
                </label>
                {/* Input meter + recording status used to live here.
                    Removed in favor of the bigger live-take waveform
                    strip below the transport — that one's clearer and
                    less cluttered. */}
                <div className="mt-tp-master-meter">
                  <span className="mt-tp-master-lbl">MASTER</span>
                  <Meter level={levels.master || 0} horizontal />
                </div>

                {recSettingsOpen && (
                  <div className="mt-rec-settings">
                    <div className="mt-rec-settings-title">Recording settings</div>

                    <label className="mt-rec-opt">
                      <input
                        type="checkbox"
                        checked={monitorInput}
                        onChange={toggleMonitor}
                      />
                      <span>
                        Input monitoring
                        <small>Hear yourself through the app — use headphones to avoid feedback.</small>
                      </span>
                    </label>

                    <div className="mt-rec-opt-block">
                      <div className="mt-rec-opt-row">
                        <span>Recording latency</span>
                        <span className="mt-rec-latency-input">
                          <input
                            type="number" min="0" max="500" step="1"
                            value={selected.record_latency_ms ?? 0}
                            onChange={e => updateRecLatency(parseInt(e.target.value, 10))}
                          />
                          <em>ms</em>
                        </span>
                      </div>
                      <small className="mt-rec-hint">
                        New takes are nudged earlier by this much so they line up with the
                        tracks you're hearing.
                      </small>
                      <button
                        className="app-btn ghost mt-calib-btn"
                        onClick={runCalibration}
                        disabled={calibStatus === 'running' || recording !== null}
                      >
                        {calibStatus === 'running' ? 'Calibrating… (listen for clicks)' : '🎯 Auto-calibrate'}
                      </button>
                      {calibStatus && calibStatus !== 'running' && calibStatus.ms !== undefined && (
                        <small className="mt-calib-ok">✓ Measured {calibStatus.ms} ms round-trip.</small>
                      )}
                      {calibStatus && calibStatus.error && (
                        <small className="mt-calib-err">{calibStatus.error}</small>
                      )}
                      <small className="mt-rec-hint">
                        Calibration plays clicks through your speakers and listens with the
                        mic — use built-in speakers + mic, not headphones, for this step.
                      </small>
                    </div>

                    <button className="mt-rec-settings-close" onClick={() => setRecSettingsOpen(false)}>
                      Done
                    </button>
                  </div>
                )}
              </div>

              {/* Live take — the same chunky-peaks waveform style
                  that the finished clip uses, built up in real time
                  as the user records. Appears just above the
                  workspace so it sits right where the new track is
                  about to land. */}
              {recording && (
                <LiveBuildWaveform recorderRef={recorderRef} active={!!recording} />
              )}

              {/* Workspace: fixed heads column + scrollable timeline */}
              <div className="mt-workspace">
                <div className="mt-track-heads">
                  {/* TRACKS header — replaces the old spacer. Has a
                      ＋ button to add an empty track before recording,
                      so the user can pick which lane the next take
                      lands in. */}
                  <div className="mt-heads-header" style={{ height: RULER_H }}>
                    <span className="mt-heads-label">TRACKS</span>
                    <button
                      type="button"
                      className="mt-heads-add"
                      onClick={addEmptyTrack}
                      title="Add an empty track (recording will land here)"
                    >＋</button>
                  </div>
                  {selected.tracks.map((t, i) => (
                    <div
                      className={`mt-track-head${recordTargetTrackId === t.id ? ' rec-target' : ''}`}
                      key={t.id}
                      style={{ height: TRACK_H }}
                      onClick={(e) => {
                        /* Don't hijack clicks on the inner controls
                           (name input, M/S/vol/pan, delete, +clip, etc.) */
                        if (e.target.closest('button, input, label, select, textarea')) return;
                        setRecordTargetTrackId(prev => prev === t.id ? null : t.id);
                      }}
                      title={
                        recordTargetTrackId === t.id
                          ? 'Recording target — click background to deselect'
                          : 'Click to record onto this track'
                      }
                    >
                      {recordTargetTrackId === t.id && (
                        <span className="mt-track-rec-flag" aria-hidden="true">⏺ REC</span>
                      )}
                      <input
                        className="mt-track-name"
                        value={t.name}
                        onChange={e => updateTrack(t.id, { name: e.target.value })}
                      />
                      <div className="mt-track-controls">
                        <button
                          className={`mt-ms ${t.is_muted ? 'on-m' : ''}`}
                          onClick={() => updateTrack(t.id, { is_muted: t.is_muted ? 0 : 1 })}
                          title="Mute"
                        >M</button>
                        <button
                          className={`mt-ms ${t.is_solo ? 'on-s' : ''}`}
                          onClick={() => updateTrack(t.id, { is_solo: t.is_solo ? 0 : 1 })}
                          title="Solo"
                        >S</button>
                        <input
                          className="mt-vol"
                          type="range" min="0" max="1.5" step="0.02"
                          value={t.volume}
                          onChange={e => updateTrack(t.id, { volume: parseFloat(e.target.value) })}
                          title="Volume"
                        />
                        <input
                          className="mt-pan"
                          type="range" min="-1" max="1" step="0.05"
                          value={t.pan}
                          onChange={e => updateTrack(t.id, { pan: parseFloat(e.target.value) })}
                          title="Pan"
                        />
                        <button
                          className={`mt-track-del ${armedDelete === `track-${t.id}` ? 'armed' : ''}`}
                          onClick={() => removeTrack(t.id)}
                          title={armedDelete === `track-${t.id}` ? 'Click again to delete this track' : 'Delete track'}
                        >{armedDelete === `track-${t.id}` ? 'Delete?' : '🗑'}</button>
                      </div>
                      <div className="mt-track-cliprow">
                        <button
                          className="mt-add-clip"
                          onClick={() => triggerAddClip(t.id)}
                          title="Add a clip to this track at the playhead"
                        >＋ clip</button>
                        <span className="mt-clipcount">
                          {(t.clips || []).length} clip{(t.clips || []).length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <Meter level={levels[t.id] || 0} />
                    </div>
                  ))}
                  {selected.tracks.length === 0 && (
                    <div className="mt-no-tracks">
                      No tracks yet — hit <b>＋</b> above to add an empty
                      track, then ⏺ Record into it. Or just ⏺ Record /
                      import a file to create a new track on the fly.
                    </div>
                  )}
                </div>

                <div className="mt-timeline-scroll" ref={scrollRef}>
                  <div className="mt-timeline" style={{ width: timelineW }}>
                    {/* Ruler */}
                    <div className="mt-ruler" style={{ height: RULER_H }} onClick={seekFromEvent}>
                      {rulerTicks.map(tick => (
                        <div key={tick.t} className="mt-tick" style={{ left: tick.t * pxPerSec }}>
                          <span className="mt-tick-lbl">{tick.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tempo grid (behind the lanes) */}
                    {selected.tracks.length > 0 && (
                      <div
                        className="mt-grid"
                        style={{ top: RULER_H, height: selected.tracks.length * TRACK_H }}
                      >
                        {gridLines.map((g, i) => (
                          <div
                            key={i}
                            className={`mt-gridline ${g.bar ? 'bar' : 'beat'}`}
                            style={{ left: g.x * pxPerSec }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Lanes — each track holds any number of clips.
                        data-track-id powers cross-track clip drag:
                        beginClipDrag → onClipDrag hit-tests the lane
                        under the cursor via .closest('.mt-lane'). */}
                    {selected.tracks.map((t, i) => {
                      const color = TRACK_COLORS[i % TRACK_COLORS.length];
                      const isDropTarget = hoverLaneId === t.id;
                      return (
                        <div
                          className={`mt-lane${isDropTarget ? ' drop-target' : ''}`}
                          key={t.id}
                          data-track-id={t.id}
                          style={{ height: TRACK_H }}
                          onClick={seekFromEvent}
                        >
                          {(t.clips || []).map(c => {
                            const buf = buffers[`clip-${c.id}`]?.buffer;
                            const peaks = buffers[`clip-${c.id}`]?.peaks;
                            if (!buf) return null;
                            const dur = clipDuration({ buffer: buf, trimStart: c.trim_start, trimEnd: c.trim_end });
                            const w = Math.max(8, dur * pxPerSec);
                            return (
                              <div
                                className="mt-clip"
                                key={c.id}
                                style={{
                                  left: c.clip_offset * pxPerSec,
                                  width: w,
                                  borderColor: color,
                                  background: `${color}1e`,
                                }}
                                onMouseDown={e => beginClipDrag(e, t.id, c, 'move')}
                              >
                                <ClipWaveform
                                  peaks={peaks}
                                  fullDur={buf.duration}
                                  trimStart={c.trim_start}
                                  trimEnd={c.trim_end}
                                  width={w}
                                  height={TRACK_H - 8}
                                  color={color}
                                />
                                <div
                                  className="mt-trim mt-trim-l"
                                  onMouseDown={e => beginClipDrag(e, t.id, c, 'trim-start')}
                                  title="Trim start"
                                />
                                <div
                                  className="mt-trim mt-trim-r"
                                  onMouseDown={e => beginClipDrag(e, t.id, c, 'trim-end')}
                                  title="Trim end"
                                />
                                <span className="mt-clip-name">{c.name || t.name}</span>
                                <button
                                  className={`mt-clip-del ${armedDelete === `clip-${c.id}` ? 'armed' : ''}`}
                                  onMouseDown={e => e.stopPropagation()}
                                  onClick={e => { e.stopPropagation(); removeClip(t.id, c.id); }}
                                  title={armedDelete === `clip-${c.id}` ? 'Click again to delete this clip' : 'Delete clip'}
                                >{armedDelete === `clip-${c.id}` ? '✕?' : '×'}</button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Playhead */}
                    <div
                      className="mt-playhead"
                      style={{
                        left: playhead * pxPerSec,
                        height: RULER_H + selected.tracks.length * TRACK_H,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mixing console drawer — now also houses the stream
                  deck shortcuts plus Count-in / Input-monitor /
                  Open Autotune. Replaces the retired floating
                  Studio Console. */}
              {showMixer && (
                <div className="mt-mixer">
                  {showAutotune ? (
                    <AutotuneWorkbench
                      tracks={selected.tracks}
                      onBack={() => setShowAutotune(false)}
                      onAnalyzeTrack={analyzeTrack}
                      onApplyAutotune={applyAutotuneToTrack}
                    />
                  ) : (
                    <>
                      <MixerControls
                        playing={playing}
                        recording={recording}
                        masterVolume={selected.master_volume ?? 1}
                        onMasterVolume={updateMasterVolume}
                        onPlayStop={handlePlayStop}
                        onRecord={handleRecord}
                        onSplit={splitAtPlayhead}
                        onReturnStart={() => { stopPlayback(); setPlayhead(0); }}
                        loopOn={loopOn}
                        onToggleLoop={() => setLoopOn(v => !v)}
                        automationOn={automationOn}
                        onToggleAutomation={() => setAutomationOn(v => !v)}
                        soloCount={soloCount}
                        onClearSolos={clearSolos}
                        onQuantize={quantizeClips}
                        countIn={countIn}
                        onCountIn={setCountIn}
                        monitorInput={monitorInput}
                        onToggleMonitor={toggleMonitor}
                        onOpenAutotune={() => setShowAutotune(true)}
                      />
                      <div className="mt-mixer-strips">
                        {selected.tracks.length === 0 ? (
                          <div className="mt-mixer-empty">Record or import a track to see its channel strip.</div>
                        ) : selected.tracks.map((t, i) => (
                          <ChannelStrip
                            key={t.id}
                            track={t}
                            color={TRACK_COLORS[i % TRACK_COLORS.length]}
                            level={levels[t.id] || 0}
                            onFx={(patch) => updateTrackFx(t.id, patch)}
                          />
                        ))}
                        <MasterStrip
                          volume={selected.master_volume ?? 1}
                          level={levels.master || 0}
                          onVolume={updateMasterVolume}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mixdown modal */}
      {mixdownState && mixdownState !== 'rendering' && (
        <>
          <div className="mt-modal-backdrop" onClick={() => setMixdownState(null)} />
          <div className="mt-modal">
            <div className="mt-modal-title">✓ Mixdown ready</div>
            <div className="mt-modal-sub">
              All tracks rendered to a single stereo WAV ({fmt(projectDuration(engineTracks()))}).
            </div>
            <audio controls src={mixdownState.dataUrl} className="mt-modal-audio" />
            <button className="app-btn primary mt-modal-btn" onClick={downloadMix}>
              ⬇ Download WAV
            </button>
            <div className="mt-modal-songs-lbl">…or save it onto a song:</div>
            {songs.length === 0 ? (
              <div className="mt-muted">No songs yet.</div>
            ) : (
              <div className="mt-modal-songs">
                {songs.map(s => (
                  <button key={s.id} className="mt-modal-song" onClick={() => saveMixToSong(s.id)}>
                    🎵 {s.title}
                  </button>
                ))}
              </div>
            )}
            <button className="mt-modal-close" onClick={() => setMixdownState(null)}>Close</button>
          </div>
        </>
      )}

      {/* The floating <StudioConsole /> used to render here.
          It has been retired in favor of inline Mixer controls. */}

      {/* Share-to-chat dialog (opened by the 📤 button on each
          project tile in the left rail). Picks a chat channel and
          posts a "shared project" message to it. */}
      {sharingProject && (
        <ShareProjectToChatDialog
          project={sharingProject}
          onClose={() => setSharingProject(null)}
          onToast={setShareToast}
        />
      )}
      {shareToast && (
        <div className="mt-share-toast" role="status">{shareToast}</div>
      )}
    </div>
    </WorshipShell>
  );
}

/* ─────────────────────────────────────────────────────────────
   Waveform canvas — draws the trimmed slice of a clip's peaks
   ───────────────────────────────────────────────────────────── */
function ClipWaveform({ peaks, fullDur, trimStart, trimEnd, width, height, color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !fullDur) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, width) * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // map the trimmed window into peak-index space
    const startFrac = (trimStart || 0) / fullDur;
    const endFrac   = (fullDur - (trimEnd || 0)) / fullDur;
    const startIdx  = Math.floor(startFrac * peaks.length);
    const endIdx    = Math.max(startIdx + 1, Math.floor(endFrac * peaks.length));
    const span      = endIdx - startIdx;
    const mid       = height / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    const cols = Math.max(1, Math.floor(width));
    for (let x = 0; x < cols; x++) {
      const idx = startIdx + Math.floor((x / cols) * span);
      const peak = peaks[idx] || 0;
      const h = Math.max(1, peak * (height - 4));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [peaks, fullDur, trimStart, trimEnd, width, height, color]);

  return <canvas ref={canvasRef} className="mt-waveform" style={{ width, height }} />;
}

/* ─────────────────────────────────────────────────────────────
   Channel strip — EQ + compressor + reverb send for one track
   ───────────────────────────────────────────────────────────── */
function FxSlider({ label, min, max, step, value, suffix, onChange }) {
  return (
    <label className="mt-fx-slider">
      <span className="mt-fx-slider-lbl">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <span className="mt-fx-slider-val">
        {typeof value === 'number' ? value.toFixed(suffix === 'dB' ? 1 : suffix === ':1' ? 1 : 0) : value}{suffix || ''}
      </span>
    </label>
  );
}

function ChannelStrip({ track, color, level = 0, onFx }) {
  const fx = { ...DEFAULT_FX, ...(track.effects || {}) };
  const isBypassed = fx.eqLow === 0 && fx.eqMid === 0 && fx.eqHigh === 0
    && fx.compThreshold === 0 && fx.reverbSend === 0;
  return (
    <div className="mt-strip" style={{ borderTopColor: color }}>
      <div className="mt-strip-name" style={{ color }}>{track.name}</div>
      <div className="mt-strip-meter"><Meter level={level} /></div>

      <div className="mt-strip-section">
        <div className="mt-strip-section-lbl">EQ</div>
        <FxSlider label="Hi"  min={-12} max={12} step={0.5} suffix="dB"
          value={fx.eqHigh} onChange={v => onFx({ eqHigh: v })} />
        <FxSlider label="Mid" min={-12} max={12} step={0.5} suffix="dB"
          value={fx.eqMid}  onChange={v => onFx({ eqMid: v })} />
        <FxSlider label="Lo"  min={-12} max={12} step={0.5} suffix="dB"
          value={fx.eqLow}  onChange={v => onFx({ eqLow: v })} />
      </div>

      <div className="mt-strip-section">
        <div className="mt-strip-section-lbl">Compressor</div>
        <FxSlider label="Thr" min={-60} max={0} step={1} suffix="dB"
          value={fx.compThreshold} onChange={v => onFx({ compThreshold: v })} />
        <FxSlider label="Rat" min={1} max={12} step={0.5} suffix=":1"
          value={fx.compRatio} onChange={v => onFx({ compRatio: v })} />
      </div>

      <div className="mt-strip-section">
        <div className="mt-strip-section-lbl">Reverb Send</div>
        <FxSlider label="Send" min={0} max={1} step={0.02} suffix="%"
          value={fx.reverbSend * 100} onChange={v => onFx({ reverbSend: v / 100 })} />
      </div>

      <div className={`mt-strip-status ${isBypassed ? '' : 'active'}`}>
        {isBypassed ? 'flat' : '● processing'}
      </div>
    </div>
  );
}

function MasterStrip({ volume, level = 0, onVolume }) {
  return (
    <div className="mt-strip mt-strip-master">
      <div className="mt-strip-name">MASTER</div>
      <div className="mt-strip-meter"><Meter level={level} /></div>
      <div className="mt-strip-section mt-master-fader">
        <FxSlider label="Vol" min={0} max={1.5} step={0.02} suffix="%"
          value={volume * 100} onChange={v => onVolume(v / 100)} />
      </div>
      <div className="mt-master-limiter">🛡 Limiter on<br/><span>protects against clipping</span></div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   WaveformMeter — live oscilloscope of the recorder's input.
   Reads the analyser node off the active mic recorder each tick
   and draws the time-domain waveform. Auto-starts when `active`
   flips true and stops when it flips false.

   Takes `recorderRef` (a React ref pointing at the live recorder
   object from startMicRecording) so the loop keeps reading the
   current recorder even as the ref's .current changes.
   ───────────────────────────────────────────────────────────── */
function WaveformMeter({ recorderRef, active, width = 240, height = 36 }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const bufRef    = useRef(null);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      /* Clear the canvas so the previous waveform doesn't linger
         on screen after recording stops. */
      const c = canvasRef.current;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const rec      = recorderRef.current;
      const analyser = rec?.getAnalyser?.();
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      /* Faint center-line so silence looks like a flat line, not
         a blank panel. Helps the user see the meter is alive. */
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (analyser) {
        if (!bufRef.current || bufRef.current.length !== analyser.fftSize) {
          bufRef.current = new Float32Array(analyser.fftSize);
        }
        const buf = bufRef.current;
        analyser.getFloatTimeDomainData(buf);

        /* Color matches the rest of the recording UI (red = live). */
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth   = 1.6;
        ctx.beginPath();
        const N = buf.length;
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * w;
          /* Samples are -1..+1; map to 0..h with the middle at h/2. */
          const v = Math.max(-1, Math.min(1, buf[i]));
          const y = h / 2 - v * (h / 2 - 1);
          if (i === 0) ctx.moveTo(x, y);
          else         ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(rafRef.current);
  }, [active, recorderRef]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="mt-wave-meter"
      aria-hidden="true"
      title="Live input waveform"
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   LiveBuildWaveform — chunky-peaks waveform that BUILDS UP as
   the user records, drawn in the same visual style as the
   finished clip's ClipWaveform. Each ~50ms we sample the peak
   amplitude off the recorder's analyser and append it to a
   running peaks buffer. The latest peak is always anchored at
   the right edge, so the take "scrolls in" from the right like
   a real DAW.

   Self-clears when `active` flips false so the next take starts
   from an empty buffer.
   ───────────────────────────────────────────────────────────── */
function LiveBuildWaveform({ recorderRef, active, height = 56, pxPerSample = 3 }) {
  const wrapRef    = useRef(null);
  const canvasRef  = useRef(null);
  const peaksRef   = useRef([]);
  const lastSampleRef = useRef(0);
  const rafRef     = useRef(null);
  const bufRef     = useRef(null);
  /* Tracked separately so a resize redraws even without new samples. */
  const sizeRef    = useRef({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      peaksRef.current = [];
      lastSampleRef.current = 0;
      const c = canvasRef.current;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      return;
    }

    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');

    /* Resize the backing store to match the wrapper's CSS size
       * devicePixelRatio so the waveform stays crisp. */
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, wrap.clientWidth);
      const h = height;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
      }
      sizeRef.current = { w, h, dpr };
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const SAMPLE_INTERVAL_MS = 50;

    const tick = () => {
      const now = performance.now();
      const rec = recorderRef.current;
      const analyser = rec?.getAnalyser?.();

      if (analyser && now - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
        if (!bufRef.current || bufRef.current.length !== analyser.fftSize) {
          bufRef.current = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(bufRef.current);
        let peak = 0;
        const samples = bufRef.current;
        for (let i = 0; i < samples.length; i++) {
          const v = samples[i] < 0 ? -samples[i] : samples[i];
          if (v > peak) peak = v;
        }
        peaksRef.current.push(peak);
        lastSampleRef.current = now;
      }

      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      /* Center line — gives the meter a "ground" so silence has shape. */
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const peaks = peaksRef.current;
      const N = peaks.length;
      if (N > 0) {
        const totalW = N * pxPerSample;
        /* Anchor the latest peak at the right edge once we overflow
           the wrapper width; otherwise draw from the left. */
        const xOffset = totalW < w ? 0 : (w - totalW);
        const mid = h / 2;
        ctx.fillStyle = '#ef4444';
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < N; i++) {
          const x = xOffset + i * pxPerSample;
          if (x + pxPerSample < 0 || x > w) continue;
          const peak = peaks[i];
          const barH = Math.max(1, peak * (h - 6));
          ctx.fillRect(x, mid - barH / 2, Math.max(1, pxPerSample - 1), barH);
        }
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active, recorderRef, height, pxPerSample]);

  return (
    <div ref={wrapRef} className="mt-live-take">
      <span className="mt-live-take-lbl">
        ● Live take
      </span>
      <canvas
        ref={canvasRef}
        className="mt-live-take-canvas"
        aria-hidden="true"
        title="Building waveform — recording in progress"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MixerControls — the strip that sits at the top of the Mixer
   drawer. Pulls together:
     • A row of stream-style hotkey buttons (the same ones the
       retired floating Console exposed via StreamDeck)
     • Count-in toggle
     • Input-monitoring toggle
     • "Open Autotune" button (shows the AutotuneWorkbench in
       place of the channel strips)

   Master Mute holds its own local state because the underlying
   master-volume slider is the only persistent piece — toggling
   mute just zeroes / restores the volume.
   ───────────────────────────────────────────────────────────── */
function MixerControls({
  playing, recording,
  masterVolume, onMasterVolume,
  onPlayStop, onRecord, onSplit, onReturnStart,
  loopOn, onToggleLoop, automationOn, onToggleAutomation,
  soloCount, onClearSolos, onQuantize,
  countIn, onCountIn, monitorInput, onToggleMonitor,
  onOpenAutotune,
}) {
  const [muted, setMuted] = useState(false);
  const [note,  setNote]  = useState(null);
  const prevVolRef = useRef(masterVolume);
  const flash = (msg) => { setNote(msg); setTimeout(() => setNote(null), 2000); };
  const toggleMute = () => {
    if (muted) { onMasterVolume(prevVolRef.current || 1); setMuted(false); }
    else       { prevVolRef.current = masterVolume; onMasterVolume(0); setMuted(true); }
  };
  const doQuantize = () => {
    const n = onQuantize();
    flash(n > 0 ? `Quantized ${n} clip${n === 1 ? '' : 's'}` : 'All clips already on the grid');
  };
  const doClearSolos = () => {
    if (soloCount > 0) { onClearSolos(); flash(`Cleared ${soloCount} solo${soloCount === 1 ? '' : 's'}`); }
    else flash('No tracks are soloed');
  };

  const keys = [
    { id: 'play',  label: playing ? 'Stop' : 'Play', icon: playing ? '⏹' : '▶', color: '#22c55e', on: playing,     run: onPlayStop },
    { id: 'rec',   label: 'Record',                  icon: '⏺',                 color: '#ef4444', on: !!recording, run: onRecord },
    { id: 'cut',   label: 'Cut / Slice',             icon: '✂',                 color: '#f59e0b',                  run: onSplit },
    { id: 'home',  label: 'To Start',                icon: '⏮',                 color: '#06b6d4',                  run: onReturnStart },
    { id: 'mute',  label: 'Master Mute',             icon: muted ? '🔇' : '🔊', color: '#a855f7', on: muted,       run: toggleMute },
    { id: 'solo',  label: soloCount > 0 ? `Clear Solo · ${soloCount}` : 'Clear Solo', icon: '🎧', color: '#eab308', on: soloCount > 0, run: doClearSolos },
    { id: 'loop',  label: 'Loop',                    icon: '🔁',                color: '#14b8a6', on: loopOn,      run: onToggleLoop },
    { id: 'quant', label: 'Quantize',                icon: '⊞',                 color: '#8b5cf6',                  run: doQuantize },
    { id: 'auto',  label: 'Auto Fade',               icon: '📈',                color: '#ec4899', on: automationOn, run: onToggleAutomation },
  ];

  return (
    <div className="mt-mixctrl">
      <div className="mt-mixctrl-head">
        <span className="mt-mixctrl-title">🎛 Mixer Controls</span>
        {note && <span className="mt-mixctrl-note">{note}</span>}
      </div>
      <div className="mt-mixctrl-deck">
        {keys.map(k => (
          <button
            key={k.id}
            type="button"
            className={`mt-mixctrl-key ${k.on ? 'on' : ''}`}
            style={{ '--key': k.color }}
            onClick={k.run}
            title={k.label}
          >
            <span className="mt-mixctrl-key-icon">{k.icon}</span>
            <span className="mt-mixctrl-key-label">{k.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-mixctrl-opts">
        <label className="mt-mixctrl-opt">
          <input type="checkbox" checked={countIn} onChange={e => onCountIn(e.target.checked)} />
          <span><b>Count-in</b><small>4-beat lead before each take</small></span>
        </label>
        <label className="mt-mixctrl-opt">
          <input type="checkbox" checked={monitorInput} onChange={onToggleMonitor} />
          <span><b>Input monitoring</b><small>route the mic through your headphones</small></span>
        </label>
        <button
          type="button"
          className="mt-mixctrl-autotune"
          onClick={onOpenAutotune}
        >
          🎵 Open Autotune
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Level meter — peak bar with green/amber/red zones + clip latch
   ───────────────────────────────────────────────────────────── */
function Meter({ level = 0, horizontal = false }) {
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    if (level >= 0.99) setClipped(true);
  }, [level]);
  const pct  = Math.min(100, level * 100);
  const zone = level >= 0.9 ? 'red' : level >= 0.7 ? 'amber' : 'green';
  return (
    <div
      className={`mt-meter ${horizontal ? 'h' : 'v'}`}
      onClick={() => setClipped(false)}
      title={clipped ? 'Peaked — click to reset' : 'Level meter'}
    >
      <div
        className={`mt-meter-fill ${zone}`}
        style={horizontal ? { width: `${pct}%` } : { height: `${pct}%` }}
      />
      {clipped && <div className="mt-meter-clip" />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Studio Console — a huge, draggable, resizable floating mixing
   board. Phase 1: transport, full per-track channel strips,
   master section. Future bays (autotune / instruments / FX rack /
   editing tools) are laid out and labelled for the next phases.
   ───────────────────────────────────────────────────────────── */
const CONSOLE_MIN = { w: 600, h: 400 };
const CONSOLE_MODES = [
  { id: 'mix',      icon: '🎚', label: 'Mixing' },
  { id: 'piano',    icon: '🎹', label: 'Piano' },
  { id: 'drum',     icon: '🥁', label: 'Drum' },
  { id: 'seaboard', icon: '🌊', label: 'Seaboard' },
  { id: 'stream',   icon: '🎛', label: 'Stream' },
  { id: 'vocal',    icon: '🎤', label: 'Vocal' },
];

const KEY_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SCALE_NAMES = ['major', 'minor', 'major pentatonic', 'minor pentatonic', 'chromatic'];

// 16-pad drum kit — each pad triggers a synth voice at a fixed pitch (chiptune-flavoured kit)
const DRUM_PADS = [
  { label: 'Kick',    voice: 'bass',  midi: 36, color: '#ef4444', key: '1' },
  { label: 'Snare',   voice: 'chip',  midi: 50, color: '#f97316', key: '2' },
  { label: 'Hat C',   voice: 'chip',  midi: 80, color: '#eab308', key: '3' },
  { label: 'Hat O',   voice: 'chip',  midi: 86, color: '#84cc16', key: '4' },
  { label: 'Tom Lo',  voice: 'bass',  midi: 43, color: '#22c55e', key: 'q' },
  { label: 'Tom Mid', voice: 'bass',  midi: 48, color: '#14b8a6', key: 'w' },
  { label: 'Tom Hi',  voice: 'pluck', midi: 55, color: '#06b6d4', key: 'e' },
  { label: 'Clap',    voice: 'chip',  midi: 64, color: '#3b82f6', key: 'r' },
  { label: 'Rim',     voice: 'pluck', midi: 72, color: '#6366f1', key: 'a' },
  { label: 'Cowbell', voice: 'pluck', midi: 68, color: '#8b5cf6', key: 's' },
  { label: 'Crash',   voice: 'bells', midi: 78, color: '#a855f7', key: 'd' },
  { label: 'Ride',    voice: 'bells', midi: 84, color: '#d946ef', key: 'f' },
  { label: 'Perc 1',  voice: 'pluck', midi: 60, color: '#ec4899', key: 'z' },
  { label: 'Perc 2',  voice: 'pluck', midi: 65, color: '#f43f5e', key: 'x' },
  { label: 'Stab',    voice: 'bass',  midi: 52, color: '#fb7185', key: 'c' },
  { label: 'Zap',     voice: 'chip',  midi: 92, color: '#fda4af', key: 'v' },
];

function StudioConsole({
  pos, onPos, size, onSize, onClose,
  playing, recording, playhead, grid,
  tracks, levels, masterVolume,
  onPlayStop, onRecord, onSplit, onReturnStart,
  onTrackUpdate, onTrackFx, onMasterVolume,
  onAnalyzeTrack, onApplyAutotune,
  onView, instRecording, onInstRecord,
  buffers, countIn, onCountIn, monitorInput, onToggleMonitor,
  loopOn, onToggleLoop, automationOn, onToggleAutomation,
  soloCount, onClearSolos, onQuantize,
}) {
  const [mode, setMode]       = useState('mix');   // mix | piano | drum | stream | vocal | autotune
  const [dock, setDock]       = useState('float'); // float | bottom | right
  const [minimized, setMinimized] = useState(false);
  useEffect(() => { onView?.(mode); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragRef = useRef(null);
  const onDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'move') {
      onPos({
        x: Math.max(0, d.baseX + (e.clientX - d.startX)),
        y: Math.max(0, d.baseY + (e.clientY - d.startY)),
      });
    } else {
      onSize({
        w: Math.max(CONSOLE_MIN.w, d.baseW + (e.clientX - d.startX)),
        h: Math.max(CONSOLE_MIN.h, d.baseH + (e.clientY - d.startY)),
      });
    }
  };
  const endDrag = () => {
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    dragRef.current = null;
  };
  const beginMove = (e) => {
    if (dock !== 'float' || e.target.closest('button')) return;
    e.preventDefault();
    dragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  };
  const beginResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, baseW: size.w, baseH: size.h };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  };

  const floatStyle = dock === 'float'
    ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
    : undefined;
  const activeMode = mode === 'autotune' ? 'vocal' : mode;

  return (
    <div className={`mt-console mt-console-${dock} ${minimized ? 'is-min' : ''}`} style={floatStyle}>
      {/* Title bar — drag handle + dock/minimize/close */}
      <div className="mt-console-bar" onMouseDown={beginMove}>
        <span className="mt-console-grip">⠿</span>
        <span className="mt-console-title">STUDIO CONSOLE</span>
        <div className="mt-console-winbtns">
          <button className={`mt-cwin ${dock === 'float' ? 'on' : ''}`}  onClick={() => setDock('float')}  title="Float">▢</button>
          <button className={`mt-cwin ${dock === 'bottom' ? 'on' : ''}`} onClick={() => setDock('bottom')} title="Dock bottom">▁</button>
          <button className={`mt-cwin ${dock === 'right' ? 'on' : ''}`}  onClick={() => setDock('right')}  title="Dock right">▌</button>
          <button className="mt-cwin" onClick={() => setMinimized(m => !m)} title="Minimize">{minimized ? '▣' : '—'}</button>
          <button className="mt-cwin mt-cwin-close" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Mode tabs */}
          <div className="mt-console-tabs">
            {CONSOLE_MODES.map(m => (
              <button
                key={m.id}
                className={`mt-ctab ${activeMode === m.id ? 'on' : ''}`}
                onClick={() => setMode(m.id)}
              >
                <span className="mt-ctab-icon">{m.icon}</span>
                <span className="mt-ctab-label">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Transport strip */}
          <div className="mt-console-transport">
            <button className="mt-con-tp" onClick={onReturnStart} title="Return to start (Home)">⏮</button>
            <button
              className={`mt-con-tp ${playing ? 'on' : ''}`}
              onClick={onPlayStop}
              disabled={recording !== null}
              title="Play / Stop (Space)"
            >{playing ? '⏹' : '▶'}</button>
            <button
              className={`mt-con-tp mt-con-rec ${recording ? 'on' : ''}`}
              onClick={onRecord}
              title="Record (R)"
            >{recording === 'arming' ? '…' : recording === 'recording' ? '⏹' : '⏺'}</button>
            <button
              className="mt-con-tp"
              onClick={onSplit}
              disabled={playing || recording !== null}
              title="Split at playhead (S)"
            >✂</button>
            <div className="mt-con-readout">
              <span className="mt-con-time">{fmtPrecise(playhead)}</span>
              <span className="mt-con-bars">{fmtBarsBeats(playhead, grid)}</span>
            </div>
            <div className="mt-con-mastermeter">
              <span className="mt-con-lbl">MASTER</span>
              <Meter level={levels.master || 0} horizontal />
            </div>
          </div>

          {/* Waveform / reactive strip */}
          <ConsoleWave buffers={buffers} tracks={tracks} playing={!!playing} level={levels.master || 0} />

          {/* Mode body */}
          {mode === 'autotune' ? (
            <AutotuneWorkbench
              tracks={tracks}
              onBack={() => setMode('vocal')}
              onAnalyzeTrack={onAnalyzeTrack}
              onApplyAutotune={onApplyAutotune}
            />
          ) : mode === 'piano' ? (
            <InstrumentsWorkbench instRecording={instRecording} onInstRecord={onInstRecord} />
          ) : mode === 'seaboard' ? (
            <SeaboardWorkbench instRecording={instRecording} onInstRecord={onInstRecord} />
          ) : mode === 'drum' ? (
            <DrumPadWorkbench instRecording={instRecording} onInstRecord={onInstRecord} />
          ) : mode === 'stream' ? (
            <StreamDeck
              playing={playing}
              recording={recording}
              onPlayStop={onPlayStop}
              onRecord={onRecord}
              onSplit={onSplit}
              onReturnStart={onReturnStart}
              masterVolume={masterVolume}
              onMasterVolume={onMasterVolume}
              onGoMix={() => setMode('mix')}
              loopOn={loopOn}
              onToggleLoop={onToggleLoop}
              automationOn={automationOn}
              onToggleAutomation={onToggleAutomation}
              soloCount={soloCount}
              onClearSolos={onClearSolos}
              onQuantize={onQuantize}
            />
          ) : mode === 'vocal' ? (
            <VocalWorkbench
              recording={recording}
              onRecord={onRecord}
              countIn={countIn}
              onCountIn={onCountIn}
              monitorInput={monitorInput}
              onToggleMonitor={onToggleMonitor}
              onOpenAutotune={() => setMode('autotune')}
            />
          ) : (
            <div className="mt-console-board">
              <div className="mt-console-strips">
                {tracks.length === 0 && (
                  <div className="mt-con-empty">No tracks yet — record or import to fill the console.</div>
                )}
                {tracks.map((t, i) => (
                  <ConsoleStrip
                    key={t.id}
                    track={t}
                    color={TRACK_COLORS[i % TRACK_COLORS.length]}
                    level={levels[t.id] || 0}
                    onUpdate={p => onTrackUpdate(t.id, p)}
                    onFx={p => onTrackFx(t.id, p)}
                  />
                ))}
                <div className="mt-cs mt-cs-master">
                  <div className="mt-cs-name">MASTER</div>
                  <div className="mt-cs-fx-zone mt-cs-master-note">
                    🛡 Limiter<br /><span>clip-safe output</span>
                  </div>
                  <div className="mt-cs-fader-zone">
                    <div className="mt-cs-fader-wrap">
                      <input
                        className="mt-cs-fader mt-cs-fader-master"
                        type="range" min="0" max="1.5" step="0.02"
                        value={masterVolume}
                        onChange={e => onMasterVolume(parseFloat(e.target.value))}
                        title="Master volume"
                      />
                      <Meter level={levels.master || 0} />
                    </div>
                    <div className="mt-cs-faderval">{Math.round(masterVolume * 100)}%</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resize handle — only when floating */}
          {dock === 'float' && (
            <div className="mt-console-resize" onMouseDown={beginResize} title="Drag to resize">◢</div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Reactive waveform / LED strip above the console body ─────── */
function ConsoleWave({ buffers, tracks, playing, level }) {
  const canvasRef = useRef(null);
  // pick the longest decoded clip as the preview source
  const peaks = useMemo(() => {
    let best = null;
    for (const t of (tracks || [])) {
      for (const c of (t.clips || [])) {
        const p = buffers?.[`clip-${c.id}`]?.peaks;
        if (p && (!best || p.length > best.length)) best = p;
      }
    }
    return best;
  }, [buffers, tracks]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, w) * dpr;
    cv.height = Math.max(1, h) * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    if (peaks && peaks.length) {
      const cols = Math.floor(w);
      for (let x = 0; x < cols; x++) {
        const v = peaks[Math.floor((x / cols) * peaks.length)] || 0;
        const bh = Math.max(1, v * (h - 4));
        ctx.fillStyle = playing ? '#34d399' : 'rgba(120,200,170,0.45)';
        ctx.fillRect(x, mid - bh / 2, 1, bh);
      }
    } else {
      // no audio yet — idle LED dots
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let x = 4; x < w; x += 7) ctx.fillRect(x, mid - 1, 3, 2);
    }
  }, [peaks, playing]);

  return (
    <div className={`mt-console-wave ${playing ? 'live' : ''}`}>
      <canvas ref={canvasRef} className="mt-console-wave-cv" />
      <div className="mt-console-wave-led" style={{ opacity: 0.25 + Math.min(0.75, level) }} />
    </div>
  );
}

/* ── Drum pad mode — 16 pads, synth percussion, key-playable ──── */
function DrumPadWorkbench({ instRecording, onInstRecord }) {
  const [hit, setHit] = useState(() => new Set());
  const flash = (i) => {
    setHit(s => { const n = new Set(s); n.add(i); return n; });
    setTimeout(() => setHit(s => { const n = new Set(s); n.delete(i); return n; }), 130);
  };
  const strike = (i) => {
    const pad = DRUM_PADS[i];
    if (!pad) return;
    try {
      const h = playNote(pad.midi, { voice: pad.voice, volume: 0.4 });
      setTimeout(() => { try { h.release(); } catch {} }, 130);
    } catch {}
    flash(i);
  };
  useEffect(() => {
    const keyIndex = {};
    DRUM_PADS.forEach((p, i) => { keyIndex[p.key] = i; });
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const i = keyIndex[e.key.toLowerCase()];
      if (i === undefined) return;
      e.preventDefault();
      strike(i);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recLabel = instRecording === 'recording' ? '⏹ Stop'
    : instRecording === 'arming' ? '…' : '⏺ Record to track';

  return (
    <div className="mt-iw">
      <div className="mt-at-head">
        <span className="mt-at-title">🥁 Drum Pads</span>
        <button className={`mt-iw-rec ${instRecording ? 'on' : ''}`} onClick={onInstRecord}>{recLabel}</button>
      </div>
      <div className="mt-iw-body">
        <div className="mt-drumgrid">
          {DRUM_PADS.map((pad, i) => (
            <button
              key={pad.label}
              className={`mt-drumpad ${hit.has(i) ? 'hit' : ''}`}
              style={{ '--pad': pad.color }}
              onMouseDown={() => strike(i)}
            >
              <span className="mt-drumpad-key">{pad.key.toUpperCase()}</span>
              <span className="mt-drumpad-label">{pad.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-iw-hint">
          Hit the pads or play the matching keys — top rows <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>
          {' '}<kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>, lower rows <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>
          {' '}<kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd>. Record captures straight to a track.
        </div>
      </div>
    </div>
  );
}

/* ── Stream-control deck — colour-coded hardware hotkeys ──────── */
function StreamDeck({
  playing, recording, onPlayStop, onRecord, onSplit, onReturnStart,
  masterVolume, onMasterVolume, onGoMix,
  loopOn, onToggleLoop, automationOn, onToggleAutomation,
  soloCount, onClearSolos, onQuantize,
}) {
  const [muted, setMuted] = useState(false);
  const [note, setNote]   = useState(null);
  const prevVolRef = useRef(masterVolume);
  const flash = (msg) => { setNote(msg); setTimeout(() => setNote(null), 2200); };
  const toggleMute = () => {
    if (muted) { onMasterVolume(prevVolRef.current || 1); setMuted(false); }
    else { prevVolRef.current = masterVolume; onMasterVolume(0); setMuted(true); }
  };
  const doQuantize = () => {
    const n = onQuantize();
    flash(n > 0 ? `Quantized ${n} clip${n === 1 ? '' : 's'} to the beat grid` : 'All clips already on the grid');
  };
  const doClearSolos = () => {
    if (soloCount > 0) { onClearSolos(); flash(`Cleared ${soloCount} solo${soloCount === 1 ? '' : 's'}`); }
    else flash('No tracks are soloed');
  };

  const keys = [
    { id: 'play',  label: playing ? 'Stop' : 'Play', icon: playing ? '⏹' : '▶', color: '#22c55e', on: playing, run: onPlayStop },
    { id: 'rec',   label: 'Record',      icon: '⏺', color: '#ef4444', on: !!recording, run: onRecord },
    { id: 'cut',   label: 'Cut / Slice', icon: '✂', color: '#f59e0b', run: onSplit },
    { id: 'home',  label: 'To Start',    icon: '⏮', color: '#06b6d4', run: onReturnStart },
    { id: 'mute',  label: 'Master Mute', icon: muted ? '🔇' : '🔊', color: '#a855f7', on: muted, run: toggleMute },
    { id: 'fx',    label: 'Effects',     icon: '🎛', color: '#3b82f6', run: onGoMix },
    { id: 'solo',  label: soloCount > 0 ? `Clear Solo · ${soloCount}` : 'Clear Solo', icon: '🎧', color: '#eab308', on: soloCount > 0, run: doClearSolos },
    { id: 'loop',  label: 'Loop',        icon: '🔁', color: '#14b8a6', on: loopOn, run: onToggleLoop },
    { id: 'quant', label: 'Quantize',    icon: '⊞', color: '#8b5cf6', run: doQuantize },
    { id: 'auto',  label: 'Auto Fade',   icon: '📈', color: '#ec4899', on: automationOn, run: onToggleAutomation },
  ];

  return (
    <div className="mt-iw">
      <div className="mt-at-head">
        <span className="mt-at-title">🎛 Stream Control Deck</span>
        {note && <span className="mt-deck-note">{note}</span>}
      </div>
      <div className="mt-iw-body">
        <div className="mt-deck">
          {keys.map(k => (
            <button
              key={k.id}
              className={`mt-deckkey ${k.on ? 'on' : ''}`}
              style={{ '--key': k.color }}
              onClick={k.run}
            >
              <span className="mt-deckkey-icon">{k.icon}</span>
              <span className="mt-deckkey-label">{k.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-iw-hint">
          Every key is live. <b>Loop</b> repeats the playing span · <b>Quantize</b> snaps all
          clips to the beat grid · <b>Clear Solo</b> un-solos every track · <b>Auto Fade</b>
          ramps the master in &amp; out each time you play.
        </div>
      </div>
    </div>
  );
}

/* ── Vocal mode — focused vocal-recording shortcuts ──────────── */
function VocalWorkbench({ recording, onRecord, countIn, onCountIn, monitorInput, onToggleMonitor, onOpenAutotune }) {
  const recLabel = recording === 'recording' ? '⏹ Stop take'
    : recording === 'arming' ? 'Get ready…' : '⏺ Record vocal';
  return (
    <div className="mt-iw">
      <div className="mt-at-head">
        <span className="mt-at-title">🎤 Vocal Booth</span>
      </div>
      <div className="mt-iw-body mt-vocal">
        <button
          className={`mt-vocal-rec ${recording ? 'on' : ''}`}
          onClick={onRecord}
        >{recLabel}</button>

        <div className="mt-vocal-opts">
          <label className="mt-vocal-opt">
            <input type="checkbox" checked={countIn} onChange={e => onCountIn(e.target.checked)} />
            <span>Count-in <small>4-beat lead before the take</small></span>
          </label>
          <label className="mt-vocal-opt">
            <input type="checkbox" checked={monitorInput} onChange={onToggleMonitor} />
            <span>Input monitoring <small>hear yourself — use headphones</small></span>
          </label>
        </div>

        <button className="app-btn ghost mt-vocal-at" onClick={onOpenAutotune}>
          🎚 Open Autotune →
        </button>
        <div className="mt-iw-hint">
          Overdub-ready: the project plays back while you record, and the count-in /
          pre-roll is trimmed off the saved take automatically.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Autotune workbench — pick a track, choose key/scale, analyse
   its tuning, then render a pitch-corrected copy into a NEW
   track. Fully non-destructive: the original is never touched.
   ───────────────────────────────────────────────────────────── */
function AutotuneWorkbench({ tracks, onBack, onAnalyzeTrack, onApplyAutotune }) {
  const realTracks = tracks.filter(t => (t.clips || []).length);
  const [trackId, setTrackId]   = useState(realTracks[0]?.id ?? null);
  const [keyRoot, setKeyRoot]   = useState(0);
  const [scale, setScale]       = useState('major');
  const [strength, setStrength] = useState(0.8);
  const [speed, setSpeed]       = useState(0.5);
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus]     = useState('idle');   // idle | analyzing | rendering
  const [msg, setMsg]           = useState(null);      // { ok, text }

  // keep the selected track valid as tracks change
  useEffect(() => {
    if (!realTracks.find(t => t.id === trackId)) {
      setTrackId(realTracks[0]?.id ?? null);
    }
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const selTrack = realTracks.find(t => t.id === trackId);

  const runAnalyze = async () => {
    if (!trackId) return;
    setStatus('analyzing'); setAnalysis(null); setMsg(null);
    const res = await onAnalyzeTrack(trackId);
    setAnalysis(res?.stats || null);
    setStatus('idle');
  };
  const runApply = async () => {
    if (!trackId) return;
    setStatus('rendering'); setMsg(null);
    const res = await onApplyAutotune(trackId, { keyRoot, scale, strength, speed });
    setMsg({ ok: !!res?.ok, text: res?.message || (res?.ok ? 'Done.' : 'Autotune failed.') });
    setStatus('idle');
  };

  return (
    <div className="mt-at">
      <div className="mt-at-head">
        <button className="mt-at-back" onClick={onBack}>← Vocal</button>
        <span className="mt-at-title">🎤 Autotune</span>
      </div>

      {realTracks.length === 0 ? (
        <div className="mt-con-empty">Record or import a track first, then come back to tune it.</div>
      ) : (
        <div className="mt-at-body">
          <div className="mt-at-section">
            <div className="mt-at-lbl">Track to tune</div>
            <div className="mt-at-tracks">
              {realTracks.map(t => (
                <button
                  key={t.id}
                  className={`mt-at-trackchip ${t.id === trackId ? 'on' : ''}`}
                  style={{ borderColor: TRACK_COLORS[tracks.indexOf(t) % TRACK_COLORS.length] }}
                  onClick={() => { setTrackId(t.id); setAnalysis(null); setMsg(null); }}
                >{t.name}</button>
              ))}
            </div>
          </div>

          <div className="mt-at-section mt-at-row">
            <label className="mt-at-field">
              <span>Key</span>
              <select value={keyRoot} onChange={e => setKeyRoot(parseInt(e.target.value, 10))}>
                {KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
              </select>
            </label>
            <label className="mt-at-field">
              <span>Scale</span>
              <select value={scale} onChange={e => setScale(e.target.value)}>
                {SCALE_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-at-section">
            <label className="mt-at-knob">
              <span>Strength <em>{Math.round(strength * 100)}%</em></span>
              <input type="range" min="0" max="1" step="0.05" value={strength}
                onChange={e => setStrength(parseFloat(e.target.value))} />
              <small>How hard notes are pulled onto the scale.</small>
            </label>
            <label className="mt-at-knob">
              <span>Retune speed <em>{Math.round(speed * 100)}%</em></span>
              <input type="range" min="0.05" max="1" step="0.05" value={speed}
                onChange={e => setSpeed(parseFloat(e.target.value))} />
              <small>Fast = hard snap (the robotic effect). Slow = gentle glide.</small>
            </label>
          </div>

          <div className="mt-at-section">
            <button className="app-btn ghost mt-at-btn" onClick={runAnalyze} disabled={status !== 'idle'}>
              {status === 'analyzing' ? 'Analysing…' : '🔍 Analyse tuning'}
            </button>
            {analysis && analysis.empty && (
              <div className="mt-at-readout-muted">No clear pitch found on this track (percussion or noise?).</div>
            )}
            {analysis && !analysis.empty && (
              <div className="mt-at-readout">
                <div className="mt-at-stat"><b>{analysis.inTunePct}%</b><span>in tune</span></div>
                <div className="mt-at-stat"><b>{analysis.avgCents}¢</b><span>avg off</span></div>
                <div className="mt-at-stat">
                  <b>{analysis.biasCents > 0 ? '+' : ''}{analysis.biasCents}¢</b>
                  <span>{analysis.biasCents > 4 ? 'runs sharp' : analysis.biasCents < -4 ? 'runs flat' : 'centred'}</span>
                </div>
                <div className="mt-at-stat"><b>{analysis.lowNote}–{analysis.highNote}</b><span>range</span></div>
              </div>
            )}
          </div>

          <div className="mt-at-section">
            <button className="app-btn primary mt-at-btn" onClick={runApply} disabled={status !== 'idle'}>
              {status === 'rendering' ? 'Tuning…' : '✨ Apply autotune'}
            </button>
            <small className="mt-at-note">
              Creates a new “{selTrack?.name} (tuned)” track — your original is never changed.
            </small>
            {msg && <div className={`mt-at-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Seaboard workbench — Roli-style MPE pad grid.
   2 rows × 12 columns of bright square pads, rainbow-coded by
   note class. Drag within any pad for pitch bend (X) and slide
   (filter, Y). Computer keys play the lower octave row.
   ───────────────────────────────────────────────────────────── */
const SB_BEND_RANGE = 2;  // semitones across full pad width
// Chromatic rainbow — one colour per semitone, wraps across octaves
const SB_COLORS = [
  '#ef4444', // C   — red
  '#f97316', // C♯  — orange
  '#f59e0b', // D   — amber
  '#eab308', // D♯  — yellow
  '#84cc16', // E   — lime
  '#22c55e', // F   — green
  '#14b8a6', // F♯  — teal
  '#06b6d4', // G   — cyan
  '#3b82f6', // G♯  — blue
  '#8b5cf6', // A   — violet
  '#a855f7', // A♯  — purple
  '#ec4899', // B   — pink
];
const SB_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
// Computer keyboard → semitone offset (chromatic, lower octave row)
const SB_KEYMAP = { a:0, w:1, s:2, e:3, d:4, f:5, t:6, g:7, y:8, h:9, u:10, j:11 };

function SeaboardWorkbench({ instRecording, onInstRecord }) {
  const [voice, setVoice]   = useState('piano');
  const [octave, setOctave] = useState(4);
  const [volume, setVolume] = useState(0.3);
  const [active, setActive] = useState(() => new Set());
  const [bendInfo, setBendInfo] = useState(null);

  const heldRef  = useRef(new Map());
  const voiceRef = useRef(voice);  voiceRef.current = voice;
  const volRef   = useRef(volume); volRef.current   = volume;
  const octRef   = useRef(octave); octRef.current   = octave;

  const syncActive = () =>
    setActive(new Set([...heldRef.current.values()].map(v => v.midi)));

  const pressNote = (id, midi, padEl, clientX, clientY) => {
    if (heldRef.current.has(id)) return;
    let handle;
    try { handle = playNoteExpressive(midi, { voice: voiceRef.current, volume: volRef.current }); }
    catch { return; }
    if (padEl) {
      const r = padEl.getBoundingClientRect();
      const bend = ((clientX - r.left) / r.width - 0.5) * SB_BEND_RANGE * 2;
      const slide = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
      try { handle.setPitchBend(bend); } catch {}
      try { handle.setSlide(slide); } catch {}
      setBendInfo({ midi, bend, slide });
    }
    heldRef.current.set(id, { handle, midi, padEl });
    syncActive();
  };

  const updateExpr = (id, clientX, clientY) => {
    const n = heldRef.current.get(id);
    if (!n || !n.padEl) return;
    const r = n.padEl.getBoundingClientRect();
    const bend  = ((clientX - r.left) / r.width - 0.5) * SB_BEND_RANGE * 2;
    const slide = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    try { n.handle.setPitchBend(bend); } catch {}
    try { n.handle.setSlide(slide); } catch {}
    setBendInfo({ midi: n.midi, bend, slide });
  };

  const releaseNote = (id) => {
    const n = heldRef.current.get(id);
    if (!n) return;
    try { n.handle.release(); } catch {}
    heldRef.current.delete(id);
    syncActive();
    if (!heldRef.current.size) setBendInfo(null);
  };

  const releaseAll = () => { [...heldRef.current.keys()].forEach(id => releaseNote(id)); };

  // Global mouse tracking for continuous expression
  useEffect(() => {
    const onMove = (e) => {
      for (const id of heldRef.current.keys())
        if (id.startsWith('m')) updateExpr(id, e.clientX, e.clientY);
    };
    const onUp = () => {
      [...heldRef.current.keys()].filter(id => id.startsWith('m')).forEach(releaseNote);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); releaseAll(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Computer keyboard — lower octave row, chromatic
  useEffect(() => {
    const base = () => (octRef.current + 1) * 12;
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const semi = SB_KEYMAP[e.key.toLowerCase()];
      if (semi === undefined) return;
      e.preventDefault();
      const midi = base() + semi;
      const id = 'k' + e.key.toLowerCase();
      if (heldRef.current.has(id)) return;
      let handle;
      try { handle = playNoteExpressive(midi, { voice: voiceRef.current, volume: volRef.current }); }
      catch { return; }
      heldRef.current.set(id, { handle, midi, padEl: null });
      syncActive();
      setBendInfo({ midi, bend: 0, slide: 0.5 });
    };
    const up = (e) => {
      const semi = SB_KEYMAP[e.key.toLowerCase()];
      if (semi !== undefined) releaseNote('k' + e.key.toLowerCase());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build 2 rows × 12 columns — top = octave+1, bottom = octave
  const base = (octave + 1) * 12;
  const pads = [];
  for (let row = 1; row >= 0; row--) {      // row 1 = top, row 0 = bottom
    for (let semi = 0; semi < 12; semi++) {
      pads.push({ midi: base + row * 12 + semi, semi });
    }
  }

  const recLabel = instRecording === 'recording' ? '⏹ Stop'
    : instRecording === 'arming' ? '…' : '⏺ Record to track';

  const midiLabel = (m) => SB_NAMES[((m % 12) + 12) % 12];
  const midiOct   = (m) => Math.floor(m / 12) - 1;

  return (
    <div className="mt-iw">
      <div className="mt-at-head">
        <span className="mt-at-title">🌊 Roli Seaboard</span>
        <button className={`mt-iw-rec ${instRecording ? 'on' : ''}`} onClick={onInstRecord}>{recLabel}</button>
      </div>

      <div className="mt-iw-body">
        {/* Voice */}
        <div className="mt-at-section">
          <div className="mt-at-lbl">Voice</div>
          <div className="mt-iw-voices">
            {VOICE_LIST.map(v => (
              <button key={v.id} className={`mt-iw-voice ${voice === v.id ? 'on' : ''}`} onClick={() => setVoice(v.id)}>
                <span className="mt-iw-voice-emoji">{v.emoji}</span>{v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Octave / Volume / Live readout */}
        <div className="mt-at-section mt-iw-controls">
          <div className="mt-iw-octave">
            <span className="mt-at-lbl">Octave</span>
            <div className="mt-iw-octave-ctl">
              <button onClick={() => setOctave(o => Math.max(1, o - 1))}>−</button>
              <span>{octave}</span>
              <button onClick={() => setOctave(o => Math.min(7, o + 1))}>+</button>
            </div>
          </div>
          <label className="mt-iw-vol">
            <span className="mt-at-lbl">Volume</span>
            <input type="range" min="0.05" max="0.6" step="0.01"
              value={volume} onChange={e => setVolume(parseFloat(e.target.value))} />
          </label>
          {bendInfo && (
            <div className="mt-sb-readout">
              <span className="mt-sb-note" style={{ color: SB_COLORS[bendInfo.midi % 12] }}>
                {midiLabel(bendInfo.midi)}{midiOct(bendInfo.midi)}
              </span>
              <span className="mt-sb-axis">
                <span className="mt-sb-ax-lbl">Bend</span>
                <span className={`mt-sb-ax-val ${Math.abs(bendInfo.bend) > 0.05 ? 'active' : ''}`}>
                  {bendInfo.bend > 0 ? '+' : ''}{bendInfo.bend.toFixed(2)} st
                </span>
              </span>
              <span className="mt-sb-axis">
                <span className="mt-sb-ax-lbl">Slide</span>
                <span className={`mt-sb-ax-val ${bendInfo.slide > 0.1 ? 'active' : ''}`}>
                  {Math.round(bendInfo.slide * 100)}%
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Square pad grid — 2 rows × 12 cols */}
        <div className="mt-sbgrid">
          {pads.map(({ midi, semi }) => (
            <div
              key={midi}
              className={`mt-sbpad ${active.has(midi) ? 'on' : ''}`}
              style={{ '--pad': SB_COLORS[semi] }}
              onMouseDown={(e) => { e.preventDefault(); pressNote('m' + midi, midi, e.currentTarget, e.clientX, e.clientY); }}
              onMouseEnter={(e) => {
                if (e.buttons !== 1) return;
                // Glide: seamlessly move to this pad
                [...heldRef.current.keys()].filter(id => id.startsWith('m')).forEach(releaseNote);
                pressNote('m' + midi, midi, e.currentTarget, e.clientX, e.clientY);
              }}
            >
              <span className="mt-sbpad-name">{midiLabel(midi)}</span>
              <span className="mt-sbpad-oct">{midiOct(midi)}</span>
            </div>
          ))}
        </div>

        <div className="mt-iw-hint">
          <b>Hold &amp; drag</b> within a pad — left/right bends pitch (±{SB_BEND_RANGE} st) ·
          {' '}up/down slides the filter · <b>Glide</b> across pads while held ·
          {' '}Keys <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>G</kbd><kbd>H</kbd><kbd>J</kbd>
          {' '}+ <kbd>W</kbd><kbd>E</kbd><kbd>T</kbd><kbd>Y</kbd><kbd>U</kbd> = bottom row.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Guitar workbench — interactive 6-string fretboard.
   Click any cell to pluck that string+fret. Keyboard:
     A S D F G H  → pluck strings e B G D A E at current fret
     Space        → strum down  |  Shift+Space → strum up
     [ ]          → move current fret  |  0–9 → jump to fret
   Select a chord button to show + play chord shapes.
   ───────────────────────────────────────────────────────────── */
// Standard tuning, high e → low E (index 0 = string 1)
const GUITAR_STRINGS = [
  { name: 'e', midi: 64, color: '#f97316', strH: 1.0 },
  { name: 'B', midi: 59, color: '#eab308', strH: 1.4 },
  { name: 'G', midi: 55, color: '#84cc16', strH: 1.8 },
  { name: 'D', midi: 50, color: '#22c55e', strH: 2.3 },
  { name: 'A', midi: 45, color: '#06b6d4', strH: 2.9 },
  { name: 'E', midi: 40, color: '#8b5cf6', strH: 3.5 },
];
const GUITAR_NUM_FRETS  = 12;
const GUITAR_SINGLE_DOTS = [3, 5, 7, 9];
const GUITAR_DOUBLE_DOTS = [12];
// Fret positions per string [e, B, G, D, A, E]; -1 = muted
const GUITAR_CHORDS = {
  'G':  [3, 0, 0, 0, 2, 3],
  'C':  [0, 1, 0, 2, 3, -1],
  'D':  [2, 3, 2, 0, -1, -1],
  'Em': [0, 0, 0, 2, 2, 0],
  'Am': [0, 1, 2, 2, 0, -1],
  'E':  [0, 0, 1, 2, 2, 0],
  'A':  [0, 2, 2, 2, 0, -1],
  'F':  [1, 1, 2, 3, 3, 1],
  'Dm': [1, 3, 2, 0, -1, -1],
  'Bm': [2, 3, 4, 4, 2, -1],
};

function GuitarWorkbench({ instRecording, onInstRecord }) {
  const [voice, setVoice]             = useState('acoustic');
  const [volume, setVolume]           = useState(0.35);
  const [currentFret, setCurrentFret] = useState(0);
  const [activeNotes, setActiveNotes] = useState(() => new Set()); // `${si}-${fret}`
  const [selectedChord, setSelectedChord] = useState(null);

  const voiceRef = useRef(voice);         voiceRef.current  = voice;
  const volRef   = useRef(volume);        volRef.current    = volume;
  const fretRef  = useRef(currentFret);   fretRef.current   = currentFret;
  const chordRef = useRef(selectedChord); chordRef.current  = selectedChord;
  const tidRef   = useRef([]);

  // Pluck one string at one fret, flash for 700 ms then release
  const pluck = useCallback((si, fret) => {
    if (fret < 0) return;
    const midi = GUITAR_STRINGS[si].midi + fret;
    const id   = `${si}-${fret}`;
    let handle;
    try {
      handle = voiceRef.current === 'acoustic'
        ? playAcousticGuitar(midi, { volume: volRef.current })
        : playNote(midi, { voice: voiceRef.current, volume: volRef.current });
    } catch { return; }
    setActiveNotes(s => new Set([...s, id]));
    // Acoustic strings ring for several seconds — flash the dot for 1.2 s
    // then let the KS loop decay naturally; non-acoustic voices release sooner
    const ringMs = voiceRef.current === 'acoustic' ? 1200 : 700;
    const t = setTimeout(() => {
      try { handle.release(); } catch {}
      setActiveNotes(s => { const n = new Set(s); n.delete(id); return n; });
    }, ringMs);
    tidRef.current.push(t);
  }, []);

  // Strum — arpeggio across all 6 strings, 28 ms apart
  const strum = useCallback((dir, chord) => {
    const shape = chord ? GUITAR_CHORDS[chord] : null;
    const order = dir === 'down' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
    order.forEach((si, i) =>
      setTimeout(() => pluck(si, shape ? shape[si] : fretRef.current), i * 28));
  }, [pluck]);

  useEffect(() => { const ts = tidRef.current; return () => ts.forEach(clearTimeout); }, []);

  useEffect(() => {
    const strKeys = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5 };
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      // String pluck
      const si = strKeys[k];
      if (si !== undefined) {
        const shape = chordRef.current ? GUITAR_CHORDS[chordRef.current] : null;
        pluck(si, shape ? shape[si] : fretRef.current);
        return;
      }
      // Strum
      if (e.code === 'Space') {
        e.preventDefault();
        strum(e.shiftKey ? 'up' : 'down', chordRef.current);
        return;
      }
      // Fret navigation
      if (k === '[') { setCurrentFret(f => Math.max(0, f - 1)); return; }
      if (k === ']') { setCurrentFret(f => Math.min(GUITAR_NUM_FRETS, f + 1)); return; }
      // Number jump
      const dig = parseInt(e.key);
      if (!isNaN(dig)) setCurrentFret(dig);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [pluck, strum]);

  const chordShape = selectedChord ? GUITAR_CHORDS[selectedChord] : null;
  const recLabel   = instRecording === 'recording' ? '⏹ Stop'
    : instRecording === 'arming' ? '…' : '⏺ Record to track';

  return (
    <div className="mt-iw">
      <div className="mt-at-head">
        <span className="mt-at-title">🎸 Guitar</span>
        <button className={`mt-iw-rec ${instRecording ? 'on' : ''}`} onClick={onInstRecord}>{recLabel}</button>
      </div>

      <div className="mt-iw-body">
        {/* Voice + Volume */}
        <div className="mt-at-section mt-iw-controls">
          <div className="mt-iw-octave">
            <span className="mt-at-lbl">Voice</span>
            <div className="mt-guitar-voicepick">
              {['acoustic', 'pluck', 'piano', 'bells'].map(v => (
                <button key={v}
                  className={`mt-iw-voice ${voice === v ? 'on' : ''}`}
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={() => setVoice(v)}>{v}</button>
              ))}
            </div>
          </div>
          <label className="mt-iw-vol">
            <span className="mt-at-lbl">Volume</span>
            <input type="range" min="0.05" max="0.6" step="0.01"
              value={volume} onChange={e => setVolume(parseFloat(e.target.value))} />
          </label>
        </div>

        {/* Fret nav + Strum + Chord picker */}
        <div className="mt-at-section mt-guitar-actionrow">
          <div className="mt-guitar-fretbar">
            <span className="mt-at-lbl">Fret</span>
            <button className="mt-guitar-fretbtn" onClick={() => setCurrentFret(f => Math.max(0, f - 1))}>−</button>
            <span className="mt-guitar-fretnum">{currentFret === 0 ? 'Open' : currentFret}</span>
            <button className="mt-guitar-fretbtn" onClick={() => setCurrentFret(f => Math.min(GUITAR_NUM_FRETS, f + 1))}>+</button>
          </div>
          <div className="mt-guitar-fretbar">
            <span className="mt-at-lbl">Strum</span>
            <button className="mt-guitar-strumbtn" onClick={() => strum('down', selectedChord)}>▼ Down</button>
            <button className="mt-guitar-strumbtn" onClick={() => strum('up',   selectedChord)}>▲ Up</button>
          </div>
          <div className="mt-guitar-chordbar">
            <span className="mt-at-lbl">Chords</span>
            <div className="mt-guitar-chordrow">
              {Object.keys(GUITAR_CHORDS).map(ch => (
                <button key={ch}
                  className={`mt-guitar-chord ${selectedChord === ch ? 'on' : ''}`}
                  onClick={() => setSelectedChord(c => c === ch ? null : ch)}>{ch}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Fretboard ── */}
        <div className="mt-guitar-board">
          {GUITAR_STRINGS.map((s, si) => (
            <div key={si} className="mt-guitar-row"
              style={{ '--sc': s.color, '--str-h': `${s.strH}px` }}>
              {/* String name */}
              <div className="mt-guitar-slbl" style={{ color: s.color }}>{s.name}</div>
              {/* Open-string cell */}
              <div className="mt-guitar-open-cell" onClick={() => pluck(si, 0)}>
                {chordShape && chordShape[si] === -1
                  ? <span className="mt-guitar-muted">✕</span>
                  : (activeNotes.has(`${si}-0`) || (chordShape && chordShape[si] === 0))
                    ? <div className={`mt-guitar-dot${activeNotes.has(`${si}-0`) ? '' : ' ghost'}`} />
                    : null}
              </div>
              {/* Nut */}
              <div className="mt-guitar-nut" />
              {/* 12 fret cells */}
              {Array.from({ length: GUITAR_NUM_FRETS }, (_, fi) => {
                const f = fi + 1;
                const isActive = activeNotes.has(`${si}-${f}`);
                const isChord  = chordShape && chordShape[si] === f;
                const isSel    = !chordShape && currentFret === f;
                return (
                  <div key={f}
                    className={`mt-guitar-fret-cell${isSel ? ' sel' : ''}`}
                    onClick={() => pluck(si, f)}>
                    {(isActive || isChord) && (
                      <div className={`mt-guitar-dot${isActive ? '' : ' ghost'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Ruler: fret numbers + position dots */}
          <div className="mt-guitar-ruler">
            <div className="mt-guitar-ruler-spacer" />
            {Array.from({ length: GUITAR_NUM_FRETS }, (_, fi) => {
              const f = fi + 1;
              const single = GUITAR_SINGLE_DOTS.includes(f) && !GUITAR_DOUBLE_DOTS.includes(f);
              const dbl    = GUITAR_DOUBLE_DOTS.includes(f);
              return (
                <div key={f} className="mt-guitar-ruler-cell">
                  <span className="mt-guitar-ruler-num">{f}</span>
                  {single && <div className="mt-guitar-pos-dot" />}
                  {dbl    && <div className="mt-guitar-pos-double"><div className="mt-guitar-pos-dot" /><div className="mt-guitar-pos-dot" /></div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-iw-hint">
          <b>Click</b> any fret to pluck ·
          {' '}<kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>G</kbd><kbd>H</kbd> pluck strings e→E at current fret ·
          {' '}<kbd>Space</kbd> strum ↓ · <kbd>⇧ Space</kbd> strum ↑ ·
          {' '}<kbd>[</kbd><kbd>]</kbd> move fret · <kbd>0</kbd>–<kbd>9</kbd> jump to fret ·
          {' '}select a chord card to play chord shapes
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Instruments workbench — a playable software instrument.
   Pick a voice, play the on-screen keys or your computer
   keyboard, and record the performance straight to a track.
   ───────────────────────────────────────────────────────────── */
const IW_WHITE = [0, 2, 4, 5, 7, 9, 11];
const IW_BLACK = [{ after: 0, semi: 1 }, { after: 1, semi: 3 }, { after: 3, semi: 6 }, { after: 4, semi: 8 }, { after: 5, semi: 10 }];
const IW_OCTAVES = 2;
const IW_KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };

function InstrumentsWorkbench({ instRecording, onInstRecord }) {
  const [voice, setVoice]   = useState('piano');
  const [octave, setOctave] = useState(4);
  const [volume, setVolume] = useState(0.3);
  const [active, setActive] = useState(() => new Set());
  const heldRef  = useRef(new Map());     // id → { handle, midi }
  const voiceRef = useRef(voice);  voiceRef.current = voice;
  const volRef   = useRef(volume); volRef.current   = volume;
  const octRef   = useRef(octave); octRef.current   = octave;

  const syncActive = () => setActive(new Set([...heldRef.current.values()].map(v => v.midi)));
  const pressNote = (id, midi) => {
    if (heldRef.current.has(id)) return;
    let handle;
    try { handle = playNote(midi, { voice: voiceRef.current, volume: volRef.current }); }
    catch { return; }
    heldRef.current.set(id, { handle, midi });
    syncActive();
  };
  const releaseNote = (id) => {
    const h = heldRef.current.get(id);
    if (!h) return;
    try { h.handle.release(); } catch {}
    heldRef.current.delete(id);
    syncActive();
  };
  const releaseAll = (prefix) => {
    for (const id of [...heldRef.current.keys()]) {
      if (!prefix || id.startsWith(prefix)) releaseNote(id);
    }
  };

  // computer-keyboard play + global mouseup release; bound once for the workbench's life
  useEffect(() => {
    const baseMidi = () => (octRef.current + 1) * 12;
    const down = (e) => {
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const semi = IW_KEYMAP[e.key.toLowerCase()];
      if (semi === undefined) return;
      e.preventDefault();
      pressNote('k' + e.key.toLowerCase(), baseMidi() + semi);
    };
    const up = (e) => {
      const semi = IW_KEYMAP[e.key.toLowerCase()];
      if (semi === undefined) return;
      releaseNote('k' + e.key.toLowerCase());
    };
    const mouseUp = () => releaseAll('m');
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mouseup', mouseUp);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mouseup', mouseUp);
      releaseAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // build the 2-octave keyboard layout
  const baseMidi = (octave + 1) * 12;
  const whiteKeys = [];
  for (let o = 0; o < IW_OCTAVES; o++) {
    for (const semi of IW_WHITE) whiteKeys.push(baseMidi + o * 12 + semi);
  }
  const blackKeys = [];
  const whitePerOct = IW_WHITE.length;
  for (let o = 0; o < IW_OCTAVES; o++) {
    for (const { after, semi } of IW_BLACK) {
      blackKeys.push({
        midi: baseMidi + o * 12 + semi,
        leftPct: ((o * whitePerOct + after + 1) * 100) / (IW_OCTAVES * whitePerOct),
      });
    }
  }

  const recLabel = instRecording === 'recording' ? '⏹ Stop'
    : instRecording === 'arming' ? '…'
    : '⏺ Record to track';

  return (
    <div className="mt-iw">
      <div className="mt-at-head">
        <span className="mt-at-title">🎹 Piano</span>
        <button
          className={`mt-iw-rec ${instRecording ? 'on' : ''}`}
          onClick={onInstRecord}
        >{recLabel}</button>
      </div>

      <div className="mt-iw-body">
        <div className="mt-at-section">
          <div className="mt-at-lbl">Voice</div>
          <div className="mt-iw-voices">
            {VOICE_LIST.map(v => (
              <button
                key={v.id}
                className={`mt-iw-voice ${voice === v.id ? 'on' : ''}`}
                onClick={() => setVoice(v.id)}
              >
                <span className="mt-iw-voice-emoji">{v.emoji}</span>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-at-section mt-iw-controls">
          <div className="mt-iw-octave">
            <span className="mt-at-lbl">Octave</span>
            <div className="mt-iw-octave-ctl">
              <button onClick={() => setOctave(o => Math.max(1, o - 1))}>−</button>
              <span>{octave}</span>
              <button onClick={() => setOctave(o => Math.min(7, o + 1))}>+</button>
            </div>
          </div>
          <label className="mt-iw-vol">
            <span className="mt-at-lbl">Volume</span>
            <input
              type="range" min="0.05" max="0.6" step="0.01"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
            />
          </label>
        </div>

        {/* the keyboard */}
        <div className="mt-piano">
          <div className="mt-piano-whites">
            {whiteKeys.map(midi => (
              <div
                key={midi}
                className={`mt-pk mt-pk-w ${active.has(midi) ? 'on' : ''}`}
                onMouseDown={() => pressNote('m' + midi, midi)}
                onMouseEnter={(e) => { if (e.buttons === 1) pressNote('m' + midi, midi); }}
                onMouseLeave={() => releaseNote('m' + midi)}
              >
                <span>{midiToNoteName(midi)}</span>
              </div>
            ))}
          </div>
          {blackKeys.map(k => (
            <div
              key={k.midi}
              className={`mt-pk mt-pk-b ${active.has(k.midi) ? 'on' : ''}`}
              style={{ left: `${k.leftPct}%` }}
              onMouseDown={(e) => { e.stopPropagation(); pressNote('m' + k.midi, k.midi); }}
              onMouseLeave={() => releaseNote('m' + k.midi)}
            />
          ))}
        </div>

        <div className="mt-iw-hint">
          Play with your computer keys — <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>G</kbd><kbd>H</kbd><kbd>J</kbd><kbd>K</kbd> (white) ·
          {' '}<kbd>W</kbd><kbd>E</kbd><kbd>T</kbd><kbd>Y</kbd><kbd>U</kbd> (black). Record captures straight to a new track.
        </div>
      </div>
    </div>
  );
}

/* One full console channel strip — name · M/S · EQ · comp · reverb send · pan · fader · meter. */
function ConsoleStrip({ track, color, level, onUpdate, onFx }) {
  const fx = { ...DEFAULT_FX, ...(track.effects || {}) };
  return (
    <div className="mt-cs" style={{ borderTopColor: color }}>
      <div className="mt-cs-name" style={{ color }} title={track.name}>{track.name}</div>

      <div className="mt-cs-ms">
        <button
          className={`mt-cs-msbtn ${track.is_muted ? 'on-m' : ''}`}
          onClick={() => onUpdate({ is_muted: track.is_muted ? 0 : 1 })}
          title="Mute"
        >M</button>
        <button
          className={`mt-cs-msbtn ${track.is_solo ? 'on-s' : ''}`}
          onClick={() => onUpdate({ is_solo: track.is_solo ? 0 : 1 })}
          title="Solo"
        >S</button>
      </div>

      <div className="mt-cs-fx-zone">
        <div className="mt-cs-fx-lbl">EQ</div>
        <FxSlider label="Hi"  min={-12} max={12} step={0.5} suffix="dB" value={fx.eqHigh} onChange={v => onFx({ eqHigh: v })} />
        <FxSlider label="Mid" min={-12} max={12} step={0.5} suffix="dB" value={fx.eqMid}  onChange={v => onFx({ eqMid: v })} />
        <FxSlider label="Lo"  min={-12} max={12} step={0.5} suffix="dB" value={fx.eqLow}  onChange={v => onFx({ eqLow: v })} />
        <div className="mt-cs-fx-lbl">Dynamics</div>
        <FxSlider label="Thr" min={-60} max={0} step={1} suffix="dB" value={fx.compThreshold} onChange={v => onFx({ compThreshold: v })} />
        <FxSlider label="Rat" min={1} max={12} step={0.5} suffix=":1" value={fx.compRatio} onChange={v => onFx({ compRatio: v })} />
        <div className="mt-cs-fx-lbl">Reverb</div>
        <FxSlider label="Snd" min={0} max={1} step={0.02} suffix="%" value={fx.reverbSend * 100} onChange={v => onFx({ reverbSend: v / 100 })} />
      </div>

      <div className="mt-cs-pan">
        <span>Pan</span>
        <input
          type="range" min="-1" max="1" step="0.05"
          value={track.pan}
          onChange={e => onUpdate({ pan: parseFloat(e.target.value) })}
          title="Pan"
        />
      </div>

      <div className="mt-cs-fader-zone">
        <div className="mt-cs-fader-wrap">
          <input
            className="mt-cs-fader"
            type="range" min="0" max="1.5" step="0.02"
            value={track.volume}
            onChange={e => onUpdate({ volume: parseFloat(e.target.value) })}
            title="Volume"
          />
          <Meter level={level} />
        </div>
        <div className="mt-cs-faderval">{Math.round(track.volume * 100)}%</div>
      </div>
    </div>
  );
}
