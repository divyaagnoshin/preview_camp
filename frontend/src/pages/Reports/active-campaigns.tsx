import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCampaigns, getJobs } from '../../api/client';
import { Download, Search, BarChart2, Table2, TrendingUp, Users, CheckCircle2, Zap } from 'lucide-react';
import {
  ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV,
  loadSavedCols, saveCols, MiniTable, FilterBar
} from './report-utils';

const ACCENT = '#6366f1';
const GRAD = 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 50%,#7c3aed 100%)';

function fmt(v: any) { return v == null || v === '' ? '—' : String(v); }
function fmtNum(v: any) { return v == null ? '—' : Number(v).toLocaleString(); }
function fmtPct(v: any) { return v == null ? '—' : `${Number(v).toFixed(1)}%`; }
function fmtDate(v: any) { return v ? new Date(v).toLocaleDateString() : '—'; }

// ── Removed 'status' (campaign status) — only job_status remains ─────────────
const DEFAULT_COLS: ColDef[] = [
  { key: 'name', label: 'Campaign Name', visible: true, get: r => fmt(r.name) },
  { key: 'job_status', label: 'Job Status', visible: true, get: r => fmt(r.job_status) },

  { key: 'total_contacts', label: 'Total Contacts', visible: true, get: r => fmtNum(r.total_contacts) },
  { key: 'processed_contacts', label: 'Processed', visible: true, get: r => fmtNum(r.processed_contacts) },
  { key: 'excluded_contacts', label: 'Excluded', visible: true, get: r => fmtNum(r.excluded_contacts) },
  { key: 'prcnt_complete', label: '% Complete', visible: true, get: r => fmtPct(r.prcnt_complete) },
  { key: 'start_time', label: 'Start Time', visible: true, get: r => fmtDate(r.start_time) },

  { key: 'caller_id', label: 'Caller ID', visible: false, get: r => fmt(r.caller_id) },
  { key: 'schedule_type', label: 'Schedule Type', visible: false, get: r => fmt(r.schedule_type) },
  { key: 'max_attempts', label: 'Max Attempts', visible: false, get: r => fmtNum(r.max_attempts) },
  { key: 'wrapup_time_sec', label: 'Wrapup (s)', visible: false, get: r => fmtNum(r.wrapup_time_sec) },
  { key: 'auto_dial_delay_sec', label: 'Dial Delay (s)', visible: false, get: r => fmtNum(r.auto_dial_delay_sec) },


];

const INFINITE_HIDDEN_KEYS = new Set(['job_run_number', 'end_time', 'end_date', 'max_attempts', 'wrapup_time_sec', 'auto_dial_delay_sec']);

// ── Status config ─────────────────────────────────────────────────────────────
const ACTIVE_STATUS = { key: 'active', label: 'Active', color: '#10b981', bg: '#d1fae5' };

// ── Horizontal Bar Progress ───────────────────────────────────────────────────
function ProgressBar({ value, color = '#6366f1', max = 100 }: { value: number; color?: string; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ position: 'relative', height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', width: '100%' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 99,
        width: `${pct}%`, background: color,
        transition: 'width 0.6s cubic-bezier(.16,1,.3,1)',
      }} />
    </div>
  );
}

