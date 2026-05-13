import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AgentSession,
  AgentUser,
  createAgent,
  deleteAgent,
  listAgents,
  listAgentSessions,
} from '../api/client';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Modal,
  PageLoader,
  Select,
  StatusBadge,
  Table,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, UserPlus } from 'lucide-react';

// Heartbeat is considered stale after this many seconds; matches the backend
// HEARTBEAT_STALE_SECONDS default so the UI label flips at the same time the
// recovery worker would tear the session down.
const HEARTBEAT_STALE_SEC = 60;

type Row = AgentUser & { session: AgentSession | null };

export default function AgentsPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<AgentUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  });
  const { data: sessions } = useQuery({
    queryKey: ['agent-sessions'],
    queryFn: listAgentSessions,
    // Poll every 5s so "Current Contact" and "Last Heartbeat" reflect live
    // workspace activity without the user having to refresh the page.
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // Force re-render every second so the relative "Xs ago" heartbeat label
  // ticks even between server fetches.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (isLoading) return <PageLoader />;

  const sessionMap: Record<string, AgentSession> = {};
  (sessions?.data || []).forEach((s) => {
    sessionMap[s.agent_id] = s;
  });
  const agents: Row[] = (data?.data || []).map((a) => ({
    ...a,
    session: sessionMap[a.id] || null,
  }));

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: "Sora, sans-serif" }}>Users</h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            Live session status and team overview
          </p>
        </div>
        {isAdmin && (
          <Button
            icon={<Plus className='w-3.5 h-3.5' />}
            onClick={() => setCreateOpen(true)}
          >
            New user
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title='Team' subtitle={`${agents.length} member(s)`} />
        <Table
          cols={[
            {
              header: 'Agent',
              render: (r: Row) => (
                <div className='flex items-center gap-3'>
                  <div className='w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700'>
                    {r.first_name?.[0]}
                    {r.last_name?.[0]}
                  </div>
                  <div>
                    <div className='font-medium text-gray-900'>
                      {r.first_name} {r.last_name}
                    </div>
                    <div className='text-xs text-gray-400'>{r.email}</div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Role',
              render: (r: Row) => (
                <Badge
                  label={r.role}
                  color={
                    r.role === 'admin'
                      ? 'indigo'
                      : r.role === 'supervisor'
                        ? 'purple'
                        : 'gray'
                  }
                />
              ),
            },
            {
              header: 'Active',
              render: (r: Row) =>
                r.is_active ? (
                  <Badge label='active' color='green' />
                ) : (
                  <Badge label='disabled' color='red' />
                ),
              width: '100px',
            },
            {
              header: 'Session',
              render: (r: Row) =>
                r.session ? (
                  <StatusBadge status={r.session.status} />
                ) : (
                  <span className='text-xs text-gray-400'>No session</span>
                ),
              width: '140px',
            },
            {
              header: 'Current Contact',
              render: (r: Row) => <CurrentContactCell session={r.session} />,
            },
            {
              header: 'Last Heartbeat',
              render: (r: Row) => <HeartbeatCell session={r.session} />,
              width: '160px',
            },
            ...(isAdmin
              ? [
                  {
                    header: 'Actions',
                    render: (r: Row) =>
                      r.id === user?.id ? (
                        <span className='text-xs text-gray-400'>You</span>
                      ) : (
                        <Button
                          size='sm'
                          variant='ghost'
                          icon={<Trash2 className='w-3.5 h-3.5' />}
                          onClick={() => setDeleteUser(r)}
                          className='text-red-600 hover:bg-red-50'
                        >
                          Delete
                        </Button>
                      ),
                    width: '120px',
                  },
                ]
              : []),
          ]}
          rows={agents}
          keyFn={(r) => r.id}
          emptyMessage='No agents found'
        />
      </Card>

      {createOpen && (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ['agents'] });
          }}
        />
      )}

      {deleteUser && (
        <DeleteAgentModal
          target={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => {
            setDeleteUser(null);
            qc.invalidateQueries({ queryKey: ['agents'] });
            qc.invalidateQueries({ queryKey: ['agent-sessions'] });
          }}
        />
      )}
    </div>
  );
}

function CurrentContactCell({ session }: { session: AgentSession | null }) {
  if (!session?.current_contact_id)
    return <span className='text-gray-400'>—</span>;
  const name = [session.current_first_name, session.current_last_name]
    .filter(Boolean)
    .join(' ');
  return (
    <div className='leading-tight'>
      <div className='text-sm font-medium text-gray-900'>
        {name || 'Unnamed contact'}
      </div>
      <div className='text-xs text-gray-500 font-mono'>
        {session.current_phone_number || '—'}
        {session.current_campaign_name && (
          <span className='ml-2 text-gray-400'>
            · {session.current_campaign_name}
          </span>
        )}
      </div>
    </div>
  );
}

function HeartbeatCell({ session }: { session: AgentSession | null }) {
  if (!session?.last_heartbeat_at)
    return <span className='text-gray-400'>—</span>;
  const ageSec = Math.max(
    0,
    Math.round((Date.now() - new Date(session.last_heartbeat_at).getTime()) / 1000),
  );
  const stale = ageSec > HEARTBEAT_STALE_SEC && session.status !== 'offline';
  const label =
    ageSec < 60
      ? `${ageSec}s ago`
      : ageSec < 3600
        ? `${Math.floor(ageSec / 60)}m ago`
        : new Date(session.last_heartbeat_at).toLocaleTimeString();
  return (
    <div className='leading-tight'>
      <div
        className={
          stale ? 'text-sm text-red-600 font-medium' : 'text-sm text-gray-700'
        }
      >
        {label}
      </div>
      {stale && <div className='text-xs text-red-500'>stale</div>}
    </div>
  );
}

function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [error, setError] = useState('');

  const m = useMutation({
    mutationFn: createAgent,
    onSuccess: () => onCreated(),
    onError: (e: any) =>
      setError(e?.response?.data?.error || 'Failed to create user'),
  });

  return (
    <Modal title='New agent' open={true} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({
            email: email.trim(),
            password,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role,
          });
        }}
        className='space-y-3'
      >
        <div className='grid grid-cols-2 gap-3'>
          <Input
            label='First name'
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoFocus
          />
          <Input
            label='Last name'
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
        <Input
          label='Email'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label='Password (min 8 chars)'
          type='password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <Select
          label='Role'
          value={role}
          onChange={(e) =>
            setRole(e.target.value as 'agent' | 'supervisor' | 'admin')
          }
          options={[
            { value: 'agent', label: 'Agent' },
            { value: 'supervisor', label: 'Supervisor' },
            { value: 'admin', label: 'Admin' },
          ]}
        />
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2 pt-2'>
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='submit'
            loading={m.isPending}
            icon={<UserPlus className='w-3.5 h-3.5' />}
          >
            Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteAgentModal({
  target,
  onClose,
  onDeleted,
}: {
  target: AgentUser;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: () => deleteAgent(target.id),
    onSuccess: () => onDeleted(),
    onError: (e: any) =>
      setError(e?.response?.data?.error || 'Failed to delete user'),
  });

  return (
    <Modal
      title={`Delete ${target.first_name} ${target.last_name}?`}
      open={true}
      onClose={onClose}
    >
      <div className='space-y-4'>
        <p className='text-sm text-gray-600'>
          This removes <strong>{target.email}</strong> from your organization.
          If the user has historical activity, the account is deactivated
          instead of hard-deleted so audit history is preserved.
        </p>
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2'>
          <Button variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant='danger'
            loading={m.isPending}
            onClick={() => m.mutate()}
          >
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
