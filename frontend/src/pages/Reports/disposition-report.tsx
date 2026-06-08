import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { getInteractions, getCampaigns, getJobs, getContactListAttributes } from '../../api/client';
import { Download, Search, ChevronDown, Check, X, LayoutList, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ColDef, ColPicker, TableHeader, TableFooter, StatusPill, CellText, exportCSV,
  loadSavedCols, saveCols, MiniTable, FilterBar
} from './report-utils';

const ACCENT = '#10b981';

function fmt(v: any) { return v == null || v === '' ? '—' : String(v); }
function fmtNum(v: any) { return v == null ? '—' : Number(v).toLocaleString(); }
function fmtDate(v: any) {
  return v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

const BASE_COLS: ColDef[] = [
  { key: 'disposition_code', label: 'Disposition Code', visible: true, get: r => fmt(r.disposition_code_label) },
  { key: 'disposition_notes', label: 'Notes', visible: true, get: r => fmt(r.disposition_notes) },
  { key: 'phone_number', label: 'Phone', visible: true, get: r => fmt(r.phone_number) },
  { key: 'agent_name', label: 'Agent', visible: true, get: r => fmt(r.agent_name) },
  { key: 'campaign_name', label: 'Campaign', visible: true, get: r => fmt(r.campaign_name) },
  { key: 'call_status', label: 'Call Status', visible: true, get: r => fmt(r.call_status) },
  { key: 'attempt_number', label: 'Attempt #', visible: true, get: r => fmtNum(r.attempt_number) },
  { key: 'talk_time_sec', label: 'Talk Time (s)', visible: true, get: r => fmtNum(r.talk_time_sec) },
  { key: 'wrapup_duration', label: 'Wrapup (s)', visible: true, get: r => fmtNum(r.wrapup_duration_sec) },
  { key: 'total_handling', label: 'Total Handle (s)', visible: true, get: r => fmtNum(r.total_handling_sec) },
  { key: 'given_at', label: 'Given At', visible: true, get: r => fmtDate(r.given_at) },
  { key: 'dial_mode', label: 'Dial Mode', visible: false, get: r => fmt(r.dial_mode) },
  { key: 'channel_type', label: 'Channel', visible: false, get: r => fmt(r.channel_type) },
  { key: 'dialed_at', label: 'Dialed At', visible: false, get: r => fmtDate(r.dialed_at) },
  { key: 'answered_at', label: 'Answered At', visible: false, get: r => fmtDate(r.answered_at) },
  { key: 'disconnected_at', label: 'Disconnected At', visible: false, get: r => fmtDate(r.disconnected_at) },
  { key: 'reschedule_at', label: 'Reschedule At', visible: false, get: r => fmtDate(r.reschedule_at) },
  { key: 'recording_url', label: 'Recording', visible: false, get: r => fmt(r.recording_url) },
];

function buildAttrCols(allFields: any[]): ColDef[] {
  const seen = new Set<string>();
  const assignedFields = (allFields || []).filter((f: any) => {
    if (!f.field_key) return false;
    if (f.is_selected === false) return false;
    if (seen.has(f.field_key)) return false;
    seen.add(f.field_key);
    return true;
  });
  return assignedFields.map((f: any) => ({
    key: `attr_${f.field_key}`,
    label: f.field_label || f.name || f.field_key,
    visible: false,
    get: (r: any) => {
      const attrs = r.attributes || r.contact_attributes || r.custom_fields || {};
      const val = attrs[f.field_key];
      return val == null || val === '' ? '—' : String(val);
    },
  }));
}

// ── Campaign Sidebar ──────────────────────────────────────────────────────────
function CampaignSidebar({
  campaigns,
  selectedCampIds,
  onToggle,
  onSelectAll,
  onClearAll,
  collapsed,
  onToggleCollapse,
}: {
  campaigns: any[];
  selectedCampIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c: any) => (c.name || '').toLowerCase().includes(q));
  }, [campaigns, search]);

  const allSelected = campaigns.length > 0 && campaigns.every(c => selectedCampIds.includes(c.id));

  return (
    <div style={{
      width: collapsed ? 44 : 240,
      minWidth: collapsed ? 44 : 240,
      flexShrink: 0,
      background: 'linear-gradient(135deg,#064e3b 0%,#059669 50%,#34d399 100%)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.22s cubic-bezier(.4,0,.2,1), min-width 0.22s cubic-bezier(.4,0,.2,1)',
      overflow: 'hidden',
      borderRight: '1px solid rgba(52,211,153,0.15)',
      position: 'relative',
    }}>
      {/* Sidebar header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '14px 0' : '14px 14px 10px',
        borderBottom: '1px solid rgba(52,211,153,0.12)',
        gap: 8,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <LayoutList size={14} color="#34d399" />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Campaigns
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'rgba(52,211,153,0.12)',
            border: '1px solid rgba(52,211,153,0.2)',
            borderRadius: 6,
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#34d399',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.22)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.12)'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Search */}
          <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#6ee7b7', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search campaigns…"
                style={{
                  width: '100%',
                  height: 30,
                  paddingLeft: 26,
                  paddingRight: 8,
                  fontSize: 11.5,
                  border: '1px solid rgba(52,211,153,0.2)',
                  borderRadius: 7,
                  outline: 'none',
                  background: 'rgba(255,255,255,0.07)',
                  color: '#e2e8f0',
                  fontWeight: 500,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Select all / Clear all */}
          <div style={{ display: 'flex', gap: 4, padding: '0 10px 8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={allSelected ? onClearAll : onSelectAll}
              style={{
                flex: 1,
                fontSize: 10.5,
                fontWeight: 700,
                padding: '4px 0',
                borderRadius: 5,
                border: '1px solid rgba(52,211,153,0.25)',
                background: 'rgba(52,211,153,0.1)',
                color: '#6ee7b7',
                cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.1)'}
            >
              {allSelected ? 'Clear All' : 'Select All'}
            </button>
            {selectedCampIds.length > 0 && !allSelected && (
              <button
                type="button"
                onClick={onClearAll}
                style={{
                  flex: 1,
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '4px 0',
                  borderRadius: 5,
                  border: '1px solid rgba(239,68,68,0.25)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
              >
                Clear
              </button>
            )}
          </div>

          {/* Campaign count badge */}
          {selectedCampIds.length > 0 && (
            <div style={{ padding: '0 10px 6px', flexShrink: 0 }}>
              <span style={{
                display: 'inline-block',
                fontSize: 10,
                fontWeight: 700,
                color: '#064e3b',
                background: '#34d399',
                borderRadius: 99,
                padding: '2px 8px',
              }}>
                {selectedCampIds.length} selected
              </span>
            </div>
          )}

          {/* Campaign list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>
                No campaigns found
              </div>
            ) : (
              filtered.map((c: any) => {
                const isSelected = selectedCampIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggle(c.id)}
                    title={c.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '8px 10px',
                      marginBottom: 4,
                      fontSize: 14,
                      border: 'none',
                      borderRadius: 8,
                      background: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                      color: isSelected ? '#fff' : 'rgba(255,255,255,0.9)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s, color 0.12s',
                      borderLeft: isSelected ? '2.5px solid #34d399' : '2.5px solid transparent',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)';
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      flexShrink: 0,
                      border: isSelected ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.25)',
                      background: isSelected ? '#10b981' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.12s',
                    }}>
                      {isSelected && <Check size={9} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: isSelected ? 800 : 600,
                      fontSize: isSelected ? 14.5 : 13.5,
                      lineHeight: 1.3,
                      textShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                    }}>
                      {c.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Collapsed: show selected count badge */}
      {collapsed && selectedCampIds.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 99,
            background: '#10b981',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
          }}>
            {selectedCampIds.length}
          </span>
        </div>
      )}

      {/* Collapsed: icon indicators for each selected campaign */}
      {collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 10 }}>
          {campaigns.map((c: any) => {
            const isSelected = selectedCampIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggle(c.id)}
                title={c.name}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: 'none',
                  background: isSelected ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isSelected ? '#34d399' : 'rgba(255,255,255,0.3)',
                  fontSize: 9,
                  fontWeight: 800,
                  borderLeft: isSelected ? '2px solid #34d399' : '2px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                {(c.name || '?').charAt(0).toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomCampaignSelect({ campaigns, selectedCampIds, onToggle }: { campaigns: any[], selectedCampIds: string[], onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = campaigns.filter((c: any) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative', width: 220 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', height: 32, padding: '0 10px', borderRadius: 8,
          border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)',
          color: '#fff', fontSize: 12, fontWeight: 700, outline: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          textAlign: 'left'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>+ Select/unselect...</span>
        <ChevronDown size={14} color="#fff" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', borderRadius: 8, border: '1px solid #ccc',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 999, overflow: 'hidden',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #eee' }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} color="#666" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search campaigns..."
                style={{ width: '100%', height: 28, paddingLeft: 24, paddingRight: 8, fontSize: 12, border: '1px solid #ddd', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 155, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: '#999' }}>No campaigns</div>
            ) : (
              filtered.map((c: any) => (
                <div
                  key={c.id}
                  onClick={() => onToggle(c.id)}
                  style={{
                    padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                    background: selectedCampIds.includes(c.id) ? '#f0fdf4' : '#fff',
                    color: '#333', fontWeight: selectedCampIds.includes(c.id) ? 700 : 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                    borderBottom: '1px solid #f9f9f9', transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => { if (!selectedCampIds.includes(c.id)) (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                  onMouseLeave={e => { if (!selectedCampIds.includes(c.id)) (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                >
                  <span style={{ width: 14, flexShrink: 0, color: '#10b981' }}>{selectedCampIds.includes(c.id) ? '✓' : ''}</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DispositionReport({ isMini, onExpand, miniTitle, pal }: { isMini?: boolean; onExpand?: () => void; miniTitle?: string; pal?: any } = {}) {
  const [page, setPage] = useState(1);
  const PER = 100;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [selectedCampIds, setSelectedCampIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('disposition_report_campaigns');
      if (saved) return JSON.parse(saved);
      const single = localStorage.getItem('disposition_report_campaign');
      return single ? [single] : [];
    } catch { return []; }
  });

  const { data: intData, isLoading } = useQuery({
    queryKey: ['interactions-disp'],
    queryFn: () => getInteractions({ per_page: 500 }),
  });
  const { data: campData } = useQuery({
    queryKey: ['campaigns-list-disp'],
    queryFn: getCampaigns,
  });
  const { data: jobData } = useQuery({
    queryKey: ['jobs-list-disp'],
    queryFn: () => getJobs({ per_page: 500 }),
  });

  const campaigns = useMemo(() => campData?.data || [], [campData]);

  const activeCampaigns = useMemo(
    () => campaigns.filter((c: any) => selectedCampIds.includes(c.id)),
    [campaigns, selectedCampIds],
  );

  const contactListIds: string[] = useMemo(() => {
    const ids = new Set<string>();
    activeCampaigns.forEach((c: any) => {
      (c.contact_lists || []).forEach((l: any) => { if (l.id) ids.add(l.id); });
    });
    return Array.from(ids);
  }, [activeCampaigns]);

  const attrQueries = useQueries({
    queries: contactListIds.map(listId => ({
      queryKey: ['contact-list-attrs-disp', listId],
      queryFn: () => getContactListAttributes(listId),
      enabled: !!listId,
    })),
  });

  const mergedAttrFields = useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    attrQueries.forEach(q => {
      const fields: any[] = q.data?.data || [];
      fields.forEach(f => {
        if (!f.field_key) return;
        if (f.is_selected === false) return;
        if (seen.has(f.field_key)) return;
        seen.add(f.field_key);
        merged.push(f);
      });
    });
    return merged;
  }, [attrQueries]);

  const campToFieldKeys = useMemo(() => {
    const map = new Map<string, Set<string>>();
    activeCampaigns.forEach((camp: any) => {
      const keys = new Set<string>();
      (camp.contact_lists || []).forEach((l: any) => {
        const listIndex = contactListIds.indexOf(l.id);
        if (listIndex < 0) return;
        const q = attrQueries[listIndex];
        const fields: any[] = q?.data?.data || [];
        fields.forEach(f => {
          if (f.field_key && f.is_selected !== false) keys.add(f.field_key);
        });
      });
      map.set(camp.id, keys);
    });
    return map;
  }, [activeCampaigns, attrQueries, contactListIds]);

  const allCols = useMemo<ColDef[]>(() => {
    const attrCols = buildAttrCols(mergedAttrFields);
    return loadSavedCols('disposition-report', [...BASE_COLS, ...attrCols]);
  }, [mergedAttrFields]);

  const [cols, setCols] = useState<ColDef[]>(() => loadSavedCols('disposition-report', BASE_COLS));
  useEffect(() => { setCols(allCols); }, [allCols]);

  const prevSelectedRef = useRef<string[]>(selectedCampIds);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    const removed = prev.filter(id => !selectedCampIds.includes(id));
    if (removed.length === 0) { prevSelectedRef.current = selectedCampIds; return; }

    const remainingKeys = new Set<string>();
    selectedCampIds.forEach(id => {
      const keys = campToFieldKeys.get(id);
      if (keys) keys.forEach(k => remainingKeys.add(k));
    });

    const keysToRemove = new Set<string>();
    removed.forEach(id => {
      const keys = campToFieldKeys.get(id);
      if (keys) keys.forEach(k => { if (!remainingKeys.has(k)) keysToRemove.add(`attr_${k}`); });
    });

    if (keysToRemove.size > 0) {
      try {
        const saved = localStorage.getItem('reports_cols_disposition-report');
        if (saved) {
          const parsed = JSON.parse(saved);
          keysToRemove.forEach(k => delete parsed[k]);
          localStorage.setItem('reports_cols_disposition-report', JSON.stringify(parsed));
        }
      } catch { }
      setCols(prev => prev.filter(c => !keysToRemove.has(c.key)));
    }
    prevSelectedRef.current = selectedCampIds;
  }, [selectedCampIds, campToFieldKeys]);

  useEffect(() => {
    function onStorage() {
      const attrCols = buildAttrCols(mergedAttrFields);
      setCols(loadSavedCols('disposition-report', [...BASE_COLS, ...attrCols]));
      try {
        const saved = localStorage.getItem('disposition_report_campaigns');
        if (saved) setSelectedCampIds(JSON.parse(saved));
        else {
          const single = localStorage.getItem('disposition_report_campaign');
          if (single) setSelectedCampIds([single]);
        }
      } catch { }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mergedAttrFields]);

  function toggleCampaign(campId: string) {
    setSelectedCampIds(prev => {
      const next = prev.includes(campId) ? prev.filter(id => id !== campId) : [...prev, campId];
      localStorage.setItem('disposition_report_campaigns', JSON.stringify(next));
      return next;
    });
    setPage(1);
  }

  function selectAllCampaigns() {
    const allIds = campaigns.map((c: any) => c.id);
    setSelectedCampIds(allIds);
    localStorage.setItem('disposition_report_campaigns', JSON.stringify(allIds));
    setPage(1);
  }

  function clearAllCampaigns() {
    setSelectedCampIds([]);
    localStorage.setItem('disposition_report_campaigns', '[]');
    setPage(1);
  }

  const effectiveCols = cols.length > 0 ? cols : allCols;

  const [sortKey, setSortKey] = useState('given_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [globalQ, setGlobalQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});

  const allRows = useMemo(() => {
    if (selectedCampIds.length === 0) return [];
    const jobsList = jobData?.data || [];
    return (intData?.data || []).filter((r: any) => {
      if (!r.disposition_code_id && !r.disposition_code_label) return false;
      const job: any = jobsList.find((j: any) => j.id === r.job_id);
      return job && selectedCampIds.includes(job.campaign_id);
    });
  }, [intData, jobData, selectedCampIds]);

  const rows = useMemo(() => {
    let result: any[] = allRows;
    const q = globalQ.trim().toLowerCase();
    if (q) result = result.filter(r =>
      effectiveCols.filter(c => c.visible).some(c => c.get(r).toLowerCase().includes(q)),
    );
    Object.entries(colFilters).forEach(([key, vals]) => {
      if (!vals || vals.length === 0) return;
      const col = effectiveCols.find(c => c.key === key);
      if (col) result = result.filter(r => vals.some(v => col.get(r).toLowerCase() === v.toLowerCase()));
    });
    return [...result].sort((a, b) => {
      const col = effectiveCols.find(c => c.key === sortKey);
      const av = col ? col.get(a) : '', bv = col ? col.get(b) : '';
      return sortDir === 'desc'
        ? bv.localeCompare(av, undefined, { numeric: true })
        : av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [allRows, globalQ, colFilters, sortKey, sortDir, effectiveCols]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER));
  const paginated = rows.slice((page - 1) * PER, page * PER);
  const visCols = effectiveCols.filter(c => c.visible);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const hasSelection = selectedCampIds.length > 0;
  const attrsLoading = attrQueries.some(q => q.isLoading);

  if (isMini) {
    const miniCols = ['Disposition Code', 'Phone', 'Agent', 'Call Status'];
    const activeCols = BASE_COLS.filter(c => miniCols.includes(c.label));
    const miniRows = rows.slice(0, 5).map(r => ({ cells: activeCols.map(c => c.get(r)) }));
    return <MiniTable title={miniTitle || 'Disposition Report'} cols={activeCols.map(c => c.label)} rows={miniRows} pal={pal} onExpand={onExpand!} emptyMsg={selectedCampIds.length === 0 ? "Select a campaign" : "No dispositions found"} />;
  }

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(16,185,129,0.15)', border: '1.5px solid #a7f3d0', display: 'flex', flexDirection: 'column', minHeight: 700 }}>
      {/* ── Top Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#064e3b 0%,#059669 50%,#34d399 100%)', padding: '16px 22px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.01em', fontFamily: 'Sora, sans-serif' }}>
                Disposition Report
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '4px 0 0', fontWeight: 600 }}>
                {hasSelection
                  ? `${rows.length} records · ${selectedCampIds.length} campaign${selectedCampIds.length > 1 ? 's' : ''}${attrsLoading ? ' · loading columns…' : ` · ${mergedAttrFields.length} contact fields`}`
                  : 'Select campaigns from the sidebar or dropdown'}
              </p>
            </div>

            <CustomCampaignSelect
              campaigns={campaigns}
              selectedCampIds={selectedCampIds}
              onToggle={id => {
                setSelectedCampIds(prev => {
                  const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
                  localStorage.setItem('disposition_report_campaigns', JSON.stringify(next));
                  return next;
                });
                setPage(1);
              }}
            />
          </div>

          {hasSelection && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <input
                  value={globalQ}
                  onChange={e => setGlobalQ(e.target.value)}
                  placeholder="Search…"
                  style={{ height: 34, paddingLeft: 30, paddingRight: 10, fontSize: 12.5, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 150 }}
                />
              </div>
              <ColPicker cols={effectiveCols} onChange={c => { setCols(c); saveCols('disposition-report', c); }} accentColor={ACCENT} />
              <button
                onClick={() => exportCSV(rows, effectiveCols, 'disposition-report.csv')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                <Download size={13} /> Export
              </button>
            </div>
          )}
        </div>

        {/* Selected campaign chips */}
        {hasSelection && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
            {activeCampaigns.map((c: any) => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(255,255,255,0.18)', color: '#fff',
                fontSize: 11, fontWeight: 700, padding: '2px 8px 2px 10px',
                borderRadius: 99, border: '1px solid rgba(255,255,255,0.3)',
              }}>
                {c.name}
                <button
                  type="button"
                  onClick={() => toggleCampaign(c.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#fff', opacity: 0.8, display: 'flex' }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Body: Sidebar + Table ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 580, background: '#fff' }}>

        {/* Left sidebar */}
        <CampaignSidebar
          campaigns={campaigns}
          selectedCampIds={selectedCampIds}
          onToggle={toggleCampaign}
          onSelectAll={selectAllCampaigns}
          onClearAll={clearAllCampaigns}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        />

        {/* Right: filter bar + table */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Filter Bar moved inside table container below */}

          {/* Table Area */}
          {!hasSelection ? (
            <div style={{ background: '#fff', padding: '80px 24px', textAlign: 'center', flex: 1 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#10b98110', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: 16 }}>
                <LayoutList size={28} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>No Campaign Selected</p>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Select one or more campaigns from the sidebar on the left</p>
            </div>
          ) : (
            <div style={{ position: 'relative', zIndex: 1, overflowX: 'auto', background: '#fff', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ minWidth: visCols.length * 200, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <FilterBar
                  cols={visCols}
                  rows={allRows}
                  colFilters={colFilters}
                  onFilter={(k, v) => { setColFilters(f => ({ ...f, [k]: v })); setPage(1); }}
                  onClearAll={() => { setColFilters({}); setPage(1); }}
                  accentColor={ACCENT}
                />
                <div style={{ background: 'linear-gradient(135deg,#064e3b 0%,#059669 50%,#34d399 100%)', padding: '10px 22px 18px', flexShrink: 0 }}>
                  <TableHeader visCols={visCols} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} accentColor={ACCENT} />
                </div>
                <div style={{ maxHeight: 800, overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
                  {isLoading || attrsLoading ? (
                    <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>
                      {attrsLoading ? 'Loading contact list columns…' : 'Loading interactions…'}
                    </div>
                  ) : paginated.length === 0 ? (
                    <div style={{ padding: '56px 0', textAlign: 'center', fontSize: 14, color: '#94a3b8' }}>
                      No disposition records found for the selected campaign(s)
                    </div>
                  ) : paginated.map((r, idx) => (
                    <div
                      key={r.interaction_id || idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${visCols.length}, minmax(180px, 1fr))`,
                        gap: 20, padding: '11px 22px',
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#fff' : '#f0fdf4',
                        alignItems: 'center', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#dcfce7'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f0fdf4'}
                    >
                      {visCols.map(c => (
                        <div key={c.key} style={{ minWidth: 0, overflow: 'hidden', maxWidth: '100%' }}>
                          {c.key === 'call_status' && r.call_status
                            ? <StatusPill status={r.call_status} />
                            : <CellText>{c.get(r)}</CellText>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {hasSelection && (
            <TableFooter
              total={rows.length}
              sortLabel={effectiveCols.find(c => c.key === sortKey)?.label || sortKey}
              sortDir={sortDir}
              accentColor={ACCENT}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(p => p - 1)}
              onNext={() => setPage(p => p + 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}