import { useState, useRef, useEffect } from 'react';
import { CATEGORIES, PAID_WITH, todayISO } from './budgetHelpers';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // receipts upload to Firebase Storage, not localStorage

/* ─── Add / Edit Expense Modal ─────────────────────────────── */
export default function ExpenseModal({ initial, vendors, onSave, onCancel, onError }) {
  const [date,         setDate]         = useState(initial?.date         || todayISO());
  const [vendor,       setVendor]       = useState(initial?.vendor       || '');
  const [category,     setCategory]     = useState(initial?.category     || 'equipment');
  const [description,  setDescription]  = useState(initial?.description  || '');
  const [amount,       setAmount]       = useState(initial?.amount       != null ? String(initial.amount) : '');
  const [paidWith,     setPaidWith]     = useState(initial?.paidWith     || 'card');
  const [reimbursable, setReimbursable] = useState(!!initial?.reimbursable);
  const [notes,        setNotes]        = useState(initial?.notes        || '');

  /* Receipt: a File pending upload (receiptFile), a preview URL for the
     thumbnail (existing Storage URL, legacy data URL, or a fresh local
     object URL), and a flag telling the parent to delete the existing
     Storage blob when the user clears it without picking a replacement. */
  const [receiptFile,    setReceiptFile]    = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(initial?.receiptUrl || initial?.receiptDataUrl || '');
  const [removeReceipt,  setRemoveReceipt]  = useState(false);
  const [receiptWarn,    setReceiptWarn]    = useState('');

  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);
  const fileRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setReceiptWarn('Please choose an image file.');
      e.target.value = '';
      return;
    }
    if (f.size > MAX_RECEIPT_BYTES) {
      setReceiptWarn(`That receipt is ${(f.size / (1024 * 1024)).toFixed(1)} MB — try something under ${MAX_RECEIPT_BYTES / (1024 * 1024)} MB.`);
      e.target.value = '';
      return;
    }
    setReceiptWarn('');
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const preview = URL.createObjectURL(f);
    objectUrlRef.current = preview;
    setReceiptFile(f);
    setReceiptPreview(preview);
    setRemoveReceipt(false);
  }

  function clearReceipt() {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setReceiptFile(null);
    setReceiptPreview('');
    setReceiptWarn('');
    setRemoveReceipt(true);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = vendor.trim();
    const amt = parseFloat(amount);
    if (!v) { setError('Vendor is required.'); return; }
    if (!category) { setError('Category is required.'); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount must be a positive number.'); return; }
    if (!date) { setError('Date is required.'); return; }
    setError('');
    setBusy(true);
    try {
      await onSave({
        date,
        vendor: v,
        category,
        description: description.trim(),
        amount: Math.round(amt * 100) / 100,
        paidWith,
        reimbursable,
        notes: notes.trim(),
      }, receiptFile, removeReceipt);
    } catch (err) {
      onError?.(err?.message || 'Could not save expense.');
    } finally {
      setBusy(false);
    }
  }

  const isEdit = !!initial?.id;

  return (
    <div className="bg-modal-overlay" onClick={onCancel}>
      <form className="bg-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="bg-modal-head">
          <span>{isEdit ? 'Edit Expense' : 'Add Expense'}</span>
          <button type="button" className="bg-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="bg-modal-body">
          {error && <div className="bg-error">{error}</div>}

          <div className="bg-form-row">
            <div className="bg-field">
              <label className="bg-lbl">Date</label>
              <input
                className="bg-inp"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="bg-field">
              <label className="bg-lbl">Amount</label>
              <div className="bg-amount-wrap">
                <span className="bg-amount-prefix">$</span>
                <input
                  className="bg-inp bg-inp-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-form-row">
            <div className="bg-field">
              <label className="bg-lbl">Vendor</label>
              <input
                className="bg-inp"
                type="text"
                placeholder="e.g. Sweetwater, Amazon"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                list="bg-vendors"
                autoFocus
              />
              <datalist id="bg-vendors">
                {vendors.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="bg-field">
              <label className="bg-lbl">Category</label>
              <select
                className="bg-inp"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-field">
            <label className="bg-lbl">Description</label>
            <input
              className="bg-inp"
              type="text"
              placeholder="What was bought and why"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="bg-field">
            <label className="bg-lbl">Paid with</label>
            <div className="bg-radio-row">
              {PAID_WITH.map(p => (
                <label key={p.key} className={`bg-radio ${paidWith === p.key ? 'bg-radio-active' : ''}`}>
                  <input
                    type="radio"
                    name="bg-paid-with"
                    value={p.key}
                    checked={paidWith === p.key}
                    onChange={() => setPaidWith(p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-field">
            <label className="bg-toggle">
              <input
                type="checkbox"
                checked={reimbursable}
                onChange={e => setReimbursable(e.target.checked)}
              />
              <span className="bg-toggle-track" aria-hidden="true">
                <span className="bg-toggle-thumb" />
              </span>
              <span className="bg-toggle-lbl">
                Reimbursable
                <span className="bg-toggle-hint"> — fronted by a team member</span>
              </span>
            </label>
          </div>

          <div className="bg-field">
            <label className="bg-lbl">Receipt (optional)</label>
            <div className="bg-receipt-row">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="bg-file-inp"
                onChange={onFile}
              />
              {receiptPreview && (
                <>
                  <img className="bg-receipt-thumb" src={receiptPreview} alt="Receipt preview" />
                  <button type="button" className="bg-btn bg-btn-ghost bg-btn-sm" onClick={clearReceipt}>
                    Remove
                  </button>
                </>
              )}
            </div>
            {receiptWarn && <div className="bg-hint bg-hint-warn">{receiptWarn}</div>}
          </div>

          <div className="bg-field">
            <label className="bg-lbl">Notes</label>
            <textarea
              className="bg-inp bg-textarea"
              rows={3}
              placeholder="Any extra context…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <footer className="bg-modal-ft">
          <button type="button" className="bg-btn bg-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="bg-btn bg-btn-accent" disabled={busy}>
            {busy ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Expense')}
          </button>
        </footer>
      </form>
    </div>
  );
}
