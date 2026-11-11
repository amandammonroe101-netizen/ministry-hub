import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadBlob, deleteBlobAtPath } from '../../lib/userStorage';
import { useAuth } from '../../context/AuthContext';
import './Documents.css';

/* ─────────────────────────────────────────────────────────────
   Documents — team-facing document store
   Namespace: .dx-*  (avoid .doc-* to prevent collisions)
   Persistence: localStorage key 'admin:documents'
   ───────────────────────────────────────────────────────────── */

const LS_KEY = 'admin:documents';

const CATEGORIES = [
  { id: 'policy',             label: 'Policy',              short: 'Policy' },
  { id: 'position',           label: 'Position Description', short: 'Position' },
  { id: 'covenant',           label: 'Covenant',            short: 'Covenant' },
  { id: 'statement-of-faith', label: 'Statement of Faith',  short: 'Faith' },
  { id: 'guide',              label: 'Guide',               short: 'Guide' },
  { id: 'form',               label: 'Form',                short: 'Form' },
  { id: 'agreement',          label: 'Agreement',           short: 'Agreement' },
  { id: 'other',              label: 'Other',               short: 'Other' },
];

const CAT_META = CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});
const catLabel = (id) => (CAT_META[id] || CAT_META.other).label;
const catShort = (id) => (CAT_META[id] || CAT_META.other).short;
const catClass = (id) => `dx-cat-${CAT_META[id] ? id : 'other'}`;

const LARGE_FILE_BYTES = 5 * 1024 * 1024;