// ── Line Chart ────────────────────────────────────────────────────────────────
function LineChart({ rows }: { rows: any[] }) {
  const [hov, setHov] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; d: any } | null>(null);

  const data = rows.slice(0, 15).map(r => ({
    name: (r.name || '—').length > 14 ? r.name.slice(0, 13) + '…' : r.name,
    fullName: r.name || '—',
    pct: Math.min(100, Math.max(0, parseFloat(r.prcnt_complete) || 0)),
    attempt: r.total_contacts > 0 ? Math.min(100, ((r.processed_contacts || 0) / r.total_contacts) * 100) : 0,
  }));

  const W = 720, H = 280, PL = 48, PR = 16, PT = 16, PB = 72;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = data.length;

  if (n === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>No data available</div>
  );

  const xOf = (i: number) => n === 1 ? cW / 2 : (i / (n - 1)) * cW;
  const yOf = (v: number) => cH - (v / 100) * cH;
  const yTicks = [0, 25, 50, 75, 100];

  const pctLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${PL + xOf(i)},${PT + yOf(d.pct)}`).join(' ');
  const attLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${PL + xOf(i)},${PT + yOf(d.attempt)}`).join(' ');

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20, paddingLeft: 4 }}>
        {[
          { color: '#10b981', label: '% Complete', dash: false },
          { color: '#6366f1', label: 'Unique Attempt %', dash: true },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            <svg width={28} height={12}>
              <line x1={0} y1={6} x2={28} y2={6} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash ? '5,4' : ''} />
              <circle cx={14} cy={6} r={3.5} fill={l.color} />
            </svg>
            {l.label}
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="lcPct" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="lcAtt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {/* Grid */}
          {yTicks.map(t => (
            <g key={t}>
              <line x1={PL} y1={PT + yOf(t)} x2={PL + cW} y2={PT + yOf(t)}
                stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'}
                strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={PL - 8} y={PT + yOf(t) + 4} textAnchor="end" fontSize={11}
                fill="#94a3b8" fontWeight={600}>{t}%</text>
            </g>
          ))}
          {/* Fill areas */}
          <path d={`${pctLine} L${PL + xOf(n - 1)},${PT + cH} L${PL},${PT + cH} Z`} fill="url(#lcPct)" />
          <path d={`${attLine} L${PL + xOf(n - 1)},${PT + cH} L${PL},${PT + cH} Z`} fill="url(#lcAtt)" />
          {/* Lines */}
          <path d={pctLine} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d={attLine} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6,4" />
          {/* Points */}
          {data.map((d, i) => {
            const isH = hov === i;
            return (
              <g key={i} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { setHov(i); setTip({ x: e.clientX, y: e.clientY, d }); }}
                onMouseLeave={() => { setHov(null); setTip(null); }}
              >
                {isH && <line x1={PL + xOf(i)} y1={PT} x2={PL + xOf(i)} y2={PT + cH}
                  stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4,3" />}
                <circle cx={PL + xOf(i)} cy={PT + yOf(d.pct)} r={isH ? 7 : 4}
                  fill="#10b981" stroke="#fff" strokeWidth={2}
                  style={{ transition: 'r 0.15s' }} />
                <circle cx={PL + xOf(i)} cy={PT + yOf(d.attempt)} r={isH ? 7 : 4}
                  fill="#6366f1" stroke="#fff" strokeWidth={2}
                  style={{ transition: 'r 0.15s' }} />
                {isH && (
                  <>
                    <text x={PL + xOf(i) + 10} y={PT + yOf(d.pct) + 4} fontSize={11} fontWeight={800} fill="#10b981">{d.pct.toFixed(1)}%</text>
                    <text x={PL + xOf(i) + 10} y={PT + yOf(d.attempt) + 4} fontSize={11} fontWeight={800} fill="#6366f1">{d.attempt.toFixed(1)}%</text>
                  </>
                )}
                <text x={PL + xOf(i)} y={PT + cH + 18} textAnchor="middle" fontSize={11}
                  fill={isH ? '#4338ca' : '#94a3b8'} fontWeight={isH ? 700 : 500}
                  transform={n > 5 ? `rotate(-38, ${PL + xOf(i)}, ${PT + cH + 18})` : ''}>
                  {d.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {tip && (
        <div style={{
          position: 'fixed', left: tip.x + 14, top: tip.y - 16, zIndex: 9999, pointerEvents: 'none',
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, lineHeight: 1.9, color: '#1e293b',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontWeight: 800, marginBottom: 4, color: '#6366f1', fontSize: 12 }}>{tip.d.fullName}</div>
          <div style={{ color: '#10b981' }}>● Complete <span style={{ fontWeight: 800 }}>{tip.d.pct.toFixed(1)}%</span></div>
          <div style={{ color: '#6366f1' }}>● Attempt&nbsp;&nbsp;<span style={{ fontWeight: 800 }}>{tip.d.attempt.toFixed(1)}%</span></div>
        </div>
      )}
    </div>
  );
}

// ── Campaign Progress Cards (light theme) ────────────────────────────────────
function CampaignCards({ rows }: { rows: any[] }) {
  const top = rows.slice(0, 6);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {top.map((r, i) => {
        const pct = Math.min(100, parseFloat(r.prcnt_complete) || 0);
        const pctColor = pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
        return (
          <div key={r.id || i} style={{
            background: '#fff', borderRadius: 14,
            border: '1.5px solid #e2e8f0',
            padding: '14px 16px', transition: 'all 0.2s',
            boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a5b4fc'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 18px rgba(99,102,241,0.12)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 6px rgba(0,0,0,0.05)'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 700, color: '#1e293b', lineHeight: 1.4,
                maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {r.name || '—'}
              </p>
              {/* Always Active badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: ACTIVE_STATUS.bg, color: ACTIVE_STATUS.color,
                border: `1px solid ${ACTIVE_STATUS.color}40`,
                whiteSpace: 'nowrap', flexShrink: 0
              }}>
                {ACTIVE_STATUS.label}
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <ProgressBar value={pct} color={pctColor} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                {(r.processed_contacts || 0).toLocaleString()} / {(r.total_contacts || 0).toLocaleString()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: pctColor }}>
                {pct.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Chart View ────────────────────────────────────────────────────────────────
function ActiveCampaignsChartView({ rows, onGoToTable }: { rows: any[]; onGoToTable: () => void }) {
  const totalContacts = rows.reduce((a, r) => a + (r.total_contacts || 0), 0);
  const totalProcessed = rows.reduce((a, r) => a + (r.processed_contacts || 0), 0);
  const avgPct = rows.length ? rows.reduce((a, r) => a + (parseFloat(r.prcnt_complete) || 0), 0) / rows.length : 0;
  const processPct = totalContacts > 0 ? (totalProcessed / totalContacts) * 100 : 0;

  const kpis = [
    { label: 'Active Campaigns', value: rows.length, sub: 'currently running', icon: Zap, color: '#6366f1' },
    { label: 'Total Contacts', value: totalContacts.toLocaleString(), sub: 'across all campaigns', icon: Users, color: '#10b981' },
    { label: 'Processed', value: totalProcessed.toLocaleString(), sub: `${processPct.toFixed(1)}% of total`, icon: CheckCircle2, color: '#ec4899' },
    { label: 'Avg Complete', value: `${avgPct.toFixed(1)}%`, sub: 'mean across campaigns', icon: TrendingUp, color: '#f59e0b' },
  ];

  return (
    <div style={{
      background: '#f8fafc',
      minHeight: '100%', padding: '28px 28px 36px',
      fontFamily: "'DM Sans', 'Nunito', sans-serif",
    }}>
      {/* Go to Table button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <button onClick={onGoToTable} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
          background: '#fff', border: '1.5px solid #e2e8f0',
          color: '#475569', fontSize: 13, fontWeight: 700,
          transition: 'all 0.18s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a5b4fc'; (e.currentTarget as HTMLElement).style.color = '#6366f1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.color = '#475569'; }}
        >
          <Table2 size={15} />
          View Table
        </button>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={{
              background: '#fff', borderRadius: 16,
              border: `1.5px solid ${k.color}20`,
              padding: '18px 20px', position: 'relative', overflow: 'hidden',
              boxShadow: `0 2px 16px ${k.color}10`,
            }}>
              {/* Glow orb */}
              <div style={{
                position: 'absolute', top: -20, right: -20, width: 80, height: 80,
                borderRadius: '50%', background: k.color, opacity: 0.08, filter: 'blur(20px)'
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, background: `${k.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Icon size={16} color={k.color} />
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{k.value}</p>
              <p style={{
                margin: '5px 0 0', fontSize: 11, fontWeight: 800, color: '#475569',
                textTransform: 'uppercase', letterSpacing: '0.06em'
              }}>{k.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{k.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Main Charts Row — line chart full width, no donut needed */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          background: '#fff', borderRadius: 18,
          border: '1.5px solid #e2e8f0', padding: '22px 24px',
          boxShadow: '0 2px 16px rgba(99,102,241,0.06)',
        }}>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.01em' }}>Completion Progress</p>
          <p style={{ margin: '0 0 18px', fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
            % Complete &amp; Unique Attempt per campaign (top 15)
          </p>
          <LineChart rows={rows} />
        </div>
      </div>

      {/* Campaign mini-cards */}
      <div style={{
        background: '#fff', borderRadius: 18,
        border: '1.5px solid #e2e8f0', padding: '22px 22px',
        boxShadow: '0 2px 16px rgba(99,102,241,0.06)',
      }}>
        <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.01em' }}>
          Campaign Snapshot
          <span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginLeft: 8 }}>top 6 campaigns</span>
        </p>
        <CampaignCards rows={rows} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ActiveCampaignsReport({ isMini, onExpand, miniTitle, pal }: { isMini?: boolean; onExpand?: () => void; miniTitle?: string; pal?: any } = {}) {
  const [cols, setCols] = useState<ColDef[]>(() => loadSavedCols('active-campaigns', DEFAULT_COLS));
  const [sortKey, setSortKey] = useState('start_time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [showChart, setShowChart] = useState(false);

  // ── Queries: staleTime 60s prevents refetch on every window focus.
  // Fetch only active campaigns from the server to reduce payload.
  const { data: campData } = useQuery({
    queryKey: ['campaigns', 'active'],
    queryFn: () => getCampaigns({ status: 'active', per_page: 500 }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: jobData } = useQuery({
    queryKey: ['jobs-all'],
    queryFn: () => getJobs({ per_page: 500 }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Removed storage-event listener — cols only change via ColPicker in this tab,
  // and cross-tab sync is not needed for a report page.

  const allRows = useMemo(() => {
    // Only active campaigns — completed / stopped are in other reports
    const campaigns: any[] = (campData?.data || []).filter((c: any) => c.status === 'active');
    const jobs: any[] = jobData?.data || [];
    return campaigns.map(c => {
      const job: any = jobs.find((j: any) => j.campaign_id === c.id) || {};
      return {
        ...c,
        job_status: job.status,
        job_run_number: job.job_run_number,
        total_contacts: job.total_contacts ?? c.total_contacts,
        processed_contacts: job.processed_contacts,
        excluded_contacts: job.excluded_contacts,
        prcnt_complete: job.prcnt_complete,
        start_time: job.start_time,
        end_time: job.end_time,
      };
    });
  }, [campData, jobData]);

  const isAllInfinite = useMemo(() =>
    !!allRows.length && allRows.every(r => (r.schedule_type || '').toLowerCase() === 'infinite'),
    [allRows]
  );

  const effectiveCols = useMemo(() =>
    isAllInfinite ? cols.map(c => INFINITE_HIDDEN_KEYS.has(c.key) ? { ...c, visible: false } : c) : cols,
    [cols, isAllInfinite]
  );

  const rows = useMemo(() => {
    let result = allRows;
    const q = globalQ.trim().toLowerCase();
    if (q) result = result.filter(r => cols.filter(c => c.visible).some(c => c.get(r).toLowerCase().includes(q)));
    Object.entries(colFilters).forEach(([key, vals]) => {
      if (!vals || vals.length === 0) return;
      const col = cols.find(c => c.key === key);
      if (col) result = result.filter(r => vals.some(v => col.get(r).toLowerCase() === v.toLowerCase()));
    });
    return [...result].sort((a, b) => {
      const col = cols.find(c => c.key === sortKey);
      const av = col ? col.get(a) : '', bv = col ? col.get(b) : '';
      return sortDir === 'desc'
        ? bv.localeCompare(av, undefined, { numeric: true })
        : av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [allRows, globalQ, colFilters, sortKey, sortDir, cols]);

  // visCols is memoized so it doesn't recreate on every render
  const visCols = useMemo(() => effectiveCols.filter(c => c.visible), [effectiveCols]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  if (isMini) {
    const miniCols = ['Campaign Name', 'Job Status', 'Total Contacts', '% Complete'];
    const activeCols = DEFAULT_COLS.filter(c => miniCols.includes(c.label));
    const miniRows = rows.slice(0, 5).map(r => ({ cells: activeCols.map(c => c.get(r)) }));
    return <MiniTable title={miniTitle || 'Active Campaigns'} cols={activeCols.map(c => c.label)} rows={miniRows} pal={pal} onExpand={onExpand!} emptyMsg="No campaigns found" />;
  }

  return (
    <div style={{ borderRadius: 16, boxShadow: '0 4px 32px rgba(99,102,241,0.15)', border: '1.5px solid #c7d2fe', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 99, background: GRAD, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Active Campaigns</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{rows.length} record{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Chart / Table toggle */}
            <button
              onClick={() => setShowChart(v => !v)}
              title={showChart ? 'Switch to Table' : 'Switch to Chart'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', height: 36, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: showChart ? '#fff' : 'rgba(255,255,255,0.15)',
                color: showChart ? '#6366f1' : '#fff',
                fontSize: 12.5, fontWeight: 700,
                transition: 'all 0.18s',
                boxShadow: showChart ? '0 2px 12px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              {showChart ? <Table2 size={14} /> : <BarChart2 size={14} />}
              {showChart ? 'Table' : 'Chart'}
            </button>

            {!showChart && (
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <input value={globalQ} onChange={e => setGlobalQ(e.target.value)} placeholder="Search all columns…"
                  style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 200 }} />
              </div>
            )}

            {!showChart && (
              <ColPicker
                cols={effectiveCols}
                onChange={newCols => {
                  setCols(isAllInfinite
                    ? cols.map(c => INFINITE_HIDDEN_KEYS.has(c.key) ? c : newCols.find(n => n.key === c.key) || c)
                    : newCols);
                  saveCols('active-campaigns', newCols);
                }}
                accentColor={ACCENT}
                disabledKeys={isAllInfinite ? INFINITE_HIDDEN_KEYS : undefined}
              />
            )}

            <button onClick={() => exportCSV(rows, cols, 'active-campaigns.csv')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Chart View */}
      {showChart && <ActiveCampaignsChartView rows={rows} onGoToTable={() => setShowChart(false)} />}

      {/* Table View */}
      {!showChart && (
        <>
          <div style={{ position: 'relative', zIndex: 1, overflowX: 'auto', background: '#fff', width: '100%' }}>
            <div style={{ minWidth: visCols.length * 200 }}>
              <FilterBar cols={visCols} rows={allRows} colFilters={colFilters}
                onFilter={(k, v) => setColFilters(f => ({ ...f, [k]: v }))}
                onClearAll={() => setColFilters({})} accentColor={ACCENT} />
              <div style={{ position: 'relative', zIndex: 10, background: GRAD, padding: '10px 22px 18px' }}>
                <TableHeader visCols={visCols} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} accentColor={ACCENT} />
              </div>
              <div style={{ maxHeight: 520, overflowY: 'auto', overflowX: 'hidden' }}>
                {rows.length === 0 ? (
                  <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>No campaigns found</div>
                ) : rows.map((r, idx) => (
                  <div key={r.id} style={{
                    display: 'grid', gridTemplateColumns: `repeat(${visCols.length}, minmax(180px, 1fr))`,
                    gap: 20, padding: '11px 22px', borderBottom: '1px solid #f1f5f9',
                    background: idx % 2 === 0 ? '#fff' : '#f8faff',
                    alignItems: 'center', transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eef2ff'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f8faff'}
                  >
                    {visCols.map(c => (
                      <div key={c.key} style={{ minWidth: 0, overflow: 'hidden', maxWidth: '100%' }}>
                        {c.key === 'job_status' && r[c.key]
                          ? <StatusPill status={r[c.key]} />
                          : <CellText>{c.get(r)}</CellText>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <TableFooter total={rows.length} sortLabel={cols.find(c => c.key === sortKey)?.label || sortKey} sortDir={sortDir} accentColor={ACCENT} />
        </>
      )}
    </div>
  );
}