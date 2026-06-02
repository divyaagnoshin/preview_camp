import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getCampaigns, getInteractions,
  listAgentSessions, listAgents, getJobs,
} from '../api/client';
import {
  BarChart2, Phone, Users, ClipboardList, LogIn,
  CheckCircle, Clock, Settings, LayoutDashboard,
  TrendingUp, Activity,
} from 'lucide-react';

import ActiveCampaignsReport  from './Reports/active-campaigns';
import StaffedAgentsReport    from './Reports/staffed-agents';
import DispositionReport      from './Reports/disposition-report';
import InteractionReport      from './Reports/interaction-report';
import AgentLoginReport       from './Reports/agent-login-repor';

function fmtNum(v: any) { return v == null ? '—' : Number(v).toLocaleString(); }
function fmtPct(v: any) { return v == null ? '—' : `${Number(v).toFixed(1)}%`; }

const PALETTE = [
  { accent:'#6366f1', grad:'linear-gradient(135deg,#1e1b4b,#4338ca,#7c3aed)', border:'#c7d2fe', row:'#f0f4ff', hover:'#eef2ff' },
  { accent:'#0ea5e9', grad:'linear-gradient(135deg,#0c4a6e,#0284c7,#38bdf8)', border:'#bae6fd', row:'#f0f9ff', hover:'#e0f2fe' },
  { accent:'#10b981', grad:'linear-gradient(135deg,#064e3b,#059669,#34d399)', border:'#a7f3d0', row:'#f0fdf4', hover:'#dcfce7' },
  { accent:'#f59e0b', grad:'linear-gradient(135deg,#78350f,#d97706,#fbbf24)', border:'#fde68a', row:'#fffbeb', hover:'#fef3c7' },
  { accent:'#ec4899', grad:'linear-gradient(135deg,#831843,#be185d,#f472b6)', border:'#f9a8d4', row:'#fdf2f8', hover:'#fce7f3' },
];

const TABS = [
  { id:'active-campaigns',   label:'Active Campaigns',   icon: BarChart2,    pal: PALETTE[0] },
  { id:'staffed-agents',     label:'Staffed Agents',     icon: Users,        pal: PALETTE[1] },
  { id:'disposition-report', label:'Disposition Report', icon: ClipboardList, pal: PALETTE[2] },
  { id:'interaction-report', label:'Interaction Report', icon: Phone,        pal: PALETTE[3] },
  { id:'agent-login-report', label:'Agent Login Report', icon: LogIn,        pal: PALETTE[4] },
] as const;
type TabId = typeof TABS[number]['id'];

