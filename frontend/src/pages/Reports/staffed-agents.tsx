import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgentSessions, listAgents } from '../../api/client';
import { Download, Search } from 'lucide-react';
import {
  ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV,
  loadSavedCols, saveCols,
} from './report-utils';

const ACCENT = '#0ea5e9';

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
  { key: 'agent_id',        label: 'Agent ID',         visible: true,  get: r => fmt(r.agent_id) },
  { key: 'agent_name',      label: 'Agent Name',       visible: true,  get: r => fmt(r.agent_name) },
  { key: 'agent_state',     label: 'Agent State',      visible: true,  get: r => fmt(r.status) },
  { key: 'call_state',      label: 'Call State',       visible: true,  get: r => fmt(r.call_state) },
  { key: 'agent_job_state', label: 'Agent Job State',  visible: true,  get: r => fmt(r.job_state) },
  { key: 'agent_state_time',label: 'Agent State Time', visible: true,  get: r => fmtElapsed(r.login_at) },
  { key: 'acquire_state',   label: 'Acquire State',    visible: true,  get: r => fmt(r.acquire_state) },
  { key: 'call_state_time', label: 'Call State Time',  visible: true,  get: r => fmtElapsed(r.call_started_at) },
  { key: 'call_count',      label: 'Call Count',       visible: true,  get: r => fmtNum(r.call_count) },
  { key: 'current_campaign',label: 'Current Campaign', visible: false, get: r => fmt(r.current_campaign_name) },
  { key: 'login_at',        label: 'Login At',         visible: false, get: r => fmtDate(r.login_at) },
  { key: 'last_heartbeat',  label: 'Last Heartbeat',   visible: false, get: r => fmtElapsed(r.last_heartbeat_at) },
];

const STATE_COLS = new Set(['agent_state', 'call_state', 'agent_job_state', 'acquire_state']);

export default function StaffedAgentsReport() {
  const [cols, setCols] = useState<ColDef[]>(() => loadSavedCols('staffed-agents', DEFAULT_COLS));
  const [sortKey, setSortKey] = useState('agent_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const { data: sessData } = useQuery({ queryKey: ['agent-sessions-live'], queryFn: listAgentSessions, refetchInterval: 10000 });
  const { data: agentData } = useQuery({ queryKey: ['agents-list'], queryFn: listAgents });

  const rows = useMemo(() => {
    const sessions: any[] = sessData?.data || [];
    const agents: any[] = agentData?.data || [];
    const merged = sessions.map(s => {
      const ag: any = agents.find((a: any) => a.id === s.agent_id) || {};
      return {
        ...s,
        agent_name: ag.first_name && ag.last_name ? `${ag.first_name} ${ag.last_name}` : (ag.email || s.agent_id),
        call_state: s.current_contact_id ? 'on_call' : (s.status === 'available' ? 'idle' : s.status),
        job_state: s.selected_job_ids?.length > 0 ? 'assigned' : 'none',
        acquire_state: s.current_job_id ? 'acquiring' : 'idle',
        call_started_at: s.current_contact_id ? s.last_heartbeat_at : null,
        call_count: s.call_count ?? 0,
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
  }, [sessData, agentData, globalQ, colFilters, sortKey, sortDir, cols]);

  const visCols = cols.filter(c => c.visible);
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(14,165,233,0.15)', border: '1.5px solid #bae6fd' }}>
      <div style={{ background: 'linear-gradient(135deg,#0c4a6e 0%,#0284c7 50%,#38bdf8 100%)', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Staffed Agents (Live)</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{rows.length} agent{rows.length !== 1 ? 's' : ''} · refreshes every 10s</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
              <input value={globalQ} onChange={e => setGlobalQ(e.target.value)} placeholder="Search agents…"
                style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 200 }} />
            </div>
            <ColPicker cols={cols} onChange={newCols => { setCols(newCols); saveCols('staffed-agents', newCols); }} accentColor={ACCENT} />
            <button onClick={() => exportCSV(rows, cols, 'staffed-agents.csv')}
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
        {rows.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>No active agents found</div>
        ) : rows.map((r, idx) => (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: `repeat(${visCols.length}, minmax(100px, 1fr))`,
            gap: 4, padding: '11px 22px', borderBottom: '1px solid #f1f5f9',
            background: idx % 2 === 0 ? '#fff' : '#f0f9ff',
            alignItems: 'center', transition: 'background 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#e0f2fe'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f0f9ff'}
          >
            {visCols.map(c => (
              <div key={c.key} style={{ minWidth: 0 }}>
                {STATE_COLS.has(c.key)
                  ? <StatusPill status={c.get(r)} />
                  : <CellText>{c.get(r)}</CellText>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <TableFooter total={rows.length} sortLabel={cols.find(c => c.key === sortKey)?.label || sortKey} sortDir={sortDir} accentColor={ACCENT} />
    </div>
  );
}
