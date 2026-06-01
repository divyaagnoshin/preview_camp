import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCampaign,
  runCampaign,
  stopCampaign,
  getCampaignReport,
} from '../api/client';
import {
  Card,
  CardHeader,
  StatusBadge,
  Button,
  StatCard,
  PageLoader,
  Progress,
} from '../components/ui';
import { Play, Square, ArrowLeft, CheckCircle, ExternalLink, ShieldOff, Users, TrendingUp, Phone, XCircle, Clock } from 'lucide-react';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => getCampaign(id!),
  });
  const { data: report } = useQuery({
    queryKey: ['campaign-report', id],
    queryFn: () => getCampaignReport(id!),
    enabled: !!campaign && campaign.status !== 'draft',
  });

  const runMut = useMutation({
    mutationFn: () => runCampaign(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });
  const stopMut = useMutation({
    mutationFn: () => stopCampaign(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  if (isLoading) return <PageLoader />;
  if (!campaign)
    return <div className='p-6 text-gray-400'>Campaign not found</div>;

  return (
    <div className='p-6 space-y-5'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <button
          onClick={() => navigate('/campaigns')}
          className='p-1.5 hover:bg-gray-100 rounded-lg'
        >
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: "Sora, sans-serif" }}>{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className='text-sm text-[#7A5C44] mt-0.5 capitalize'>
            {campaign.schedule_type} campaign
            {campaign.agent_priority_enabled && ' · Agent priority enabled'}
          </p>
        </div>
        <div className='flex gap-2'>
          {(campaign.status === 'draft' || campaign.status === 'stopped') && (
            <Button
              icon={<Play className='w-4 h-4' />}
              variant='success'
              loading={runMut.isPending}
              onClick={() => runMut.mutate()}
            >
              {campaign.status === 'stopped'
                ? 'Restart Campaign'
                : 'Run Campaign'}
            </Button>
          )}
          {campaign.status === 'active' && (
            <Button
              icon={<Square className='w-4 h-4' />}
              variant='danger'
              loading={stopMut.isPending}
              onClick={() => stopMut.mutate()}
            >
              Stop Campaign
            </Button>
          )}
          {campaign.active_job_id && (
            <Button
              variant='secondary'
              onClick={() => navigate(`/jobs/${campaign.active_job_id}`)}
            >
              View Live Job →
            </Button>
          )}
        </div>
      </div>

      {/* Config cards */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        <StatCard label='Max Attempts' value={campaign.max_attempts || '∞'} color='indigo' />
        <StatCard label='Wrap-up Time' value={`${campaign.wrapup_time_sec}s`} color='amber' />
        <StatCard label='Auto-dial Delay' value={`${campaign.auto_dial_delay_sec}s`} color='cyan' />
        <StatCard label='Caller ID' value={campaign.caller_id || '—'} color='gray' />
      </div>

      {/* Report stats */}
      {report && (
        <>
          {/* Contact accounting: raw list count vs unique queued vs collapsed dupes */}
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-4'>
            <StatCard label='Total Contacts' value={report.total_contacts || 0} icon={Users}
              gradient='linear-gradient(135deg,#6B7280,#4B5563)' tint='linear-gradient(135deg,#F9FAFB,#F3F4F6)' border='#E5E7EB' textColor='#374151'/>
            <StatCard label='Successful Contacts' value={report.successful_contacts || 0} icon={CheckCircle}
              gradient='linear-gradient(135deg,#10B981,#059669)' tint='linear-gradient(135deg,#ECFDF5,#D1FAE5)' border='#A7F3D0' textColor='#065F46'/>
            <StatCard label='Duplicate Contacts' value={report.duplicate_contacts || 0} icon={XCircle}
              gradient='linear-gradient(135deg,#F59E0B,#D97706)' tint='linear-gradient(135deg,#FFFBEB,#FEF3C7)' border='#FDE68A' textColor='#92400E'/>
          </div>

          <div className='grid grid-cols-2 lg:grid-cols-3 gap-4'>
            <StatCard label='Attempted' value={report.attempted || 0} icon={Phone}
              gradient='linear-gradient(135deg,#8B5CF6,#7C3AED)' tint='linear-gradient(135deg,#F5F3FF,#EDE9FE)' border='#DDD6FE' textColor='#5B21B6'/>
           {/*  <StatCard label='Connected' value={report.connected || 0} icon={CheckCircle}
              gradient='linear-gradient(135deg,#10B981,#059669)' tint='linear-gradient(135deg,#ECFDF5,#D1FAE5)' border='#A7F3D0' textColor='#065F46'/> */}
            <StatCard label='Completed' value={report.completed_total || 0} icon={TrendingUp}
              gradient='linear-gradient(135deg,#3B82F6,#1D4ED8)' tint='linear-gradient(135deg,#EFF6FF,#DBEAFE)' border='#BFDBFE' textColor='#1E40AF'/>
            <StatCard label='DNC' value={report.dnc || 0} icon={XCircle}
              gradient='linear-gradient(135deg,#EF4444,#DC2626)' tint='linear-gradient(135deg,#FEF2F2,#FEE2E2)' border='#FECACA' textColor='#991B1B'/>
          </div>

          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard label='Avg Preview Time' value={`${report.avg_preview_duration_sec || 0}s`} icon={Clock}
              gradient='linear-gradient(135deg,#E8470A,#F59E0B)' tint='linear-gradient(135deg,#FFF4EE,#FFE6D2)' border='#FFD3B5' textColor='#C43A06'/>
            <StatCard label='Avg Talk Time' value={`${report.avg_talk_time_sec || 0}s`} icon={Phone}
              gradient='linear-gradient(135deg,#F59E0B,#EAB308)' tint='linear-gradient(135deg,#FFFBEB,#FEF3C7)' border='#FDE68A' textColor='#92400E'/>
            <StatCard label='Avg Wrap-up' value={`${report.avg_wrapup_duration_sec || 0}s`} icon={Clock}
              gradient='linear-gradient(135deg,#06B6D4,#0891B2)' tint='linear-gradient(135deg,#ECFEFF,#CFFAFE)' border='#A5F3FC' textColor='#164E63'/>
            <StatCard label='Avg Total Handle' value={`${report.avg_total_handling_sec || 0}s`} icon={TrendingUp}
              gradient='linear-gradient(135deg,#A855F7,#7C3AED)' tint='linear-gradient(135deg,#F5F3FF,#EDE9FE)' border='#DDD6FE' textColor='#5B21B6'/>
          </div>

          {/* Disposition breakdown */}
          {report.dispositions?.length > 0 && (
            <Card>
              <CardHeader title='Disposition Breakdown' />
              <div className='p-5 space-y-3'>
                {report.dispositions.map((d: any) => (
                  <div key={d.code}>
                    <div className='flex items-center justify-between mb-1'>
                      <span className='text-sm text-gray-700'>{d.label}</span>
                      <span className='text-sm font-medium text-gray-900'>
                        {d.count}
                      </span>
                    </div>
                    <Progress
                      value={(d.count / (report.total_contacts || 1)) * 100}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Attached lists */}
      <Card>
        <CardHeader title='Contact Lists' />
        <div className='p-5 space-y-2'>
          {campaign.contact_lists?.length === 0 && (
            <p className='text-sm text-gray-400'>No contact lists attached.</p>
          )}
          {campaign.contact_lists?.map((l: any) => (
            <div
              key={l.id}
              className='contactlist-inner-card flex items-center gap-3'
            >
              <CheckCircle className='w-4 h-4 text-green-500 shrink-0' />
              <span className='text-sm font-medium text-gray-900 flex-1'>{l.name}</span>
              <button
                onClick={() => navigate(`/contact-lists/${l.id}`)}
                className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold transition'
              >
                <ExternalLink className='w-3.5 h-3.5' />
                View Contacts
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* DNC groups */}
      <Card>
        <CardHeader
          title='DNC Groups'
          subtitle='Suppression lists applied to this campaign'
        />
        <div className='p-5 space-y-2'>
          {(!campaign.dnc_groups || campaign.dnc_groups.length === 0) && (
            <p className='text-sm text-gray-400'>No DNC groups attached.</p>
          )}
          {campaign.dnc_groups?.map((g: any) => (
            <div
              key={g.id}
              className='dnc-inner-card flex items-center gap-3'
            >
              <ShieldOff className='w-4 h-4 text-red-500 shrink-0' />
              <span className='text-sm font-medium text-red-800 flex-1'>{g.name}</span>
              <button
                onClick={() => navigate('/dnc', { state: { group: g } })}
                className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 text-xs font-semibold transition'
              >
                <ExternalLink className='w-3.5 h-3.5' />
                View Group
              </button>
            </div>
          ))}
        </div>
      </Card>


    </div>
  );
}
