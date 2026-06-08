import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// import { useQuery, useQueries } from '@tanstack/react-query';
// import { getContactListAttributes, getCampaigns } from '../../api/client';
import {
  BarChart2, Users, // ClipboardList, Phone, LogIn,
  ArrowLeft, Eye, EyeOff, RotateCcw, Check, Settings2, // X, Search
} from 'lucide-react';

interface ColConfig {
  key: string;
  label: string;
  visible: boolean;
}

const ACTIVE_CAMPAIGNS_DEFAULT: ColConfig[] = [
  { key: 'name', label: 'Campaign Name', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'job_status', label: 'Job Status', visible: true },
  { key: 'job_run_number', label: 'Run #', visible: true },
  { key: 'total_contacts', label: 'Total Contacts', visible: true },
  { key: 'processed_contacts', label: 'Processed', visible: true },
  { key: 'excluded_contacts', label: 'Excluded', visible: true },
  { key: 'prcnt_complete', label: '% Complete', visible: true },
  { key: 'start_time', label: 'Start Time', visible: true },
  // { key: 'end_time', label: 'End Time', visible: false },
  { key: 'caller_id', label: 'Caller ID', visible: false },
  { key: 'schedule_type', label: 'Schedule Type', visible: false },
  { key: 'max_attempts', label: 'Max Attempts', visible: false },
  { key: 'wrapup_time_sec', label: 'Wrapup (s)', visible: false },
  { key: 'auto_dial_delay_sec', label: 'Dial Delay (s)', visible: false },
  // { key: 'start_date', label: 'Start Date', visible: false },
  // { key: 'end_date', label: 'End Date', visible: false },
  { key: 'created_at', label: 'Created At', visible: false },
];

const STAFFED_AGENTS_DEFAULT: ColConfig[] = [
  { key: 'agent_id', label: 'Agent ID', visible: true },
  { key: 'agent_name', label: 'Agent Name', visible: true },
  { key: 'agent_state', label: 'Agent State', visible: true },
  { key: 'call_state', label: 'Call State', visible: true },
  { key: 'agent_job_state', label: 'Agent Job State', visible: true },
  { key: 'agent_state_time', label: 'Agent State Time', visible: true },
  { key: 'acquire_state', label: 'Acquire State', visible: true },
  { key: 'call_state_time', label: 'Call State Time', visible: true },
  { key: 'call_count', label: 'Call Count', visible: true },
  { key: 'current_campaign', label: 'Current Campaign', visible: false },
  { key: 'login_at', label: 'Login At', visible: false },
  { key: 'last_heartbeat', label: 'Last Heartbeat', visible: false },
];

// const DISPOSITION_BASE_DEFAULT: ColConfig[] = [
//   { key: 'disposition_code', label: 'Disposition Code', visible: true },
//   { key: 'disposition_notes', label: 'Notes', visible: true },
//   { key: 'phone_number', label: 'Phone', visible: true },
//   { key: 'agent_name', label: 'Agent', visible: true },
//   { key: 'campaign_name', label: 'Campaign', visible: true },
//   { key: 'call_status', label: 'Call Status', visible: true },
//   { key: 'attempt_number', label: 'Attempt #', visible: true },
//   { key: 'talk_time_sec', label: 'Talk Time (s)', visible: true },
//   { key: 'wrapup_duration', label: 'Wrapup (s)', visible: true },
//   { key: 'total_handling', label: 'Total Handle (s)', visible: true },
//   { key: 'given_at', label: 'Given At', visible: true },
//   { key: 'dial_mode', label: 'Dial Mode', visible: false },
//   { key: 'channel_type', label: 'Channel', visible: false },
//   { key: 'dialed_at', label: 'Dialed At', visible: false },
//   { key: 'answered_at', label: 'Answered At', visible: false },
//   { key: 'disconnected_at', label: 'Disconnected At', visible: false },
//   { key: 'reschedule_at', label: 'Reschedule At', visible: false },
//   { key: 'recording_url', label: 'Recording', visible: false },
// ];

