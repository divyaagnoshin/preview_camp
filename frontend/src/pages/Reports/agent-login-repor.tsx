import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgentSessions, listAgents } from '../../api/client';
import { Download, Search } from 'lucide-react';
import { ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV, loadSavedCols, saveCols } from './report-utils';

const ACCENT = '#ec4899';

function fmt(v: any) { return v == null || v === '' ? '—' : String(v); }
function fmtDate(v: any) { return v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
function fmtElapsed(from: string | null, to?: string | null): string {
  if (!from) return '—';
  const end = to ? new Date(to).getTime() : Date.now();
  const secs = Math.floor((end - new Date(from).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

const DEFAULT_COLS: ColDef[] = [
  { key: 'agent_id',    label: 'Agent ID',         visible: true,  get: r => fmt(r.agent_id) },
  { key: 'agent_name',  label: 'Agent Name',       visible: true,  get: r => fmt(r.agent_name) },
  { key: 'email',       label: 'Email',            visible: true,  get: r => fmt(r.email) },
  { key: 'role',        label: 'Role',             visible: true,  get: r => fmt(r.role) },
  { key: 'status',      label: 'Session Status',   visible: true,  get: r => fmt(r.status) },
  { key: 'login_at',    label: 'Login At',         visible: true,  get: r => fmtDate(r.login_at) },
  { key: 'logout_at',   label: 'Logout At',        visible: true,  get: r => fmtDate(r.logout_at) },
  { key: 'session_dur', label: 'Session Duration', visible: true,  get: r => fmtElapsed(r.login_at, r.logout_at) },
  { key: 'last_hb',     label: 'Last Heartbeat',   visible: true,  get: r => fmtDate(r.last_heartbeat_at) },
  { key: 'is_active',   label: 'Active',           visible: true,  get: r => r.is_active != null ? (r.is_active ? 'Yes' : 'No') : '—' },
  { key: 'jobs_count',  label: 'Jobs Selected',    visible: false, get: r => (r.selected_job_ids?.length || 0).toString() },
  { key: 'created_at',  label: 'Agent Created',    visible: false, get: r => fmtDate(r.created_at) },
];

export default function AgentLoginReport() {
  const [cols, setCols] = useState<ColDef[]>(() => loadSavedCols('agent-login-report', DEFAULT_COLS));
  const [sortKey, setSortKey] = useState('login_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const { data: sessData, isLoading } = useQuery({ queryKey: ['sessions-login'], queryFn: listAgentSessions });
  const { data: agentData } = useQuery({ queryKey: ['agents-login'], queryFn: listAgents });

  const rows = useMemo(() => {
    const sessions: any[] = sessData?.data || [];
    const agents: any[] = agentData?.data || [];
    const merged = sessions.map(s => {
      const ag: any = agents.find((a: any) => a.id === s.agent_id) || {};
      return {
        ...s, ...ag,
        agent_id: s.agent_id,
        agent_name: ag.first_name && ag.last_name ? `${ag.first_name} ${ag.last_name}` : (ag.email || s.agent_id),
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
      return sortDir === 'desc' ? bv.localeCompare(av, undefined, { numeric: true }) : av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [sessData, agentData, globalQ, colFilters, sortKey, sortDir, cols]);

  const visCols = cols.filter(c => c.visible);
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(236,72,153,0.15)', border: '1.5px solid #f9a8d4' }}>
      <div style={{ background: 'linear-gradient(135deg,#831843 0%,#be185d 50%,#f472b6 100%)', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Agent Login Report</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{rows.length} session{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
              <input value={globalQ} onChange={e => setGlobalQ(e.target.value)} placeholder="Search agents…"
                style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 200 }} />
            </div>
            <ColPicker cols={cols} onChange={newCols => { setCols(newCols); saveCols('agent-login-report', newCols); }} accentColor={ACCENT} />
            <button onClick={() => exportCSV(rows, cols, 'agent-login-report.csv')}
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
        ) : rows.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>No login sessions found</div>
        ) : rows.map((r, idx) => (
          <div key={r.id || idx} style={{
            display: 'grid', gridTemplateColumns: `repeat(${visCols.length}, minmax(100px, 1fr))`,
            gap: 4, padding: '11px 22px', borderBottom: '1px solid #f1f5f9',
            background: idx % 2 === 0 ? '#fff' : '#fdf2f8',
            alignItems: 'center', transition: 'background 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fce7f3'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#fdf2f8'}
          >
            {visCols.map(c => (
              <div key={c.key} style={{ minWidth: 0 }}>
                {c.key === 'status' ? <StatusPill status={c.get(r)} /> : <CellText>{c.get(r)}</CellText>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <TableFooter total={rows.length} sortLabel={cols.find(c => c.key === sortKey)?.label || sortKey} sortDir={sortDir} accentColor={ACCENT} />
    </div>
  );
}
