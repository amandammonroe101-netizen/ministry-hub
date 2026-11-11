import { MONTH_NAMES, formatMoney } from './budgetHelpers';

/* ─── Category breakdown (bar chart for the selected month) ─── */
export default function CategoryBreakdown({ year, month, categoryBreakdown }) {
  return (
    <section className="bg-section">
      <div className="bg-section-head">
        <h2 className="bg-section-title">Category breakdown</h2>
        <div className="bg-section-sub">
          {MONTH_NAMES[month]} {year} · {formatMoney(categoryBreakdown.totalSpend)} total
        </div>
      </div>
      <div className="bg-cat-list">
        {categoryBreakdown.totalSpend === 0 ? (
          <div className="bg-cat-empty">No expenses recorded for this month yet.</div>
        ) : (
          categoryBreakdown.rows.map(row => (
            <div key={row.key} className={`bg-cat-row ${row.amount === 0 ? 'bg-cat-row-zero' : ''}`}>
              <div className="bg-cat-name">
                <span className="bg-cat-icon" aria-hidden="true">{row.icon}</span>
                <span>{row.label}</span>
              </div>
              <div className="bg-cat-bar-wrap">
                <div className="bg-cat-bar" style={{ width: `${row.pct}%` }} />
              </div>
              <div className="bg-cat-amt">{formatMoney(row.amount)}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
