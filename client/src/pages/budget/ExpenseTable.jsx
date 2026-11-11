import { CAT_BY_KEY, PAID_WITH, formatDate, formatMoney } from './budgetHelpers';

/* ─── Expense list: table + expandable detail rows ──────────── */
export default function ExpenseTable({
  expenses, filteredExpenses,
  expandedId, setExpandedId,
  armedDel, setArmedDel, openEdit, handleDelete, openNew,
}) {
  if (filteredExpenses.length === 0) {
    return (
      <div className="bg-empty">
        <div className="bg-empty-icon" aria-hidden="true">💰</div>
        <div className="bg-empty-title">No expenses in this view</div>
        <div className="bg-empty-sub">
          {expenses.length === 0
            ? 'Start tracking your ministry spend by adding your first expense.'
            : 'Try widening the date range or clearing the filters.'}
        </div>
        <div className="bg-empty-actions">
          <button className="bg-btn bg-btn-accent" onClick={openNew}>+ Add Expense</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-table">
      <div className="bg-thead">
        <div className="bg-th bg-th-date">Date</div>
        <div className="bg-th bg-th-vendor">Vendor</div>
        <div className="bg-th bg-th-cat">Category</div>
        <div className="bg-th bg-th-desc">Description</div>
        <div className="bg-th bg-th-amt">Amount</div>
        <div className="bg-th bg-th-actions">Actions</div>
      </div>
      <div className="bg-tbody">
        {filteredExpenses.map(e => {
          const cat = CAT_BY_KEY[e.category] || CAT_BY_KEY.other;
          const isExpanded = expandedId === e.id;
          /* receiptUrl is the current Firebase Storage URL; receiptDataUrl
             is kept only as a fallback for records saved before the
             Storage migration. */
          const receiptSrc = e.receiptUrl || e.receiptDataUrl || '';
          return (
            <div key={e.id} className={`bg-tr-wrap ${isExpanded ? 'bg-tr-wrap-open' : ''}`}>
              <div
                className="bg-tr"
                onClick={() => setExpandedId(isExpanded ? null : e.id)}
              >
                <div className="bg-td bg-td-date">{formatDate(e.date)}</div>
                <div className="bg-td bg-td-vendor">
                  <span className="bg-vendor-name">{e.vendor || '—'}</span>
                  {e.reimbursable && (
                    <span className="bg-tag bg-tag-reimb" title="Reimbursable">REIMB</span>
                  )}
                </div>
                <div className="bg-td bg-td-cat">
                  <span className="bg-cat-chip">
                    <span aria-hidden="true">{cat.icon}</span>
                    <span>{cat.label}</span>
                  </span>
                </div>
                <div className="bg-td bg-td-desc">{e.description || '—'}</div>
                <div className="bg-td bg-td-amt">{formatMoney(e.amount)}</div>
                <div className="bg-td bg-td-actions" onClick={ev => ev.stopPropagation()}>
                  <button
                    className="bg-btn bg-btn-ghost bg-btn-sm"
                    onClick={() => openEdit(e)}
                  >
                    Edit
                  </button>
                  <button
                    className={`bg-btn bg-btn-sm ${armedDel === e.id ? 'bg-btn-danger-armed' : 'bg-btn-danger'}`}
                    onClick={() => handleDelete(e.id)}
                    onBlur={() => setArmedDel(null)}
                    title={armedDel === e.id ? 'Click again to confirm' : 'Delete expense'}
                  >
                    {armedDel === e.id ? 'Confirm' : 'Delete'}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="bg-tr-detail">
                  <div className="bg-detail-grid">
                    <div>
                      <div className="bg-detail-lbl">Paid with</div>
                      <div className="bg-detail-val">
                        {PAID_WITH.find(p => p.key === e.paidWith)?.label || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="bg-detail-lbl">Reimbursable</div>
                      <div className="bg-detail-val">{e.reimbursable ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="bg-detail-wide">
                      <div className="bg-detail-lbl">Notes</div>
                      <div className="bg-detail-val">{e.notes || '—'}</div>
                    </div>
                    {receiptSrc && (
                      <div className="bg-detail-wide">
                        <div className="bg-detail-lbl">Receipt</div>
                        <a href={receiptSrc} target="_blank" rel="noreferrer">
                          <img className="bg-receipt-thumb-lg" src={receiptSrc} alt="Receipt" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
