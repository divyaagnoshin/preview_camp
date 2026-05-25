import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Badge, Button, Card, CardHeader, ClearFiltersButton, EmptyState,
  FilterDropdown, FilterPill, Input, Modal, PageLoader, SearchInput,
  Select, StatusBadge, Table,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Pencil, Plus, Trash2, UserPlus, Phone, AlertTriangle } from 'lucide-react';

export interface OrgUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'agent' | 'supervisor';
  is_active: boolean;
  reporting_to: string | null;
  sip_extension: string | null;
  sip_password: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportingOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'admin' | 'agent' | 'supervisor';
  source: 'preview_campaign' | 'agnoconnew';
}

const listUsers = (): Promise<{ data: OrgUser[] }> =>
  api.get('/users').then((r) => r.data);

const listReportingOptions = (): Promise<{ data: ReportingOption[] }> =>
  api.get('/users/reporting-options').then((r) => r.data);

const createUser = (body: any): Promise<OrgUser> =>
  api.post('/users', body).then((r) => r.data);

const updateUser = (id: string, body: any): Promise<OrgUser> =>
  api.patch(`/users/${id}`, body).then((r) => r.data);

const deleteUser = (id: string): Promise<{ message: string }> =>
  api.delete(`/users/${id}`).then((r) => r.data);

type FormState = {
  first_name: string; last_name: string; email: string; password: string;
  role: 'agent' | 'supervisor'; reporting_to: string; sip_extension: string; sip_password: string;
};

const EMPTY_FORM: FormState = {
  first_name: '', last_name: '', email: '', password: '',
  role: 'agent', reporting_to: '', sip_extension: '', sip_password: '',
};

