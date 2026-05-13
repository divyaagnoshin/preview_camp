import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOrganization, updateOrganization, listOrgUsers, createOrgUser, deleteOrgUser,
  Organization, OrgAdmin,
} from '../api/client';
import { Badge, Button, Card, CardHeader, Input, Modal, PageLoader, Select, Textarea } from '../components/ui';
import {
  ArrowLeft, Building2, Users, ShieldCheck, UserPlus, Pencil,
  CalendarDays, Headphones, Trash2, UserCog, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

function StatCard({ icon: Icon, label, value, gradient }: {
  icon: typeof Users; label: string; value: number | string; gradient: string;
}) {
  return (
    <div className='bg-white border border-[#FFE0C8] rounded-2xl p-5 flex flex-col gap-3 shadow-[0_2px_16px_rgba(244,82,30,0.06)] hover:shadow-[0_8px_24px_rgba(244,82,30,0.12)] transition-all duration-200 hover:-translate-y-0.5'>
      <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ background: gradient }}>
        <Icon className='w-5 h-5 text-white' />
      </div>
      <div>
        <div className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>{value}</div>
        <div className='text-xs text-[#7A5C44] mt-0.5 font-medium'>{label}</div>
      </div>
    </div>
  );
}

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setOrgContext } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<OrgAdmin | null>(null);

  const { data: orgData, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => getOrganization(id!),
    enabled: !!id,
  });
  const { data: usersData } = useQuery({
    queryKey: ['org-users', id],
    queryFn: () => listOrgUsers(id!),
    enabled: !!id,
  });

  const org: Organization | undefined = orgData;
  const users: OrgAdmin[] = usersData?.data || [];
  const adminCount = (org as any)?.admin_count ?? users.filter((u) => u.role === 'admin').length;
  const supervisorCount = (org as any)?.supervisor_count ?? users.filter((u) => u.role === 'supervisor').length;
  const agentCount = (org as any)?.agent_count ?? users.filter((u) => u.role === 'agent').length;
  const totalUsers = org?.user_count ?? users.length;

  if (isLoading) return <PageLoader />;
  if (!org) return <div className='p-8 text-sm text-[#7A5C44]'>Organization not found.</div>;

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      {/* Header */}
      <div className='flex items-start justify-between flex-wrap gap-4'>
        <div className='flex items-center gap-4'>
          <button onClick={() => navigate('/organizations')}
            className='p-2 rounded-xl border border-[#FFD0B0] bg-white hover:border-[#F4521E] hover:text-[#F4521E] text-[#7A5C44] transition-all'>
            <ArrowLeft className='w-4 h-4' />
          </button>
          <div className='w-12 h-12 rounded-2xl flex items-center justify-center'
            style={{ background: 'linear-gradient(135deg, #F4521E, #F5A623)', boxShadow: '0 4px 16px rgba(244,82,30,0.35)' }}>
            <Building2 className='w-6 h-6 text-white' />
          </div>
          <div>
            <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>{org.name}</h1>
            {org.description && <p className='text-sm text-[#7A5C44] mt-0.5'>{org.description}</p>}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button size='sm' variant='secondary' icon={<Pencil className='w-3.5 h-3.5' />} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button size='sm' icon={<ShieldCheck className='w-3.5 h-3.5' />}
            onClick={() => { setOrgContext({ id: org.id, name: org.name }); navigate('/dashboard'); }}>
            Act as this org
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 anim-d1'>
        <StatCard icon={ShieldCheck} label='Admins' value={adminCount} gradient='linear-gradient(135deg,#F4521E,#F5A623)' />
        <StatCard icon={UserCog} label='Supervisors' value={supervisorCount} gradient='linear-gradient(135deg,#A855F7,#7C3AED)' />
        <StatCard icon={Headphones} label='Agents' value={agentCount} gradient='linear-gradient(135deg,#10B981,#059669)' />
        <StatCard icon={Users} label='Total Users' value={totalUsers} gradient='linear-gradient(135deg,#3B82F6,#1D4ED8)' />
        <StatCard icon={CalendarDays} label='Created'
          value={new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          gradient='linear-gradient(135deg,#6B7280,#4B5563)' />
      </div>

      {/* Users list */}
      <Card className='anim-d2'>
        <CardHeader
          title='Users'
          subtitle={`${users.length} member${users.length !== 1 ? 's' : ''}`}
          action={
            <Button size='sm' icon={<UserPlus className='w-3.5 h-3.5' />} onClick={() => setAddUserOpen(true)}>
              Add user
            </Button>
          }
        />
        {users.length === 0 ? (
          <div className='px-6 py-12 text-center text-sm text-[#7A5C44]'>
            No users yet. Add one to get started.
          </div>
        ) : (
          <div className='divide-y divide-[#FFF0E8]'>
            {users.map((u) => (
              <div key={u.id} className='flex items-center justify-between px-6 py-4 hover:bg-[#FFFAF7] transition-colors'>
                <div className='flex items-center gap-3'>
                  <div className='w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0'
                    style={{ background: 'linear-gradient(135deg, #F4521E, #F5A623)' }}>
                    {u.first_name?.[0]}{u.last_name?.[0]}
                  </div>
                  <div>
                    <div className='text-sm font-semibold text-[#1A0F00]'>{u.first_name} {u.last_name}</div>
                    <div className='text-xs text-[#7A5C44]'>{u.email}</div>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Badge label={u.role}
                    color={u.role === 'admin' ? 'orange' : u.role === 'supervisor' ? 'purple' : 'green'} />
                  {!u.is_active && <Badge label='disabled' color='red' />}
                  <Button size='sm' variant='ghost' icon={<Trash2 className='w-3.5 h-3.5' />}
                    onClick={() => setDeleteUser(u)} className='text-red-500 hover:bg-red-50'>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editOpen && <EditOrgModal org={org} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ['organization', id] }); qc.invalidateQueries({ queryKey: ['organizations'] }); }} />}
      {addUserOpen && <CreateUserModal org={org} onClose={() => setAddUserOpen(false)} onCreated={() => { setAddUserOpen(false); qc.invalidateQueries({ queryKey: ['org-users', id] }); qc.invalidateQueries({ queryKey: ['organization', id] }); qc.invalidateQueries({ queryKey: ['organizations'] }); }} />}
      {deleteUser && <DeleteUserModal orgId={org.id} user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={() => { setDeleteUser(null); qc.invalidateQueries({ queryKey: ['org-users', id] }); qc.invalidateQueries({ queryKey: ['organization', id] }); qc.invalidateQueries({ queryKey: ['organizations'] }); }} />}
    </div>
  );
}

