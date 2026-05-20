import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCampaigns, getCampaignReport, getInteractions } from '../api/client';
import { StatusBadge, PageLoader, Badge } from '../components/ui';
import {
  BarChart2, ChevronDown, ChevronUp, Calendar, Search,
  Users, CheckCircle, XCircle, Phone, TrendingUp, Clock, Filter,
} from 'lucide-react';

/* ─── palette ───────────────────────────────────────────────────── */
const PALETTE = [
  { accent: '#6366f1', light: '#eef2ff', muted: '#c7d2fe', label: '#4338ca' },
  { accent: '#0ea5e9', light: '#f0f9ff', muted: '#bae6fd', label: '#0369a1' },
  { accent: '#10b981', light: '#ecfdf5', muted: '#a7f3d0', label: '#047857' },
  { accent: '#f59e0b', light: '#fffbeb', muted: '#fde68a', label: '#b45309' },
  { accent: '#ec4899', light: '#fdf2f8', muted: '#f9a8d4', label: '#be185d' },
  { accent: '#14b8a6', light: '#f0fdfa', muted: '#99f6e4', label: '#0f766e' },
  { accent: '#f97316', light: '#fff7ed', muted: '#fed7aa', label: '#c2410c' },
  { accent: '#8b5cf6', light: '#f5f3ff', muted: '#ddd6fe', label: '#6d28d9' },
];
const pal = (i: number) => PALETTE[i % PALETTE.length];

/* ─── status config ─────────────────────────────────────────────── */
const ST: Record<string, { color: string; bg: string; dot: string }> = {
  active:    { color: '#059669', bg: '#ecfdf5', dot: '#10b981' },
  inactive:  { color: '#6b7280', bg: '#f9fafb', dot: '#9ca3af' },
  paused:    { color: '#d97706', bg: '#fffbeb', dot: '#f59e0b' },
  draft:     { color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6' },
  completed: { color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
};

/* ─── components ────────────────────────────────────────────────── */
function Avatar({ name, color }: { name: string; color: string }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('');
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
      letterSpacing: '0.02em',
    }}>{init || '?'}</div>
  );
}

function Pill({ status }: { status: string }) {
  const s = ST[status?.toLowerCase()] || ST.inactive;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
      border: `1px solid ${s.dot}33`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: `1.5px solid ${color}22`,
      padding: '14px 16px',
      borderLeft: `3px solid ${color}`,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 6, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums', margin: 0 }}>
        {value}{sub && <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', marginLeft: 2 }}>{sub}</span>}
      </p>
    </div>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color, margin: '0 0 10px' }}>{label}</p>
  );
}

const inputStyle: React.CSSProperties = {
  height: 34, fontSize: 12.5, borderRadius: 8,
  border: '1.5px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff', outline: 'none',
  transition: 'border-color 0.15s',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, paddingLeft: 12, paddingRight: 24,
  appearance: 'none' as const, cursor: 'pointer', minWidth: 120,
};

