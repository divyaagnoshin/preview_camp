import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFieldLibrary } from '../../api/client';
import {
  BarChart2, Users, ClipboardList, Phone, LogIn,
  ArrowLeft, Eye, EyeOff, RotateCcw, Check,
} from 'lucide-react';

interface ColConfig {
  key: string;
  label: string;
  visible: boolean;
}

const ACTIVE_CAMPAIGNS_DEFAULT: ColConfig[] = [
  { key: 'name',               label: 'Campaign Name',   visible: true },
  { key: 'status',             label: 'Status',          visible: true },
  { key: 'job_status',         label: 'Job Status',      visible: true },
  { key: 'job_run_number',     label: 'Run #',           visible: true },
  { key: 'total_contacts',     label: 'Total Contacts',  visible: true },
  { key: 'processed_contacts', label: 'Processed',       visible: true },
  { key: 'excluded_contacts',  label: 'Excluded',        visible: true },
  { key: 'prcnt_complete',     label: '% Complete',      visible: true },
  { key: 'start_time',         label: 'Start Time',      visible: true },
  { key: 'end_time',           label: 'End Time',        visible: false },
  { key: 'caller_id',          label: 'Caller ID',       visible: false },
  { key: 'schedule_type',      label: 'Schedule Type',   visible: false },
  { key: 'max_attempts',       label: 'Max Attempts',    visible: false },
  { key: 'wrapup_time_sec',    label: 'Wrapup (s)',      visible: false },
  { key: 'auto_dial_delay_sec',label: 'Dial Delay (s)',  visible: false },
  { key: 'start_date',         label: 'Start Date',      visible: false },
  { key: 'end_date',           label: 'End Date',        visible: false },
  { key: 'created_at',         label: 'Created At',      visible: false },
];

const STAFFED_AGENTS_DEFAULT: ColConfig[] = [
  { key: 'agent_id',        label: 'Agent ID',         visible: true },
  { key: 'agent_name',      label: 'Agent Name',       visible: true },
  { key: 'agent_state',     label: 'Agent State',      visible: true },
  { key: 'call_state',      label: 'Call State',       visible: true },
  { key: 'agent_job_state', label: 'Agent Job State',  visible: true },
  { key: 'agent_state_time',label: 'Agent State Time', visible: true },
  { key: 'acquire_state',   label: 'Acquire State',    visible: true },
  { key: 'call_state_time', label: 'Call State Time',  visible: true },
  { key: 'call_count',      label: 'Call Count',       visible: true },
  { key: 'current_campaign',label: 'Current Campaign', visible: false },
  { key: 'login_at',        label: 'Login At',         visible: false },
  { key: 'last_heartbeat',  label: 'Last Heartbeat',   visible: false },
];

const DISPOSITION_BASE_DEFAULT: ColConfig[] = [
  { key: 'disposition_code',  label: 'Disposition Code',  visible: true },
  { key: 'disposition_notes', label: 'Notes',             visible: true },
  { key: 'contact_name',      label: 'Contact',           visible: true },
  { key: 'phone_number',      label: 'Phone',             visible: true },
  { key: 'agent_name',        label: 'Agent',             visible: true },
  { key: 'campaign_name',     label: 'Campaign',          visible: true },
  { key: 'call_status',       label: 'Call Status',       visible: true },
  { key: 'attempt_number',    label: 'Attempt #',         visible: true },
  { key: 'talk_time_sec',     label: 'Talk Time (s)',     visible: true },
  { key: 'wrapup_duration',   label: 'Wrapup (s)',        visible: true },
  { key: 'total_handling',    label: 'Total Handle (s)',  visible: true },
  { key: 'given_at',          label: 'Given At',          visible: true },
  { key: 'dial_mode',         label: 'Dial Mode',         visible: false },
  { key: 'channel_type',      label: 'Channel',           visible: false },
  { key: 'dialed_at',         label: 'Dialed At',         visible: false },
  { key: 'answered_at',       label: 'Answered At',       visible: false },
  { key: 'disconnected_at',   label: 'Disconnected At',   visible: false },
  { key: 'reschedule_at',     label: 'Reschedule At',     visible: false },
  { key: 'recording_url',     label: 'Recording',         visible: false },
];

