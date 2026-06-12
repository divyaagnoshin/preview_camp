import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Badge, Button, Card, CardHeader, ClearFiltersButton, EmptyState,
  FilterDropdown, FilterPill, Input, Modal, PageLoader, SearchInput,
  Select, StatusBadge, PagedTable,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Pencil, Plus, Trash2, UserPlus, Phone, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgUser {
  id: string;
  first_name: string;
  last_name: string;
  mobile_no: string | null;
  email: string;
  username: string;
  role: 'agent' | 'supervisor';
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

export interface ExtensionOption {
  extension_id: string;
  effective_name: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const listUsers = (): Promise<{ data: OrgUser[] }> => api.get('/users').then((r) => r.data);
const listReportingOptions = (): Promise<{ data: ReportingOption[] }> => api.get('/users/reporting-options').then((r) => r.data);
const listExtensions = (current?: string): Promise<{ data: ExtensionOption[] }> =>
  api.get('/users/extensions', { params: current ? { current } : undefined }).then((r) => r.data);
const createUser = (body: any): Promise<OrgUser> => api.post('/users', body).then((r) => r.data);
const updateUser = (id: string, body: any): Promise<OrgUser> => api.patch(`/users/${id}`, body).then((r) => r.data);
const deleteUser = (id: string): Promise<{ message: string }> => api.delete(`/users/${id}`).then((r) => r.data);

// ─── Form state ───────────────────────────────────────────────────────────────

type CreateFormState = {
  first_name: string;
  last_name: string;
  mobile_no: string;
  email: string;
  username: string;
  password: string;
  confirm_password: string;
  role: 'agent' | 'supervisor';
  reporting_to: string;
  sip_extension: string;
};

const EMPTY_CREATE_FORM: CreateFormState = {
  first_name: '', last_name: '', mobile_no: '', email: '',
  username: '', password: '', confirm_password: '',
  role: 'agent', reporting_to: '', sip_extension: '',
};

type EditFormState = {
  first_name?: string;
  last_name?: string;
  mobile_no?: string;
  email?: string;
  username?: string;
  password?: string;
  confirm_password?: string;
  role?: 'agent' | 'supervisor';
  is_active?: boolean;
  reporting_to?: string;
  sip_extension?: string;
  sip_password?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-xs text-red-600 mt-1">{msg}</p>;
}

// ─── ReportingToSelect ────────────────────────────────────────────────────────

function ReportingToSelect({ options, value, onChange, loading }: {
  options: ReportingOption[];
  value: string;
  onChange: (v: string) => void;
  loading?: boolean;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const adminsAndSups = options.filter((o) => o.role === 'admin' || o.role === 'supervisor');
    const q = search.trim().toLowerCase();
    if (!q) return adminsAndSups;
    return adminsAndSups.filter((o) =>
      o.first_name.toLowerCase().includes(q) ||
      o.last_name.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      o.role.toLowerCase().includes(q),
    );
  }, [options, search]);

  const roleBadge: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    supervisor: 'bg-[#F4521E]/10 text-[#F4521E]',
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Reporting To</label>
      {loading ? (
        <div className="h-9 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <input
              type="text"
              placeholder="Search by name, email or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2 py-1 rounded border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F4521E]"
            />
          </div>
          <div className="max-h-36 overflow-y-auto bg-white">
            <div
              onClick={() => onChange('')}
              className={`px-3 py-2 cursor-pointer text-sm hover:bg-orange-50 flex items-center justify-between ${value === '' ? 'bg-orange-50 font-medium text-[#F4521E]' : 'text-gray-700'}`}
            >
              <span>— None —</span>
            </div>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No matches</div>
            ) : filtered.map((opt) => (
              <div
                key={`${opt.source}-${opt.id}`}
                onClick={() => onChange(opt.id)}
                className={`px-3 py-2 cursor-pointer hover:bg-orange-50 flex items-center justify-between gap-2 ${value === opt.id ? 'bg-orange-50' : ''}`}
              >
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
          Selected:{' '}
          {(() => {
            const s = options.find((o) => o.id === value);
            return s ? `${s.first_name} ${s.last_name} (${s.role})` : value;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── ExtensionSelect ──────────────────────────────────────────────────────────

function ExtensionSelect({ options, value, onChange, loading, required }: {
  options: ExtensionOption[];
  value: string;
  onChange: (v: string) => void;
  loading?: boolean;
  required?: boolean;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.extension_id.toLowerCase().includes(q) ||
      (o.effective_name ?? '').toLowerCase().includes(q),
    );
  }, [options, search]);

  const selected = options.find((o) => o.extension_id === value);

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
        SIP Extension {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {loading ? (
        <div className="h-9 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <input
              type="text"
              placeholder="Search extension…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2 py-1 rounded border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#F4521E]"
            />
          </div>
          <div className="max-h-36 overflow-y-auto bg-white">
            <div
              onClick={() => onChange('')}
              className={`px-3 py-2 cursor-pointer text-sm hover:bg-orange-50 flex items-center justify-between ${value === '' ? 'bg-orange-50 font-medium text-[#F4521E]' : 'text-gray-700'}`}
            >
              <span>— Select Extension —</span>
            </div>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No extensions found</div>
            ) : filtered.map((opt) => (
              <div
                key={opt.extension_id}
                onClick={() => onChange(opt.extension_id)}
                className={`px-3 py-2 cursor-pointer hover:bg-orange-50 flex items-center gap-2 ${value === opt.extension_id ? 'bg-orange-50' : ''}`}
              >
                <div className="text-sm font-medium text-gray-900 font-mono">{opt.extension_id}</div>
                {opt.effective_name && (
                  <div className="text-xs text-gray-500">— {opt.effective_name}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {value && selected && (
        <div className="text-xs text-gray-500 mt-1">
          Selected: <span className="font-mono font-medium">{selected.extension_id}</span>
          {selected.effective_name && ` — ${selected.effective_name}`}
        </div>
      )}
    </div>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateCreateForm(f: CreateFormState): Partial<Record<keyof CreateFormState, string>> {
  const errs: Partial<Record<keyof CreateFormState, string>> = {};
  if (!f.first_name.trim()) errs.first_name = 'First name is required';
  if (!f.last_name.trim()) errs.last_name = 'Last name is required';
  if (!f.mobile_no.trim()) errs.mobile_no = 'Mobile number is required';
  else if (!/^\d{7,15}$/.test(f.mobile_no.trim())) errs.mobile_no = 'Enter a valid mobile number (7–15 digits)';
  if (!f.email.trim()) errs.email = 'Email is required';
  else if (!/\S+@\S+\.\S+/.test(f.email)) errs.email = 'Enter a valid email address';
  if (!f.username.trim()) errs.username = 'Username is required';
  if (!f.password) errs.password = 'Password is required';
  else if (f.password.length < 8) errs.password = 'Password must be at least 8 characters';
  if (!f.confirm_password) errs.confirm_password = 'Please confirm your password';
  else if (f.password !== f.confirm_password) errs.confirm_password = 'Passwords do not match';
  if (!f.sip_extension) errs.sip_extension = 'SIP extension is required';
  return errs;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { isAdmin, user: authUser } = useAuth();
  const qc = useQueryClient();

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null);

  // Form state
  const [form, setForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [formErrs, setFormErrs] = useState<Partial<Record<keyof CreateFormState, string>>>({});
  const [editForm, setEditForm] = useState<EditFormState>({});
  const [editErrs, setEditErrs] = useState<Partial<Record<string, string>>>({});

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({ queryKey: ['org-users'], queryFn: listUsers });
  const users: OrgUser[] = data?.data ?? [];

  const { data: reportingData, isLoading: reportingLoading } = useQuery({
    queryKey: ['reporting-options'],
    queryFn: listReportingOptions,
    enabled: createOpen || !!editUser,
  });
  const reportingOptions: ReportingOption[] = reportingData?.data ?? [];

  const { data: extensionsData, isLoading: extensionsLoading } = useQuery({
    queryKey: ['extensions', editUser?.sip_extension ?? ''],
    queryFn: () => listExtensions(editUser?.sip_extension ?? undefined),
    enabled: createOpen || !!editUser,
  });
  const extensionOptions: ExtensionOption[] = extensionsData?.data ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-users'] });
      qc.invalidateQueries({ queryKey: ['extensions'] });
      setCreateOpen(false);
      setForm(EMPTY_CREATE_FORM);
      setFormErrs({});
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => updateUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-users'] });
      qc.invalidateQueries({ queryKey: ['extensions'] });
      setEditUser(null);
      setEditErrs({});
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-users'] });
      setDeleteTarget(null);
    },
  });

  // ── Filtering ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filterRole && u.role !== filterRole) return false;
      if (!q) return true;
      return (
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.mobile_no ?? '').includes(q) ||
        (u.sip_extension ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, search, filterRole]);

  const hasActiveFilters = !!(search || filterRole);
  const clearAll = () => { setSearch(''); setFilterRole(''); };

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const roleOptions = authUser?.role === 'admin'
    ? [{ value: 'agent', label: 'Agent' }, { value: 'supervisor', label: 'Supervisor' }]
    : [{ value: 'agent', label: 'Agent' }];

  const reportingLabel = (id: string | null) => {
    if (!id) return '—';
    const m = reportingOptions.find((o) => o.id === id);
    return m ? `${m.first_name} ${m.last_name}` : id;
  };

  // ── Open edit modal ───────────────────────────────────────────────────────────
  const openEdit = (u: OrgUser) => {
    setEditUser(u);
    setEditErrs({});
    setEditForm({
      first_name: u.first_name,
      last_name: u.last_name,
      mobile_no: u.mobile_no ?? '',
      email: u.email,
      username: u.username,
      password: '',
      confirm_password: '',
      role: u.role,
      is_active: true,            // only active users are listed
      reporting_to: u.reporting_to ?? '',
      sip_extension: u.sip_extension ?? '',
      sip_password: u.sip_password ?? '',
    });
  };

  // ── Submit create ─────────────────────────────────────────────────────────────
  const handleCreate = () => {
    const errs = validateCreateForm(form);
    setFormErrs(errs);
    if (Object.keys(errs).length > 0) return;

    createMut.mutate({
      first_name: form.first_name,
      last_name: form.last_name,
      mobile_no: form.mobile_no,
      email: form.email,
      username: form.username,
      password: form.password,
      role: form.role,
      reporting_to: form.reporting_to || null,
      sip_extension: form.sip_extension || null,
      sip_password: null,
    });
  };

  // ── Submit edit ───────────────────────────────────────────────────────────────
  const handleUpdate = () => {
    const errs: Record<string, string> = {};
    if (editForm.mobile_no !== undefined && editForm.mobile_no !== '' && !/^\d{7,15}$/.test(editForm.mobile_no))
      errs.mobile_no = 'Enter a valid mobile number (7–15 digits)';
    if (editForm.password && editForm.password.length < 8)
      errs.password = 'Password must be at least 8 characters';
    if (editForm.password && editForm.confirm_password !== editForm.password)
      errs.confirm_password = 'Passwords do not match';
    if (!editForm.sip_extension)
      errs.sip_extension = 'SIP extension is required';
    setEditErrs(errs);
    if (Object.keys(errs).length > 0) return;

    const body: any = {};
    if (editForm.first_name !== undefined) body.first_name = editForm.first_name;
    if (editForm.last_name !== undefined) body.last_name = editForm.last_name;
    if (editForm.mobile_no !== undefined) body.mobile_no = editForm.mobile_no;
    if (editForm.email !== undefined) body.email = editForm.email;
    if (editForm.username !== undefined) body.username = editForm.username;
    if (editForm.role !== undefined) body.role = editForm.role;
    if (editForm.is_active !== undefined) body.is_active = editForm.is_active;
    if (editForm.password) body.password = editForm.password;
    body.reporting_to = editForm.reporting_to || null;
    if (editForm.sip_extension !== undefined) body.sip_extension = editForm.sip_extension || null;
    if (editForm.sip_password) body.sip_password = editForm.sip_password;

    updateMut.mutate({ id: editUser!.id, body });
  };

  // ── Table columns ─────────────────────────────────────────────────────────────
  const cols: any[] = [
    {
      key: 'first_name',
      header: 'First Name',
      render: (u: OrgUser) => (
        <span className="font-medium text-gray-900">{u.first_name}</span>
      ),
    },
    {
      key: 'last_name',
      header: 'Last Name',
      render: (u: OrgUser) => (
        <span className="text-gray-800">{u.last_name}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (u: OrgUser) => (
        <span className="text-xs text-gray-600">{u.email}</span>
      ),
    },
    {
      key: 'mobile_no',
      header: 'Mobile',
      render: (u: OrgUser) => (
        <span className="text-xs text-gray-600 font-mono">{u.mobile_no ?? '—'}</span>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      render: (u: OrgUser) => (
        <span className="text-xs font-mono text-gray-700">{u.username}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: OrgUser) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.role === 'supervisor' ? 'bg-[#F4521E]/10 text-[#F4521E]' : 'bg-[#F5A623]/10 text-[#C07010]'}`}>
          {u.role === 'supervisor' ? 'Supervisor' : 'Agent'}
        </span>
      ),
    },
    {
      key: 'reporting_to',
      header: 'Reports To',
      render: (u: OrgUser) => (
        <span className="text-xs text-gray-600">{reportingLabel(u.reporting_to)}</span>
      ),
    },
    {
      key: 'sip',
      header: 'SIP Ext.',
      render: (u: OrgUser) => (
        <span className="text-xs font-mono text-gray-600">{u.sip_extension ?? '—'}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (u: OrgUser) => (
        <span className="text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</span>
      ),
    },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      render: (u: OrgUser) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(u); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition"
            title="Edit"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      ),
    }] : []),
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div className="p-6 md:p-8 w-full space-y-6 animate-fade-up">

      {/* ── Header ── */}
      <div className="page-header-bar">
        <div>
          <h1 className="text-2xl font-bold page-heading">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {hasActiveFilters
              ? `${filtered.length} of ${users.length} active user(s)`
              : 'Manage active agents and supervisors in your organisation'}
          </p>
        </div>
        {isAdmin && (
          <Button
            icon={<UserPlus className="w-4 h-4" />}
            onClick={() => { setCreateOpen(true); setForm(EMPTY_CREATE_FORM); setFormErrs({}); createMut.reset(); }}
          >
            Add User
          </Button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Active', value: users.length, color: '#F4521E' },
          { label: 'Agents', value: users.filter((u) => u.role === 'agent').length, color: '#F5A623' },
          { label: 'Supervisors', value: users.filter((u) => u.role === 'supervisor').length, color: '#10B981' },
        ].map((s) => (
          <Card key={s.label} className="px-5 py-4">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      {users.length > 0 && (
        <div className="space-y-3">
          <div className="filter-bar">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, username, mobile or SIP ext…"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown
                label="Role" color="orange"
                options={[{ value: 'agent', label: 'Agent' }, { value: 'supervisor', label: 'Supervisor' }]}
                value={filterRole}
                onChange={setFilterRole}
              />
              {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-medium">Active filters:</span>
              {search && <FilterPill label={`Search: "${search}"`} onRemove={() => setSearch('')} />}
              {filterRole && <FilterPill label={`Role: ${filterRole}`} onRemove={() => setFilterRole('')} />}
            </div>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <Card>
        {users.length === 0 ? (
          <EmptyState
            title="No active users"
            description="Add the first agent or supervisor to get started."
            action={isAdmin ? (
              <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setCreateOpen(true); setForm(EMPTY_CREATE_FORM); }}>
                Add User
              </Button>
            ) : undefined}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" description="Try adjusting or clearing the filters above." />
        ) : (
          <PagedTable<OrgUser> cols={cols} rows={filtered} keyFn={(u) => u.id} emptyMessage="No users found" />
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════
          CREATE MODAL
      ══════════════════════════════════════════════════════════ */}
      <Modal title="Add New User" open={createOpen} onClose={() => setCreateOpen(false)} size="lg">
        <div className="overflow-y-auto max-h-[65vh] pr-1 space-y-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="First Name *"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder="John"
              />
              <FieldError msg={formErrs.first_name ?? null} />
            </div>
            <div>
              <Input
                label="Last Name *"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder="Doe"
              />
              <FieldError msg={formErrs.last_name ?? null} />
            </div>
          </div>

          {/* Mobile + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Mobile Number *"
                type="tel"
                value={form.mobile_no}
                onChange={(e) => setForm((f) => ({ ...f, mobile_no: e.target.value.replace(/\D/g, '') }))}
                placeholder="9876543210"
              />
              <FieldError msg={formErrs.mobile_no ?? null} />
            </div>
            <div>
              <Input
                label="Email *"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="john@example.com"
              />
              <FieldError msg={formErrs.email ?? null} />
            </div>
          </div>

          {/* Username + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Username *"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="john.doe"
              />
              <FieldError msg={formErrs.username ?? null} />
            </div>
            <Select
              label="Role *"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'agent' | 'supervisor' }))}
              options={roleOptions}
            />
          </div>

          {/* Password + Confirm */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Password *"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
              />
              <FieldError msg={formErrs.password ?? null} />
            </div>
            <div>
              <Input
                label="Confirm Password *"
                type="password"
                value={form.confirm_password}
                onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
                placeholder="Re-enter password"
              />
              <FieldError msg={formErrs.confirm_password ?? null} />
            </div>
          </div>

          {/* Reporting To */}
          <ReportingToSelect
            options={reportingOptions}
            value={form.reporting_to}
            onChange={(v) => setForm((f) => ({ ...f, reporting_to: v }))}
            loading={reportingLoading}
          />

          {/* SIP Extension */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="w-3.5 h-3.5 text-[#F4521E]" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SIP Configuration</span>
            </div>
            <ExtensionSelect
              options={extensionOptions}
              value={form.sip_extension}
              onChange={(v) => setForm((f) => ({ ...f, sip_extension: v }))}
              loading={extensionsLoading}
              required
            />
            <FieldError msg={formErrs.sip_extension ?? null} />
          </div>

          {/* API error */}
          {createMut.error && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                {(createMut.error as any)?.response?.data?.error ?? 'Something went wrong. Please try again.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 mt-3">
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={createMut.isPending}>
            Create User
          </Button>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════
          EDIT MODAL
      ══════════════════════════════════════════════════════════ */}
      <Modal title="Edit User" open={!!editUser} onClose={() => setEditUser(null)} size="lg">
        {editUser && (
          <>
            <div className="overflow-y-auto max-h-[65vh] pr-1 space-y-4">

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label="First Name *"
                    value={editForm.first_name ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                  <FieldError msg={editErrs.first_name ?? null} />
                </div>
                <div>
                  <Input
                    label="Last Name *"
                    value={editForm.last_name ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                  <FieldError msg={editErrs.last_name ?? null} />
                </div>
              </div>

              {/* Mobile + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Mobile Number *"
                    type="tel"
                    value={editForm.mobile_no ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, mobile_no: e.target.value.replace(/\D/g, '') }))}
                  />
                  <FieldError msg={editErrs.mobile_no ?? null} />
                </div>
                <div>
                  <Input
                    label="Email *"
                    type="email"
                    value={editForm.email ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  <FieldError msg={editErrs.email ?? null} />
                </div>
              </div>

              {/* Username + Role */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Username *"
                    value={editForm.username ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                  />
                  <FieldError msg={editErrs.username ?? null} />
                </div>
                {authUser?.role === 'admin' && (
                  <Select
                    label="Role *"
                    value={editForm.role ?? editUser.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as 'agent' | 'supervisor' }))}
                    options={roleOptions}
                  />
                )}
              </div>

              {/* Password + Confirm */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label="New Password"
                    type="password"
                    value={editForm.password ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value || undefined }))}
                    placeholder="Leave blank to keep current"
                  />
                  <FieldError msg={editErrs.password ?? null} />
                </div>
                <div>
                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={editForm.confirm_password ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, confirm_password: e.target.value }))}
                    placeholder="Re-enter new password"
                  />
                  <FieldError msg={editErrs.confirm_password ?? null} />
                </div>
              </div>

              {/* Reporting To */}
              <ReportingToSelect
                options={reportingOptions}
                value={editForm.reporting_to ?? ''}
                onChange={(v) => setEditForm((f) => ({ ...f, reporting_to: v }))}
                loading={reportingLoading}
              />

              {/* SIP section */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="w-3.5 h-3.5 text-[#F4521E]" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SIP Configuration</span>
                </div>
                <div className="space-y-3">
                  <ExtensionSelect
                    options={extensionOptions}
                    value={editForm.sip_extension ?? ''}
                    onChange={(v) => setEditForm((f) => ({ ...f, sip_extension: v }))}
                    loading={extensionsLoading}
                    required
                  />
                  <FieldError msg={editErrs.sip_extension ?? null} />
                  <Input
                    label="SIP Password"
                    type="password"
                    value={editForm.sip_password ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, sip_password: e.target.value }))}
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>

              {/* API error */}
              {updateMut.error && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">
                    {(updateMut.error as any)?.response?.data?.error ?? 'Something went wrong. Please try again.'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 mt-3">
              <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={handleUpdate} loading={updateMut.isPending}>
                Save Changes
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════
          DELETE MODAL
      ══════════════════════════════════════════════════════════ */}
      <Modal title="" open={!!deleteTarget} onClose={() => { setDeleteTarget(null); deleteMut.reset(); }}>
        {deleteTarget && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center pt-2 pb-1">
              <div className="w-14 h-14 rounded-2xl bg-red-50 border-2 border-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Delete "{deleteTarget.first_name} {deleteTarget.last_name}"?
              </h3>
              <p className="text-sm text-gray-500 mt-1.5 max-w-xs leading-relaxed">
                If they have existing interactions they will be deactivated instead of removed.
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                This action is <span className="font-semibold">permanent</span> and cannot be undone.
              </p>
            </div>
            {deleteMut.isError && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">
                  {(deleteMut.error as any)?.response?.data?.error ?? 'Could not delete this user.'}
                </p>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1">
                Cancel
              </Button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-60 shadow-sm"
              >
                {deleteMut.isPending
                  ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  : <Trash2 className="w-4 h-4" />}
                {deleteMut.isPending ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}