// const INTERACTION_DEFAULT: ColConfig[] = [
//   { key: 'phone_number', label: 'Phone', visible: true },
//   { key: 'agent_name', label: 'Agent', visible: true },
//   { key: 'campaign_name', label: 'Campaign', visible: true },
//   { key: 'preview_action', label: 'Preview Action', visible: true },
//   { key: 'call_status', label: 'Call Status', visible: true },
//   { key: 'dial_mode', label: 'Dial Mode', visible: true },
//   { key: 'attempt_number', label: 'Attempt #', visible: true },
//   { key: 'talk_time_sec', label: 'Talk Time (s)', visible: true },
//   { key: 'preview_duration', label: 'Preview (s)', visible: true },
//   { key: 'wrapup_duration', label: 'Wrapup (s)', visible: true },
//   { key: 'total_handling', label: 'Total Handle (s)', visible: true },
//   { key: 'disposition_code', label: 'Disposition', visible: true },
//   { key: 'given_at', label: 'Given At', visible: true },
//   { key: 'dialed_at', label: 'Dialed At', visible: false },
//   { key: 'answered_at', label: 'Answered At', visible: false },
//   { key: 'disconnected_at', label: 'Disconnected At', visible: false },
//   { key: 'accepted_at', label: 'Accepted At', visible: false },
//   { key: 'rejected_at', label: 'Rejected At', visible: false },
//   { key: 'rejection_reason', label: 'Rejection Reason', visible: false },
//   { key: 'wrapup_at', label: 'Wrapup At', visible: false },
//   { key: 'channel_type', label: 'Channel', visible: false },
//   { key: 'recording_url', label: 'Recording URL', visible: false },
//   { key: 'reschedule_at', label: 'Reschedule At', visible: false },
//   { key: 'disposition_notes', label: 'Notes', visible: false },
// ];

// const AGENT_LOGIN_DEFAULT: ColConfig[] = [
//   { key: 'agent_id', label: 'Agent ID', visible: true },
//   { key: 'agent_name', label: 'Agent Name', visible: true },
//   { key: 'email', label: 'Email', visible: true },
//   { key: 'status', label: 'Session Status', visible: true },
//   { key: 'login_at', label: 'Login At', visible: true },
//   { key: 'logout_at', label: 'Logout At', visible: true },
//   { key: 'session_dur', label: 'Session Duration', visible: true },
//   { key: 'is_active', label: 'Active', visible: true },
//   { key: 'jobs_count', label: 'Jobs Selected', visible: false },
//   { key: 'created_at', label: 'Agent Created', visible: false },
// ];

const REPORTS = [
  { id: 'active-campaigns', title: 'Active Campaigns', icon: BarChart2, defaults: ACTIVE_CAMPAIGNS_DEFAULT, color: '#6366f1', bg: '#eef2ff' },
  { id: 'staffed-agents', title: 'Staffed Agents', icon: Users, defaults: STAFFED_AGENTS_DEFAULT, color: '#0ea5e9', bg: '#e0f2fe' },
  // { id: 'disposition-report', title: 'Disposition Report', icon: ClipboardList, defaults: DISPOSITION_BASE_DEFAULT, color: '#10b981', bg: '#d1fae5' },
  // { id: 'interaction-report', title: 'Interaction Report', icon: Phone, defaults: INTERACTION_DEFAULT, color: '#f59e0b', bg: '#fef3c7' },
  // { id: 'agent-login-report', title: 'Agent Login Report', icon: LogIn, defaults: AGENT_LOGIN_DEFAULT, color: '#ec4899', bg: '#fce7f3' },
] as const;

type ReportId = typeof REPORTS[number]['id'];

