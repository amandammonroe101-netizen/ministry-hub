import { CATEGORIES, CAT_BY_KEY } from './budgetHelpers';

/* ─── Filter bar + active-filter pills above the expense table ── */
export default function ExpenseFilters({
  filterCategory, setFilterCategory,
  filterVendor, setFilterVendor,
  filterFrom, filterTo, setFilterRangeManual,
  snapFilterToMonth, handleExport, exportDisabled,
}) {
  return (
    <div className="bg-filterbar">
      <div className="bg-filter-row">
        <div className="bg-filter-field">
          <label className="bg-lbl">Category</label>
          <select
            className="bg-inp"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.icon}  {c.label}</option>
            ))}
          </select>
        </div>
        <div className="bg-filter-field bg-filter-field-wide">
          <label className="bg-lbl">Vendor</label>
          <input
            className="bg-inp"
            type="text"
            placeholder="Search vendors…"
            value={filterVendor}
            onChange={e => setFilterVendor(e.target.value)}
          />
        </div>
        <div className="bg-filter-field">
          <label className="bg-lbl">From</label>
          <input
            className="bg-inp"
            type="date"
            value={filterFrom}
            onChange={e => setFilterRangeManual('from', e.target.value)}
          />
        </div>
        <div className="bg-filter-field">
          <label className="bg-lbl">To</label>
          <input
            className="bg-inp"
            type="date"
            value={filterTo}
            onChange={e => setFilterRangeManual('to', e.target.value)}
          />
        </div>
        <div className="bg-filter-actions">
          <button
            className="bg-btn bg-btn-ghost bg-btn-sm"
            onClick={snapFilterToMonth}
            title="Snap range to the selected month"
          >
            Month view
          </button>
          <button
            className="bg-btn bg-btn-ghost bg-btn-sm"
            onClick={handleExport}
            disabled={exportDisabled}
          >
            Export CSV
          </button>
        </div>
      </div>

      {(filterCategory || filterVendor) && (
        <div className="bg-pills">
          {filterCategory && (
            <span className="bg-pill">
              {CAT_BY_KEY[filterCategory]?.icon} {CAT_BY_KEY[filterCategory]?.label}
              <button className="bg-pill-x" onClick={() => setFilterCategory('')} aria-label="Clear category">✕</button>
            </span>
          )}
          {filterVendor && (
            <span className="bg-pill">
              Vendor: "{filterVendor}"
              <button className="bg-pill-x" onClick={() => setFilterVendor('')} aria-label="Clear vendor">✕</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
