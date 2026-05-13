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
import { Play, Square, ArrowLeft, CheckCircle } from 'lucide-react';

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
            <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: "Sora, sans-serif" }}>{campaign.name}</h1>
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
        <StatCard
          label='Max Attempts'
          value={campaign.max_attempts || '∞'}
          color='indigo'
        />
        <StatCard
          label='Retry Interval'
          value={`${campaign.attempt_interval_min}m`}
          color='gray'
        />
        <StatCard
          label='Auto-dial Delay'
          value={`${campaign.auto_dial_delay_sec}s`}
          color='gray'
        />
        <StatCard
          label='Caller ID'
          value={campaign.caller_id || '—'}
          color='gray'
        />
      </div>

      {/* Report stats */}
      {report && (
        <>
          {/* Contact accounting: raw list count vs unique queued vs collapsed dupes */}
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-4'>
            <StatCard
              label='Total Contacts'
              value={report.total_contacts || 0}
              color='gray'
            />
            <StatCard
              label='Successful Contacts'
              value={report.successful_contacts || 0}
              color='green'
            />
            <StatCard
              label='Duplicate Contacts'
              value={report.duplicate_contacts || 0}
              color='orange'
            />
          </div>

          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard
              label='Attempted'
              value={report.attempted || 0}
              color='indigo'
            />
            <StatCard
              label='Connected'
              value={report.connected || 0}
              color='green'
            />
            <StatCard
              label='Completed'
              value={report.completed_total || 0}
              color='blue'
            />
            <StatCard label='DNC' value={report.dnc || 0} color='red' />
          </div>

          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard
              label='Avg Preview Time'
              value={`${report.avg_preview_duration_sec || 0}s`}
              color='gray'
            />
            <StatCard
              label='Avg Talk Time'
              value={`${report.avg_talk_time_sec || 0}s`}
              color='gray'
            />
            <StatCard
              label='Avg Wrap-up'
              value={`${report.avg_wrapup_duration_sec || 0}s`}
              color='gray'
            />
            <StatCard
              label='Avg Total Handle'
              value={`${report.avg_total_handling_sec || 0}s`}
              color='gray'
            />
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
          {campaign.contact_lists?.map((l: any) => (
            <div
              key={l.id}
              className='flex items-center gap-3 p-3 bg-gray-50 rounded-lg'
            >
              <CheckCircle className='w-4 h-4 text-green-500' />
              <span className='text-sm text-gray-900'>{l.name}</span>
              <button
                onClick={() => navigate(`/contact-lists/${l.id}`)}
                className='ml-auto text-xs text-[#F4521E] hover:underline font-semibold'
              >
                View →
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* DNC groups */}
      {campaign.dnc_groups?.length > 0 && (
        <Card>
          <CardHeader
            title='DNC Groups'
            subtitle='Suppression lists applied to this campaign'
          />
          <div className='p-5 space-y-2'>
            {campaign.dnc_groups.map((g: any) => (
              <div
                key={g.id}
                className='text-sm text-gray-700 bg-red-50 px-3 py-2 rounded-lg'
              >
                🚫 {g.name}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
