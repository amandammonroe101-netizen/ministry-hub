import { MONTH_NAMES, formatMoney } from './budgetHelpers';

/* ─────────────────────────────────────────────────────────────
   BudgetSummary — month nav + the 3 stat cards (spent / budget /
   remaining), including the inline "click to set budget" editor.
   ───────────────────────────────────────────────────────────── */
export default function BudgetSummary({
  year, month, onShiftMonth, onToday,
  summary, curMonthBudget, hasMonthOverride, defaultMonthly,
  editingBudget, budgetDraft, setBudgetDraft,
  onStartEdit, onSaveBudget, onSaveDefault, onClearBudget, onCancelEdit,
}) {
  const remainingPositive = summary.remaining >= 0;
  const overByLabel = !remainingPositive
    ? `${formatMoney(Math.abs(summary.remaining))} over`
    : '';

  return (
    <section className="bg-section">
      <div className="bg-month-nav">
        <button
          className="bg-icon-btn bg-month-arrow"
          onClick={() => onShiftMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="bg-month-label">{MONTH_NAMES[month]} {year}</div>
        <button
          className="bg-icon-btn bg-month-arrow"
          onClick={() => onShiftMonth(1)}
          aria-label="Next month"
        >
          ›
        </button>
        <button className="bg-btn bg-btn-ghost bg-btn-sm bg-today-btn" onClick={onToday}>
          Today
        </button>
      </div>

      <div className="bg-stats">
        <div className="bg-stat">
          <div className="bg-stat-num">{formatMoney(summary.monthSpent)}</div>
          <div className="bg-stat-lbl">Spent this month</div>
        </div>

        <button
          className={`bg-stat bg-stat-clickable ${editingBudget ? 'bg-stat-editing' : ''}`}
          type="button"
          onClick={() => !editingBudget && onStartEdit()}
          title="Click to set monthly budget"
        >
          {editingBudget ? (
            <div className="bg-stat-edit" onClick={e => e.stopPropagation()}>
              <div className="bg-stat-edit-row">
                <span className="bg-amount-prefix">$</span>
                <input
                  className="bg-inp bg-inp-amount bg-inp-budget"
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={budgetDraft}
                  onChange={e => setBudgetDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); onSaveBudget(); }
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                />
              </div>
              <div className="bg-stat-edit-actions">
                <button type="button" className="bg-btn bg-btn-accent bg-btn-sm" onClick={onSaveBudget}>
                  Save
                </button>
                <button type="button" className="bg-btn bg-btn-ghost bg-btn-sm" onClick={onSaveDefault}>
                  Set as default
                </button>
                <button type="button" className="bg-btn bg-btn-ghost bg-btn-sm" onClick={onClearBudget}>
                  Clear
                </button>
                <button type="button" className="bg-btn bg-btn-ghost bg-btn-sm" onClick={onCancelEdit}>
                  Cancel
                </button>
              </div>
              {defaultMonthly > 0 && (
                <div className="bg-hint">Default: {formatMoney(defaultMonthly)}/mo</div>
              )}
            </div>
          ) : (
            <>
              <div className="bg-stat-num">
                {curMonthBudget > 0 ? formatMoney(curMonthBudget) : '—'}
              </div>
              <div className="bg-stat-lbl">
                Budget this month
                {curMonthBudget === 0 && <span className="bg-stat-cta"> · click to set</span>}
                {curMonthBudget > 0 && !hasMonthOverride && <span className="bg-stat-cta"> · default</span>}
              </div>
            </>
          )}
        </button>

        <div className={`bg-stat ${remainingPositive ? 'bg-stat-pos' : 'bg-stat-neg'}`}>
          <div className={`bg-stat-num ${remainingPositive ? 'bg-num-pos' : 'bg-num-neg'}`}>
            {curMonthBudget > 0 ? formatMoney(Math.abs(summary.remaining)) : '—'}
          </div>
          <div className="bg-stat-lbl">
            {curMonthBudget > 0
              ? (remainingPositive
                  ? 'Remaining'
                  : <>Over budget <span className="bg-over-tag">· {overByLabel}</span></>)
              : 'Remaining (no budget)'}
          </div>
        </div>

        <div className="bg-stat">
          <div className="bg-stat-num">{formatMoney(summary.ytdSpent)}</div>
          <div className="bg-stat-lbl">YTD spent ({year})</div>
        </div>
      </div>
    </section>
  );
}
