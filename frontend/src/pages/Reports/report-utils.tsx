/**
 * Shared utility components for all Report sub-pages.
 * Handles: click-outside closing, proper column grid, text contrast.
 */
import { useState, useEffect, useRef } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';

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

// ── Column filter popup ────────────────────────────────────────────────────
export function ColFilter({
  label, value, onChange, accentColor = '#6366f1',
}: { label: string; value: string; onChange: (v: string) => void; accentColor?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title={`Filter ${label}`}
        style={{
          background: value ? `${accentColor}22` : 'none',
          border: value ? `1px solid ${accentColor}55` : 'none',
          cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
          display: 'inline-flex', alignItems: 'center',
          color: value ? accentColor : 'rgba(255,255,255,0.45)',
          transition: 'all 0.15s',
        }}
      >
        <Filter size={10} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
            background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
            padding: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', minWidth: 190,
            fontFamily: '"DM Sans", sans-serif',
          }}
          onClick={e => e.stopPropagation()}
        >
          <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
            Filter: {label}
          </p>
          <input
            autoFocus
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Type to filter…"
            style={{
              width: '100%', fontSize: 12.5, padding: '6px 10px', borderRadius: 7,
              border: `1.5px solid ${value ? accentColor : '#e2e8f0'}`,
              outline: 'none', boxSizing: 'border-box', color: '#1e293b',
              transition: 'border-color 0.15s',
            }}
          />
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              style={{
                marginTop: 8, fontSize: 11, color: accentColor, background: `${accentColor}10`,
                border: `1px solid ${accentColor}30`, borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              }}
            >
              <X size={10} /> Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Column picker panel ────────────────────────────────────────────────────
export function ColPicker({
  cols, onChange, accentColor = '#6366f1',
}: { cols: ColDef[]; onChange: (c: ColDef[]) => void; accentColor?: string }) {
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
            {cols.map((c, i) => (
              <label
                key={c.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '6px 8px', cursor: 'pointer', borderRadius: 7,
                  background: c.visible ? `${accentColor}08` : 'transparent',
                  transition: 'background 0.12s',
                }}
              >
                <input
                  type="checkbox"
                  checked={c.visible}
                  onChange={e => onChange(cols.map((x, j) => j === i ? { ...x, visible: e.target.checked } : x))}
                  style={{ accentColor, width: 14, height: 14, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: c.visible ? '#1e293b' : '#94a3b8', fontWeight: c.visible ? 600 : 400 }}>
                  {c.label}
                </span>
              </label>
            ))}
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

// ── Table header row ───────────────────────────────────────────────────────
export function TableHeader({
  visCols, sortKey, sortDir, colFilters, onSort, onFilter, accentColor,
}: {
  visCols: ColDef[];
  sortKey: string; sortDir: 'asc' | 'desc';
  colFilters: Record<string, string>;
  onSort: (k: string) => void;
  onFilter: (k: string, v: string) => void;
  accentColor: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${visCols.length}, minmax(90px, 1fr))`,
        gap: 4, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 10,
        minWidth: 0,
      }}
    >
      {visCols.map(c => (
        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
          <SortBtn colKey={c.key} label={c.label} sortKey={sortKey} sortDir={sortDir} onSort={onSort} accentColor={accentColor} />
          <ColFilter label={c.label} value={colFilters[c.key] || ''} onChange={v => onFilter(c.key, v)} accentColor={accentColor} />
        </div>
      ))}
    </div>
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
        gridTemplateColumns: `repeat(${visCols.length}, minmax(90px, 1fr))`,
        gap: 4, padding: '10px 20px',
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
        <div key={col.key} style={{ minWidth: 0, overflow: 'hidden' }}>
          {renderCell(col, row)}
        </div>
      ))}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { color: string; bg: string; dot: string }> = {
  active:    { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  inactive:  { color: '#374151', bg: '#f1f5f9', dot: '#9ca3af' },
  paused:    { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  draft:     { color: '#6d28d9', bg: '#f5f3ff', dot: '#8b5cf6' },
  completed: { color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  running:   { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  stopped:   { color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
  pending:   { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  available: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  with_agent:{ color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  offline:   { color: '#374151', bg: '#f1f5f9', dot: '#9ca3af' },
  connected: { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  no_answer: { color: '#374151', bg: '#f1f5f9', dot: '#9ca3af' },
  busy:      { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  voicemail: { color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  failed:    { color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
  accepted:  { color: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  rejected:  { color: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
  wrap_up:   { color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
};

export function StatusPill({ status }: { status: string }) {
  if (!status || status === '—') return <span style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>—</span>;
  const s = STATUS_MAP[status.toLowerCase()] ?? { color: '#1e293b', bg: '#f1f5f9', dot: '#64748b' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 11px', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
      border: `1px solid ${s.dot}55`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  );
}

// ── Cell text ──────────────────────────────────────────────────────────────
export function CellText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 14.5, color: '#0f172a', fontWeight: 650,
      fontVariantNumeric: 'tabular-nums',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      display: 'block',
    }}>
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

// ── Column storage helpers ────────────────────────────────────────────────
export function loadSavedCols(reportId: string, defaultCols: ColDef[]): ColDef[] {
  try {
    const saved = localStorage.getItem(`reports_cols_${reportId}`);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      return defaultCols.map(c => ({
        ...c,
        visible: parsed[c.key] !== undefined ? parsed[c.key] : c.visible,
      }));
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