const INTERACTION_DEFAULT: ColConfig[] = [
  { key: 'contact_name',    label: 'Contact',          visible: true },
  { key: 'phone_number',    label: 'Phone',            visible: true },
  { key: 'agent_name',      label: 'Agent',            visible: true },
  { key: 'campaign_name',   label: 'Campaign',         visible: true },
  { key: 'preview_action',  label: 'Preview Action',   visible: true },
  { key: 'call_status',     label: 'Call Status',      visible: true },
  { key: 'dial_mode',       label: 'Dial Mode',        visible: true },
  { key: 'attempt_number',  label: 'Attempt #',        visible: true },
  { key: 'talk_time_sec',   label: 'Talk Time (s)',    visible: true },
  { key: 'preview_duration',label: 'Preview (s)',      visible: true },
  { key: 'wrapup_duration', label: 'Wrapup (s)',       visible: true },
  { key: 'total_handling',  label: 'Total Handle (s)', visible: true },
  { key: 'disposition_code',label: 'Disposition',      visible: true },
  { key: 'given_at',        label: 'Given At',         visible: true },
  { key: 'dialed_at',       label: 'Dialed At',        visible: false },
  { key: 'answered_at',     label: 'Answered At',      visible: false },
  { key: 'disconnected_at', label: 'Disconnected At',  visible: false },
  { key: 'accepted_at',     label: 'Accepted At',      visible: false },
  { key: 'rejected_at',     label: 'Rejected At',      visible: false },
  { key: 'rejection_reason',label: 'Rejection Reason', visible: false },
  { key: 'wrapup_at',       label: 'Wrapup At',        visible: false },
  { key: 'channel_type',    label: 'Channel',          visible: false },
  { key: 'recording_url',   label: 'Recording URL',    visible: false },
  { key: 'reschedule_at',   label: 'Reschedule At',    visible: false },
  { key: 'disposition_notes',label:'Notes',            visible: false },
];

const AGENT_LOGIN_DEFAULT: ColConfig[] = [
  { key: 'agent_id',    label: 'Agent ID',         visible: true },
  { key: 'agent_name',  label: 'Agent Name',       visible: true },
  { key: 'email',       label: 'Email',            visible: true },
  { key: 'role',        label: 'Role',             visible: true },
  { key: 'status',      label: 'Session Status',   visible: true },
  { key: 'login_at',    label: 'Login At',         visible: true },
  { key: 'logout_at',   label: 'Logout At',        visible: true },
  { key: 'session_dur', label: 'Session Duration', visible: true },
  { key: 'last_hb',     label: 'Last Heartbeat',   visible: true },
  { key: 'is_active',   label: 'Active',           visible: true },
  { key: 'jobs_count',  label: 'Jobs Selected',    visible: false },
  { key: 'created_at',  label: 'Agent Created',    visible: false },
];

const REPORTS = [
  { id: 'active-campaigns',   title: 'Active Campaigns',   icon: BarChart2,    defaults: ACTIVE_CAMPAIGNS_DEFAULT,   color: '#6366f1' },
  { id: 'staffed-agents',     title: 'Staffed Agents',     icon: Users,        defaults: STAFFED_AGENTS_DEFAULT,     color: '#0ea5e9' },
  { id: 'disposition-report', title: 'Disposition Report', icon: ClipboardList, defaults: DISPOSITION_BASE_DEFAULT,   color: '#10b981' },
  { id: 'interaction-report', title: 'Interaction Report', icon: Phone,        defaults: INTERACTION_DEFAULT,        color: '#f59e0b' },
  { id: 'agent-login-report', title: 'Agent Login Report', icon: LogIn,        defaults: AGENT_LOGIN_DEFAULT,        color: '#ec4899' },
] as const;

type ReportId = typeof REPORTS[number]['id'];

