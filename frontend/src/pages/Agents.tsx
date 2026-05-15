import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AgentSession,
  AgentUser,
  createAgent,
  deleteAgent,
  listAgents,
  listAgentSessions,
  updateAgent,
} from '../api/client';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ClearFiltersButton,
  EmptyState,
  FilterDropdown,
  FilterPill,
  Input,
  Modal,
  PageLoader,
  SearchInput,
  Select,
  StatusBadge,
  Table,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';

// Heartbeat is considered stale after this many seconds; matches the backend
// HEARTBEAT_STALE_SECONDS default so the UI label flips at the same time the
// recovery worker would tear the session down.
const HEARTBEAT_STALE_SEC = 60;

type Row = AgentUser & { session: AgentSession | null };

export default function AgentsPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AgentUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AgentUser | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');

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

  const sessionMap: Record<string, AgentSession> = {};
  (sessions?.data || []).forEach((s) => {
    sessionMap[s.agent_id] = s;
  });
  const agents: Row[] = (data?.data || []).map((a) => ({
    ...a,
    session: sessionMap[a.id] || null,
  }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (q) {
        const hay = `${a.first_name || ''} ${a.last_name || ''} ${a.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterRole && a.role !== filterRole) return false;
      if (filterActive) {
        const want = filterActive === 'active';
        if (!!a.is_active !== want) return false;
      }
      return true;
    });
  }, [agents, search, filterRole, filterActive]);

  if (isLoading) return <PageLoader />;

  const hasActiveFilters = !!(search || filterRole || filterActive);
  const clearAll = () => { setSearch(''); setFilterRole(''); setFilterActive(''); };

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: "Sora, sans-serif" }}>Users</h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {hasActiveFilters
              ? `${filtered.length} of ${agents.length} member(s)`
              : 'Live session status and team overview'}
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

      {/* Search + filters */}
      <div className='space-y-3'>
        <div className='flex items-center gap-3 flex-wrap'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search by name or email…' />
          <div className='flex items-center gap-2 flex-wrap'>
            <FilterDropdown
              label='Role'
              value={filterRole}
              onChange={setFilterRole}
              color='purple'
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'supervisor', label: 'Supervisor' },
                { value: 'agent', label: 'Agent' },
              ]}
            />
            <FilterDropdown
              label='Status'
              value={filterActive}
              onChange={setFilterActive}
              color='green'
              options={[
                { value: 'active', label: 'Active' },
                { value: 'disabled', label: 'Disabled' },
              ]}
            />
            {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
          </div>
        </div>
        {hasActiveFilters && (
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
            {search && <FilterPill label={`Search: "${search}"`} onRemove={() => setSearch('')} />}
            {filterRole && <FilterPill label={`Role: ${filterRole}`} onRemove={() => setFilterRole('')} />}
            {filterActive && <FilterPill label={`Status: ${filterActive}`} onRemove={() => setFilterActive('')} />}
          </div>
        )}
      </div>

      <Card>
        <CardHeader title='Team' subtitle={`${filtered.length} member(s)`} />
        {hasActiveFilters && filtered.length === 0 ? (
          <EmptyState
            title='No users match your filters'
            description='Try adjusting or clearing the filters above.'
          />
        ) : (
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
                        <div className='flex items-center gap-1.5'>
                          <button
                            onClick={() => setEditUser(r)}
                            title='Edit user'
                            className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                          >
                            <Pencil className='w-3 h-3' />
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteUser(r)}
                            title='Delete user'
                            className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                          >
                            <Trash2 className='w-3 h-3' />
                            Delete
                          </button>
                        </div>
                      ),
                    width: '180px',
                  },
                ]
              : []),
          ]}
          rows={filtered}
          keyFn={(r) => r.id}
          emptyMessage='No agents found'
        />
        )}
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

      {editUser && (
        <EditAgentModal
          target={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
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

function EditAgentModal({
  target,
  onClose,
  onSaved,
}: {
  target: AgentUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(target.first_name || '');
  const [lastName, setLastName] = useState(target.last_name || '');
  const [isActive, setIsActive] = useState(!!target.is_active);
  const [error, setError] = useState('');

  const m = useMutation({
    mutationFn: () =>
      updateAgent(target.id, {
        first_name: firstName,
        last_name: lastName,
        is_active: isActive,
      }),
    onSuccess: () => onSaved(),
    onError: (e: any) =>
      setError(e?.response?.data?.error || 'Failed to update user'),
  });

  return (
    <Modal title={`Edit ${target.first_name} ${target.last_name}`} open={true} onClose={onClose}>
      <form
        className='space-y-4'
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          m.mutate();
        }}
      >
        <div className='grid grid-cols-2 gap-3'>
          <Input
            label='First name *'
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label='Last name *'
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
        <div className='space-y-1'>
          <label className='block text-xs text-gray-500'>Email</label>
          <div className='px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-500'>
            {target.email}
          </div>
        </div>
        <div className='space-y-1'>
          <label className='block text-xs text-gray-500'>Role</label>
          <div className='px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-500 capitalize'>
            {target.role}
          </div>
        </div>
        <label className='flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition'>
          <input
            type='checkbox'
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className='rounded text-indigo-600'
          />
          <span className='text-sm text-gray-700'>
            Active — user can sign in and be assigned to campaigns
          </span>
        </label>
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2 pt-2 border-t border-gray-100'>
          <Button variant='secondary' onClick={onClose} type='button'>
            Cancel
          </Button>
          <Button
            type='submit'
            loading={m.isPending}
            disabled={!firstName.trim() || !lastName.trim()}
          >
            Save Changes
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
