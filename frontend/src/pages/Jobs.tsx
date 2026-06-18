import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs, getJob, getJobStats, getJobContacts, updateCCS } from '../api/client';
import { Card, CardHeader, PagedTable, StatusBadge, Button, StatCard, Progress, PageLoader, Modal, Input, Select, SearchInput, FilterDropdown, FilterPill, ClearFiltersButton, EmptyState } from '../components/ui';
import { ArrowLeft, RefreshCw } from 'lucide-react';

// ── Jobs List ─────────────────────────────────────────────
export function JobsPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['jobs'], queryFn: () => getJobs() });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const allJobs: any[] = data?.data || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allJobs.filter((r) => {
      if (q && !(r.campaign_name || '').toLowerCase().includes(q)) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterType && r.schedule_type !== filterType) return false;
      return true;
    });
  }, [allJobs, search, filterStatus, filterType]);
  const hasActiveFilters = !!(search || filterStatus || filterType);
  const clearAll = () => { setSearch(''); setFilterStatus(''); setFilterType(''); };

  if (isLoading) return <PageLoader />;
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A0F00]">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {hasActiveFilters
              ? `${filtered.length} of ${allJobs.length} jobs`
              : 'System-created runtime instances of campaigns'}
          </p>
        </div>
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Refresh</Button>
      </div>

      {/* Search + filters */}
      <div className='space-y-3'>
        <div className='filter-bar'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search by campaign name…' />
          <div className='flex items-center gap-2 flex-wrap'>
            <FilterDropdown
              label='Status'
              value={filterStatus}
              onChange={setFilterStatus}
              color='green'
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'preparing', label: 'Preparing' },
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Completed' },
                { value: 'stopped', label: 'Stopped' },
              ]}
            />
            <FilterDropdown
              label='Type'
              value={filterType}
              onChange={setFilterType}
              color='indigo'
              options={[
                { value: 'finite', label: 'Finite' },
                { value: 'infinite', label: 'Infinite' },
              ]}
            />
            {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
          </div>
        </div>
        {hasActiveFilters && (
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
            {search && <FilterPill label={`Campaign: "${search}"`} onRemove={() => setSearch('')} />}
            {filterStatus && <FilterPill label={`Status: ${filterStatus}`} onRemove={() => setFilterStatus('')} />}
            {filterType && <FilterPill label={`Type: ${filterType}`} onRemove={() => setFilterType('')} />}
          </div>
        )}
      </div>

      <Card>
        {hasActiveFilters && filtered.length === 0 ? (
          <EmptyState title='No jobs match your filters' description='Try adjusting or clearing the filters above.' />
        ) : (
          <PagedTable
            cols={[
              { header: 'Campaign', width: '200px', render: (r: any) => <span className="font-medium text-gray-900">{r.campaign_name}</span> },
              {
                header: 'Progress', width: '180px', render: (r: any) => {
                  const pct = parseFloat(r.prcnt_complete) || 0;
                  return (
                    <div className="flex items-center gap-2">
                      <Progress value={pct} />
                      <span className="text-xs text-gray-400 w-12">{pct.toFixed(1)}%</span>
                    </div>
                  );
                }
              },
              { header: 'Contacts', width: '110px', render: (r: any) => `${r.processed_contacts ?? 0} / ${r.total_contacts ?? 0}` },
              { header: 'Status', width: '110px', render: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Started', width: '120px', render: (r: any) => new Date(r.start_time).toLocaleDateString() },
              { header: 'Type', width: '100px', render: (r: any) => <StatusBadge status={r.schedule_type} /> },
            ]}
            rows={filtered}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => navigate(`/jobs/${r.id}`)}
            emptyMessage="No jobs found"
          />
        )}
      </Card>
    </div>
  );
}

