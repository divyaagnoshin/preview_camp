/**
 * Shared utility components for all Report sub-pages.
 * Handles: click-outside closing, proper column grid, text contrast.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Check, X, ChevronDown, ChevronUp, Settings2, Search } from 'lucide-react';

export interface ColDef {
  key: string;
  label: string;
  visible: boolean;
  get: (r: any) => string;
}

// ── Click-outside hook ─────────────────────────────────────────────────────
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// ── Filter dropdown (used inside FilterBar) ────────────────────────────────
function FilterDropdown({
  label, values, onChange, options, accentColor = '#6366f1',
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(''); });

  const hasActive = values.length > 0;
  const cleanOptions = options.filter(o => o !== '—');
  const filtered = cleanOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  function toggle(opt: string) {
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);
  }

  React.useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: hasActive ? `1.5px solid ${accentColor}` : `1.5px solid ${accentColor}30`,
          background: hasActive ? `${accentColor}16` : `${accentColor}08`,
          color: hasActive ? accentColor : '#334155',
          fontSize: 13, fontWeight: hasActive ? 700 : 500,
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}{hasActive ? ` (${values.length})` : ''}
        </span>
        {hasActive && (
          <span
            onClick={e => { e.stopPropagation(); onChange([]); }}
            style={{ display: 'inline-flex', opacity: 0.65, cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={9} />
          </span>
        )}
        <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown popup */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 9999,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)', width: 200,
          fontFamily: '"DM Sans", sans-serif', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '9px 11px 8px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {label}
              </span>
              {hasActive && (
                <button
                  onClick={() => onChange([])}
                  style={{ fontSize: 10, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer', padding: '2px 7px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <X size={8} /> Clear
                </button>
              )}
            </div>
            {/* Search — always shown */}
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ width: '100%', fontSize: 12, padding: '5px 8px 5px 24px', border: '1.5px solid #e2e8f0', borderRadius: 7, outline: 'none', boxSizing: 'border-box', color: '#1e293b', background: '#fff', fontFamily: '"DM Sans", sans-serif' }}
              />
            </div>
          </div>

          {/* Options list — scrollable */}
          <div style={{ maxHeight: 230, overflowY: 'auto', padding: '5px 5px' }}>
            {cleanOptions.length === 0 ? (
              <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                No options available
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                No matches for "{search}"
              </div>
            ) : filtered.map(opt => {
              const checked = values.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: checked ? `${accentColor}14` : 'transparent',
                    color: checked ? accentColor : '#1e293b',
                    fontSize: 12.5, fontWeight: checked ? 700 : 400, textAlign: 'left',
                    transition: 'background 0.1s', boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                    border: checked ? `2px solid ${accentColor}` : '2px solid #cbd5e1',
                    background: checked ? accentColor : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}>
                    {checked && <Check size={9} color="#fff" strokeWidth={3} />}
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: '6px 11px', borderTop: '1px solid #f1f5f9', background: '#fafafa', fontSize: 10.5, color: '#64748b', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>{hasActive ? `${values.length} of ${cleanOptions.length} selected` : `${cleanOptions.length} option${cleanOptions.length !== 1 ? 's' : ''}`}</span>
            {search && filtered.length !== cleanOptions.length && <span>{filtered.length} shown</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FilterBar — placed ABOVE the table, outside any scroll container ────────
export function FilterBar({
  cols, rows, colFilters, onFilter, onClearAll, accentColor = '#6366f1',
}: {
  cols: ColDef[];
  rows: any[];
  colFilters: Record<string, string[]>;
  onFilter: (k: string, v: string[]) => void;
  onClearAll: () => void;
  accentColor?: string;
}) {
  // Build option lists from unfiltered rows
  const optionMap = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    cols.forEach(col => {
      const vals = new Set<string>();
      rows.forEach(r => {
        const v = col.get(r);
        if (v && v !== '—') vals.add(v);
      });
      map[col.key] = Array.from(vals).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    return map;
  }, [cols, rows]);

  const totalActive = cols.reduce((sum, c) => sum + (colFilters[c.key]?.length || 0), 0);

  return (
    <div style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8edf4', padding: '10px 22px 8px' }}>
      {/* Row 1: filter dropdowns */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, marginRight: 2 }}>
          Filter:
        </span>
        {cols.map(col => (
          <FilterDropdown
            key={col.key}
            label={col.label}
            values={colFilters[col.key] || []}
            options={optionMap[col.key] || []}
            onChange={v => onFilter(col.key, v)}
            accentColor={accentColor}
          />
        ))}
        {totalActive > 0 && (
          <button
            onClick={onClearAll}
            style={{
              fontSize: 11, color: '#ef4444', background: '#fef2f2',
              border: '1.5px solid #fecaca', borderRadius: 7,
              padding: '5px 10px', cursor: 'pointer', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            }}
          >
            <X size={9} /> Clear all
          </button>
        )}
      </div>

      {/* Row 2: active filter tags (shown when any filter is active) */}
      {totalActive > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>Active:</span>
          {cols.flatMap(col =>
            (colFilters[col.key] || []).map(v => (
              <span
                key={`${col.key}-${v}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: `${accentColor}10`, color: accentColor,
                  border: `1px solid ${accentColor}28`,
                  borderRadius: 99, padding: '2px 8px 2px 10px',
                  fontSize: 11, fontWeight: 600,
                }}
              >
                <span style={{ color: '#64748b', fontWeight: 400 }}>{col.label}:</span>&nbsp;{v}
                <span
                  onClick={() => onFilter(col.key, (colFilters[col.key] || []).filter(x => x !== v))}
                  style={{ cursor: 'pointer', display: 'inline-flex', opacity: 0.55, marginLeft: 2 }}
                >
                  <X size={8} />
                </span>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Table header row (sort only — filter is now in FilterBar above) ─────────
export function TableHeader({
  visCols, sortKey, sortDir, onSort, accentColor,
  // Legacy props accepted but unused (FilterBar handles filtering now)
  colFilters: _colFilters, onFilter: _onFilter, rows: _rows,
}: {
  visCols: ColDef[];
  sortKey: string; sortDir: 'asc' | 'desc';
  onSort: (k: string) => void;
  accentColor: string;
  colFilters?: Record<string, string[]>;
  onFilter?: (k: string, v: string[]) => void;
  rows?: any[];
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${visCols.length}, minmax(160px, 1fr))`,
      gap: 16, width: '100%', boxSizing: 'border-box', alignItems: 'center',
      borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10, paddingBottom: 6,
    }}>
      {visCols.map(c => {
        const isSorted = sortKey === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onSort(c.key)}
            title={`Sort by ${c.label}`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 0',
              color: '#fff', fontSize: 11.5, fontWeight: 900,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              textAlign: 'left', width: '100%', minWidth: 0, minHeight: 22,
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.label}
            </span>
            {isSorted
              ? (sortDir === 'desc' ? <ChevronDown size={11} style={{ flexShrink: 0 }} /> : <ChevronUp size={11} style={{ flexShrink: 0 }} />)
              : <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.25 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Column picker panel ────────────────────────────────────────────────────
export function ColPicker({
  cols, onChange, accentColor = '#6366f1', disabledKeys,
}: { cols: ColDef[]; onChange: (c: ColDef[]) => void; accentColor?: string; disabledKeys?: Set<string> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const visCount = cols.filter(c => c.visible).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: '1.5px solid rgba(255,255,255,0.25)',
          background: open ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        <Settings2 size={13} />
        Columns
        <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
          {visCount}
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
            padding: '14px 16px', zIndex: 9999,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            minWidth: 220, maxHeight: 360, overflowY: 'auto',
            fontFamily: '"DM Sans", sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#64748b', margin: 0 }}>
              Toggle Columns
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onChange(cols.map(c => ({ ...c, visible: true })))}
                style={{ fontSize: 10, color: accentColor, background: `${accentColor}12`, border: `1px solid ${accentColor}30`, borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontWeight: 700 }}
              >
                All
              </button>
              <button
                onClick={() => onChange(cols.map(c => ({ ...c, visible: false })))}
                style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontWeight: 700 }}
              >
                None
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cols.map((c, i) => {
              const isDisabled = disabledKeys?.has(c.key);
              return (
                <label
                  key={c.key}
                  title={isDisabled ? 'Not applicable for Infinite schedule campaigns' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '6px 8px', cursor: isDisabled ? 'not-allowed' : 'pointer', borderRadius: 7,
                    background: isDisabled ? '#f8fafc' : c.visible ? `${accentColor}08` : 'transparent',
                    transition: 'background 0.12s',
                    opacity: isDisabled ? 0.45 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.visible}
                    disabled={isDisabled}
                    onChange={e => onChange(cols.map((x, j) => j === i ? { ...x, visible: e.target.checked } : x))}
                    style={{ accentColor, width: 14, height: 14, flexShrink: 0, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: isDisabled ? '#94a3b8' : c.visible ? '#1e293b' : '#94a3b8', fontWeight: c.visible && !isDisabled ? 600 : 400, flex: 1 }}>
                    {c.label}
                  </span>
                  {isDisabled && (
                    <span style={{ fontSize: 9, color: '#94a3b8', background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>N/A</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sort header button ─────────────────────────────────────────────────────
export function SortBtn({
  colKey, label, sortKey, sortDir, onSort,
}: {
  colKey: string; label: string;
  sortKey: string; sortDir: 'asc' | 'desc';
  onSort: (k: string) => void;
  accentColor?: string;
}) {
  const active = sortKey === colKey;
  return (
    <button
      onClick={() => onSort(colKey)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3, padding: 0,
        color: '#ffffff',
        fontSize: 12.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em',
        textShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'color 0.15s',
      }}
    >
      {label}
      {active
        ? (sortDir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />)
        : <span style={{ width: 10 }} />}
    </button>
  );
}



// ── Table body row ─────────────────────────────────────────────────────────
export function TableRow({
  visCols, row, idx, rowBg, hoverBg, renderCell,
}: {
  visCols: ColDef[];
  row: any;
  idx: number;
  rowBg: (idx: number) => string;
  hoverBg: string;
  renderCell: (col: ColDef, row: any) => React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${visCols.length}, minmax(180px, 1fr))`,
        gap: 20, padding: '10px 20px',
        borderBottom: '1px solid #f1f5f9',
        background: rowBg(idx),
        alignItems: 'center',
        transition: 'background 0.1s',
        minWidth: 0,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = hoverBg}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = rowBg(idx)}
    >
      {visCols.map(col => (
        <div key={col.key} style={{ minWidth: 0, overflow: 'hidden', maxWidth: '100%' }}>
          {renderCell(col, row)}
        </div>
      ))}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { color: string; bg: string; dot: string }> = {
  active: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  inactive: { color: '#374151', bg: '#f1f5f9', dot: '#9ca3af' },
  paused: { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  draft: { color: '#6d28d9', bg: '#f5f3ff', dot: '#8b5cf6' },
  completed: { color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  running: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  stopped: { color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
  pending: { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  available: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  with_agent: { color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  offline: { color: '#374151', bg: '#f1f5f9', dot: '#9ca3af' },
  connected: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  no_answer: { color: '#374151', bg: '#f1f5f9', dot: '#9ca3af' },
  busy: { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  voicemail: { color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  failed: { color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
  accepted: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  rejected: { color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
  wrap_up: { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
};

export function StatusPill({ status }: { status: string }) {
  if (!status || status === '—') return <span style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>—</span>;
  const s = STATUS_MAP[status.toLowerCase()] ?? { color: '#1e293b', bg: '#f1f5f9', dot: '#64748b' };
  return (
    <span
      title={status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 12,
        background: s.bg, color: s.color,
        fontSize: 11.5, fontWeight: 800,
        whiteSpace: 'nowrap', overflow: 'hidden',
        maxWidth: '100%',
        border: `1px solid ${s.dot}55`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    </span>
  );
}

// ── Cell text ──────────────────────────────────────────────────────────────
export function CellText({ children }: { children: React.ReactNode }) {
  return (
    <span
      title={typeof children === 'string' ? children : undefined}
      style={{
        fontSize: 13.5, color: '#0f172a', fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'block', maxWidth: '100%',
      }}
    >
      {children}
    </span>
  );
}

// ── CSV export helper ──────────────────────────────────────────────────────
export function exportCSV(rows: any[], cols: ColDef[], filename: string) {
  const vis = cols.filter(c => c.visible);
  const header = vis.map(c => `"${c.label}"`).join(',');
  const body = rows.map(r => vis.map(c => `"${c.get(r).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// ── Page footer ────────────────────────────────────────────────────────────
export function TableFooter({
  total, sortLabel, sortDir, accentColor,
  page, totalPages, onPrev, onNext,
}: {
  total: number; sortLabel: string; sortDir: string; accentColor: string;
  page?: number; totalPages?: number; onPrev?: () => void; onNext?: () => void;
}) {
  return (
    <div style={{
      padding: '8px 20px', background: '#f8fafc',
      borderTop: '1px solid #f1f5f9',
      fontSize: 11, color: '#64748b',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontWeight: 600 }}>{total.toLocaleString()} rows</span>
      {page !== undefined && totalPages !== undefined && onPrev && onNext && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            disabled={page === 1}
            onClick={onPrev}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 6,
              border: '1.5px solid #e2e8f0', background: '#fff', cursor: page === 1 ? 'default' : 'pointer',
              color: page === 1 ? '#d1d5db' : '#374151', fontWeight: 600,
            }}
          >← Prev</button>
          <span style={{ fontWeight: 700, color: '#475569' }}>Page {page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={onNext}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 6,
              border: '1.5px solid #e2e8f0', background: '#fff', cursor: page === totalPages ? 'default' : 'pointer',
              color: page === totalPages ? '#d1d5db' : '#374151', fontWeight: 600,
            }}
          >Next →</button>
        </div>
      )}
      <span>
        Sorted by <b style={{ color: accentColor }}>{sortLabel}</b>
        <span style={{ marginLeft: 4, opacity: 0.7 }}>({sortDir})</span>
      </span>
    </div>
  );
}

export function loadSavedCols(reportId: string, defaultCols: ColDef[]): ColDef[] {
  try {
    const saved = localStorage.getItem(`reports_cols_${reportId}`);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      const loaded = defaultCols.map(c => ({
        ...c,
        visible: parsed[c.key] !== undefined ? parsed[c.key] : c.visible,
      }));
      // If at least one column is visible, return loaded configuration. Otherwise fall back to defaults!
      if (loaded.some(c => c.visible)) {
        return loaded;
      }
    }
  } catch (e) {
    console.error('Error loading columns from localStorage', e);
  }
  return defaultCols;
}

export function saveCols(reportId: string, cols: ColDef[]) {
  try {
    const state = cols.reduce((acc, c) => {
      acc[c.key] = c.visible;
      return acc;
    }, {} as Record<string, boolean>);
    localStorage.setItem(`reports_cols_${reportId}`, JSON.stringify(state));
  } catch (e) {
    console.error('Error saving columns to localStorage', e);
  }
}

// ── Palette ────────────────────────────────────────────────────────────────
export const PALETTE = [
  { accent: '#6366f1', grad: 'linear-gradient(135deg,#1e1b4b,#4338ca,#7c3aed)', border: '#c7d2fe', row: '#f0f4ff', hover: '#eef2ff' },
  { accent: '#0ea5e9', grad: 'linear-gradient(135deg,#0c4a6e,#0284c7,#38bdf8)', border: '#bae6fd', row: '#f0f9ff', hover: '#e0f2fe' },
  { accent: '#10b981', grad: 'linear-gradient(135deg,#064e3b,#059669,#34d399)', border: '#a7f3d0', row: '#f0fdf4', hover: '#dcfce7' },
  { accent: '#f59e0b', grad: 'linear-gradient(135deg,#78350f,#d97706,#fbbf24)', border: '#fde68a', row: '#fffbeb', hover: '#fef3c7' },
  { accent: '#ec4899', grad: 'linear-gradient(135deg,#831843,#be185d,#f472b6)', border: '#f9a8d4', row: '#fdf2f8', hover: '#fce7f3' },
];

// ── Mini table card ────────────────────────────────────────────────────────
export function MiniTable({
  title, cols, rows, pal, emptyMsg = 'No data', onExpand,
}: {
  title: string; cols: string[];
  rows: { cells: any[] }[];
  pal: typeof PALETTE[0]; emptyMsg?: string; onExpand: () => void;
}) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${pal.border}`, boxShadow: `0 2px 16px ${pal.accent}18` }}>
      {/* Header */}
      <div style={{ background: pal.grad, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{title}</span>
        <button
          onClick={onExpand}
          style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          Full Report →
        </button>
      </div>

      {/* Col headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(60px,1fr))`, gap: 4, padding: '10px 20px', background: `${pal.accent}08`, borderBottom: `1px solid ${pal.accent}22` }}>
        {cols.map(c => (
          <span key={c} style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.09em', color: pal.accent }}>
            {c}
          </span>
        ))}
      </div>

      {/* Rows — fixed height, no flex stretching */}
      {rows.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 15, color: '#94a3b8', background: '#fff' }}>
          {emptyMsg}
        </div>
      ) : (
        <>
          {rows.slice(0, 5).map((r, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols.length}, minmax(60px,1fr))`,
              gap: 4,
              padding: '13px 20px',
              borderBottom: `1px solid ${pal.accent}11`,
              background: i % 2 === 0 ? '#fff' : pal.row,
              alignItems: 'center',
            }}>
              {r.cells.map((cell, j) => (
                <span key={j} style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {cell}
                </span>
              ))}
            </div>
          ))}
          {rows.length > 5 && (
            <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 13, color: '#94a3b8', background: '#f8fafc' }}>
              +{rows.length - 5} more rows
            </div>
          )}
        </>
      )}
    </div>
  );
}