/* ── KPI Card ──────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, grad, accent }:
  { label: string; value: string | number; sub?: string; icon: any; grad: string; accent: string }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${accent}30`, boxShadow: `0 2px 14px ${accent}18`, background: '#fff' }}>
      <div style={{ background: grad, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color="#fff" />
        </div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {value}{sub && <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 3, opacity: 0.7 }}>{sub}</span>}
        </p>
      </div>
      <div style={{ padding: '8px 16px 10px' }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#64748b', margin: 0 }}>{label}</p>
      </div>
    </div>
  );
}

/* ── Mini table card ────────────────────────────────────────────────────── */
function MiniTable({
  title, cols, rows, pal, emptyMsg = 'No data', onExpand,
}: {
  title: string; cols: string[];
  rows: { cells: string[] }[];
  pal: typeof PALETTE[0]; emptyMsg?: string; onExpand: () => void;
}) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${pal.border}`, boxShadow: `0 2px 16px ${pal.accent}18` }}>
      <div style={{ background: pal.grad, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{title}</span>
        <button
          onClick={onExpand}
          style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 7, padding: '4px 11px', cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          Full Report →
        </button>
      </div>
      {/* Col headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(60px,1fr))`, gap: 4, padding: '7px 16px', background: `${pal.accent}08`, borderBottom: `1px solid ${pal.accent}22` }}>
        {cols.map(c => <span key={c} style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.09em', color: pal.accent }}>{c}</span>)}
      </div>
      {/* Rows */}
      {rows.length === 0 ? (
        <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: '#94a3b8', background: '#fff' }}>{emptyMsg}</div>
      ) : rows.slice(0, 5).map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(60px,1fr))`, gap: 4, padding: '8px 16px', borderBottom: `1px solid ${pal.accent}11`, background: i % 2 === 0 ? '#fff' : pal.row }}>
          {r.cells.map((cell, j) => (
            <span key={j} style={{ fontSize: 12, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {cell}
            </span>
          ))}
        </div>
      ))}
      {rows.length > 5 && (
        <div style={{ padding: '6px 16px', textAlign: 'center', fontSize: 11, color: '#94a3b8', background: '#f8fafc' }}>
          +{rows.length - 5} more rows
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────── */
export default function ReportsPage() {
  const location = useLocation();
  const navigate  = useNavigate();

  const pathTab = location.pathname.replace(/^\/reports\/?/, '') as TabId | '';
  const activeTab: TabId | null = (pathTab && TABS.some(t => t.id === pathTab)) ? pathTab as TabId : null;
  const isOverview = activeTab === null && !location.pathname.includes('/settings');
  const setActiveTab = (id: TabId | null) => navigate(id ? `/reports/${id}` : '/reports');

  // data queries
  const { data: campData }  = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns });
  const { data: jobData }   = useQuery({ queryKey: ['jobs-all'], queryFn: () => getJobs({ per_page: 500 }) });
  const { data: sessData }  = useQuery({ queryKey: ['agent-sessions-live'], queryFn: listAgentSessions, refetchInterval: 15000 });
  const { data: agentData } = useQuery({ queryKey: ['agents-list'], queryFn: listAgents });
  const { data: intData }   = useQuery({ queryKey: ['interactions-all'], queryFn: () => getInteractions({ per_page: 500 }) });

  const campaigns: any[]    = campData?.data || [];
  const jobs: any[]         = jobData?.data  || [];
  const sessions: any[]     = sessData?.data || [];
  const agents: any[]       = agentData?.data || [];
  const interactions: any[] = intData?.data || [];

  // KPI stats
  const activeCamps = campaigns.filter((c: any) => c.status === 'active').length;
  const liveAgents  = sessions.filter((s: any) => s.status !== 'offline').length;
  const totalInts   = interactions.length;
  const connected   = interactions.filter((i: any) => i.call_status === 'connected').length;
  const avgTalk     = interactions.length
    ? Math.round(interactions.reduce((a: number, i: any) => a + (i.talk_time_sec || 0), 0) / interactions.length)
    : 0;
  const totalProcessed = jobs.reduce((a: number, j: any) => a + (j.processed_contacts || 0), 0);

  // Mini-table rows
  const campRows = useMemo(() =>
    [...campaigns].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((c: any) => {
      const job: any = jobs.find((j: any) => j.campaign_id === c.id) || {};
      return { cells: [c.name || '—', c.status || '—', fmtNum(job.total_contacts ?? c.total_contacts), fmtPct(job.prcnt_complete)] };
    }), [campaigns, jobs]);

  const staffedRows = useMemo(() =>
    sessions.filter((s: any) => s.status !== 'offline').map((s: any) => {
      const ag: any = agents.find((a: any) => a.id === s.agent_id) || {};
      const name = ag.first_name ? `${ag.first_name} ${ag.last_name}` : s.agent_id;
      return { cells: [name, s.status?.replace(/_/g, ' ') || '—', s.current_contact_id ? 'On Call' : 'Idle'] };
    }), [sessions, agents]);

  const dispRows = useMemo(() =>
    interactions.filter((i: any) => i.disposition_code_label).slice(0, 10).map((i: any) => {
      const name = `${i.first_name || ''} ${i.last_name || ''}`.trim() || '—';
      return { cells: [i.disposition_code_label || '—', name, i.call_status || '—', i.talk_time_sec ? `${i.talk_time_sec}s` : '—'] };
    }), [interactions]);

  const intRows = useMemo(() =>
    [...interactions].sort((a: any, b: any) => new Date(b.given_at || 0).getTime() - new Date(a.given_at || 0).getTime())
      .slice(0, 10).map((i: any) => {
        const name = `${i.first_name || ''} ${i.last_name || ''}`.trim() || '—';
        return { cells: [name, i.agent_name || '—', i.preview_action || '—', i.call_status || '—'] };
      }), [interactions]);

  const loginRows = useMemo(() =>
    [...sessions].sort((a: any, b: any) => new Date(b.login_at || 0).getTime() - new Date(a.login_at || 0).getTime())
      .slice(0, 10).map((s: any) => {
        const ag: any = agents.find((a: any) => a.id === s.agent_id) || {};
        const name = ag.first_name ? `${ag.first_name} ${ag.last_name}` : s.agent_id;
        const t = s.login_at ? new Date(s.login_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
        return { cells: [name, s.status || '—', t] };
      }), [sessions, agents]);

  return (
    <div style={{ padding: '24px 28px', fontFamily: '"DM Sans", sans-serif', minHeight: '100%', background: '#f8fafc' }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{
            fontSize: 24, fontWeight: 900, margin: 0, fontFamily: 'Sora, sans-serif', letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg,#F4521E 0%,#F5A623 55%,#FFD080 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Reports
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0', fontWeight: 500 }}>
            Campaign analytics, agent activity &amp; interaction data
          </p>
        </div>
        {/* Settings icon top-right */}
        <button
          onClick={() => navigate('/reports/settings')}
          title="Column Settings"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 11,
            border: '1.5px solid #e2e8f0',
            background: '#fff', color: '#475569',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#F4521E'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'}
        >
          <Settings size={15} />
          Column Settings
        </button>
      </div>

      {/* ── Tab nav ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {/* Dashboard / Overview icon tab */}
        <button
          onClick={() => setActiveTab(null)}
          title="Dashboard Overview"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', fontSize: 13, fontWeight: 700,
            borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer',
            background: isOverview ? '#fff' : 'transparent',
            color: isOverview ? '#6366f1' : '#94a3b8',
            borderBottom: isOverview ? '2px solid #6366f1' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.15s',
          }}
        >
          <LayoutDashboard size={14} />
          <span>Dashboard</span>
        </button>

        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', fontSize: 13, fontWeight: 700,
                borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer',
                background: active ? '#fff' : 'transparent',
                color: active ? t.pal.accent : '#94a3b8',
                borderBottom: active ? `2px solid ${t.pal.accent}` : '2px solid transparent',
                marginBottom: -2, transition: 'all 0.15s',
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW / DASHBOARD ───────────────────────────────────── */}
      {isOverview && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 22 }}>
            <KpiCard label="Active Campaigns"   value={activeCamps}   icon={BarChart2}     grad={PALETTE[0].grad} accent={PALETTE[0].accent} />
            <KpiCard label="Live Agents"        value={liveAgents}    icon={Users}         grad={PALETTE[1].grad} accent={PALETTE[1].accent} />
            <KpiCard label="Connected Calls"    value={connected}     icon={CheckCircle}   grad={PALETTE[2].grad} accent={PALETTE[2].accent} />
            <KpiCard label="Total Interactions" value={totalInts}     icon={Phone}         grad={PALETTE[3].grad} accent={PALETTE[3].accent} />
            <KpiCard label="Avg Talk Time"      value={avgTalk}       icon={Clock}    sub="s" grad={PALETTE[4].grad} accent={PALETTE[4].accent} />
            <KpiCard label="Contacts Processed" value={totalProcessed} icon={TrendingUp}   grad="linear-gradient(135deg,#1e293b,#334155,#475569)" accent="#64748b" />
          </div>

          {/* Top row: 3 tables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
            <MiniTable title="Active Campaigns"    cols={['Campaign','Status','Contacts','% Done']}
              rows={campRows}  pal={PALETTE[0]} onExpand={() => setActiveTab('active-campaigns')}  emptyMsg="No campaigns" />
            <MiniTable title="Staffed Agents (Live)" cols={['Agent','State','Call State']}
              rows={staffedRows} pal={PALETTE[1]} onExpand={() => setActiveTab('staffed-agents')} emptyMsg="No active agents" />
            <MiniTable title="Disposition Report"  cols={['Disposition','Contact','Status','Talk']}
              rows={dispRows}  pal={PALETTE[2]} onExpand={() => setActiveTab('disposition-report')} emptyMsg="No dispositions" />
          </div>

          {/* Bottom row: 2 tables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
            <MiniTable title="Interaction Report" cols={['Contact','Agent','Action','Status']}
              rows={intRows}   pal={PALETTE[3]} onExpand={() => setActiveTab('interaction-report')} emptyMsg="No interactions" />
            <MiniTable title="Agent Login Report" cols={['Agent','Status','Login Time']}
              rows={loginRows} pal={PALETTE[4]} onExpand={() => setActiveTab('agent-login-report')} emptyMsg="No sessions" />
          </div>
        </>
      )}

      {/* ── Individual tabs ─────────────────────────────────────────── */}
      {activeTab === 'active-campaigns'   && <ActiveCampaignsReport />}
      {activeTab === 'staffed-agents'     && <StaffedAgentsReport />}
      {activeTab === 'disposition-report' && <DispositionReport />}
      {activeTab === 'interaction-report' && <InteractionReport />}
      {activeTab === 'agent-login-report' && <AgentLoginReport />}
    </div>
  );
}