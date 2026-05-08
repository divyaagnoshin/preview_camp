import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, Table, StatusBadge, Badge, PageLoader } from '../components/ui';

export default function AgentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then(r => r.data).catch(() => ({ data: [] })),
  });
  const { data: sessions } = useQuery({
    queryKey: ['agent-sessions'],
    queryFn: () => api.get('/sessions').then(r => r.data).catch(() => ({ data: [] })),
    refetchInterval: 15000,
  });

  if (isLoading) return <PageLoader />;

  // Merge session status into agents
  const sessionMap: Record<string, any> = {};
  (sessions?.data || []).forEach((s: any) => { sessionMap[s.agent_id] = s; });

  const agents = (data?.data || []).map((a: any) => ({
    ...a, session: sessionMap[a.id] || null,
  }));

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Agents</h1>
        <p className="text-sm text-gray-400 mt-0.5">Live session status and team overview</p>
      </div>

      <Card>
        <Table
          cols={[
            { header: 'Agent', render: (r: any) => (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">
                  {r.first_name?.[0]}{r.last_name?.[0]}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{r.first_name} {r.last_name}</div>
                  <div className="text-xs text-gray-400">{r.email}</div>
                </div>
              </div>
            )},
            { header: 'Role', render: (r: any) => <Badge label={r.role} color={r.role==='admin'?'indigo':r.role==='supervisor'?'purple':'gray'} /> },
            { header: 'Session Status', render: (r: any) => r.session
              ? <StatusBadge status={r.session.status} />
              : <span className="text-xs text-gray-400">No session</span>
            },
            { header: 'Current Contact', render: (r: any) => r.session?.current_contact_id
              ? <span className="text-xs font-mono text-indigo-600">Active call</span>
              : <span className="text-gray-400">—</span>
            },
            { header: 'Last Heartbeat', render: (r: any) => r.session?.last_heartbeat_at
              ? new Date(r.session.last_heartbeat_at).toLocaleTimeString()
              : '—'
            },
          ]}
          rows={agents}
          keyFn={(r: any) => r.id}
          emptyMessage="No agents found"
        />
      </Card>
    </div>
  );
}