function ReportingToSelect({ options, value, onChange, loading }: {
  options: ReportingOption[]; value: string; onChange: (v: string) => void; loading?: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.first_name.toLowerCase().includes(q) || o.last_name.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) || o.role.toLowerCase().includes(q),
    );
  }, [options, search]);

  const roleBadge: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    supervisor: 'bg-[#F4521E]/10 text-[#F4521E]',
    agent: 'bg-[#F5A623]/10 text-[#C07010]',
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Reporting To</label>
      {loading ? (
        <div className="h-9 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <input type="text" placeholder="Search by name, email or role…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2 py-1 rounded border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F4521E]" />
          </div>
          <div className="max-h-44 overflow-y-auto bg-white">
            <div onClick={() => onChange('')}
              className={`px-3 py-2 cursor-pointer text-sm hover:bg-orange-50 flex items-center justify-between ${value === '' ? 'bg-orange-50 font-medium text-[#F4521E]' : 'text-gray-700'}`}>
              <span>— None —</span>
            </div>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No matches</div>
            ) : filtered.map((opt) => (
              <div key={`${opt.source}-${opt.id}`} onClick={() => onChange(opt.id)}
                className={`px-3 py-2 cursor-pointer hover:bg-orange-50 flex items-center justify-between gap-2 ${value === opt.id ? 'bg-orange-50' : ''}`}>
                <div>
                  <div className="text-sm font-medium text-gray-900">{opt.first_name} {opt.last_name}</div>
                  <div className="text-xs text-gray-500">{opt.email}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${roleBadge[opt.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {opt.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {value && (
        <div className="text-xs text-gray-500 mt-1">
          Selected: {(() => { const s = options.find((o) => o.id === value); return s ? `${s.first_name} ${s.last_name} (${s.role})` : value; })()}
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  const { isAdmin, user: authUser } = useAuth();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<Partial<FormState & { is_active: boolean }>>({});
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['org-users'], queryFn: listUsers });
  const users: OrgUser[] = data?.data ?? [];

  const { data: reportingData, isLoading: reportingLoading } = useQuery({
    queryKey: ['reporting-options'],
    queryFn: listReportingOptions,
    enabled: createOpen || !!editUser,
  });
  const reportingOptions: ReportingOption[] = reportingData?.data ?? [];

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); setCreateOpen(false); setForm(EMPTY_FORM); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => updateUser(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); setEditUser(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); setDeleteTarget(null); },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filterRole && u.role !== filterRole) return false;
      if (filterActive === 'active' && !u.is_active) return false;
      if (filterActive === 'inactive' && u.is_active) return false;
      if (!q) return true;
      return u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) || (u.sip_extension ?? '').toLowerCase().includes(q);
    });
  }, [users, search, filterRole, filterActive]);

  const activeFilters = [
    filterRole ? { label: `Role: ${filterRole}`, clear: () => setFilterRole('') } : null,
    filterActive ? { label: `Status: ${filterActive}`, clear: () => setFilterActive('') } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const roleOptions = authUser?.role === 'admin'
    ? [{ value: 'agent', label: 'Agent' }, { value: 'supervisor', label: 'Supervisor' }]
    : [{ value: 'agent', label: 'Agent' }];

  const reportingLabel = (id: string | null) => {
    if (!id) return '—';
    const m = reportingOptions.find((o) => o.id === id);
    return m ? `${m.first_name} ${m.last_name}` : id;
  };

  const cols: any[] = [
    {
      key: 'name', header: 'Name',
      render: (u: OrgUser) => (
        <div>
          <div className="font-medium text-gray-900">{u.first_name} {u.last_name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'role', header: 'Role',
      render: (u: OrgUser) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.role === 'supervisor' ? 'bg-[#F4521E]/10 text-[#F4521E]' : 'bg-[#F5A623]/10 text-[#C07010]'}`}>
          {u.role === 'supervisor' ? 'Supervisor' : 'Agent'}
        </span>
      ),
    },
    {
      key: 'reporting_to', header: 'Reports To',
      render: (u: OrgUser) => <span className="text-xs text-gray-600">{reportingLabel(u.reporting_to)}</span>,
    },
    {
      key: 'sip', header: 'SIP Ext.',
      render: (u: OrgUser) => <span className="text-xs font-mono text-gray-600">{u.sip_extension ?? '—'}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (u: OrgUser) => <StatusBadge status={u.is_active ? 'active' : 'inactive'} />,
    },
    {
      key: 'created', header: 'Created',
      render: (u: OrgUser) => <span className="text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</span>,
    },
    ...(isAdmin ? [{
      key: 'actions', header: '',
      render: (u: OrgUser) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={(e) => { e.stopPropagation(); setEditUser(u); setEditForm({ first_name: u.first_name, last_name: u.last_name, email: u.email, role: u.role, is_active: u.is_active, reporting_to: u.reporting_to ?? '', sip_extension: u.sip_extension ?? '', sip_password: u.sip_password ?? '' }); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition" title="Edit">
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition" title="Delete">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      ),
    }] : []),
  ];

  if (isLoading) return <PageLoader />;

  const hasActiveFilters = !!(search || filterRole || filterActive);
  const clearAll = () => { setSearch(''); setFilterRole(''); setFilterActive(''); };

  return (
    <div className="p-6 md:p-8 w-full space-y-6 animate-fade-up">

      {/* Header */}
      <div className="page-header-bar">
        <div>
          <h1 className="text-2xl font-bold page-heading">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {hasActiveFilters
              ? `${filtered.length} of ${users.length} user(s)`
              : 'Manage agents and supervisors in your organisation'}
          </p>
        </div>
        {isAdmin && (
          <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setCreateOpen(true); setForm(EMPTY_FORM); }}>
            Add User
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users',  value: users.length,                                    color: '#F4521E' },
          { label: 'Agents',       value: users.filter((u) => u.role === 'agent').length,      color: '#F5A623' },
          { label: 'Supervisors',  value: users.filter((u) => u.role === 'supervisor').length, color: '#10B981' },
        ].map((s) => (
          <Card key={s.label} className="px-5 py-4">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      {users.length > 0 && (
        <div className="space-y-3">
          <div className="filter-bar">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or SIP ext…" />
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown label="Role" color="orange"
                options={[{ value: 'agent', label: 'Agent' }, { value: 'supervisor', label: 'Supervisor' }]}
                value={filterRole} onChange={setFilterRole} />
              <FilterDropdown label="Status" color="green"
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
                value={filterActive} onChange={setFilterActive} />
              {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-medium">Active filters:</span>
              {search && <FilterPill label={`Name: "${search}"`} onRemove={() => setSearch('')} />}
              {filterRole && <FilterPill label={`Role: ${filterRole}`} onRemove={() => setFilterRole('')} />}
              {filterActive && <FilterPill label={`Status: ${filterActive}`} onRemove={() => setFilterActive('')} />}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card>
        {users.length === 0 ? (
          <EmptyState title="No users yet" description="Add the first agent or supervisor to get started."
            action={isAdmin ? <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setCreateOpen(true); setForm(EMPTY_FORM); }}>Add User</Button> : undefined} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" description="Try adjusting or clearing the filters above." />
        ) : (
          <Table<OrgUser> cols={cols} rows={filtered} keyFn={(u) => u.id} emptyMessage="No users found" />
        )}
      </Card>

      {/* ── Create Modal ── */}
      <Modal title="Add New User" open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="John" />
            <Input label="Last Name"  value={form.last_name}  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}  placeholder="Doe"  />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" />
          <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'agent' | 'supervisor' }))} options={roleOptions} />
          <ReportingToSelect options={reportingOptions} value={form.reporting_to} onChange={(v) => setForm((f) => ({ ...f, reporting_to: v }))} loading={reportingLoading} />
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="w-3.5 h-3.5 text-[#F4521E]" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SIP Credentials (optional)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="SIP Extension" value={form.sip_extension} onChange={(e) => setForm((f) => ({ ...f, sip_extension: e.target.value }))} placeholder="e.g. 1001" />
              <Input label="SIP Password" type="password" value={form.sip_password} onChange={(e) => setForm((f) => ({ ...f, sip_password: e.target.value }))} placeholder="SIP password" />
            </div>
          </div>
          {createMut.error && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{(createMut.error as any)?.response?.data?.error ?? 'Something went wrong'}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ first_name: form.first_name, last_name: form.last_name, email: form.email, password: form.password, role: form.role, reporting_to: form.reporting_to || null, sip_extension: form.sip_extension || null, sip_password: form.sip_password || null })}
              loading={createMut.isPending} disabled={!form.first_name || !form.last_name || !form.email || !form.password}>
              Create User
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal title="Edit User" open={!!editUser} onClose={() => setEditUser(null)}>
        {editUser && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" value={editForm.first_name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))} />
              <Input label="Last Name"  value={editForm.last_name  ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}  />
            </div>
            <Input label="Email" type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            <Input label="New Password" type="password" value={editForm.password ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value || undefined }))} placeholder="Leave blank to keep current" />
            {authUser?.role === 'admin' && (
              <Select label="Role" value={editForm.role ?? editUser.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as 'agent' | 'supervisor' }))} options={roleOptions} />
            )}
            <Select label="Status" value={editForm.is_active ? 'active' : 'inactive'} onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            <ReportingToSelect options={reportingOptions} value={editForm.reporting_to ?? ''} onChange={(v) => setEditForm((f) => ({ ...f, reporting_to: v }))} loading={reportingLoading} />
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="w-3.5 h-3.5 text-[#F4521E]" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SIP Credentials</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="SIP Extension" value={editForm.sip_extension ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, sip_extension: e.target.value }))} placeholder="e.g. 1001" />
                <Input label="SIP Password" type="password" value={editForm.sip_password ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, sip_password: e.target.value }))} placeholder="Leave blank to keep current" />
              </div>
            </div>
            {updateMut.error && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{(updateMut.error as any)?.response?.data?.error ?? 'Something went wrong'}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={() => {
                const body: any = {};
                if (editForm.first_name !== undefined) body.first_name = editForm.first_name;
                if (editForm.last_name  !== undefined) body.last_name  = editForm.last_name;
                if (editForm.email      !== undefined) body.email      = editForm.email;
                if (editForm.role       !== undefined) body.role       = editForm.role;
                if (editForm.is_active  !== undefined) body.is_active  = editForm.is_active;
                if (editForm.password) body.password = editForm.password;
                body.reporting_to = editForm.reporting_to || null;
                if (editForm.sip_extension !== undefined) body.sip_extension = editForm.sip_extension || null;
                if (editForm.sip_password)               body.sip_password  = editForm.sip_password;
                updateMut.mutate({ id: editUser.id, body });
              }} loading={updateMut.isPending}>
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal title="" open={!!deleteTarget} onClose={() => { setDeleteTarget(null); deleteMut.reset(); }}>
        {deleteTarget && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center pt-2 pb-1">
              <div className="w-14 h-14 rounded-2xl bg-red-50 border-2 border-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Delete "{deleteTarget.first_name} {deleteTarget.last_name}"?</h3>
              <p className="text-sm text-gray-500 mt-1.5 max-w-xs leading-relaxed">If they have existing interactions they will be deactivated instead.</p>
            </div>
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">This action is <span className="font-semibold">permanent</span> and cannot be undone.</p>
            </div>
            {deleteMut.isError && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{(deleteMut.error as any)?.response?.data?.error ?? 'Could not delete this user.'}</p>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1">Cancel</Button>
              <button onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-60 shadow-sm">
                {deleteMut.isPending ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : <Trash2 className="w-4 h-4" />}
                {deleteMut.isPending ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}