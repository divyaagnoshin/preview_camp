import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCampaigns, getCampaignReport, getInteractions } from '../api/client';
import { Card, CardHeader, Select, StatCard, Table, StatusBadge, Progress, PageLoader, Badge } from '../components/ui';
import { BarChart2 } from 'lucide-react';

export default function ReportsPage() {
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [previewFilter, setPreviewFilter] = useState('');
  const [callFilter, setCallFilter] = useState('');

  const { data: campaigns } = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns });
  const { data: report, isLoading: loadReport } = useQuery({
    queryKey: ['campaign-report', selectedCampaign],
    queryFn: () => getCampaignReport(selectedCampaign),
    enabled: !!selectedCampaign,
  });
  const { data: interactions, isLoading: loadInt } = useQuery({
    queryKey: ['interactions', previewFilter, callFilter],
    queryFn: () => getInteractions({
      preview_action: previewFilter || undefined,
      call_status: callFilter || undefined,
      per_page: 100,
    }),
  });

  const campOptions = [
    { value: '', label: 'Select a campaign...' },
    ...(campaigns?.data || []).map((c: any) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="p-6 md:p-8 w-full space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-[#1A0F00]">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Campaign performance and interaction analytics</p>
      </div>

      {/* Campaign Report */}
      <Card>
        <CardHeader title="Campaign Report"
          action={
            <div className="w-72">
              <Select label="" value={selectedCampaign}
                onChange={e => setSelectedCampaign(e.target.value)} options={campOptions} />
            </div>
          } />
        {!selectedCampaign && (
          <div className="p-12 text-center text-gray-400">
            <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Select a campaign to see its report</p>
          </div>
        )}
        {selectedCampaign && loadReport && <PageLoader />}
        {report && (
          <div className="p-5 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard label="Total Contacts"  value={report.total_contacts  || 0} color="gray" />
              <StatCard label="Attempted"       value={report.attempted       || 0} color="indigo" />
              <StatCard label="Connected"       value={report.connected       || 0} color="green" />
              <StatCard label="Completed"       value={report.completed_total || 0} color="blue" />
              <StatCard label="DNC"             value={report.dnc             || 0} color="red" />
            </div>

            {/* Timings */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Avg Preview Time"  value={`${report.avg_preview_duration_sec || 0}s`}   color="gray" />
              <StatCard label="Avg Talk Time"      value={`${report.avg_talk_time_sec || 0}s`}          color="gray" />
              <StatCard label="Avg Wrap-up Time"   value={`${report.avg_wrapup_duration_sec || 0}s`}    color="gray" />
              <StatCard label="Avg Total Handling" value={`${report.avg_total_handling_sec || 0}s`}     color="gray" />
            </div>

            {/* Disposition breakdown */}
            {report.dispositions?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Disposition Breakdown</h3>
                <div className="space-y-3">
                  {report.dispositions.map((d: any) => (
                    <div key={d.code}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{d.label}</span>
                        <span className="text-sm font-medium text-gray-900">{d.count}</span>
                      </div>
                      <Progress value={(d.count / Math.max(report.total_contacts, 1)) * 100} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Interaction Log */}
      <Card>
        <CardHeader title="Interaction Log" subtitle="All agent contact events"
          action={
            <div className="flex gap-2">
              <Select label="" value={previewFilter} onChange={e => setPreviewFilter(e.target.value)}
                options={[{value:'',label:'All actions'},{value:'accepted',label:'Accepted'},{value:'rejected',label:'Rejected'}]} />
              <Select label="" value={callFilter} onChange={e => setCallFilter(e.target.value)}
                options={[{value:'',label:'All call statuses'},{value:'connected',label:'Connected'},{value:'no_answer',label:'No Answer'},{value:'busy',label:'Busy'},{value:'voicemail',label:'Voicemail'}]} />
            </div>
          } />
        {loadInt ? <PageLoader /> : (
          <Table
            cols={[
              { header: 'Contact', render: (r: any) => (
                <div>
                  <div className="font-medium text-gray-900">{r.first_name} {r.last_name}</div>
                  <div className="text-xs text-gray-400">{r.phone_number}</div>
                </div>
              )},
              { header: 'Agent', key: 'agent_name' },
              { header: 'Action', render: (r: any) => <StatusBadge status={r.preview_action} /> },
              { header: 'Call Status', render: (r: any) => r.call_status ? <StatusBadge status={r.call_status} /> : <span className="text-gray-400">—</span> },
              { header: 'Talk Time', render: (r: any) => r.talk_time_sec ? `${r.talk_time_sec}s` : '—' },
              { header: 'Total Handle', render: (r: any) => r.total_handling_sec ? `${r.total_handling_sec}s` : '—' },
              { header: 'Disposition', render: (r: any) => r.disposition_code_label
                ? <Badge label={r.disposition_code_label} color="blue" />
                : <span className="text-gray-400">—</span> },
              { header: 'Given At', render: (r: any) => new Date(r.given_at).toLocaleString() },
            ]}
            rows={interactions?.data || []}
            keyFn={(r: any) => r.interaction_id}
            emptyMessage="No interactions found"
          />
        )}
      </Card>
    </div>
  );
}
