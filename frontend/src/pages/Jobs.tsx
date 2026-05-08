import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs, getJob, getJobStats, getJobContacts, updateCCS } from '../api/client';
import { Card, CardHeader, Table, StatusBadge, Button, StatCard, Progress, PageLoader, Modal, Input, Select } from '../components/ui';
import { ArrowLeft, RefreshCw } from 'lucide-react';

// ── Jobs List ─────────────────────────────────────────────
export function JobsPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['jobs'], queryFn: () => getJobs() });
  if (isLoading) return <PageLoader />;
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">System-created runtime instances of campaigns</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Refresh</Button>
      </div>
      <Card>
        <Table
          cols={[
            { header: 'Campaign', render: (r: any) => <span className="font-medium text-gray-900">{r.campaign_name}</span> },
            { header: 'Run #', key: 'job_run_number', width: '70px' },
            { header: 'Progress', render: (r: any) => (
              <div className="flex items-center gap-2">
                <Progress value={r.prcnt_complete} />
                <span className="text-xs text-gray-400 w-12">{r.prcnt_complete?.toFixed(1)}%</span>
              </div>
            )},
            { header: 'Contacts', render: (r: any) => `${r.processed_contacts} / ${r.total_contacts}` },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
            { header: 'Started', render: (r: any) => new Date(r.start_time).toLocaleDateString() },
            { header: 'Type', render: (r: any) => <StatusBadge status={r.schedule_type} /> },
          ]}
          rows={data?.data || []}
          keyFn={(r: any) => r.id}
          onRowClick={(r: any) => navigate(`/jobs/${r.id}`)}
          emptyMessage="No jobs found"
        />
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
  const [reassignModal, setReassignModal] = useState<any>(null);
  const [newAgent, setNewAgent] = useState('');
  const [newPriority, setNewPriority] = useState('');

  const { data: job, isLoading: loadJ } = useQuery({
    queryKey: ['job', id], queryFn: () => getJob(id!),
  });
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['job-stats', id], queryFn: () => getJobStats(id!),
    refetchInterval: job?.status === 'active' ? 10000 : false,
  });
  const { data: contacts, isLoading: loadC } = useQuery({
    queryKey: ['job-contacts', id, statusFilter],
    queryFn: () => getJobContacts(id!, { status: statusFilter || undefined, per_page: 100 }),
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

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/jobs')} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{job.campaign_name}</h1>
            <span className="text-sm text-gray-400">Run #{job.job_run_number}</span>
            <StatusBadge status={job.status} />
          </div>
          {job.agent_priority_enabled && (
            <p className="text-xs text-indigo-600 mt-0.5">Agent priority enabled</p>
          )}
        </div>
        <Button variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => refetchStats()} size="sm">
          Refresh
        </Button>
      </div>

      {/* Progress */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Overall progress</span>
          <span className="text-sm font-medium text-gray-900">{job.prcnt_complete?.toFixed(1)}%</span>
        </div>
        <Progress value={job.prcnt_complete} />
        <div className="text-xs text-gray-400 mt-1">{job.processed_contacts} of {job.total_contacts} contacts processed</div>
      </Card>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Queued"     value={byStatus.queued      || 0} color="yellow" />
        <StatCard label="With Agent" value={byStatus.with_agent  || 0} color="indigo" />
        <StatCard label="Completed"  value={byStatus.completed   || 0} color="green" />
        <StatCard label="Exhausted"  value={byStatus.exhausted   || 0} color="orange" />
        <StatCard label="DNC"        value={byStatus.dnc         || 0} color="red" />
      </div>

      {/* Per-agent breakdown */}
      {stats?.by_agent?.length > 0 && (
        <Card>
          <CardHeader title="Agent Activity" />
          <Table
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
            <Select label="" value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              options={[
                {value:'',label:'All statuses'},
                {value:'queued',label:'Queued'},
                {value:'with_agent',label:'With Agent'},
                {value:'completed',label:'Completed'},
                {value:'exhausted',label:'Exhausted'},
                {value:'dnc',label:'DNC'},
              ]} />
          } />
        {loadC ? <PageLoader /> : (
          <Table
            cols={[
              { header: 'Contact', render: (r: any) => (
                <div>
                  <div className="font-medium text-gray-900">{r.first_name} {r.last_name}</div>
                  <div className="text-xs text-gray-400">{r.phone_number}</div>
                </div>
              )},
              { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Priority', key: 'priority' },
              { header: 'Attempts', key: 'attempts_made' },
              { header: 'Assigned Agent', render: (r: any) => r.assigned_agent_name || <span className="text-gray-400">—</span> },
              { header: 'Next Attempt', render: (r: any) => r.next_attempt_at
                ? new Date(r.next_attempt_at).toLocaleString() : '—' },
              { header: 'Actions', render: (r: any) => (
                <Button size="sm" variant="ghost"
                  onClick={e => { e.stopPropagation(); setReassignModal(r); setNewAgent(r.assigned_agent_id||''); setNewPriority(String(r.priority)); }}>
                  Edit
                </Button>
              )},
            ]}
            rows={contacts?.data || []}
            keyFn={(r: any) => r.id}
            emptyMessage="No contacts match filter"
          />
        )}
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