/* ─── expanded detail ───────────────────────────────────────────── */
function Detail({ id, idx }: { id: string; idx: number }) {
  const p = pal(idx);
  const { data: r, isLoading } = useQuery({
    queryKey: ['campaign-report', id],
    queryFn: () => getCampaignReport(id),
    enabled: !!id,
  });

  if (isLoading) return (
    <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center', background: p.light }}>
      <PageLoader />
    </div>
  );
  if (!r) return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No data</div>;

  const tot = Math.max(r.total_contacts || 1, 1);

  return (
    <div style={{ padding: '24px 28px', background: p.light, borderTop: `1.5px solid ${p.muted}` }}>

      <div style={{ marginBottom: 20 }}>
        <SectionLabel label="Contact Summary" color={p.label} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <Metric label="Total" value={(r.total_contacts ?? 0).toLocaleString()} color="#64748b" />
          <Metric label="Successful" value={(r.successful_contacts ?? 0).toLocaleString()} color="#10b981" />
          <Metric label="Duplicates" value={(r.duplicate_contacts ?? 0).toLocaleString()} color="#f59e0b" />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <SectionLabel label="Call Performance" color={p.label} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <Metric label="Attempted" value={(r.attempted ?? 0).toLocaleString()} color="#8b5cf6" />
          <Metric label="Connected" value={(r.connected ?? 0).toLocaleString()} color="#10b981" />
          <Metric label="Completed" value={(r.completed_total ?? 0).toLocaleString()} color="#3b82f6" />
          <Metric label="DNC" value={(r.dnc ?? 0).toLocaleString()} color="#ef4444" />
        </div>
      </div>

      <div style={{ marginBottom: r.dispositions?.length > 0 ? 20 : 0 }}>
        <SectionLabel label="Avg Timings" color={p.label} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <Metric label="Preview" value={r.avg_preview_duration_sec ?? 0} sub="s" color="#f97316" />
          <Metric label="Talk time" value={r.avg_talk_time_sec ?? 0} sub="s" color="#0ea5e9" />
          <Metric label="Wrap-up" value={r.avg_wrapup_duration_sec ?? 0} sub="s" color="#14b8a6" />
          <Metric label="Total" value={r.avg_total_handling_sec ?? 0} sub="s" color="#a855f7" />
        </div>
      </div>

      {r.dispositions?.length > 0 && (
        <div>
          <SectionLabel label="Dispositions" color={p.label} />
          <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${p.muted}`, overflow: 'hidden' }}>
            {r.dispositions.map((d: any, di: number) => {
              const pct = Math.round((d.count / tot) * 100);
              return (
                <div key={d.code} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '11px 16px',
                  borderBottom: di < r.dispositions.length - 1 ? `1px solid ${p.muted}55` : 'none',
                }}>
                  <span style={{ fontSize: 12.5, color: '#475569', width: 140, flexShrink: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                  <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 999 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: p.accent, borderRadius: 999, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: p.label, width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.count}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main page ─────────────────────────────────────────────────── */
export default function ReportsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [campQ, setCampQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusF, setStatusF] = useState('');
  const [prevF, setPrevF] = useState('');
  const [callF, setCallF] = useState('');
  const [intQ, setIntQ] = useState('');

  const { data: campaigns } = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns });
  const { data: interactions, isLoading: loadInt } = useQuery({
    queryKey: ['interactions', prevF, callF],
    queryFn: () => getInteractions({ preview_action: prevF || undefined, call_status: callF || undefined, per_page: 100 }),
  });

  const camps = useMemo(() => {
    let rows: any[] = campaigns?.data || [];
    const q = campQ.trim().toLowerCase();
    if (q) rows = rows.filter((c: any) => c.name?.toLowerCase().includes(q));
    if (statusF) rows = rows.filter((c: any) => c.status?.toLowerCase() === statusF);
    return rows;
  }, [campaigns, campQ, statusF]);

  const ints = useMemo(() => {
    const rows = interactions?.data || [];
    const q = intQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r: any) => {
      const n = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
      return n.includes(q) || (r.phone_number || '').toLowerCase().includes(q) || (r.agent_name || '').toLowerCase().includes(q);
    });
  }, [interactions, intQ]);

  const CAMP_GRID = '2.5fr 1fr 90px 90px 90px 40px';
  const INT_GRID  = '2fr 1.2fr 100px 110px 80px 100px 130px 140px';

  const th: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const,
    letterSpacing: '0.09em', color: 'rgba(255,255,255,0.7)',
  };

  return (
    <div style={{ padding: '28px 32px', fontFamily: '"DM Sans", sans-serif', minHeight: '100%', background: '#f8fafc' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 800, margin: 0,
            fontFamily: 'Sora, sans-serif', letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #F4521E 0%, #F5A623 55%, #FFD080 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Reports</h1>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Campaign performance &amp; interactions</span>
        </div>
        <div style={{ width: 36, height: 3, borderRadius: 99, background: 'linear-gradient(90deg,#F4521E,#F5A623)' }} />
      </div>

      {/* ══ CAMPAIGN REPORT ══════════════════════════════════════ */}
      <div style={{
        borderRadius: 18, overflow: 'hidden', marginBottom: 24,
        boxShadow: '0 4px 24px rgba(99,102,241,0.12), 0 1px 3px rgba(0,0,0,0.05)',
        border: '1.5px solid #e0e7ff',
      }}>

        {/* gradient header */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 45%,#7c3aed 100%)', padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart2 style={{ width: 16, height: 16, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Campaign Report</p>
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', margin: 0 }}>{camps.length} campaign{camps.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <input style={{ ...inputStyle, paddingLeft: 30, paddingRight: 10, width: 168 }} placeholder="Search campaigns…" value={campQ} onChange={e => setCampQ(e.target.value)} />
              </div>
              <div style={{ position: 'relative' }}>
                <Calendar style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <input type="date" style={{ ...inputStyle, paddingLeft: 30, paddingRight: 8 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>→</span>
              <div style={{ position: 'relative' }}>
                <Calendar style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <input type="date" style={{ ...inputStyle, paddingLeft: 30, paddingRight: 8 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div style={{ position: 'relative' }}>
                <Filter style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <select style={{ ...selectStyle, paddingLeft: 30 }} value={statusF} onChange={e => setStatusF(e.target.value)}>
                  <option value="">All statuses</option>
                  {['active','inactive','paused','draft','completed'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: CAMP_GRID, gap: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {['Campaign','Status','Contacts','Connected','Completed',''].map((l, i) => (
              <span key={i} style={th}>{l}</span>
            ))}
          </div>
        </div>

        {/* rows */}
        <div style={{ maxHeight: 520, overflowY: 'auto', background: '#fafbff' }}>
          {camps.length === 0 ? (
            <div style={{ padding: '56px 0', textAlign: 'center' }}>
              <BarChart2 style={{ width: 32, height: 32, color: '#e2e8f0', margin: '0 auto 10px', display: 'block' }} />
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No campaigns found</p>
            </div>
          ) : camps.map((c: any, idx: number) => {
            const p = pal(idx);
            const open = expanded === String(c.id);
            return (
              <div key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => setExpanded(open ? null : String(c.id))}
                  style={{
                    width: '100%', display: 'grid', gridTemplateColumns: CAMP_GRID,
                    gap: 16, alignItems: 'center', padding: '13px 24px',
                    textAlign: 'left', cursor: 'pointer', border: 'none',
                    background: open ? p.light : '#fff',
                    borderLeft: `3px solid ${open ? p.accent : 'transparent'}`,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = '#f8faff'; (e.currentTarget as HTMLElement).style.borderLeftColor = p.muted; } }}
                  onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar name={c.name} color={p.accent} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: open ? p.label : '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                      {c.description && <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</p>}
                    </div>
                  </div>
                  <div>{c.status ? <Pill status={c.status} /> : <span style={{ color: '#d1d5db' }}>—</span>}</div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{(c.total_contacts ?? 0).toLocaleString()}</span>
                  <span style={{ fontSize: 13, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{c.connected != null ? c.connected.toLocaleString() : '—'}</span>
                  <span style={{ fontSize: 13, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{c.completed_total != null ? c.completed_total.toLocaleString() : '—'}</span>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {open
                      ? <ChevronUp style={{ width: 15, height: 15, color: p.accent }} />
                      : <ChevronDown style={{ width: 15, height: 15, color: '#cbd5e1' }} />}
                  </div>
                </button>
                {open && <Detail id={String(c.id)} idx={idx} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ INTERACTION LOG ══════════════════════════════════════ */}
      <div style={{
        borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(14,165,233,0.10), 0 1px 3px rgba(0,0,0,0.05)',
        border: '1.5px solid #bae6fd',
      }}>

        {/* gradient header */}
        <div style={{ background: 'linear-gradient(135deg,#0c4a6e 0%,#0284c7 50%,#38bdf8 100%)', padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Phone style={{ width: 16, height: 16, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Interaction Log</p>
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', margin: 0 }}>All agent contact events</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
                <input style={{ ...inputStyle, paddingLeft: 30, paddingRight: 10, width: 220 }} placeholder="Search contact, phone, agent…" value={intQ} onChange={e => setIntQ(e.target.value)} />
              </div>
              <select style={selectStyle} value={prevF} onChange={e => setPrevF(e.target.value)}>
                <option value="">All actions</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
              <select style={selectStyle} value={callF} onChange={e => setCallF(e.target.value)}>
                <option value="">All call statuses</option>
                <option value="connected">Connected</option>
                <option value="no_answer">No Answer</option>
                <option value="busy">Busy</option>
                <option value="voicemail">Voicemail</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: INT_GRID, gap: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {['Contact','Agent','Action','Call status','Talk','Handle','Disposition','Time'].map((l, i) => (
              <span key={i} style={th}>{l}</span>
            ))}
          </div>
        </div>

        {/* rows */}
        <div style={{ background: '#f8fbff' }}>
          {loadInt ? (
            <div style={{ padding: '48px 0', display: 'flex', justifyContent: 'center' }}><PageLoader /></div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {ints.length === 0 ? (
                <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                  {intQ ? `No results for "${intQ}"` : 'No interactions found'}
                </div>
              ) : ints.map((r: any, idx: number) => (
                <div
                  key={r.interaction_id}
                  style={{
                    display: 'grid', gridTemplateColumns: INT_GRID, gap: 12,
                    alignItems: 'center', padding: '12px 24px',
                    borderBottom: '1px solid #f1f5f9',
                    background: idx % 2 === 0 ? '#fff' : '#f8fbff',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eff6ff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? '#fff' : '#f8fbff'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#64748b,#475569)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                      {[(r.first_name || '')[0], (r.last_name || '')[0]].filter(Boolean).join('').toUpperCase() || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.first_name} {r.last_name}</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0', fontVariantNumeric: 'tabular-nums' }}>{r.phone_number}</p>
                    </div>
                  </div>

                  {r.agent_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#94a3b8,#64748b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
                        {(r.agent_name || '').trim().split(/\s+/).slice(0,2).map((w: string) => w[0]?.toUpperCase()).join('')}
                      </div>
                      <span style={{ fontSize: 12.5, color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.agent_name}</span>
                    </div>
                  ) : <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>}

                  <span>{r.preview_action ? <StatusBadge status={r.preview_action} /> : <span style={{ color: '#d1d5db' }}>—</span>}</span>
                  <span>{r.call_status ? <StatusBadge status={r.call_status} /> : <span style={{ color: '#d1d5db' }}>—</span>}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{r.talk_time_sec ? `${r.talk_time_sec}s` : '—'}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{r.total_handling_sec ? `${r.total_handling_sec}s` : '—'}</span>
                  <span>{r.disposition_code_label ? <Badge label={r.disposition_code_label} color="blue" /> : <span style={{ color: '#d1d5db' }}>—</span>}</span>
                  <span style={{ fontSize: 11.5, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(r.given_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}