function EditOrgModal({ org, onClose, onSaved }: { org: Organization; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || '');
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: (body: { name: string; description: string | null }) => updateOrganization(org.id, body),
    onSuccess: () => onSaved(),
    onError: (e: any) => setError(e?.response?.data?.error || 'Failed to update organization'),
  });
  return (
    <Modal title={`Edit ${org.name}`} open={true} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ name, description: description || null }); }} className='space-y-4'>
        <Input label='Name' value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Textarea label='Description' value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2 pt-2'>
          <Button type='button' variant='secondary' onClick={onClose}>Cancel</Button>
          <Button type='submit' loading={m.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({ org, onClose, onCreated }: { org: Organization; onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'agent'>('admin');
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: (body: any) => createOrgUser(org.id, body),
    onSuccess: () => onCreated(),
    onError: (e: any) => setError(e?.response?.data?.error || 'Failed to create user'),
  });
  return (
    <Modal title={`Add user — ${org.name}`} open={true} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ email: email.trim(), password, first_name: firstName.trim(), last_name: lastName.trim(), role }); }} className='space-y-3'>
        <div className='grid grid-cols-2 gap-3'>
          <Input label='First name' value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
          <Input label='Last name' value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <Input label='Email' type='email' value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label='Password (min 8 chars)' type='password' value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <Select label='Role' value={role} onChange={(e) => setRole(e.target.value as any)} options={[{ value: 'admin', label: 'Admin' }, { value: 'supervisor', label: 'Supervisor' }, { value: 'agent', label: 'Agent' }]} />
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2 pt-2'>
          <Button type='button' variant='secondary' onClick={onClose}>Cancel</Button>
          <Button type='submit' loading={m.isPending}>Create user</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteUserModal({ orgId, user, onClose, onDeleted }: { orgId: string; user: OrgAdmin; onClose: () => void; onDeleted: () => void }) {
  const [error, setError] = useState('');
  const m = useMutation({ mutationFn: () => deleteOrgUser(orgId, user.id), onSuccess: () => onDeleted(), onError: (e: any) => setError(e?.response?.data?.error || 'Failed to delete user') });
  return (
    <Modal title={`Delete ${user.first_name} ${user.last_name}?`} open={true} onClose={onClose}>
      <div className='space-y-4'>
        <p className='text-sm text-[#5C4030]'>This removes <strong>{user.email}</strong> from the organization. If the user has historical activity, the account is deactivated instead of hard-deleted.</p>
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2'>
          <Button variant='secondary' onClick={onClose}>Cancel</Button>
          <Button variant='danger' loading={m.isPending} onClick={() => m.mutate()}>Delete</Button>
        </div>
      </div>
    </Modal>
  );
}
