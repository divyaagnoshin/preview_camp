import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button, Card, CardHeader, EmptyState, PageLoader, SearchInput } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import {
  Search, Plus, X, ChevronLeft, ChevronRight,
  ChevronDown, Loader2, AlertCircle, Check, Users,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface Campaign { id: string; name: string; status?: string; }

interface OrgUser {
  id: string; first_name: string; last_name: string;
  email: string; role: 'agent' | 'supervisor'; is_active: boolean;
}

interface MappingRow {
  mapping_id: number; campaign_id: string; user_id: string;
  first_name: string | null; last_name: string | null;
  email: string | null; role: string | null; is_active: boolean | null;
}

// ── API ───────────────────────────────────────────────────────

const listCampaigns   = (): Promise<{ data: Campaign[] }>    => api.get('/campaigns').then((r) => r.data);
const listUsers       = (): Promise<{ data: OrgUser[] }>     => api.get('/campaign-mapping/agents').then((r) => r.data);
const listAllMappings = (): Promise<{ data: MappingRow[] }>  => api.get('/campaign-mapping').then((r) => r.data);
const getMappingsByCampaign = (id: string): Promise<{ data: { mapping_id: number; campaign_id: string; user_id: string }[] }> =>
  api.get(`/campaign-mapping/by-campaign/${id}`).then((r) => r.data);
const syncCampaignAgents = (campaignId: string, agent_userids: string[]): Promise<{ message: string }> =>
  api.put(`/campaign-mapping/sync-campaign/${campaignId}`, { agent_userids }).then((r) => r.data);

// ── Avatar ────────────────────────────────────────────────────

function Avatar({ name, small }: { name: string; small?: boolean }) {
  const parts = name.trim().split(' ');
  return (
    <div className={`rounded-full bg-gradient-to-br from-[#F4521E] to-[#F5A623] flex items-center justify-center text-white font-bold flex-shrink-0 ${small ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'}`}>
      {(parts[0]?.[0] ?? '').toUpperCase()}{(parts[1]?.[0] ?? '').toUpperCase()}
    </div>
  );
}

// ── Pagination button ─────────────────────────────────────────

function PagBtn({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-2 py-1 rounded text-xs bg-white border border-gray-200 text-gray-600 hover:border-[#F4521E] hover:text-[#F4521E] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {label}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function CampaignMappingPage() {
  const { isAdmin } = useAuth();

  const [globalSearch, setGlobalSearch] = useState('');
  const [pageSize, setPageSize]         = useState(25);
  const [currentPage, setCurrentPage]   = useState(1);
  const [modalOpen, setModalOpen]       = useState(false);

  const { data: campaignData, isLoading: loadingCampaigns } = useQuery({ queryKey: ['campaigns'],               queryFn: listCampaigns });
  const { data: usersData }                                  = useQuery({ queryKey: ['org-users'],               queryFn: listUsers });
  const { data: mappingData, isLoading: loadingMappings, refetch: refetchMappings } =
    useQuery({ queryKey: ['campaign-agent-mappings'], queryFn: listAllMappings });

  const allCampaigns: Campaign[]  = campaignData?.data ?? [];
  const allUsers: OrgUser[]       = usersData?.data ?? [];
  const allMappings: MappingRow[] = mappingData?.data ?? [];

  const campaignById = useMemo(() => {
    const m: Record<string, Campaign> = {};
    allCampaigns.forEach((c) => { m[c.id] = c; });
    return m;
  }, [allCampaigns]);

  const filteredRows = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return allMappings;
    return allMappings.filter((r) => {
      const campName  = (campaignById[r.campaign_id]?.name ?? r.campaign_id).toLowerCase();
      const agentName = `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
      const email     = (r.email ?? '').toLowerCase();
      return campName.includes(q) || agentName.includes(q) || email.includes(q) || r.user_id.toLowerCase().includes(q);
    });
  }, [allMappings, globalSearch, campaignById]);

  const totalEntries = filteredRows.length;
  const totalPages   = Math.max(1, Math.ceil(totalEntries / pageSize));
  const safePage     = Math.min(currentPage, totalPages);
  const pagedRows    = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const fromEntry    = totalEntries === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toEntry      = Math.min(safePage * pageSize, totalEntries);

  if (loadingCampaigns) return <PageLoader />;

  return (
    <div className="p-6 md:p-8 w-full space-y-6 animate-fade-up">

      {/* Header */}
      <div className="page-header-bar">
        <div>
          <h1 className="text-2xl font-bold page-heading">Campaign Mapping</h1>
          <p className="text-sm text-gray-500 mt-1">
            {globalSearch
              ? `${filteredRows.length} of ${allMappings.length} mapping(s)`
              : 'Assign agents and supervisors to campaigns'}
          </p>
        </div>
        {isAdmin && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>
            Add Mapping
          </Button>
        )}
      </div>

      {/* Search */}
      {allMappings.length > 0 && (
        <div className="filter-bar">
          <SearchInput value={globalSearch} onChange={(v) => { setGlobalSearch(v); setCurrentPage(1); }} placeholder="Search by campaign or agent…" />
        </div>
      )}

      {/* Table card */}
      <Card>
        <CardHeader title={globalSearch ? `${filteredRows.length} of ${allMappings.length} mappings` : 'All Mappings'} />

        {allMappings.length === 0 ? (
          <EmptyState
            title="No mappings yet"
            description="Assign agents or supervisors to a campaign to get started."
            action={isAdmin ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>Add Mapping</Button> : undefined}
          />
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
              {['Campaign', 'Type', 'Agent Name', 'Agent ID'].map((h) => (
                <div key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</div>
              ))}
            </div>

            {/* Rows */}
            {loadingMappings ? (
              <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin text-[#F4521E]" />
                <span className="text-sm">Loading mappings…</span>
              </div>
            ) : pagedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                <Users className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No results match your search</p>
              </div>
            ) : (
              <div>
                {pagedRows.map((row, i) => {
                  const campName = campaignById[row.campaign_id]?.name ?? row.campaign_id;
                  const fullName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—';
                  return (
                    <div key={row.mapping_id}
                      className={`grid grid-cols-4 px-5 py-3 items-center border-b border-gray-50 last:border-0 hover:bg-orange-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <div className="text-sm text-gray-900 font-medium truncate pr-2" title={campName}>{campName}</div>
                      <div>
                        {row.role ? (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${row.role === 'supervisor' ? 'bg-[#F4521E]/10 text-[#F4521E]' : 'bg-[#F5A623]/15 text-[#C07800]'}`}>
                            {row.role}
                          </span>
                        ) : <span className="text-[11px] text-gray-400">—</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Avatar name={fullName} small />
                        <span className="text-sm text-gray-800 truncate">{fullName}</span>
                      </div>
                      <div className="text-xs text-gray-400 font-mono truncate" title={row.user_id}>{row.user_id}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-5 py-3 text-xs text-gray-500 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <span>Showing {fromEntry} to {toEntry} of {totalEntries} entries</span>
              <div className="flex items-center gap-1.5">
                <PagBtn onClick={() => setCurrentPage(1)}                                      disabled={safePage === 1}          label="<<" />
                <PagBtn onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}              disabled={safePage === 1}          label="<"  />
                <PagBtn onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}     disabled={safePage === totalPages} label=">"  />
                <PagBtn onClick={() => setCurrentPage(totalPages)}                             disabled={safePage === totalPages} label=">>" />
                <div className="relative ml-2">
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="appearance-none bg-white border border-gray-200 text-gray-600 text-xs rounded px-3 py-1.5 pr-7 outline-none focus:border-[#F4521E] cursor-pointer">
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Modal */}
      {modalOpen && (
        <AddMappingModal
          campaigns={allCampaigns}
          users={allUsers}
          onSaved={() => { refetchMappings(); setModalOpen(false); }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Add Mapping Modal ─────────────────────────────────────────

interface AddMappingModalProps {
  campaigns: Campaign[]; users: OrgUser[]; onSaved: () => void; onClose: () => void;
}

function AddMappingModal({ campaigns, users, onSaved, onClose }: AddMappingModalProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campDropOpen, setCampDropOpen]         = useState(false);
  const [campSearch, setCampSearch]             = useState('');
  const [localUnassigned, setLocalUnassigned]   = useState<OrgUser[]>([]);
  const [localAssigned,   setLocalAssigned]     = useState<OrgUser[]>([]);
  const [unassignedSel,   setUnassignedSel]     = useState<Set<string>>(new Set());
  const [assignedSel,     setAssignedSel]       = useState<Set<string>>(new Set());
  const [unSearch, setUnSearch] = useState('');
  const [aSearch,  setASearch]  = useState('');
  const [loadingCampaign, setLoadingCampaign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCampaign) { setLocalUnassigned(users); setLocalAssigned([]); setUnassignedSel(new Set()); setAssignedSel(new Set()); return; }
    setLoadingCampaign(true); setError(null);
    getMappingsByCampaign(selectedCampaign.id)
      .then(({ data }) => {
        const ids = new Set(data.map((d) => d.user_id));
        setLocalAssigned(users.filter((u) => ids.has(u.id)));
        setLocalUnassigned(users.filter((u) => !ids.has(u.id)));
        setUnassignedSel(new Set()); setAssignedSel(new Set());
      })
      .catch(() => { setLocalUnassigned(users); setLocalAssigned([]); })
      .finally(() => setLoadingCampaign(false));
  }, [selectedCampaign?.id]);

  const moveRight = () => {
    if (!unassignedSel.size) return;
    const moving = localUnassigned.filter((u) => unassignedSel.has(u.id));
    setLocalAssigned((p) => [...p, ...moving]);
    setLocalUnassigned((p) => p.filter((u) => !unassignedSel.has(u.id)));
    setUnassignedSel(new Set());
  };

  const moveLeft = () => {
    if (!assignedSel.size) return;
    const moving = localAssigned.filter((u) => assignedSel.has(u.id));
    setLocalUnassigned((p) => [...p, ...moving]);
    setLocalAssigned((p) => p.filter((u) => !assignedSel.has(u.id)));
    setAssignedSel(new Set());
  };

  const toggleSel = (id: string, setSel: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    setSel((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleSave = async () => {
    if (!selectedCampaign) return;
    setSaving(true); setError(null);
    try { await syncCampaignAgents(selectedCampaign.id, localAssigned.map((u) => u.id)); onSaved(); }
    catch (e: any) { setError(e?.response?.data?.error ?? 'Save failed. Please try again.'); }
    finally { setSaving(false); }
  };

  const filteredCampaigns = useMemo(() => {
    const q = campSearch.trim().toLowerCase();
    return q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns;
  }, [campaigns, campSearch]);

  const filteredUnassigned = useMemo(() => {
    const q = unSearch.trim().toLowerCase();
    return q ? localUnassigned.filter((u) => `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : localUnassigned;
  }, [localUnassigned, unSearch]);

  const filteredAssigned = useMemo(() => {
    const q = aSearch.trim().toLowerCase();
    return q ? localAssigned.filter((u) => `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : localAssigned;
  }, [localAssigned, aSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>Create Campaign Mapping</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-[#F4521E] hover:bg-red-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* Campaign selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Campaign</label>
            <div className="relative">
              <button type="button" onClick={() => setCampDropOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-[#F4521E] transition-colors text-left focus:outline-none shadow-sm">
                {selectedCampaign
                  ? <span className="text-sm font-medium text-gray-900 truncate">{selectedCampaign.name}</span>
                  : <span className="text-sm text-gray-400">Select a campaign…</span>}
                <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${campDropOpen ? 'rotate-180' : ''}`} />
              </button>
              {campDropOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                      <Search className="w-3.5 h-3.5 text-gray-400" />
                      <input autoFocus type="text" value={campSearch} onChange={(e) => setCampSearch(e.target.value)}
                        placeholder="Search campaigns…"
                        className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none" />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredCampaigns.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">No campaigns found</div>
                    ) : filteredCampaigns.map((c) => (
                      <button key={c.id} type="button"
                        onClick={() => { setSelectedCampaign(c); setCampDropOpen(false); setCampSearch(''); }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-orange-50 transition-colors ${selectedCampaign?.id === c.id ? 'bg-orange-50' : ''}`}>
                        <span className="text-sm text-gray-900 truncate">{c.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.status && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.status}</span>}
                          {selectedCampaign?.id === c.id && <Check className="w-4 h-4 text-[#F4521E]" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dual agent listbox */}
          {loadingCampaign ? (
            <div className="flex items-center justify-center py-10 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#F4521E]" />
              <span className="text-sm text-gray-500">Loading agents…</span>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_52px_1fr] gap-2 items-start">
              <AgentListBox label="Unassigned Agents" count={localUnassigned.length}
                agents={filteredUnassigned} selected={unassignedSel}
                search={unSearch} onSearch={setUnSearch}
                onToggle={(id) => toggleSel(id, setUnassignedSel)}
                emptyText={selectedCampaign ? 'All agents assigned' : 'Select a campaign first'}
                accentColor="#F5A623" />

              <div className="flex flex-col items-center justify-center gap-3 pt-8">
                <button type="button" onClick={moveRight} disabled={unassignedSel.size === 0}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F4521E] text-white hover:bg-[#D83E10] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-md disabled:shadow-none">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button type="button" onClick={moveLeft} disabled={assignedSel.size === 0}
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#F4521E] text-[#F4521E] hover:bg-[#F4521E] hover:text-white disabled:border-gray-200 disabled:text-gray-300 disabled:cursor-not-allowed transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <AgentListBox label="Assigned Agents" count={localAssigned.length}
                agents={filteredAssigned} selected={assignedSel}
                search={aSearch} onSearch={setASearch}
                onToggle={(id) => toggleSel(id, setAssignedSel)}
                emptyText={selectedCampaign ? 'No agents assigned yet' : 'Select a campaign first'}
                accentColor="#F4521E" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 rounded-b-2xl flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!selectedCampaign || saving || loadingCampaign}>
            Save Mapping
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Agent list box ────────────────────────────────────────────

function AgentListBox({ label, count, agents, selected, search, onSearch, onToggle, emptyText, accentColor }: {
  label: string; count: number; agents: OrgUser[]; selected: Set<string>;
  search: string; onSearch: (v: string) => void; onToggle: (id: string) => void;
  emptyText: string; accentColor: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold" style={{ color: accentColor }}>{label}</label>
        <span className="text-[11px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: accentColor }}>{count}</span>
      </div>
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 mb-1.5 focus-within:border-[#F4521E] transition-colors shadow-sm">
        <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <input type="text" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search…"
          className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none" />
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ minHeight: 200, maxHeight: 240, overflowY: 'auto' }}>
        {agents.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-gray-400 text-xs text-center px-4">{emptyText}</div>
        ) : agents.map((u) => {
          const sel = selected.has(u.id);
          const fullName = `${u.first_name} ${u.last_name}`;
          return (
            <button key={u.id} type="button" onClick={() => onToggle(u.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-gray-50 last:border-0 transition-colors ${sel ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
              <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                style={sel ? { background: accentColor, border: `2px solid ${accentColor}` } : { border: '2px solid #D1D5DB', background: 'white' }}>
                {sel && <Check className="w-2 h-2 text-white" />}
              </div>
              <Avatar name={fullName} small />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{fullName}</div>
                <div className="text-[10px] text-gray-500 truncate">{u.email}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${u.role === 'supervisor' ? 'bg-[#F4521E]/10 text-[#F4521E]' : 'bg-[#F5A623]/15 text-[#C07800]'}`}>
                {u.role}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-[11px] font-medium mt-1 text-right" style={{ color: selected.size > 0 ? accentColor : '#9CA3AF' }}>
        {selected.size > 0 ? `${selected.size} selected` : 'Click to select'}
      </div>
    </div>
  );
}