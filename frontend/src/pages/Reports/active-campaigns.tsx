import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCampaigns, getJobs } from '../../api/client';
import { Download, Search } from 'lucide-react';
import {
  ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV,
  loadSavedCols, saveCols,
} from './report-utils';

const ACCENT = '#6366f1';

function fmt(v: any) { return v == null || v === '' ? '—' : String(v); }
function fmtNum(v: any) { return v == null ? '—' : Number(v).toLocaleString(); }
function fmtPct(v: any) { return v == null ? '—' : `${Number(v).toFixed(1)}%`; }
function fmtDate(v: any) { return v ? new Date(v).toLocaleDateString() : '—'; }

const DEFAULT_COLS: ColDef[] = [
  { key: 'name',               label: 'Campaign Name',   visible: true,  get: r => fmt(r.name) },
  { key: 'status',             label: 'Status',          visible: true,  get: r => fmt(r.status) },
  { key: 'job_status',         label: 'Job Status',      visible: true,  get: r => fmt(r.job_status) },
  { key: 'job_run_number',     label: 'Run #',           visible: true,  get: r => fmtNum(r.job_run_number) },
  { key: 'total_contacts',     label: 'Total Contacts',  visible: true,  get: r => fmtNum(r.total_contacts) },
  { key: 'processed_contacts', label: 'Processed',       visible: true,  get: r => fmtNum(r.processed_contacts) },
  { key: 'excluded_contacts',  label: 'Excluded',        visible: true,  get: r => fmtNum(r.excluded_contacts) },
  { key: 'prcnt_complete',     label: '% Complete',      visible: true,  get: r => fmtPct(r.prcnt_complete) },
  { key: 'start_time',         label: 'Start Time',      visible: true,  get: r => fmtDate(r.start_time) },
  { key: 'end_time',           label: 'End Time',        visible: false, get: r => fmtDate(r.end_time) },
  { key: 'caller_id',          label: 'Caller ID',       visible: false, get: r => fmt(r.caller_id) },
  { key: 'schedule_type',      label: 'Schedule Type',   visible: false, get: r => fmt(r.schedule_type) },
  { key: 'max_attempts',       label: 'Max Attempts',    visible: false, get: r => fmtNum(r.max_attempts) },
  { key: 'wrapup_time_sec',    label: 'Wrapup (s)',      visible: false, get: r => fmtNum(r.wrapup_time_sec) },
  { key: 'auto_dial_delay_sec',label: 'Dial Delay (s)',  visible: false, get: r => fmtNum(r.auto_dial_delay_sec) },
  { key: 'start_date',         label: 'Start Date',      visible: false, get: r => fmtDate(r.start_date) },
  { key: 'end_date',           label: 'End Date',        visible: false, get: r => fmtDate(r.end_date) },
  { key: 'created_at',         label: 'Created At',      visible: false, get: r => fmtDate(r.created_at) },
];

export default function ActiveCampaignsReport() {
  const [cols, setCols] = useState<ColDef[]>(() => loadSavedCols('active-campaigns', DEFAULT_COLS));
  const [sortKey, setSortKey] = useState('start_time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const { data: campData } = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns });
  const { data: jobData }  = useQuery({ queryKey: ['jobs-all'], queryFn: () => getJobs({ per_page: 500 }) });

  const rows = useMemo(() => {
    const campaigns: any[] = campData?.data || [];
    const jobs: any[] = jobData?.data || [];
    const merged = campaigns.map(c => {
      const job: any = jobs.find((j: any) => j.campaign_id === c.id) || {};
      return {
        ...c,
        job_status: job.status, job_run_number: job.job_run_number,
        total_contacts: job.total_contacts ?? c.total_contacts,
        processed_contacts: job.processed_contacts, excluded_contacts: job.excluded_contacts,
        prcnt_complete: job.prcnt_complete, start_time: job.start_time, end_time: job.end_time,
      };
    });
    let result = merged;
    const q = globalQ.trim().toLowerCase();
    if (q) result = result.filter(r => cols.filter(c => c.visible).some(c => c.get(r).toLowerCase().includes(q)));
    Object.entries(colFilters).forEach(([key, val]) => {
      if (!val) return;
      const col = cols.find(c => c.key === key);
      if (col) result = result.filter(r => col.get(r).toLowerCase().includes(val.toLowerCase()));
    });
    return [...result].sort((a, b) => {
      const col = cols.find(c => c.key === sortKey);
      const av = col ? col.get(a) : '', bv = col ? col.get(b) : '';
      const n = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'desc' ? -n : n;
    });
  }, [campData, jobData, globalQ, colFilters, sortKey, sortDir, cols]);

  const visCols = cols.filter(c => c.visible);
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(99,102,241,0.15)', border: '1.5px solid #c7d2fe' }}>
      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 50%,#7c3aed 100%)', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Active Campaigns</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{rows.length} record{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
              <input
                value={globalQ} onChange={e => setGlobalQ(e.target.value)}
                placeholder="Search all columns…"
                style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 200 }}
              />
            </div>
            <ColPicker cols={cols} onChange={newCols => { setCols(newCols); saveCols('active-campaigns', newCols); }} accentColor={ACCENT} />
            <button
              onClick={() => exportCSV(rows, cols, 'active-campaigns.csv')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>
        <TableHeader
          visCols={visCols} sortKey={sortKey} sortDir={sortDir}
          colFilters={colFilters} onSort={toggleSort}
          onFilter={(k, v) => setColFilters(f => ({ ...f, [k]: v }))}
          accentColor={ACCENT}
        />
      </div>

      {/* ── Body ── */}
      <div style={{ maxHeight: 520, overflowY: 'auto', overflowX: 'auto', background: '#fff' }}>
        {rows.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>No campaigns found</div>
        ) : rows.map((r, idx) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${visCols.length}, minmax(100px, 1fr))`,
              gap: 4, padding: '11px 22px',
              borderBottom: '1px solid #f1f5f9',
              background: idx % 2 === 0 ? '#fff' : '#f8faff',
              alignItems: 'center', transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eef2ff'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f8faff'}
          >
            {visCols.map(c => (
              <div key={c.key} style={{ minWidth: 0 }}>
                {(c.key === 'status' || c.key === 'job_status') && r[c.key]
                  ? <StatusPill status={r[c.key]} />
                  : <CellText>{c.get(r)}</CellText>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <TableFooter
        total={rows.length}
        sortLabel={cols.find(c => c.key === sortKey)?.label || sortKey}
        sortDir={sortDir}
        accentColor={ACCENT}
      />
    </div>
  );
}