/* ─── Helpers ────────────────────────────────────────────────── */
function uid() {
  return `dx_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatBytes(b) {
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return '—'; }
}

function stripExt(name) {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function getFileKind(doc) {
  const mime = (doc?.fileType || '').toLowerCase();
  const fname = (doc?.fileName || '').toLowerCase();
  if (mime === 'application/pdf' || fname.endsWith('.pdf'))   return 'pdf';
  if (mime.startsWith('image/'))                              return 'image';
  if (mime.startsWith('text/')
      || fname.endsWith('.txt')
      || fname.endsWith('.md')
      || fname.endsWith('.markdown'))                         return 'text';
  return 'other';
}

function fileIcon(doc) {
  const k = getFileKind(doc);
  if (k === 'pdf')   return '📕';
  if (k === 'image') return '🖼';
  if (k === 'text')  return '📝';
  return '📄';
}

/* Convert a data URL to a Blob URL for opening in a new tab. */
function dataUrlToBlobUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  try {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl);
    if (!m) return null;
    const mime    = m[1] || 'application/octet-stream';
    const isB64   = !!m[2];
    const payload = m[3] || '';
    let bytes;
    if (isB64) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const decoded = decodeURIComponent(payload);
      bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/* Decode a text/* data URL to a plain string for inline preview. */
function decodeTextDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  try {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl);
    if (!m) return '';
    const isB64   = !!m[2];
    const payload = m[3] || '';
    if (isB64) {
      const bin = atob(payload);
      // Treat the bytes as UTF-8.
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      try { return new TextDecoder('utf-8').decode(bytes); }
      catch { return bin; }
    }
    return decodeURIComponent(payload);
  } catch { return ''; }
}

/* ─── Tag helpers ────────────────────────────────────────────── */
function normalizeTag(t) {
  return (t || '').trim().replace(/\s+/g, ' ');
}

function mergeTags(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(t => t.toLowerCase()));
  for (const raw of incoming) {
    const t = normalizeTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/* ─── Storage ────────────────────────────────────────────────── */
function loadDocs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveDocs(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    return { ok: true };
  } catch (err) {
    const isQuota =
      err && (err.name === 'QuotaExceededError' ||
              err.code === 22 ||
              err.code === 1014 ||
              /quota/i.test(err.message || ''));
    return { ok: false, isQuota };
  }
}

/* ─── Toast ──────────────────────────────────────────────────── */
function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="dx-toast" role="status">
      <span>{message}</span>
      <button className="dx-toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ─── Tag chip input ─────────────────────────────────────────── */
function TagInput({ tags, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(tags) ? tags : [];

  function commit(raw) {
    if (!raw) return;
    const parts = raw.split(',').map(normalizeTag).filter(Boolean);
    if (parts.length === 0) return;
    const next = mergeTags(list, parts);
    if (next.length !== list.length) onChange(next);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
    else if (e.key === 'Backspace' && draft === '' && list.length > 0) {
      e.preventDefault();
      onChange(list.slice(0, -1));
    } else if (e.key === ',') {
      e.preventDefault();
      commit(draft);
    }
  }

  function handleChange(e) {
    const v = e.target.value;
    if (v.includes(',')) { commit(v); return; }
    setDraft(v);
  }

  function handleBlur() {
    if (draft.trim()) commit(draft);
  }

  function removeAt(i) {
    const next = list.slice();
    next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="dx-tag-input">
      {list.map((tag, i) => (
        <span className="dx-tag-chip" key={`${tag}-${i}`}>
          <span className="dx-tag-chip-lbl">{tag}</span>
          <button
            type="button"
            className="dx-tag-chip-x"
            onClick={() => removeAt(i)}
            aria-label={`Remove tag ${tag}`}
            tabIndex={-1}
          >✕</button>
        </span>
      ))}
      <input
        className="dx-tag-input-inp"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={list.length === 0 ? (placeholder || 'Add tags (Enter or comma to add)…') : 'Add tag…'}
      />
    </div>
  );
}

/* ─── Upload dialog ──────────────────────────────────────────── */
function UploadDialog({ onSave, onClose, onError }) {
  const [file,       setFile]       = useState(null);
  const [name,       setName]       = useState('');
  const [category,   setCategory]   = useState('other');
  const [description,setDescription]= useState('');
  const [tags,       setTags]       = useState([]);
  const [uploadedBy, setUploadedBy] = useState('');
  const [dataUrl,    setDataUrl]    = useState('');
  const [busy,       setBusy]       = useState(false);
  const [readError,  setReadError]  = useState('');

  const isLarge = file && file.size > LARGE_FILE_BYTES;

  function handleFileChosen(f) {
    if (!f) return;
    setFile(f);
    setName(stripExt(f.name));
    setReadError('');
    setDataUrl('');

    const reader = new FileReader();
    reader.onerror = () => {
      setReadError('Could not read this file. It may be too large for the browser to load.');
    };
    reader.onload = () => {
      const url = reader.result;
      setDataUrl(typeof url === 'string' ? url : '');
    };
    try { reader.readAsDataURL(f); }
    catch { setReadError('Could not read this file.'); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !dataUrl) { setReadError('Choose a file first.'); return; }
    if (!name.trim())      { setReadError('Name is required.'); return; }
    setBusy(true);
    const now = new Date().toISOString();
    /* The file blob is NOT included on the metadata — parent uploads to
       Firebase Storage and adds fileUrl + storagePath to the doc record. */
    const metadata = {
      id:          uid(),
      name:        name.trim(),
      fileName:    file.name,
      category,
      description: description.trim(),
      fileType:    file.type || '',
      fileSize:    file.size,
      tags:        Array.isArray(tags) ? tags.slice() : [],
      pinned:      false,
      uploadedAt:  now,
      uploadedBy:  uploadedBy.trim(),
      notes:       '',
      createdAt:   now,
      updatedAt:   now,
    };
    try {
      const result = await onSave(metadata, file);
      if (result && result.error) onError(result.error);
      else onClose();
    } catch (err) {
      onError(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dx-modal-overlay" onClick={onClose}>
      <div className="dx-modal" onClick={e => e.stopPropagation()}>
        <div className="dx-modal-head">
          <span>📤 Upload Document</span>
          <button className="dx-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="dx-modal-body" onSubmit={handleSubmit}>
          {/* File picker */}
          <div className="dx-field">
            <label className="dx-field-lbl">File</label>
            <input
              type="file"
              accept="application/pdf,image/*,text/*,.txt,.md"
              className="dx-file-input"
              onChange={e => handleFileChosen(e.target.files?.[0] || null)}
            />
            {file && (
              <div className="dx-file-meta">
                <span className="dx-file-name">{file.name}</span>
                <span className="dx-muted">{formatBytes(file.size)}</span>
              </div>
            )}
            {isLarge && (
              <div className="dx-warn">
                ⚠ Large files may slow down storage. Consider compressing or using a cloud share link instead.
              </div>
            )}
            {readError && <div className="dx-error">{readError}</div>}
          </div>

          {/* Name */}
          <div className="dx-field">
            <label className="dx-field-lbl">Name</label>
            <input
              className="dx-inp"
              placeholder="e.g. Worship Team Covenant 2026"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="dx-field">
            <label className="dx-field-lbl">Category</label>
            <select
              className="dx-inp"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="dx-field">
            <label className="dx-field-lbl">Description (optional)</label>
            <textarea
              className="dx-inp dx-textarea"
              rows={2}
              placeholder="Short summary of what this document is for…"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div className="dx-field">
            <label className="dx-field-lbl">Tags</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          {/* Uploaded by */}
          <div className="dx-field">
            <label className="dx-field-lbl">Uploaded by (optional)</label>
            <input
              className="dx-inp"
              placeholder="e.g. Pastor Mike"
              value={uploadedBy}
              onChange={e => setUploadedBy(e.target.value)}
            />
          </div>

          <div className="dx-modal-foot">
            <button type="button" className="dx-btn dx-btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="dx-btn dx-btn-accent"
              disabled={busy || !file || !dataUrl}
            >
              {busy ? 'Saving…' : 'Save Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Category picker (inline popover) ───────────────────────── */
function CategoryPicker({ current, onPick, onClose }) {
  return (
    <div className="dx-modal-overlay" onClick={onClose}>
      <div className="dx-modal dx-modal-small" onClick={e => e.stopPropagation()}>
        <div className="dx-modal-head">
          <span>Change Category</span>
          <button className="dx-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dx-modal-body">
          <div className="dx-cat-list">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                className={`dx-cat-opt dx-cat-${c.id}${current === c.id ? ' on' : ''}`}
                onClick={() => onPick(c.id)}
              >
                <span className="dx-cat-opt-dot" aria-hidden="true" />
                <span className="dx-cat-opt-lbl">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline preview ─────────────────────────────────────────── */
function InlinePreview({ doc }) {
  const kind = getFileKind(doc);
  const [textBody, setTextBody] = useState('');

  /* The file URL is either the new Firebase Storage URL (preferred) or a
     legacy base64 data URL from pre-migration records. */
  const fileUrl = doc.fileUrl || doc.fileDataUrl || '';

  useEffect(() => {
    if (kind !== 'text' || !fileUrl) {
      setTextBody('');
      return;
    }
    if (fileUrl.startsWith('data:')) {
      // Legacy path — synchronously decode the data URL.
      setTextBody(decodeTextDataUrl(fileUrl));
    } else {
      // New path — fetch the text from the Storage URL.
      let cancelled = false;
      fetch(fileUrl).then(r => r.text()).then(t => {
        if (!cancelled) setTextBody(t);
      }).catch(() => {
        if (!cancelled) setTextBody('');
      });
      return () => { cancelled = true; };
    }
  }, [doc.id, fileUrl, kind]);

  if (!fileUrl) {
    return (
      <div className="dx-preview-none">
        Preview not available — file data is missing.
      </div>
    );
  }
  if (kind === 'pdf') {
    return (
      <iframe
        className="dx-preview-iframe"
        src={fileUrl}
        title={`Preview: ${doc.name}`}
      />
    );
  }
  if (kind === 'image') {
    return (
      <div className="dx-preview-image-wrap">
        <img className="dx-preview-image" src={fileUrl} alt={doc.name} />
      </div>
    );
  }
  if (kind === 'text') {
    return <pre className="dx-preview-text">{textBody || '(empty)'}</pre>;
  }
  return (
    <div className="dx-preview-none">
      Preview not available — click <strong>Download Original</strong> to view this file.
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function Documents() {
  /* Document metadata in Firestore; file blobs in Firebase Storage at
     /users/{uid}/documents/<id>.<ext>. Each doc carries fileUrl (for
     download/preview) + storagePath (for delete). */
  const { user } = useAuth();
  const [docs,          setDocs]          = useUserStoreKey('admin:documents', []);
  const [selectedId,    setSelectedId]    = useState(null);
  const [filterCat,     setFilterCat]     = useState('all');
  const [query,         setQuery]         = useState('');
  const [showUpload,    setShowUpload]    = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [armedDelete,   setArmedDelete]   = useState(false);
  const [toast,         setToast]         = useState('');
  const [isEditing,     setIsEditing]     = useState(false);

  /* (useUserStoreKey autosaves and live-syncs across devices.) */

  /* ── Reset armed delete + edit mode on selection change ──────── */
  useEffect(() => { setArmedDelete(false); setIsEditing(false); }, [selectedId]);

  /* ── Derived ───────────────────────────────────────────────── */
  const catCounts = useMemo(() => {
    const c = { all: docs.length };
    for (const cat of CATEGORIES) c[cat.id] = 0;
    for (const d of docs) {
      if (c[d.category] != null) c[d.category] += 1;
      else c.other += 1;
    }
    return c;
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = docs.filter(d => {
      if (filterCat !== 'all' && d.category !== filterCat) return false;
      if (!q) return true;
      if ((d.name || '').toLowerCase().includes(q))         return true;
      if ((d.description || '').toLowerCase().includes(q))  return true;
      if (Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(q))) return true;
      return false;
    });
    return filtered.slice().sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const aT = a.uploadedAt || a.createdAt || '';
      const bT = b.uploadedAt || b.createdAt || '';
      return bT.localeCompare(aT);
    });
  }, [docs, filterCat, query]);

  const selected = useMemo(
    () => docs.find(d => d.id === selectedId) || null,
    [docs, selectedId]
  );

  const totalBytes = useMemo(
    () => docs.reduce((sum, d) => sum + (d.fileSize || 0), 0),
    [docs]
  );

  /* ── CRUD ──────────────────────────────────────────────────── */
  const addDoc = useCallback(async (metadata, file) => {
    if (!user?.uid) return { error: 'You must be signed in to upload documents.' };
    if (!file)      return { error: 'No file selected.' };
    try {
      const { url, path, size, contentType } = await uploadBlob(
        user.uid,
        'documents',
        file,
        { filename: file.name }
      );
      const doc = {
        ...metadata,
        fileUrl:     url,
        storagePath: path,
        fileSize:    size || metadata.fileSize,
        fileType:    contentType || metadata.fileType,
      };
      setDocs(prev => [doc, ...prev]);
      setSelectedId(doc.id);
      return null;
    } catch (err) {
      const code = err?.code || '';
      if (code === 'storage/unauthorized') {
        return { error: 'Upload blocked by Storage rules — publish docs/storage.rules in Firebase Console.' };
      }
      if (/size/i.test(err?.message || '')) {
        return { error: 'File too large — each upload must be under 50 MiB.' };
      }
      return { error: 'Upload failed: ' + (err?.message || 'unknown error') };
    }
  }, [user, setDocs]);

  const updateDoc = useCallback((id, patch) => {
    setDocs(prev => prev.map(d =>
      d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d
    ));
  }, []);

  const removeDoc = useCallback((id) => {
    const target = docs.find(d => d.id === id);
    setDocs(prev => prev.filter(d => d.id !== id));
    if (selectedId === id) setSelectedId(null);
    /* Clean up the Storage blob too — fire-and-forget. */
    if (target?.storagePath) {
      deleteBlobAtPath(target.storagePath).catch(() => {});
    }
  }, [docs, selectedId, setDocs]);

  /* ── Actions ───────────────────────────────────────────────── */
  const handleDelete = () => {
    if (!selected) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    removeDoc(selected.id);
  };

  /* Files now live in Firebase Storage. Use fileUrl with a fallback to
     the legacy fileDataUrl for any pre-migration records. */
  const handleDownload = () => {
    if (!selected) return;
    const fileUrl = selected.fileUrl || selected.fileDataUrl;
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = selected.fileName || `${selected.name || 'document'}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleOpenInNewTab = () => {
    if (!selected) return;
    const fileUrl = selected.fileUrl || selected.fileDataUrl;
    if (!fileUrl) return;
    /* New Storage URLs open directly; legacy data URLs still go through
     * the blob-URL trampoline to avoid issues with some viewers. */
    const url = fileUrl.startsWith('data:') ? dataUrlToBlobUrl(fileUrl) : fileUrl;
    if (!url) {
      setToast("Couldn't open this file in a new tab.");
      return;
    }
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (url.startsWith('blob:')) {
      // Revoke after a delay so the new tab has time to read the URL.
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60_000);
    }
    if (!w) setToast('Pop-up blocked. Allow pop-ups for this site to open documents in a new tab.');
  };

  const togglePinned = () => {
    if (!selected) return;
    updateDoc(selected.id, { pinned: !selected.pinned });
  };

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <WorshipShell title="Documents" icon="📄" subtitle="Shared documents for the worship team — policies, forms, and references.">
    <div className="dx-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="dx-main">
        <div className="dx-layout">
          {/* ─── Sidebar ──────────────────────────────────── */}
          <aside className="dx-side">
            <div className="dx-side-head">
              <span className="dx-side-title">Documents</span>
              <button
                className="dx-btn dx-btn-accent dx-btn-sm"
                onClick={() => setShowUpload(true)}
              >
                📤 Upload
              </button>
            </div>

            {/* Search */}
            <div className="dx-search-wrap">
              <input
                className="dx-inp"
                placeholder="Search name, description, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            {/* Category pills */}
            <div className="dx-pills">
              <button
                className={`dx-pill${filterCat === 'all' ? ' on' : ''}`}
                onClick={() => setFilterCat('all')}
              >
                All <span className="dx-pill-count">{catCounts.all || 0}</span>
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  className={`dx-pill dx-pill-${c.id}${filterCat === c.id ? ' on' : ''}`}
                  onClick={() => setFilterCat(c.id)}
                  title={c.label}
                >
                  <span className="dx-pill-lbl">{c.short}</span>
                  <span className="dx-pill-count">{catCounts[c.id] || 0}</span>
                </button>
              ))}
            </div>

            {/* Storage chip */}
            <div className="dx-storage-chip">
              Storage: {formatBytes(totalBytes)} used
              <span className="dx-muted"> · {docs.length} document{docs.length === 1 ? '' : 's'}</span>
            </div>

            {/* List */}
            <div className="dx-list">
              {filteredDocs.length === 0 ? (
                <div className="dx-list-empty dx-muted">
                  {docs.length === 0 ? 'No documents uploaded yet.' : 'No documents match these filters.'}
                </div>
              ) : (
                filteredDocs.map(d => (
                  <div
                    key={d.id}
                    className={`dx-row${selectedId === d.id ? ' on' : ''}${d.pinned ? ' pinned' : ''}`}
                    onClick={() => setSelectedId(d.id)}
                  >
                    <span className="dx-row-icon" aria-hidden="true">{fileIcon(d)}</span>
                    <div className="dx-row-info">
                      <div className="dx-row-name">
                        {d.pinned && <span className="dx-row-pin" title="Pinned">📌</span>}
                        <span className="dx-row-name-text">{d.name}</span>
                      </div>
                      <div className="dx-row-sub">
                        <span className={`dx-row-cat ${catClass(d.category)}`}>{catShort(d.category)}</span>
                        <span className="dx-row-dot">·</span>
                        <span className="dx-row-size">{formatBytes(d.fileSize)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* ─── Detail ────────────────────────────────────── */}
          <section className="dx-detail">
            {!selected ? (
              <div className="dx-empty">
                <div className="dx-empty-icon">📄</div>
                <div className="dx-empty-title">
                  {docs.length === 0 ? 'No documents yet' : 'No document selected'}
                </div>
                <div className="dx-empty-sub">
                  {docs.length === 0
                    ? 'Store team-facing documents here — covenants, position descriptions, statements of faith, policies, lyrics packets, technical guides.'
                    : 'Choose a document from the sidebar to view and edit.'}
                </div>
                {docs.length === 0 && (
                  <button
                    className="dx-btn dx-btn-accent dx-btn-cta"
                    onClick={() => setShowUpload(true)}
                  >
                    📤 Upload your first doc
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="dx-detail-head">
                  <div className="dx-detail-head-l">
                    <div className="dx-title-row">
                      <button
                        className={`dx-pin-btn${selected.pinned ? ' on' : ''}`}
                        onClick={togglePinned}
                        title={selected.pinned ? 'Unpin' : 'Pin to top'}
                        aria-label={selected.pinned ? 'Unpin document' : 'Pin document'}
                      >📌</button>
                      {isEditing ? (
                        <input
                          className="dx-name-input"
                          value={selected.name}
                          onChange={e => updateDoc(selected.id, { name: e.target.value })}
                          placeholder="Document name"
                          autoFocus
                        />
                      ) : (
                        <span className="dx-name-input dx-name-view">{selected.name}</span>
                      )}
                    </div>

                    <div className="dx-chips">
                      {isEditing ? (
                        <button
                          type="button"
                          className={`dx-chip dx-chip-cat ${catClass(selected.category)}`}
                          onClick={() => setShowCatPicker(true)}
                          title="Change category"
                        >
                          {catLabel(selected.category)}
                        </button>
                      ) : (
                        <span className={`dx-chip dx-chip-cat ${catClass(selected.category)}`}>
                          {catLabel(selected.category)}
                        </span>
                      )}
                      <span className="dx-chip dx-chip-meta" title="Uploaded">
                        Uploaded {formatDate(selected.uploadedAt)}
                      </span>
                      {selected.uploadedBy && (
                        <span className="dx-chip dx-chip-meta">by {selected.uploadedBy}</span>
                      )}
                      <span className="dx-chip dx-chip-file" title={selected.fileName}>
                        {fileIcon(selected)} {selected.fileName || 'file'} · {formatBytes(selected.fileSize)}
                      </span>
                    </div>
                  </div>

                  <div className="dx-detail-head-r">
                    <button className="dx-btn dx-btn-ghost" onClick={handleDownload}>
                      ⬇ Download Original
                    </button>
                    <button className="dx-btn dx-btn-accent" onClick={handleOpenInNewTab}>
                      🔗 Open in New Tab
                    </button>
                    <button
                      className="dx-btn dx-btn-ghost"
                      onClick={() => setIsEditing(v => !v)}
                    >
                      {isEditing ? '✓ Done' : '✏️ Edit'}
                    </button>
                    <button
                      className={`dx-btn${armedDelete ? ' dx-btn-danger-armed' : ' dx-btn-danger'}`}
                      onClick={handleDelete}
                      onBlur={() => setArmedDelete(false)}
                      title={armedDelete ? 'Click again to confirm' : 'Delete document'}
                    >
                      {armedDelete ? 'Confirm Delete' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* Form */}
                <div className="dx-form">
                  {/* Tags */}
                  <div className="dx-field">
                    <label className="dx-field-lbl">Tags</label>
                    {isEditing ? (
                      <TagInput
                        tags={Array.isArray(selected.tags) ? selected.tags : []}
                        onChange={tags => updateDoc(selected.id, { tags })}
                      />
                    ) : (
                      <div className="dx-tag-input dx-tag-input-view">
                        {Array.isArray(selected.tags) && selected.tags.length > 0 ? (
                          selected.tags.map((tag, i) => (
                            <span className="dx-tag-chip" key={`${tag}-${i}`}>
                              <span className="dx-tag-chip-lbl">{tag}</span>
                            </span>
                          ))
                        ) : (
                          <span className="dx-muted">No tags</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="dx-field">
                    <label className="dx-field-lbl">Description</label>
                    {isEditing ? (
                      <textarea
                        className="dx-inp dx-textarea"
                        rows={2}
                        placeholder="Short summary of what this document is for…"
                        value={selected.description || ''}
                        onChange={e => updateDoc(selected.id, { description: e.target.value })}
                      />
                    ) : (
                      <div className="dx-inp dx-textarea dx-view-text">
                        {selected.description || <span className="dx-muted">No description</span>}
                      </div>
                    )}
                  </div>

                  {/* Preview */}
                  <div className="dx-field">
                    <label className="dx-field-lbl">Preview</label>
                    <div className="dx-preview">
                      <InlinePreview doc={selected} />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="dx-field">
                    <label className="dx-field-lbl">Notes</label>
                    {isEditing ? (
                      <textarea
                        className="dx-inp dx-textarea"
                        rows={4}
                        placeholder="Internal notes about this document…"
                        value={selected.notes || ''}
                        onChange={e => updateDoc(selected.id, { notes: e.target.value })}
                      />
                    ) : (
                      <div className="dx-inp dx-textarea dx-view-text">
                        {selected.notes || <span className="dx-muted">No notes</span>}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {showUpload && (
        <UploadDialog
          onSave={addDoc}
          onClose={() => setShowUpload(false)}
          onError={(msg) => setToast(msg)}
        />
      )}

      {showCatPicker && selected && (
        <CategoryPicker
          current={selected.category}
          onPick={(cat) => { updateDoc(selected.id, { category: cat }); setShowCatPicker(false); }}
          onClose={() => setShowCatPicker(false)}
        />
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
    </WorshipShell>
  );
}
