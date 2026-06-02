import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInteractions, getFieldLibrary } from '../../api/client';
import { Download, Search } from 'lucide-react';
import {
  ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV,
  loadSavedCols, saveCols,
} from './report-utils';

const ACCENT = '#10b981';

function fmt(v: any) { return v == null || v === '' ? '—' : String(v); }
function fmtNum(v: any) { return v == null ? '—' : Number(v).toLocaleString(); }
function fmtDate(v: any) { return v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

// Base columns from contact_interactions schema
const BASE_COLS: ColDef[] = [
  { key: 'disposition_code',  label: 'Disposition Code',  visible: true,  get: r => fmt(r.disposition_code_label) },
  { key: 'disposition_notes', label: 'Notes',             visible: true,  get: r => fmt(r.disposition_notes) },
  { key: 'contact_name',      label: 'Contact',           visible: true,  get: r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—' },
  { key: 'phone_number',      label: 'Phone',             visible: true,  get: r => fmt(r.phone_number) },
  { key: 'agent_name',        label: 'Agent',             visible: true,  get: r => fmt(r.agent_name) },
  { key: 'campaign_name',     label: 'Campaign',          visible: true,  get: r => fmt(r.campaign_name) },
  { key: 'call_status',       label: 'Call Status',       visible: true,  get: r => fmt(r.call_status) },
  { key: 'attempt_number',    label: 'Attempt #',         visible: true,  get: r => fmtNum(r.attempt_number) },
  { key: 'talk_time_sec',     label: 'Talk Time (s)',     visible: true,  get: r => fmtNum(r.talk_time_sec) },
  { key: 'wrapup_duration',   label: 'Wrapup (s)',        visible: true,  get: r => fmtNum(r.wrapup_duration_sec) },
  { key: 'total_handling',    label: 'Total Handle (s)',  visible: true,  get: r => fmtNum(r.total_handling_sec) },
  { key: 'given_at',          label: 'Given At',          visible: true,  get: r => fmtDate(r.given_at) },
  { key: 'dial_mode',         label: 'Dial Mode',         visible: false, get: r => fmt(r.dial_mode) },
  { key: 'channel_type',      label: 'Channel',           visible: false, get: r => fmt(r.channel_type) },
  { key: 'dialed_at',         label: 'Dialed At',         visible: false, get: r => fmtDate(r.dialed_at) },
  { key: 'answered_at',       label: 'Answered At',       visible: false, get: r => fmtDate(r.answered_at) },
  { key: 'disconnected_at',   label: 'Disconnected At',   visible: false, get: r => fmtDate(r.disconnected_at) },
  { key: 'reschedule_at',     label: 'Reschedule At',     visible: false, get: r => fmtDate(r.reschedule_at) },
  { key: 'recording_url',     label: 'Recording',         visible: false, get: r => fmt(r.recording_url) },
];

// Build contact-attribute columns from field library data
function buildAttrCols(fields: any[]): ColDef[] {
  return (fields || []).map((f: any) => ({
    key: `attr_${f.field_key}`,
    label: f.name || f.field_key,
    visible: false,
    get: (r: any) => {
      // Contact attributes are usually nested under r.attributes or r.contact_attributes
      const attrs = r.attributes || r.contact_attributes || r.custom_fields || {};
      const val = attrs[f.field_key];
      return val == null || val === '' ? '—' : String(val);
    },
  }));
}

export default function DispositionReport() {
  const [page, setPage] = useState(1);
  const PER = 100;

  const { data: intData, isLoading } = useQuery({ queryKey: ['interactions-disp'], queryFn: () => getInteractions({ per_page: 500 }) });
  const { data: fieldData } = useQuery({ queryKey: ['field-library'], queryFn: getFieldLibrary });

  // Build full column set: base + contact attributes
  const allCols = useMemo<ColDef[]>(() => {
    const attrCols = buildAttrCols(fieldData?.data || []);
    return loadSavedCols('disposition-report', [...BASE_COLS, ...attrCols]);
  }, [fieldData]);

  const [cols, setCols] = useState<ColDef[]>([]);
  // Sync when allCols are ready (field library loaded)
  const effectiveCols = cols.length > 0 ? cols : allCols;

  const [sortKey, setSortKey] = useState('given_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    let result: any[] = (intData?.data || []).filter((r: any) => r.disposition_code_id || r.disposition_code_label);
    const q = globalQ.trim().toLowerCase();
    if (q) result = result.filter(r => effectiveCols.filter(c => c.visible).some(c => c.get(r).toLowerCase().includes(q)));
    Object.entries(colFilters).forEach(([key, val]) => {
      if (!val) return;
      const col = effectiveCols.find(c => c.key === key);
      if (col) result = result.filter(r => col.get(r).toLowerCase().includes(val.toLowerCase()));
    });
    return [...result].sort((a, b) => {
      const col = effectiveCols.find(c => c.key === sortKey);
      const av = col ? col.get(a) : '', bv = col ? col.get(b) : '';
      return sortDir === 'desc' ? bv.localeCompare(av, undefined, { numeric: true }) : av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [intData, globalQ, colFilters, sortKey, sortDir, effectiveCols]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER));
  const paginated = rows.slice((page - 1) * PER, page * PER);
  const visCols = effectiveCols.filter(c => c.visible);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(16,185,129,0.15)', border: '1.5px solid #a7f3d0' }}>
      <div style={{ background: 'linear-gradient(135deg,#064e3b 0%,#059669 50%,#34d399 100%)', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Disposition Report</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>
              {rows.length} records with disposition · includes contact attributes
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
              <input value={globalQ} onChange={e => setGlobalQ(e.target.value)} placeholder="Search…"
                style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 200 }} />
            </div>
            <ColPicker cols={effectiveCols} onChange={c => { setCols(c); saveCols('disposition-report', c); }} accentColor={ACCENT} />
            <button onClick={() => exportCSV(rows, effectiveCols, 'disposition-report.csv')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>
        <TableHeader visCols={visCols} sortKey={sortKey} sortDir={sortDir}
          colFilters={colFilters} onSort={toggleSort}
          onFilter={(k, v) => setColFilters(f => ({ ...f, [k]: v }))} accentColor={ACCENT} />
      </div>

      <div style={{ maxHeight: 520, overflowY: 'auto', overflowX: 'auto', background: '#fff' }}>
        {isLoading ? (
          <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>Loading…</div>
        ) : paginated.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>No disposition records found</div>
        ) : paginated.map((r, idx) => (
          <div key={r.interaction_id || idx} style={{
            display: 'grid', gridTemplateColumns: `repeat(${visCols.length}, minmax(100px, 1fr))`,
            gap: 4, padding: '11px 22px', borderBottom: '1px solid #f1f5f9',
            background: idx % 2 === 0 ? '#fff' : '#f0fdf4',
            alignItems: 'center', transition: 'background 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#dcfce7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f0fdf4'}
          >
            {visCols.map(c => (
              <div key={c.key} style={{ minWidth: 0 }}>
                {c.key === 'call_status' && r.call_status
                  ? <StatusPill status={r.call_status} />
                  : <CellText>{c.get(r)}</CellText>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <TableFooter total={rows.length} sortLabel={effectiveCols.find(c => c.key === sortKey)?.label || sortKey}
        sortDir={sortDir} accentColor={ACCENT}
        page={page} totalPages={totalPages}
        onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
    </div>
  );
}
