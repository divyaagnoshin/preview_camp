import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AgentUser,
  createAgent,
  deleteAgent,
  listAgents,
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
  PagedTable,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Pencil, Plus, Trash2, UserPlus, Eye, EyeOff } from 'lucide-react';

type Row = AgentUser;

export default function AgentsPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AgentUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AgentUser | null>(null);
  const [editSelfOpen, setEditSelfOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  });

  const agents: Row[] = data?.data || [];

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

  const selfRow = agents.find((a) => a.id === user?.id) ?? null;

  return (
    <div className='p-6 space-y-5'>
      <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
            Admins
          </h1>
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
            New Admin
          </Button>
        )}
      </div>

      {/* Search + filters */}
      <div className='space-y-3'>
        <div className='filter-bar'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search by name or email…' />
          <div className='flex items-center gap-2 flex-wrap'>
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
          <PagedTable
            cols={[
              {
                header: 'Name',
                width: '220px',
                render: (r: Row) => {
                  const initials = `${r.first_name?.[0] || ''}${r.last_name?.[0] || ''}`;
                  const gradients = [
                    'linear-gradient(135deg,#E8470A,#F59E0B)',
                    'linear-gradient(135deg,#8B5CF6,#7C3AED)',
                    'linear-gradient(135deg,#10B981,#059669)',
                    'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                    'linear-gradient(135deg,#F59E0B,#D97706)',
                    'linear-gradient(135deg,#06B6D4,#0891B2)',
                  ];
                  const grad = gradients[(r.first_name?.charCodeAt(0) || 0) % gradients.length];
                  return (
                    <div className='flex items-center gap-3'>
                      <div
                        className='w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-md flex-shrink-0'
                        style={{ background: grad }}
                      >
                        {initials}
                      </div>
                      <div className='font-semibold text-[#0F1117] truncate'>
                        {r.first_name} {r.last_name}
                      </div>
                    </div>
                  );
                },
              },
              {
                header: 'Email',
                render: (r: Row) => (
                  <span className='text-sm text-[#6B7280]'>{r.email || '—'}</span>
                ),
              },
              {
                header: 'Role',
                width: '120px',
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
                width: '100px',
                render: (r: Row) =>
                  r.is_active ? (
                    <Badge label='active' color='green' />
                  ) : (
                    <Badge label='disabled' color='red' />
                  ),
              },
              ...(isAdmin
                ? [
                  {
                    header: 'Actions',
                    width: '160px',
                    render: (r: Row) => {
                      const isSelf = r.id === user?.id;
                      return (
                        <div className='flex items-center gap-1.5'>
                          <button
                            onClick={() =>
                              isSelf ? setEditSelfOpen(true) : setEditUser(r)
                            }
                            title={isSelf ? 'Edit your profile' : 'Edit user'}
                            className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                          >
                            <Pencil className='w-3 h-3' />
                            {isSelf ? 'Edit profile' : 'Edit'}
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => setDeleteUser(r)}
                              title='Delete user'
                              className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                            >
                              <Trash2 className='w-3 h-3' />
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    },
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
          }}
        />
      )}

      {editSelfOpen && selfRow && (
        <EditSelfModal
          target={selfRow}
          onClose={() => setEditSelfOpen(false)}
          onSaved={() => {
            setEditSelfOpen(false);
            qc.invalidateQueries({ queryKey: ['agents'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Password field with eye toggle ───────────────────────────────────────────

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className='relative'>
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
      />
      <button
        type='button'
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className='absolute right-3 top-7 text-gray-400 hover:text-gray-600 transition'
      >
        {show ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
      </button>
    </div>
  );
}

// ─── Password match hint ───────────────────────────────────────────────────────

function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <p className={`text-xs flex items-center gap-1 -mt-1 ${match ? 'text-green-600' : 'text-red-500'}`}>
      {match ? '✓ Passwords match' : '✗ Passwords do not match'}
    </p>
  );
}

// ─── Create Admin Modal ────────────────────────────────────────────────────────

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const m = useMutation({
    mutationFn: createAgent,
    onSuccess: () => onCreated(),
    onError: (e: any) =>
      setError(e?.response?.data?.error || 'Failed to create user'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    m.mutate({
      email: email.trim(),
      password,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role: 'admin',
    });
  };

  return (
    <Modal title='New Admin' open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className='space-y-3'>
        <div className='grid grid-cols-2 gap-3'>
          <Input
            label='First name *'
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoFocus
          />
          <Input
            label='Last name *'
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <Input
          label='Email *'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <PasswordInput
          label='Password (min 8 chars)'
          value={password}
          onChange={setPassword}
          required
          minLength={8}
        />

        <PasswordInput
          label='Confirm password'
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
        />

        <PasswordMatchHint password={password} confirm={confirmPassword} />

        <div className='space-y-1'>
          <label className='block text-xs text-gray-500'>Role</label>
          <div className='px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-500 capitalize'>
            Admin
          </div>
        </div>

        {error && <p className='text-xs text-red-500'>{error}</p>}

        <div className='flex justify-end gap-2 pt-2'>
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='submit'
            loading={m.isPending}
            disabled={!firstName.trim() || !lastName.trim() || !email.trim() || !password || !confirmPassword || password !== confirmPassword}
            icon={<UserPlus className='w-3.5 h-3.5' />}
          >
            Create Admin
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Other Admin Modal ────────────────────────────────────────────────────

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
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const wantsPasswordReset = newPassword.length > 0;

  const m = useMutation({
    mutationFn: () => {
      const payload: any = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        is_active: isActive,
      };
      if (wantsPasswordReset) {
        payload.password = newPassword;
      }
      return updateAgent(target.id, payload);
    },
    onSuccess: () => onSaved(),
    onError: (e: any) =>
      setError(e?.response?.data?.error || 'Failed to update user'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (wantsPasswordReset) {
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }
    m.mutate();
  };

  return (
    <Modal
      title={`Edit ${target.first_name} ${target.last_name}`}
      open={true}
      onClose={onClose}
    >
      <form className='space-y-4' onSubmit={handleSubmit}>
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

        <div className='space-y-3 pt-1 border-t border-gray-100'>
          <p className='text-xs font-medium text-gray-500 pt-2'>
            Reset password{' '}
            <span className='font-normal text-gray-400'>(leave blank to keep unchanged)</span>
          </p>

          <PasswordInput
            label='New password (min 8 chars)'
            value={newPassword}
            onChange={setNewPassword}
            placeholder='Enter new password'
          />

          <PasswordInput
            label='Confirm new password'
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder='Re-enter new password'
          />

          <PasswordMatchHint password={newPassword} confirm={confirmPassword} />
        </div>

        {error && <p className='text-xs text-red-500'>{error}</p>}

        <div className='flex justify-end gap-2 pt-2 border-t border-gray-100'>
          <Button variant='secondary' onClick={onClose} type='button'>
            Cancel
          </Button>
          <Button
            type='submit'
            loading={m.isPending}
            disabled={
              !firstName.trim() ||
              !lastName.trim() ||
              (wantsPasswordReset && newPassword !== confirmPassword)
            }
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Self Modal ───────────────────────────────────────────────────────────

function EditSelfModal({
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
  const [email, setEmail] = useState(target.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');

  const wantsPasswordChange = newPassword.length > 0 || currentPassword.length > 0;

  const m = useMutation({
    mutationFn: () => {
      const payload: any = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      };
      if (wantsPasswordChange) {
        payload.current_password = currentPassword;
        payload.password = newPassword;
      }
      return updateAgent(target.id, payload);
    },
    onSuccess: () => onSaved(),
    onError: (e: any) =>
      setError(e?.response?.data?.error || 'Failed to update profile'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (wantsPasswordChange) {
      if (!currentPassword) {
        setError('Please enter your current password.');
        return;
      }
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setError('New passwords do not match.');
        return;
      }
    }
    m.mutate();
  };

  const initials = `${target.first_name?.[0] || ''}${target.last_name?.[0] || ''}`.toUpperCase();

  return (
    <Modal title='Edit my profile' open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className='space-y-4'>

        <div className='flex items-center gap-3 pb-3 border-b border-gray-100'>
          <div className='w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white bg-indigo-500 flex-shrink-0'>
            {initials}
          </div>
          <div>
            <div className='text-sm font-semibold text-gray-800'>
              {target.first_name} {target.last_name}
            </div>
            <div className='text-xs text-gray-400 capitalize'>{target.role}</div>
          </div>
        </div>

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

        <Input
          label='Email *'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className='space-y-3 pt-1 border-t border-gray-100'>
          <p className='text-xs font-medium text-gray-500 pt-2'>
            Change password{' '}
            <span className='font-normal text-gray-400'>(leave blank to keep current)</span>
          </p>

          <PasswordInput
            label='Current password'
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder='Enter current password'
          />

          <PasswordInput
            label='New password (min 8 chars)'
            value={newPassword}
            onChange={setNewPassword}
            placeholder='Enter new password'
          />

          <PasswordInput
            label='Confirm new password'
            value={confirmNewPassword}
            onChange={setConfirmNewPassword}
            placeholder='Re-enter new password'
          />

          <PasswordMatchHint password={newPassword} confirm={confirmNewPassword} />
        </div>

        {error && <p className='text-xs text-red-500'>{error}</p>}

        <div className='flex justify-end gap-2 pt-2 border-t border-gray-100'>
          <Button variant='secondary' onClick={onClose} type='button'>
            Cancel
          </Button>
          <Button
            type='submit'
            loading={m.isPending}
            disabled={
              !firstName.trim() ||
              !lastName.trim() ||
              !email.trim() ||
              (wantsPasswordChange && newPassword !== confirmNewPassword)
            }
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete Other Admin Modal ──────────────────────────────────────────────────

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
          This removes <strong>{target.email}</strong> from your organization. If the user
          has historical activity, the account is deactivated instead of hard-deleted so
          audit history is preserved.
        </p>
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2'>
          <Button variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='danger' loading={m.isPending} onClick={() => m.mutate()}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}