// ── Job Detail ────────────────────────────────────────────
export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [reassignModal, setReassignModal] = useState<any>(null);
  const [newAgent, setNewAgent] = useState('');
  const [newPriority, setNewPriority] = useState('');

  // Job polls while running — now returns live-computed progress from backend
  const { data: job, isLoading: loadJ, refetch: refetchJob } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'active' || status === 'preparing' || status === 'pending') return 5000;
      if (status === 'paused') return 10000;
      return false;
    },
  });

  // Stats also poll and now return live-computed progress from backend
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['job-stats', id],
    queryFn: () => getJobStats(id!),
    refetchInterval: (query) => {
      const status = job?.status;
      if (status === 'active' || status === 'preparing' || status === 'pending') return 5000;
      if (status === 'paused') return 15000;
      if (status === 'completed' || status === 'stopped') {
        if ((query.state.dataUpdateCount ?? 0) < 1) return 2000;
      }
      return false;
    },
  });

  // Contacts poll while running
  const { data: contacts, isLoading: loadC, refetch: refetchContacts } = useQuery({
    queryKey: ['job-contacts', id, statusFilter],
    queryFn: () => getJobContacts(id!, { status: statusFilter || undefined, per_page: 100 }),
    refetchInterval: () => {
      const status = job?.status;
      if (status === 'active' || status === 'preparing') return 8000;
      if (status === 'paused') return 20000;
      return false;
    },
  });

  const updateMut = useMutation({
    mutationFn: () => updateCCS(id!, reassignModal.id, {
      assigned_agent_id: newAgent || undefined,
      priority: newPriority ? parseInt(newPriority) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-contacts', id] });
      setReassignModal(null);
    },
  });

  if (loadJ) return <PageLoader />;
  if (!job) return <div className="p-6 text-gray-400">Job not found</div>;

  const byStatus = stats?.by_status || {};

  // --- PROGRESS SOURCE OF TRUTH ---
  // Prefer live-computed values from stats (which counts directly from CCS rows).
  // Fall back to job fields so the page works even before stats loads.
  const totalContacts = stats?.total_contacts ?? job.total_contacts ?? 0;
  const processedContacts = stats?.processed_contacts ?? job.processed_contacts ?? 0;
  const prcntComplete = stats?.prcnt_complete ?? job.prcnt_complete ?? 0;
  const isFinished = job.status === 'completed' || job.status === 'stopped';
  // When the job is marked completed, clamp to 100% visually
  const displayPrcnt = job.status === 'completed' ? 100 : prcntComplete;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/jobs')} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#1A0F00]">{job.campaign_name}</h1>
            {/* <span className="text-sm text-gray-400">Run #{job.job_run_number}</span> */}
            <StatusBadge status={job.status} />
          </div>
          {job.agent_priority_enabled && (
            <p className="text-xs text-indigo-600 mt-0.5">Agent priority enabled</p>
          )}
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={() => { refetchJob(); refetchStats(); refetchContacts(); }}
          size="sm"
        >
          Refresh
        </Button>
      </div>

      {/* Progress — uses live-computed values */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Overall progress</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {displayPrcnt.toFixed(1)}%
            </span>
            {isFinished && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${job.status === 'completed'
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-600'
                }`}>
                {job.status}
              </span>
            )}
          </div>
        </div>
        <Progress value={displayPrcnt} />
        <div className="text-xs text-gray-400 mt-1">
          {processedContacts} of {totalContacts} contacts processed
        </div>
      </Card>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Queued" value={byStatus.queued || 0} color="yellow" />
        <StatCard label="With Agent" value={byStatus.with_agent || 0} color="indigo" />
        <StatCard label="Completed" value={byStatus.completed || 0} color="green" />
        <StatCard label="Exhausted" value={byStatus.exhausted || 0} color="orange" />
        <StatCard label="DNC" value={byStatus.dnc || 0} color="red" />
      </div>

      {/* Per-agent breakdown */}
      {stats?.by_agent?.length > 0 && (
        <Card>
          <CardHeader title="Agent Activity" />
          <PagedTable
            cols={[
              { header: 'Agent', key: 'agent_name' },
              { header: 'With Agent', key: 'with_agent_count' },
              { header: 'Completed Today', key: 'completed_count' },
            ]}
            rows={stats.by_agent}
            keyFn={(r: any) => r.id}
          />
        </Card>
      )}

      {/* Contact CCS table */}
      <Card>
        <CardHeader title="Contact Queue" subtitle="All contacts for this job"
          action={
            <div className='flex items-center gap-2'>
              <SearchInput value={contactSearch} onChange={setContactSearch} placeholder='Search name or phone…' />
              <Select label="" value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'queued', label: 'Queued' },
                  { value: 'with_agent', label: 'With Agent' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'exhausted', label: 'Exhausted' },
                  { value: 'dnc', label: 'DNC' },
                ]} />
            </div>
          } />
        {loadC ? <PageLoader /> : (() => {
          const q = contactSearch.trim().toLowerCase();
          const rows = (contacts?.data || []).filter((r: any) => {
            if (!q) return true;
            const hay = `${r.first_name || ''} ${r.last_name || ''} ${r.phone_number || ''}`.toLowerCase();
            return hay.includes(q);
          });
          return (
            <PagedTable
              cols={[
                {
                  header: 'Contact', render: (r: any) => (
                    <div className="font-semibold text-gray-900">{r.phone_number}</div>
                  )
                },
                { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
                { header: 'Priority', key: 'priority' },
                { header: 'Attempts', key: 'attempts_made' },
                { header: 'Assigned Agent', render: (r: any) => r.assigned_agent_name || <span className="text-gray-400">—</span> },
                {
                  header: 'Next Attempt', render: (r: any) => r.next_attempt_at
                    ? new Date(r.next_attempt_at).toLocaleString() : '—'
                },
                {
                  header: 'Actions', render: (r: any) => (
                    <Button size="sm" variant="ghost"
                      onClick={e => { e.stopPropagation(); setReassignModal(r); setNewAgent(r.assigned_agent_id || ''); setNewPriority(String(r.priority)); }}>
                      Edit
                    </Button>
                  )
                },
              ]}
              rows={rows}
              keyFn={(r: any) => r.id}
              emptyMessage="No contacts match filter"
            />
          );
        })()}
      </Card>

      {/* Reassign modal */}
      <Modal title="Update Contact Assignment" open={!!reassignModal} onClose={() => setReassignModal(null)}>
        {reassignModal && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium text-gray-900">{reassignModal.first_name} {reassignModal.last_name}</div>
              <div className="text-sm text-gray-400">{reassignModal.phone_number}</div>
            </div>
            <Input label="Assigned Agent ID (UUID) — leave blank to release to pool"
              value={newAgent} onChange={e => setNewAgent(e.target.value)}
              placeholder="UUID or blank for general pool" />
            <Input label="Priority (lower = higher priority)" type="number"
              value={newPriority} onChange={e => setNewPriority(e.target.value)} />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setReassignModal(null)}>Cancel</Button>
              <Button className="flex-1" loading={updateMut.isPending} onClick={() => updateMut.mutate()}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}