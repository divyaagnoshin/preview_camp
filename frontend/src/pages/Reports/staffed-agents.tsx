import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgentSessions } from '../../api/client';
import { Download, Search, Table2, BarChart2 } from 'lucide-react';
import {
  ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV,
  loadSavedCols, saveCols, MiniTable, FilterBar
} from './report-utils';

const ACCENT = '#0ea5e9';
const GRAD = 'linear-gradient(135deg,#0c4a6e 0%,#0284c7 50%,#38bdf8 100%)';

function fmt(v: any) { return v == null || v === '' ? '—' : String(v); }
function fmtNum(v: any) { return v == null ? '—' : Number(v).toLocaleString(); }
function fmtDate(v: any) { return v ? new Date(v).toLocaleTimeString() : '—'; }
function fmtElapsed(from: string | null): string {
  if (!from) return '—';
  const secs = Math.floor((Date.now() - new Date(from).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

const DEFAULT_COLS: ColDef[] = [
  { key: 'agent_id', label: 'Agent ID', visible: true, get: r => fmt(r.agent_id) },
  { key: 'agent_name', label: 'Agent Name', visible: true, get: r => fmt(r.agent_name) },
  { key: 'agent_state', label: 'Agent State', visible: true, get: r => fmt(r.status) },
  { key: 'call_state', label: 'Call State', visible: true, get: r => fmt(r.call_state) },
  { key: 'agent_job_state', label: 'Agent Job State', visible: true, get: r => fmt(r.job_state) },
  { key: 'agent_state_time', label: 'Agent State Time', visible: true, get: r => fmtElapsed(r.login_at) },
  { key: 'login_at', label: 'Login At', visible: true, get: r => fmtDate(r.login_at) },
  { key: 'acquire_state', label: 'Acquire State', visible: true, get: r => fmt(r.acquire_state) },
  { key: 'call_state_time', label: 'Call State Time', visible: true, get: r => fmtElapsed(r.call_started_at) },
  { key: 'call_count', label: 'Call Count', visible: true, get: r => fmtNum(r.call_count) },
  { key: 'current_campaign', label: 'Current Campaign', visible: true, get: r => fmt(r.current_campaign_name) },
  { key: 'last_heartbeat', label: 'Last Heartbeat', visible: false, get: r => fmtElapsed(r.last_heartbeat_at) },
];

const STATE_COLS = new Set(['agent_state', 'call_state', 'agent_job_state', 'acquire_state']);

// ── Big Donut ─────────────────────────────────────────────────────────────────
function BigDonut({
  title, data, total,
}: {
  title: string;
  data: { label: string; count: number; color: string }[];
  total: number;
}) {
  const [hov, setHov] = useState<string | null>(null);
  const R = 62, ri = 38, CX = 72, CY = 72;
  let angle = -Math.PI / 2;

  const arcs = data.map(d => {
    const sweep = total > 0 ? (d.count / total) * 2 * Math.PI : 0;
    const ea = angle + sweep;
    const path = sweep > 0.01 ? [
      `M${CX + R * Math.cos(angle)},${CY + R * Math.sin(angle)}`,
      `A${R},${R} 0 ${sweep > Math.PI ? 1 : 0},1 ${CX + R * Math.cos(ea)},${CY + R * Math.sin(ea)}`,
      `L${CX + ri * Math.cos(ea)},${CY + ri * Math.sin(ea)}`,
      `A${ri},${ri} 0 ${sweep > Math.PI ? 1 : 0},0 ${CX + ri * Math.cos(angle)},${CY + ri * Math.sin(angle)}`,
      'Z',
    ].join(' ') : '';
    angle = ea;
    return { ...d, path, pct: total > 0 ? ((d.count / total) * 100).toFixed(1) : '0.0' };
  });

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 16px rgba(14,165,233,0.08)', border: '1.5px solid #e0f2fe' }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e', margin: '0 0 14px', letterSpacing: '-0.01em', textAlign: 'center' }}>{title}</p>
      {/* Horizontal row: donut + legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width={144} height={144} style={{ flexShrink: 0 }}>
          {total === 0
            ? <circle cx={CX} cy={CY} r={(R + ri) / 2} fill="none" stroke="#e0f2fe" strokeWidth={R - ri} />
            : arcs.map(a => a.path && (
              <path key={a.label} d={a.path} fill={a.color}
                stroke="#fff" strokeWidth={2}
                opacity={hov && hov !== a.label ? 0.2 : 1}
                onMouseEnter={() => setHov(a.label)}
                onMouseLeave={() => setHov(null)}
                style={{ cursor: 'pointer', transition: 'opacity 0.18s' }}
              />
            ))
          }
          <text x={CX} y={CY - 10} textAnchor="middle" fontSize={24} fontWeight={900} fill="#0c4a6e">{total}</text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize={10} fill="#64748b" fontWeight={700}>TOTAL</text>
          {hov && (() => {
            const a = arcs.find(x => x.label === hov);
            return a ? (
              <>
                <text x={CX} y={CY + 26} textAnchor="middle" fontSize={10} fill={a.color} fontWeight={700}>{a.label}</text>
                <text x={CX} y={CY + 40} textAnchor="middle" fontSize={9} fill="#94a3b8">{a.pct}%</text>
              </>
            ) : null;
          })()}
        </svg>
        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
          {arcs.map(a => (
            <div key={a.label}
              onMouseEnter={() => setHov(a.label)}
              onMouseLeave={() => setHov(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px', borderRadius: 8,
                background: hov === a.label ? `${a.color}12` : '#f8fafc',
                border: `1.5px solid ${hov === a.label ? a.color + '35' : '#f1f5f9'}`,
                cursor: 'default', transition: 'all 0.15s',
                opacity: hov && hov !== a.label ? 0.35 : 1,
              }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0, boxShadow: `0 0 0 2px ${a.color}22` }} />
              <span style={{ fontSize: 12, color: '#334155', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: a.color }}>{a.count}</span>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{a.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Chart View ─────────────────────────────────────────────────────────────────
function StaffedAgentsChartView({ rows }: { rows: any[] }) {
  const total = rows.length;

  // Call State
  const callMap: Record<string, number> = {};
  rows.forEach(r => {
    const raw = (r.call_state || '').toLowerCase();
    let key = 'Other';
    if (raw.includes('talk') || raw === 'on_call') key = 'Talking';
    else if (raw.includes('wrap')) key = 'Wrapup';
    else if (raw.includes('preview')) key = 'Preview';
    else if (raw === 'idle' || raw === 'available') key = 'Idle';
    callMap[key] = (callMap[key] || 0) + 1;
  });
  const callData = [
    { label: 'Talking', count: callMap['Talking'] || 0, color: '#f97316' },
    { label: 'Wrapup', count: callMap['Wrapup'] || 0, color: '#10b981' },
    { label: 'Preview', count: callMap['Preview'] || 0, color: '#f59e0b' },
    { label: 'Idle', count: callMap['Idle'] || 0, color: '#eab308' },
    { label: 'Other', count: callMap['Other'] || 0, color: '#3b82f6' },
  ];

  // Agent State
  const agentMap: Record<string, number> = {};
  rows.forEach(r => {
    const raw = (r.status || '').toLowerCase();
    let key = 'Other';
    if (raw === 'busy') key = 'Busy';
    else if (raw.includes('not') && (raw.includes('ready') || raw.includes('r'))) key = 'Not Ready';
    else if (raw === 'available' || raw === 'ready') key = 'Ready';
    agentMap[key] = (agentMap[key] || 0) + 1;
  });
  const agentData = [
    { label: 'Busy', count: agentMap['Busy'] || 0, color: '#8b5cf6' },
    { label: 'Not Ready', count: agentMap['Not Ready'] || 0, color: '#ef4444' },
    { label: 'Ready', count: agentMap['Ready'] || 0, color: '#10b981' },
    { label: 'Other', count: agentMap['Other'] || 0, color: '#3b82f6' },
  ];

  // Agent Job State
  const jobMap: Record<string, number> = {};
  rows.forEach(r => {
    const raw = (r.job_state || '').toLowerCase();
    let key = 'Other';
    if (raw === 'assigned' || raw === 'attached') key = 'Attached';
    else if (raw === 'none' || raw === 'detached') key = 'Detached';
    else if (raw === 'inbound') key = 'Inbound';
    jobMap[key] = (jobMap[key] || 0) + 1;
  });
  const jobData = [
    { label: 'Attached', count: jobMap['Attached'] || 0, color: '#10b981' },
    { label: 'Detached', count: jobMap['Detached'] || 0, color: '#7f1d1d' },
    { label: 'Inbound', count: jobMap['Inbound'] || 0, color: '#f59e0b' },
    { label: 'Other', count: jobMap['Other'] || 0, color: '#3b82f6' },
  ];

  // Acquire State
  const acqMap: Record<string, number> = {};
  rows.forEach(r => {
    const raw = (r.acquire_state || '').toLowerCase();
    const key = raw === 'acquiring' ? 'Acquiring' : 'Not Acquiring';
    acqMap[key] = (acqMap[key] || 0) + 1;
  });
  const acqData = [
    { label: 'Acquiring', count: acqMap['Acquiring'] || 0, color: '#10b981' },
    { label: 'Not Acquiring', count: acqMap['Not Acquiring'] || 0, color: '#ec4899' },
  ];

  const onCallCount = rows.filter(r => r.current_contact_id).length;
  const totalCalls = rows.reduce((a, r) => a + (r.call_count || 0), 0);
  const avgCalls = total ? (totalCalls / total).toFixed(1) : '0';

  const kpis = [
    { label: 'Active Agents', value: total, color: '#0ea5e9', bg: '#f0f9ff' },
    { label: 'On Call Now', value: onCallCount, color: '#6366f1', bg: '#eef2ff' },
    { label: 'Total Calls Made', value: totalCalls.toLocaleString(), color: '#10b981', bg: '#ecfdf5' },
    { label: 'Avg Calls / Agent', value: avgCalls, color: '#f59e0b', bg: '#fffbeb' },
  ];

  return (
    <div style={{ background: '#f0f9ff', padding: '28px 32px 36px' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: '#fff', borderRadius: 14, padding: '20px 22px',
            border: `1.5px solid ${k.color}20`,
            boxShadow: `0 2px 16px ${k.color}10`,
          }}>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* 4 Donuts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
        <BigDonut title="Call State" data={callData} total={total} />
        <BigDonut title="Agent State" data={agentData} total={total} />
        <BigDonut title="Agent Job State" data={jobData} total={total} />
        <BigDonut title="Acquire State" data={acqData} total={total} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StaffedAgentsReport({ isMini, onExpand, miniTitle, pal }: { isMini?: boolean; onExpand?: () => void; miniTitle?: string; pal?: any } = {}) {
  const [cols, setCols] = useState<ColDef[]>(() => loadSavedCols('staffed-agents', DEFAULT_COLS));
  const [sortKey, setSortKey] = useState('agent_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [showChart, setShowChart] = useState(false);

  // Storage listener removed — not needed; cols only change via ColPicker in this tab.

  // refetchInterval keeps data live (10s); staleTime prevents extra refetch on window focus
  const { data: sessData } = useQuery({
    queryKey: ['agent-sessions-live'],
    queryFn: listAgentSessions,
    refetchInterval: 10_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const allRows = useMemo(() => {
    const sessions: any[] = sessData?.data || [];
    const activeSessions = sessions.filter(s => !s.logout_at && s.status !== 'offline');
    return activeSessions.map(s => ({
      ...s,
      call_state: s.current_contact_id ? 'on_call' : (s.status === 'available' ? 'idle' : s.status),
      job_state: s.selected_job_ids?.length > 0 ? 'assigned' : 'none',
      acquire_state: s.current_job_id ? 'acquiring' : 'idle',
      call_started_at: s.current_contact_id ? s.last_heartbeat_at : null,
      call_count: s.call_count ?? 0,
    }));
  }, [sessData]);

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

  // Memoized so it's not recomputed on every render
  const visCols = useMemo(() => cols.filter(c => c.visible), [cols]);
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  if (isMini) {
    const miniCols = ['Agent Name', 'Agent State', 'Call State'];
    const activeCols = DEFAULT_COLS.filter(c => miniCols.includes(c.label));
    const miniRows = rows.slice(0, 5).map(r => ({ cells: activeCols.map(c => c.get(r)) }));
    return <MiniTable title={miniTitle || 'Staffed Agents (Live)'} cols={activeCols.map(c => c.label)} rows={miniRows} pal={pal} onExpand={onExpand!} emptyMsg="No active agents" />;
  }

  return (
    <div style={{ borderRadius: 16, boxShadow: '0 4px 32px rgba(2,132,199,0.15)', border: '1.5px solid #bae6fd', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ position: 'relative', zIndex: 99, background: GRAD, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Staffed Agents (Live)</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{rows.length} active agent{rows.length !== 1 ? 's' : ''} logged in</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Chart toggle — top right */}
            <button
              onClick={() => setShowChart(v => !v)}
              title={showChart ? 'Switch to Table' : 'Switch to Chart'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', height: 36, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: showChart ? '#fff' : 'rgba(255,255,255,0.15)',
                color: showChart ? '#0284c7' : '#fff',
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
                <input value={globalQ} onChange={e => setGlobalQ(e.target.value)} placeholder="Search agents…"
                  style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(251, 243, 243, 0.84)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 200 }} />
              </div>
            )}
            {!showChart && (
              <ColPicker cols={cols} onChange={newCols => { setCols(newCols); saveCols('staffed-agents', newCols); }} accentColor={ACCENT} />
            )}

            <button onClick={() => exportCSV(rows, cols, 'staffed-agents.csv')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Chart View (replaces table) ── */}
      {showChart && <StaffedAgentsChartView rows={rows} />}

      {/* ── Table View ── */}
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
                  <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>No active agents found</div>
                ) : rows.map((r, idx) => (
                  <div key={r.id} style={{
                    display: 'grid', gridTemplateColumns: `repeat(${visCols.length}, minmax(180px, 1fr))`,
                    gap: 20, padding: '11px 22px', borderBottom: '1px solid #f1f5f9',
                    background: idx % 2 === 0 ? '#fff' : '#f0f9ff',
                    alignItems: 'center', transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#e0f2fe'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f0f9ff'}
                  >
                    {visCols.map(c => (
                      <div key={c.key} style={{ minWidth: 0, overflow: 'hidden', maxWidth: '100%' }}>
                        {STATE_COLS.has(c.key)
                          ? <StatusPill status={c.get(r)} />
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
