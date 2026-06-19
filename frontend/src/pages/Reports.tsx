import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getCampaigns,
  getInteractions,
  listAgentSessions,
  getJobs,
} from '../api/client';
import {
  BarChart2,
  Phone,
  Users,
  ClipboardList,
  LogIn,
  CheckCircle,
  Clock,
  Settings,
  LayoutDashboard,
  TrendingUp,
  Activity,
  FileText,
} from 'lucide-react';

import ActiveCampaignsReport from './Reports/active-campaigns';
import StaffedAgentsReport from './Reports/staffed-agents';
import DispositionReport from './Reports/disposition-report';
import InteractionReport from './Reports/interaction-report';
import AgentLoginReport from './Reports/agent-login-repor';
import HistoricalReports from './Reports/historical-reports';
import DashboardFolders from './Reports/dashboard-folders';
import { PALETTE } from './Reports/report-utils';
function fmtNum(v: any) {
  return v == null ? '—' : Number(v).toLocaleString();
}
function fmtPct(v: any) {
  return v == null ? '—' : `${Number(v).toFixed(1)}%`;
}



const TABS = [
  {
    id: 'active-campaigns',
    label: 'Active Campaigns',
    icon: BarChart2,
    pal: PALETTE[0],
  },
  {
    id: 'staffed-agents',
    label: 'Staffed Agents',
    icon: Users,
    pal: PALETTE[1],
  },
  {
    id: 'historical-reports',
    label: 'Historical Reports',
    icon: FileText,
    pal: PALETTE[0],
  },
  {
    id: 'dashboard-folders',
    label: 'Dashboard Folders',
    icon: Settings,
    pal: PALETTE[1],
  },
] as const;
type TabId = (typeof TABS)[number]['id'];

/* ── KPI Card ──────────────────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  icon: Icon,
  grad,
}: {
  label: string;
  value: string | number;
  icon: any;
  grad: string;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid #e8eaf0',
        background: '#fff',
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* coloured top strip */}
      <div
        style={{
          background: grad,
          padding: '20px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={22} color='#fff' />
        </div>
        <p
          style={{
            fontSize: 38,
            fontWeight: 800,
            color: '#fff',
            margin: 0,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </p>
      </div>
      {/* white label strip */}
      <div style={{ padding: '11px 22px 13px', background: '#fff' }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: '#94a3b8',
            margin: 0,
          }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */
export default function ReportsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const pathTab = location.pathname.replace(/^\/reports\/?/, '') as TabId | '';
  const activeTab: TabId | null =
    pathTab && TABS.some((t) => t.id === pathTab) ? (pathTab as TabId) : null;
  const isOverview =
    activeTab === null && !location.pathname.includes('/settings');
    
  React.useEffect(() => {
    if (isOverview) {
      navigate('/reports/active-campaigns', { replace: true });
    }
  }, [isOverview, navigate]);
  const setActiveTab = (id: TabId | null) =>
    navigate(id ? `/reports/${id}` : '/reports');

  /* data queries */
  const { data: campData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
  });
  const { data: sessData } = useQuery({
    queryKey: ['agent-sessions-live'],
    queryFn: listAgentSessions,
    refetchInterval: 15000,
  });

  const campaigns: any[] = campData?.data || [];
  const sessions: any[] = sessData?.data || [];

  const activeCamps = campaigns.filter(
    (c: any) => c.status === 'active',
  ).length;
  const activeSessionsOnly = sessions.filter(
    (s: any) => !s.logout_at && s.status !== 'offline',
  );
  const liveAgents = activeSessionsOnly.length;

  /* ── tab button style helper ─────────────────────────────────────── */
  const tabBtn = (active: boolean, accent: string) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: '10px 10px 0 0',
    border: 'none',
    cursor: 'pointer' as const,
    background: active ? '#fff' : 'transparent',
    color: active ? accent : '#94a3b8',
    borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
    marginBottom: -2,
    transition: 'all 0.15s',
  });

  return (
    /* Outer wrapper: fill full viewport height, use flex-column so inner content can flex-grow */
    <div
      style={{
        padding: '24px 28px',
        fontFamily: '"DM Sans", sans-serif',
        minHeight: '100vh',
        height: '100%',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Page header ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: 26,
            fontWeight: 900,
            margin: 0,
            fontFamily: 'Sora, sans-serif',
            letterSpacing: '-0.02em',
            background:
              'linear-gradient(135deg,#F4521E 0%,#F5A623 55%,#FFD080 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Reports
        </h1>

        {activeTab !== 'historical-reports' && activeTab !== 'dashboard-folders' && (
          <button
            onClick={() => navigate('/reports/settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 11,
              border: '1.5px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor = '#F4521E')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0')
            }
          >
            <Settings size={16} />
            Column Settings
          </button>
        )}
      </div>

      {/* ── Tab nav ────────────────────────────────────────────────── */}
      {activeTab !== 'historical-reports' && activeTab !== 'dashboard-folders' && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 22,
            borderBottom: '2px solid #e2e8f0',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          {TABS.filter(t => t.id !== 'historical-reports' && t.id !== 'dashboard-folders').map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={tabBtn(active, t.pal.accent)}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── OVERVIEW REMOVED ───────────── */}

      {/* ── Individual tabs ────────────────────────────────────────── */}
      {activeTab === 'active-campaigns' && <ActiveCampaignsReport />}
      {activeTab === 'staffed-agents' && <StaffedAgentsReport />}
      {activeTab === 'historical-reports' && <HistoricalReports />}
      {activeTab === 'dashboard-folders' && <DashboardFolders />}
    </div>
  );
}