export default function ReportSettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ReportId>('active-campaigns');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // — Disposition-related state commented out —
  // const [settingsCampSearch, setSettingsCampSearch] = useState('');
  // const [selectedCampIds, setSelectedCampIds] = useState<string[]>(() => {
  //   try {
  //     const saved = localStorage.getItem('disposition_report_campaigns');
  //     if (saved) return JSON.parse(saved);
  //     const single = localStorage.getItem('disposition_report_campaign');
  //     return single ? [single] : [];
  //   } catch { return []; }
  // });
  // const { data: campData } = useQuery({
  //   queryKey: ['campaigns-settings'],
  //   queryFn: getCampaigns,
  //   enabled: activeTab === 'disposition-report',
  // });
  // const campaigns: any[] = campData?.data || [];
  // const activeCampaigns = useMemo(
  //   () => campaigns.filter((c: any) => selectedCampIds.includes(c.id)),
  //   [campaigns, selectedCampIds],
  // );
  // const contactListIds: string[] = useMemo(() => {
  //   const ids = new Set<string>();
  //   activeCampaigns.forEach((c: any) => {
  //     (c.contact_lists || []).forEach((l: any) => { if (l.id) ids.add(l.id); });
  //   });
  //   return Array.from(ids);
  // }, [activeCampaigns]);
  // const attrQueries = useQueries({
  //   queries: contactListIds.map(listId => ({
  //     queryKey: ['contact-list-attrs-settings', listId],
  //     queryFn: () => getContactListAttributes(listId),
  //     enabled: activeTab === 'disposition-report' && !!listId,
  //   })),
  // });
  // const attrsLoading = attrQueries.some(q => q.isLoading);
  // const mergedAttrFields = useMemo(() => {
  //   const seen = new Set<string>();
  //   const merged: any[] = [];
  //   attrQueries.forEach(q => {
  //     const fields: any[] = q.data?.data || [];
  //     fields.forEach(f => {
  //       if (!f.field_key) return;
  //       if (f.is_selected === false) return;
  //       if (seen.has(f.field_key)) return;
  //       seen.add(f.field_key);
  //       merged.push(f);
  //     });
  //   });
  //   return merged;
  // }, [attrQueries]);
  // function toggleSettingsCampaign(campId: string) {
  //   setSelectedCampIds(prev =>
  //     prev.includes(campId) ? prev.filter(id => id !== campId) : [...prev, campId],
  //   );
  // }
  // const filteredSettingsCampaigns = useMemo(() => {
  //   const q = settingsCampSearch.trim().toLowerCase();
  //   if (!q) return campaigns;
  //   return campaigns.filter((c: any) => (c.name || '').toLowerCase().includes(q));
  // }, [campaigns, settingsCampSearch]);

  const [configStates, setConfigStates] = useState<Record<string, Record<string, boolean>>>(() => {
    const states: Record<string, Record<string, boolean>> = {};
    REPORTS.forEach(r => {
      states[r.id] = {};
      const saved = localStorage.getItem(`reports_cols_${r.id}`);
      if (saved) { try { states[r.id] = JSON.parse(saved); } catch { } }
      r.defaults.forEach(col => {
        if (states[r.id][col.key] === undefined) states[r.id][col.key] = col.visible;
      });
      const activeCount = r.defaults.filter(col => states[r.id][col.key] !== false).length;
      if (activeCount === 0) r.defaults.forEach(col => { states[r.id][col.key] = col.visible; });
    });
    return states;
  });

  const activeReport = REPORTS.find(r => r.id === activeTab)!;

  const getActiveCols = (): ColConfig[] => {
    // Disposition branch removed
    // if (activeTab === 'disposition-report') { ... }
    return activeReport.defaults.map(col => ({
      ...col, visible: configStates[activeTab][col.key] ?? col.visible,
    }));
  };

  const cols = getActiveCols();
  const visCount = cols.filter(c => c.visible).length;

  const setColVisible = (key: string, visible: boolean) => {
    setConfigStates(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: visible } }));
  };

  const handleSave = () => {
    // Disposition pruning removed
    // const validAttrKeys = new Set(mergedAttrFields.map(f => `attr_${f.field_key}`));
    // const pruned = { ...configStates['disposition-report'] };
    // Object.keys(pruned).forEach(k => {
    //   if (k.startsWith('attr_') && !validAttrKeys.has(k)) delete pruned[k];
    // });
    // const finalStates = { ...configStates, 'disposition-report': pruned };

    Object.entries(configStates).forEach(([id, state]) => {
      localStorage.setItem(`reports_cols_${id}`, JSON.stringify(state));
    });

    // localStorage.setItem('disposition_report_campaigns', JSON.stringify(selectedCampIds));
    // if (selectedCampIds.length > 0) localStorage.setItem('disposition_report_campaign', selectedCampIds[0]);
    // else localStorage.removeItem('disposition_report_campaign');

    window.dispatchEvent(new Event('storage'));
    setSaveSuccess(true);
    setTimeout(() => { setSaveSuccess(false); navigate(-1); }, 800);
  };

  const handleShowAll = () => {
    const updated = { ...configStates[activeTab] };
    cols.forEach(c => { updated[c.key] = true; });
    setConfigStates(prev => ({ ...prev, [activeTab]: updated }));
  };

  const handleHideAll = () => {
    const updated = { ...configStates[activeTab] };
    cols.forEach(c => { updated[c.key] = false; });
    setConfigStates(prev => ({ ...prev, [activeTab]: updated }));
  };

  const handleReset = () => {
    const updated = { ...configStates[activeTab] };
    activeReport.defaults.forEach(c => { updated[c.key] = c.visible; });
    // attr cols reset removed (disposition only)
    // cols.filter(c => c.key.startsWith('attr_')).forEach(c => { updated[c.key] = false; });
    setConfigStates(prev => ({ ...prev, [activeTab]: updated }));
  };

  const progressPct = cols.length > 0 ? Math.round((visCount / cols.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '"DM Sans", sans-serif', background: '#f1f5f9', overflow: 'hidden' }}>
      {/* ── Top Header Bar ── */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
            <ArrowLeft size={15} color="#64748b" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#1e1b4b,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings2 size={15} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Report Column Settings</h1>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Configure global visibility preferences for all report tables</p>
            </div>
          </div>
        </div>
        <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: saveSuccess ? '#10b981' : 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%)', color: '#fff', transition: 'all 0.2s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'none'}>
          {saveSuccess ? <Check size={14} /> : null}
          {saveSuccess ? 'Saved!' : 'Save Preferences'}
        </button>
      </div>

      {/* ── Body: Sidebar + Main ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Left Sidebar ── */}
        <div style={{ width: 280, flexShrink: 0, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '18px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#94a3b8', margin: 0 }}>Report Categories</p>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {REPORTS.map(r => {
              const active = activeTab === r.id;
              const Icon = r.icon;
              const saved = configStates[r.id];
              const vis = r.defaults.filter(col => saved[col.key] !== false).length;
              const pct = Math.round((vis / r.defaults.length) * 100);
              return (
                <button key={r.id} onClick={() => setActiveTab(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', border: 'none', borderRadius: 10, background: active ? r.bg : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%', outline: active ? `2px solid ${r.color}30` : 'none', transition: 'all 0.15s' }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: active ? r.color : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: active ? `0 4px 12px ${r.color}40` : 'none' }}>
                    <Icon size={15} color={active ? '#fff' : '#94a3b8'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? r.color : '#475569', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: active ? r.color : '#cbd5e1', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{vis}/{r.defaults.length}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main Content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Sticky top bar */}
          <div style={{ flexShrink: 0, background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: activeReport.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${activeReport.color}60` }}>
                <activeReport.icon size={18} color="#fff" />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0 }}>{activeReport.title}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <div style={{ width: 120, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 99, background: activeReport.color, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{visCount} of {cols.length} columns selected</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {[
                { label: 'Select All', icon: Eye, fn: handleShowAll },
                { label: 'Unselect All', icon: EyeOff, fn: handleHideAll },
                { label: 'Reset', icon: RotateCcw, fn: handleReset },
              ].map(btn => (
                <button key={btn.label} onClick={btn.fn} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'}>
                  <btn.icon size={12} /> {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable column grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            {/* Disposition campaign selector removed */}
            {/* {activeTab === 'disposition-report' && ( ... )} */}

            {/* Column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {cols.map(c => <ColCard key={c.key} c={c} activeReport={activeReport} setColVisible={setColVisible} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColCard({ c, activeReport, setColVisible }: {
  c: ColConfig;
  activeReport: typeof REPORTS[number];
  setColVisible: (key: string, v: boolean) => void;
}) {
  const isAttr = c.key.startsWith('attr_');
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s', border: `1.5px solid ${c.visible ? `${activeReport.color}30` : '#e2e8f0'}`, background: c.visible ? `${activeReport.color}08` : '#fff', boxShadow: c.visible ? `0 2px 8px ${activeReport.color}12` : '0 1px 2px rgba(0,0,0,0.03)' }}
      onMouseEnter={e => { if (!c.visible) (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; }}
      onMouseLeave={e => { if (!c.visible) (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
      <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: c.visible ? `2px solid ${activeReport.color}` : '2px solid #cbd5e1', background: c.visible ? activeReport.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
        onClick={() => setColVisible(c.key, !c.visible)}>
        {c.visible && <Check size={11} color="#fff" strokeWidth={3} />}
      </div>
      <input type="checkbox" checked={c.visible} onChange={e => setColVisible(c.key, e.target.checked)} style={{ display: 'none' }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: c.visible ? 700 : 500, color: c.visible ? '#1e293b' : '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.label}
        </p>
        {/* Contact Attribute badge — kept for future use */}
        {isAttr && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#10b981', background: '#d1fae5', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 3 }}>
            Contact Attribute
          </span>
        )}
      </div>
    </label>
  );
}