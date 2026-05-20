import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCampaigns, getJobs } from '../api/client';
import { Card, CardHeader, StatusBadge, Progress, PageLoader, Table } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Megaphone, Briefcase, TrendingUp, Users, ArrowRight, Activity } from 'lucide-react';

function KPICard({ label, value, sub, icon: Icon, gradient, tint, border }: { label: string; value: string | number; sub?: string; icon: typeof Megaphone; gradient: string; tint: string; border: string }) {
  return (
    <div
      className='rounded-2xl p-5 shadow-[0_2px_16px_rgba(244,82,30,0.06)] hover:shadow-[0_8px_24px_rgba(244,82,30,0.12)] transition-all duration-200 hover:-translate-y-0.5 flex gap-4 items-start border'
      style={{ background: tint, borderColor: border }}
    >
      <div className='w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0' style={{ background: gradient }}>
        <Icon className='w-5 h-5 text-white' />
      </div>
      <div className='min-w-0'>
        <div className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>{value}</div>
        <div className='text-xs font-medium text-[#7A5C44] mt-0.5'>{label}</div>
        {sub && <div className='text-xs text-[#B89070] mt-1'>{sub}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: campaigns, isLoading: loadingC } = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaigns() });
  const { data: jobs, isLoading: loadingJ } = useQuery({ queryKey: ['jobs', 'active'], queryFn: () => getJobs({ status: 'active' }) });

  if (loadingC || loadingJ) return <PageLoader />;

  const activeCampaigns = campaigns?.data?.filter((c: any) => c.status === 'active').length || 0;
  const activeJobs = jobs?.data?.length || 0;

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      {/* Welcome header */}
      <div className='flex items-center justify-between flex-wrap gap-4'>
        <div>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
            <span style={{ background: 'linear-gradient(135deg, #F4521E, #F5A623)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {user?.firstName}
            </span> 
          </h1>
          <p className='text-sm text-[#7A5C44] mt-1'>Here's what's happening with your campaigns today</p>
        </div>
        <div className='flex items-center gap-2 text-xs text-[#7A5C44] bg-white border border-[#FFE0C8] rounded-xl px-3 py-2'>
          <Activity className='w-3.5 h-3.5 text-[#F4521E]' />
          Live data
          <span className='w-1.5 h-1.5 rounded-full bg-[#F4521E] pulse-dot' />
        </div>
      </div>

      {/* KPI grid */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 anim-d1'>
        <KPICard label='Active Campaigns' value={activeCampaigns} icon={Megaphone}
          gradient='linear-gradient(135deg,#F4521E,#F5A623)'
          tint='linear-gradient(135deg,#FFF4EE,#FFE6D2)' border='#FFD3B5'
          sub='Currently running' />
        <KPICard label='Running Jobs' value={activeJobs} icon={Briefcase}
          gradient='linear-gradient(135deg,#10B981,#059669)'
          tint='linear-gradient(135deg,#ECFDF5,#D1FAE5)' border='#A7F3D0'
          sub='In progress' />
        <KPICard label='Total Campaigns' value={campaigns?.data?.length || 0} icon={TrendingUp}
          gradient='linear-gradient(135deg,#3B82F6,#1D4ED8)'
          tint='linear-gradient(135deg,#EFF6FF,#DBEAFE)' border='#BFDBFE'
          sub='All time' />
        <KPICard label='My Role' value={user?.role || ''} icon={Users}
          gradient='linear-gradient(135deg,#A855F7,#7C3AED)'
          tint='linear-gradient(135deg,#F5F3FF,#EDE9FE)' border='#DDD6FE'
          sub={user?.orgName || ''} />
      </div>

      {/* Active jobs */}
      <Card className='anim-d2'>
        <CardHeader title='Active Jobs' subtitle='Currently running campaign jobs'
          action={
            <button onClick={() => navigate('/jobs')} className='text-xs font-semibold text-[#F4521E] hover:text-[#D93D0E] flex items-center gap-1 transition-colors'>
              View all <ArrowRight className='w-3 h-3' />
            </button>
          } />
        <Table
          cols={[
            { header: 'Campaign', render: (r: any) => <span className='font-semibold text-[#1A0F00]'>{r.campaign_name}</span> },
            { header: 'Run #', key: 'job_run_number', width: '70px' },
            {
              header: 'Progress', render: (r: any) => (
                <div className='flex items-center gap-2 min-w-[120px]'>
                  <Progress value={r.prcnt_complete} />
                  <span className='text-xs text-[#7A5C44] w-9 text-right'>{r.prcnt_complete?.toFixed(0)}%</span>
                </div>
              )
            },
            { header: 'Contacts', render: (r: any) => <span className='text-[#5C4030]'>{r.processed_contacts} / {r.total_contacts}</span> },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
          ]}
          rows={jobs?.data || []}
          keyFn={(r: any) => r.id}
          onRowClick={(r: any) => navigate(`/jobs/${r.id}`)}
          emptyMessage='No active jobs'
        />
      </Card>

      {/* Recent campaigns */}
      <Card className='anim-d3'>
        <CardHeader title='Recent Campaigns'
          action={
            <button onClick={() => navigate('/campaigns')} className='text-xs font-semibold text-[#F4521E] hover:text-[#D93D0E] flex items-center gap-1 transition-colors'>
              View all <ArrowRight className='w-3 h-3' />
            </button>
          } />
        <Table
          cols={[
            { header: 'Name', render: (r: any) => <span className='font-semibold text-[#1A0F00]'>{r.name}</span> },
            { header: 'Type', render: (r: any) => <StatusBadge status={r.schedule_type} /> },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
            {
              header: 'Agent Priority', render: (r: any) => r.agent_priority_enabled
                ? <span className='text-xs font-semibold text-[#F4521E]'>âœ“ Enabled</span>
                : <span className='text-xs text-[#C4A080]'>Off</span>
            },
          ]}
          rows={campaigns?.data?.slice(0, 5) || []}
          keyFn={(r: any) => r.id}
          onRowClick={(r: any) => navigate(`/campaigns/${r.id}`)}
          emptyMessage='No campaigns yet'
        />
      </Card>
    </div>
  );
}