export default function ReportSettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ReportId>('active-campaigns');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Field library query for Disposition Report contact attributes
  const { data: fieldData } = useQuery({
    queryKey: ['field-library-settings'],
    queryFn: getFieldLibrary,
    enabled: activeTab === 'disposition-report',
  });

  // State to hold custom toggles before save
  const [configStates, setConfigStates] = useState<Record<string, Record<string, boolean>>>(() => {
    const states: Record<string, Record<string, boolean>> = {};
    REPORTS.forEach(r => {
      states[r.id] = {};
      // Load saved values
      const saved = localStorage.getItem(`reports_cols_${r.id}`);
      if (saved) {
        try {
          states[r.id] = JSON.parse(saved);
        } catch {
          // ignore
        }
      }
      // Populate defaults if missing
      r.defaults.forEach(col => {
        if (states[r.id][col.key] === undefined) {
          states[r.id][col.key] = col.visible;
        }
      });
    });
    return states;
  });

  const activeReport = REPORTS.find(r => r.id === activeTab)!;

  // Resolve full column set for active tab
  const getActiveCols = (): ColConfig[] => {
    if (activeTab === 'disposition-report') {
      const base = DISPOSITION_BASE_DEFAULT.map(col => ({
        ...col,
        visible: configStates[activeTab][col.key] ?? col.visible,
      }));
      const fields = fieldData?.data || [];
      const attrCols = fields.map((f: any) => {
        const key = `attr_${f.field_key}`;
        return {
          key,
          label: f.name || f.field_key,
          visible: configStates[activeTab][key] ?? false,
        };
      });
      return [...base, ...attrCols];
    }

    return activeReport.defaults.map(col => ({
      ...col,
      visible: configStates[activeTab][col.key] ?? col.visible,
    }));
  };

  const cols = getActiveCols();
  const visCount = cols.filter(c => c.visible).length;

  const setColVisible = (key: string, visible: boolean) => {
    setConfigStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [key]: visible,
      },
    }));
  };

  const handleSave = () => {
    Object.entries(configStates).forEach(([id, state]) => {
      localStorage.setItem(`reports_cols_${id}`, JSON.stringify(state));
    });
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      navigate('/reports');
    }, 800);
  };

  const handleShowAll = () => {
    const updated = { ...configStates[activeTab] };
    cols.forEach(c => {
      updated[c.key] = true;
    });
    setConfigStates(prev => ({ ...prev, [activeTab]: updated }));
  };

  const handleHideAll = () => {
    const updated = { ...configStates[activeTab] };
    cols.forEach(c => {
      updated[c.key] = false;
    });
    setConfigStates(prev => ({ ...prev, [activeTab]: updated }));
  };

  const handleReset = () => {
    const updated = { ...configStates[activeTab] };
    activeReport.defaults.forEach(c => {
      updated[c.key] = c.visible;
    });
    if (activeTab === 'disposition-report') {
      const fields = fieldData?.data || [];
      fields.forEach((f: any) => {
        updated[`attr_${f.field_key}`] = false;
      });
    }
    setConfigStates(prev => ({ ...prev, [activeTab]: updated }));
  };

  return (
    <div style={{ padding: '24px 30px', fontFamily: '"DM Sans", sans-serif', maxWidth: 1200, margin: '0 auto', background: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/reports')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <ArrowLeft size={16} color="#64748b" />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Report Column Settings</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>Configure global visibility preferences for all report tables</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10,
              background: saveSuccess ? '#10b981' : 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
              color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(67,56,202,0.22)', transition: 'background 0.2s, transform 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            {saveSuccess ? <Check size={14} /> : null}
            {saveSuccess ? 'Preferences Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Panel: Report list */}
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.08em', padding: '0 8px 10px', borderBottom: '1px solid #f1f5f9', margin: '0 0 10px' }}>
            Select Report
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {REPORTS.map(r => {
              const active = activeTab === r.id;
              const Icon = r.icon;
              // Count current columns visible for this report
              const repCols = r.defaults;
              const saved = configStates[r.id];
              const vis = repCols.filter(col => saved[col.key] !== false).length;
              const total = repCols.length + (r.id === 'disposition-report' ? (fieldData?.data?.length || 0) : 0);

              return (
                <button
                  key={r.id}
                  onClick={() => setActiveTab(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', border: 'none',
                    borderRadius: 10, background: active ? `${r.color}10` : 'transparent',
                    cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background 0.15s, transform 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!active) e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={e => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: active ? r.color : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'background 0.15s',
                  }}>
                    <Icon size={15} color={active ? '#fff' : '#64748b'} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: active ? 800 : 600, color: active ? r.color : '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                      {vis} of {total} visible
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Column checkboxes */}
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          {/* Header Controls */}
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0 }}>{activeReport.title} Columns</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '3px 0 0' }}>{visCount} of {cols.length} columns active</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleShowAll}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <Eye size={12} /> Show All
              </button>
              <button
                onClick={handleHideAll}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <EyeOff size={12} /> Hide All
              </button>
              <button
                onClick={handleReset}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          </div>

          {/* List of checkboxes */}
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {cols.map(c => {
              const isAttr = c.key.startsWith('attr_');
              return (
                <label
                  key={c.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10,
                    border: '1.5px solid #e2e8f0', background: c.visible ? `${activeReport.color}06` : 'transparent',
                    cursor: 'pointer', transition: 'all 0.12s',
                    borderColor: c.visible ? `${activeReport.color}35` : '#e2e8f0',
                  }}
                  onMouseEnter={e => {
                    if (!c.visible) e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseLeave={e => {
                    if (!c.visible) e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.visible}
                    onChange={e => setColVisible(c.key, e.target.checked)}
                    style={{ accentColor: activeReport.color, width: 15, height: 15, cursor: 'pointer' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: c.visible ? 700 : 500, color: c.visible ? '#1e293b' : '#64748b', margin: 0 }}>
                      {c.label}
                    </p>
                    {isAttr && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#10b981', background: '#10b98114', padding: '1px 5px', borderRadius: 4, display: 'inline-block', marginTop: 3 }}>
                        Contact Attribute
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
