import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCampaigns, getJobs } from '../api/client';
import { StatCard, Card, CardHeader, StatusBadge, Progress, PageLoader, Table } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Megaphone, Briefcase, TrendingUp, Users } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: campaigns, isLoading: loadingC } = useQuery({
    queryKey: ['campaigns'], queryFn: () => getCampaigns(),
  });
  const { data: jobs, isLoading: loadingJ } = useQuery({
    queryKey: ['jobs', 'active'], queryFn: () => getJobs({ status: 'active' }),
  });

  if (loadingC || loadingJ) return <PageLoader />;

  const activeCampaigns = campaigns?.data?.filter((c: any) => c.status === 'active').length || 0;
  const activeJobs = jobs?.data?.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Welcome back, {user?.firstName}</p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Campaigns" value={activeCampaigns} color="indigo" />
        <StatCard label="Running Jobs" value={activeJobs} color="green" />
        <StatCard label="Total Campaigns" value={campaigns?.data?.length || 0} color="gray" />
        <StatCard label="My Role" value={user?.role || ''} color="purple" />
      </div>

      {/* Active jobs */}
      <Card>
        <CardHeader title="Active Jobs" subtitle="Currently running campaign jobs"
          action={<button onClick={() => navigate('/jobs')} className="text-xs text-indigo-600 hover:underline">View all</button>} />
        <Table
          cols={[
            { header: 'Campaign', render: (r: any) => <span className="font-medium text-gray-900">{r.campaign_name}</span> },
            { header: 'Run #', key: 'job_run_number', width: '80px' },
            { header: 'Progress', render: (r: any) => (
              <div className="flex items-center gap-2">
                <Progress value={r.prcnt_complete} />
                <span className="text-xs text-gray-400 w-10">{r.prcnt_complete?.toFixed(0)}%</span>
              </div>
            )},
            { header: 'Contacts', render: (r: any) => `${r.processed_contacts} / ${r.total_contacts}` },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
          ]}
          rows={jobs?.data || []}
          keyFn={(r: any) => r.id}
          onRowClick={(r: any) => navigate(`/jobs/${r.id}`)}
          emptyMessage="No active jobs"
        />
      </Card>

      {/* Recent campaigns */}
      <Card>
        <CardHeader title="Recent Campaigns"
          action={<button onClick={() => navigate('/campaigns')} className="text-xs text-indigo-600 hover:underline">View all</button>} />
        <Table
          cols={[
            { header: 'Name', render: (r: any) => <span className="font-medium text-gray-900">{r.name}</span> },
            { header: 'Type', render: (r: any) => <StatusBadge status={r.schedule_type} /> },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
            { header: 'Agent Priority', render: (r: any) => r.agent_priority_enabled
              ? <span className="text-xs text-indigo-600 font-medium">✓ Enabled</span>
              : <span className="text-xs text-gray-400">Off</span> },
          ]}
          rows={campaigns?.data?.slice(0,5) || []}
          keyFn={(r: any) => r.id}
          onRowClick={(r: any) => navigate(`/campaigns/${r.id}`)}
          emptyMessage="No campaigns yet"
        />
      </Card>
    </div>
  );
}
