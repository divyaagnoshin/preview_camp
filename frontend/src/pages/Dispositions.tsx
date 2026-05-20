import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Modal, Input, Select,
  PageLoader, EmptyState, SearchInput,
} from '../components/ui';
import {
  Plus, Tag, Pencil, Trash2, ArrowLeft, Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  listDispositionGroups,
  createDispositionGroup,
  updateDispositionGroup,
  deleteDispositionGroup,
  listDispositionGroupCodes,
  updateDispositionCode,
  deleteDispositionCode,
} from '../api/client';
import ManageGroupDispositions from './Managegroupdispositions';

const capabilityBadge: Record<string, string> = {
  CLOSED: 'bg-emerald-50 text-emerald-700',
  NEXT_ATTEMPT: 'bg-amber-50 text-amber-700',
  RESCHEDULE: 'bg-indigo-50 text-indigo-700',
};

const CAPABILITY_OPTIONS = [
  { value: 'CLOSED', label: 'Closed (terminal — call complete)' },
  { value: 'NEXT_ATTEMPT', label: 'Next Attempt (re-dial after delay)' },
  { value: 'RESCHEDULE', label: 'Reschedule (callback at specific time)' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

// ── 3-level view ─────────────────────────────────────────────
type View =
  | { level: 'groups' }
  | { level: 'codes'; group: any }
  | { level: 'manage'; group: any };

export default function DispositionsPage() {
  const [view, setView] = useState<View>({ level: 'groups' });

  if (view.level === 'groups')
    return <GroupsView onOpenGroup={(group) => setView({ level: 'codes', group })} />;

  if (view.level === 'manage')
    return (
      <ManageGroupDispositions
        group={(view as any).group}
        onBack={() => setView({ level: 'codes', group: (view as any).group })}
      />
    );

  return (
    <CodesView
      group={(view as any).group}
      onBack={() => setView({ level: 'groups' })}
      onManage={(group) => setView({ level: 'manage', group })}
    />
  );
}

// ============================================================================
// LEVEL 1 — Disposition Groups
// ============================================================================

function GroupsView({ onOpenGroup }: { onOpenGroup: (g: any) => void }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['disposition-groups'],
    queryFn: listDispositionGroups,
  });
  const all: any[] = data?.data || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => (r.name || '').toLowerCase().includes(q));
  }, [all, search]);

  const resetCreate = () => { setShowCreate(false); setName(''); setDescription(''); };
  const resetEdit = () => { setEditTarget(null); setName(''); setDescription(''); };
  const openEdit = (g: any) => { setEditTarget(g); setName(g.name || ''); setDescription(g.description || ''); };

  const createMut = useMutation({
    mutationFn: () => createDispositionGroup({ name, description: description || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disposition-groups'] }); resetCreate(); },
  });
  const editMut = useMutation({
    mutationFn: () => updateDispositionGroup(editTarget.id, { name, description: description || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disposition-groups'] }); resetEdit(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDispositionGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disposition-groups'] }); setDeleteTarget(null); },
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
            Disposition Management
          </h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {search ? `${filtered.length} of ${all.length} groups` : `${all.length} groups total`}
          </p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New Disposition Group
        </Button>
      </div>

      {all.length > 0 && (
        <SearchInput value={search} onChange={setSearch} placeholder='Search groups…' />
      )}

      <Card>
        {all.length === 0 ? (
          <EmptyState
            title='No disposition groups'
            description='Create a group to start managing dispositions.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create Disposition Group
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState title='No matches' description={`No groups match "${search}".`} />
        ) : (
          <Table
            cols={[
              {
                header: 'Group Name',
                render: (r: any) => (
                  <div className='flex items-center gap-2'>
                    <Settings2 className='w-4 h-4 text-indigo-500' />
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  </div>
                ),
              },
              {
                header: 'Description',
                render: (r: any) => <span className='text-gray-600 text-sm'>{r.description || '—'}</span>,
              },
              {
                header: 'Custom Codes',
                render: (r: any) => (
                  <span className='font-medium text-indigo-600'>{r.custom_code_count ?? 0}</span>
                ),
              },
              { header: 'Created', render: (r: any) => formatDate(r.created_at) },
              {
                header: 'Actions',
                render: (r: any) => (
                  <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEdit(r)}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' /> Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered as any}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => onOpenGroup(r)}
          />
        )}
      </Card>

      {/* Create */}
      <Modal title='Create Disposition Group' open={showCreate} onClose={resetCreate}>
        <div className='space-y-4'>
          <Input label='Group Name *' value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. Sales Outreach' />
          <Input label='Description' value={description} onChange={(e) => setDescription(e.target.value)} placeholder='Optional summary' />
          {createMut.isError && (
            <p className='text-xs text-red-500'>
              {(createMut.error as any)?.response?.data?.error || 'Create failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetCreate}>Cancel</Button>
            <Button className='flex-1' loading={createMut.isPending} disabled={!name.trim()} onClick={() => createMut.mutate()}>
              Create Group
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit */}
      <Modal title='Edit Disposition Group' open={!!editTarget} onClose={resetEdit}>
        <div className='space-y-4'>
          <Input label='Group Name *' value={name} onChange={(e) => setName(e.target.value)} />
          <Input label='Description' value={description} onChange={(e) => setDescription(e.target.value)} />
          {editMut.isError && (
            <p className='text-xs text-red-500'>
              {(editMut.error as any)?.response?.data?.error || 'Update failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetEdit}>Cancel</Button>
            <Button className='flex-1' loading={editMut.isPending} disabled={!name.trim()} onClick={() => editMut.mutate()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete */}
      <Modal title='Delete Disposition Group?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            Permanently delete <span className='font-medium text-gray-900'>{deleteTarget?.name}</span> and all its custom codes?
          </p>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error || 'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant='danger' className='flex-1' loading={deleteMut.isPending} onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              Delete Group
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// LEVEL 2 — Codes view: shows all selected dispositions, edit/delete custom
// ============================================================================

function CodesView({
  group, onBack, onManage,
}: {
  group: any;
  onBack: () => void;
  onManage: (group: any) => void;
}) {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [search, setSearch] = useState('');

  const blank = { code: '', label: '', capability: 'CLOSED', retry_delay_min: '', notes_required: false, display_order: '99' };
  const [form, setForm] = useState({ ...blank });
  const setField = (k: keyof typeof blank, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['disposition-group-codes', group.id],
    queryFn: () => listDispositionGroupCodes(group.id),
  });

  const allDispositions: any[] = data?.data || [];

  const filteredDispositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDispositions;
    return allDispositions.filter(
      (r) =>
        (r.code || '').toLowerCase().includes(q) ||
        (r.label || '').toLowerCase().includes(q),
    );
  }, [allDispositions, search]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['disposition-group-codes', group.id] });
    qc.invalidateQueries({ queryKey: ['disposition-groups'] });
  };

  const resetEdit = () => { setEditTarget(null); setForm({ ...blank }); };
  const openEdit = (c: any) => {
    setEditTarget(c);
    setForm({
      code: c.code || '',
      label: c.label || '',
      capability: c.capability || 'CLOSED',
      retry_delay_min: c.retry_delay_min != null ? String(c.retry_delay_min) : '',
      notes_required: !!c.notes_required,
      display_order: String(c.display_order ?? 99),
    });
  };

  const editMut = useMutation({
    mutationFn: () =>
      updateDispositionCode(editTarget.id, {
        code: form.code.trim().toUpperCase(),
        label: form.label.trim(),
        capability: form.capability,
        retry_delay_min:
          form.capability === 'NEXT_ATTEMPT' && form.retry_delay_min !== ''
            ? parseInt(form.retry_delay_min)
            : null,
        notes_required: form.notes_required,
        display_order: form.display_order !== '' ? parseInt(form.display_order) : 99,
      }),
    onSuccess: () => { invalidateAll(); resetEdit(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDispositionCode(id),
    onSuccess: () => { invalidateAll(); setDeleteTarget(null); },
  });

  if (isLoading) return <PageLoader />;

  const formValid =
    form.label.trim() !== '' &&
    (form.capability !== 'NEXT_ATTEMPT' || form.retry_delay_min !== '');

  return (
    <div className='p-6 space-y-5'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <button onClick={onBack} className='p-1.5 hover:bg-gray-100 rounded-lg transition'>
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <div className='flex items-center gap-2 text-sm text-gray-400 mb-0.5'>
            <span className='cursor-pointer hover:text-indigo-600 transition' onClick={onBack}>
              Disposition Groups
            </span>
            <span>/</span>
            <span className='text-gray-600 font-medium'>{group.name}</span>
          </div>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
            {group.name}
          </h1>
          {group.description && <p className='text-sm text-[#7A5C44] mt-0.5'>{group.description}</p>}
        </div>
        <Button icon={<SlidersHorizontal className='w-4 h-4' />} onClick={() => onManage(group)}>
          Manage Dispositions
        </Button>
      </div>

      {/* Stats */}
      <div className='flex items-center gap-4 text-sm text-gray-500'>
        <span>
          <span className='font-semibold text-gray-900'>{allDispositions.length}</span>{' '}
          {allDispositions.length === 1 ? 'disposition' : 'dispositions'}
        </span>
      </div>

      {/* Search */}
      {allDispositions.length > 0 && (
        <SearchInput value={search} onChange={setSearch} placeholder='Search dispositions…' />
      )}

      {/* Table */}
      <Card>
        <div className='px-5 py-3 border-b border-gray-100'>
          <h2 className='text-sm font-semibold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>
            Selected Dispositions
          </h2>
          <p className='text-xs text-gray-400 mt-0.5'>
            {search
              ? `${filteredDispositions.length} of ${allDispositions.length} dispositions`
              : `${allDispositions.length} dispositions in this group`}
          </p>
        </div>

        {allDispositions.length === 0 ? (
          <EmptyState
            title='No dispositions selected'
            description='Click "Manage Dispositions" to add dispositions to this group.'
            action={
              <Button icon={<SlidersHorizontal className='w-4 h-4' />} onClick={() => onManage(group)}>
                Manage Dispositions
              </Button>
            }
          />
        ) : filteredDispositions.length === 0 ? (
          <EmptyState title='No matches' description='Try adjusting your search.' />
        ) : (
          <Table
            cols={[
              {
                header: 'Code',
                render: (r: any) => (
                  <div className='flex items-center gap-2'>
                    <Tag className='w-3.5 h-3.5 text-indigo-500' />
                    <span className='font-mono font-medium text-gray-900'>{r.code}</span>
                  </div>
                ),
              },
              { header: 'Label', render: (r: any) => <span className='text-gray-700'>{r.label}</span> },
              {
                header: 'Capability',
                render: (r: any) => (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${capabilityBadge[r.capability] || 'bg-gray-100 text-gray-600'}`}>
                    {r.capability.replace('_', ' ')}
                  </span>
                ),
              },
              {
                header: 'Retry Delay',
                render: (r: any) =>
                  r.retry_delay_min != null
                    ? <span className='text-sm text-gray-700'>{r.retry_delay_min}m</span>
                    : <span className='text-gray-300'>—</span>,
              },
              {
                header: 'Notes',
                render: (r: any) =>
                  r.notes_required
                    ? <span className='px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs font-medium'>Required</span>
                    : <span className='text-gray-300 text-xs'>Optional</span>,
              },
              {
                header: 'Actions',
                render: (r: any) =>
                  r.is_system ? (
                    <span className='text-xs text-gray-400'>—</span>
                  ) : (
                    <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(r)}
                        className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                      >
                        <Pencil className='w-3 h-3' /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                      >
                        <Trash2 className='w-3 h-3' /> Delete
                      </button>
                    </div>
                  ),
              },
            ]}
            rows={filteredDispositions}
            keyFn={(r: any) => r.id}
          />
        )}
      </Card>

      {/* Edit modal */}
      <Modal title='Edit Custom Disposition' open={!!editTarget} onClose={resetEdit} size='lg'>
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <Input label='Code' value={form.code} disabled onChange={() => {}} />
            <Input label='Label *' value={form.label} onChange={(e) => setField('label', e.target.value)} />
          </div>
          <Select
            label='Capability *'
            value={form.capability}
            onChange={(e) => setField('capability', e.target.value)}
            options={CAPABILITY_OPTIONS}
          />
          {form.capability === 'NEXT_ATTEMPT' && (
            <Input
              label='Retry Delay (minutes) *'
              type='number'
              value={form.retry_delay_min}
              onChange={(e) => setField('retry_delay_min', e.target.value)}
            />
          )}
          <div className='grid grid-cols-2 gap-3'>
            <Input label='Display Order' type='number' value={form.display_order} onChange={(e) => setField('display_order', e.target.value)} />
            <div>
              <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>Notes</label>
              <label className='flex items-center gap-2 text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer'>
                <input type='checkbox' checked={form.notes_required} onChange={(e) => setField('notes_required', e.target.checked)} />
                Required
              </label>
            </div>
          </div>
          <p className='text-xs text-gray-400'>The code itself can't be changed after creation.</p>
          {editMut.isError && (
            <p className='text-xs text-red-500'>
              {(editMut.error as any)?.response?.data?.error || 'Save failed'}
            </p>
          )}
          <div className='flex gap-3 pt-2'>
            <Button variant='secondary' className='flex-1' onClick={resetEdit}>Cancel</Button>
            <Button className='flex-1' loading={editMut.isPending} disabled={!formValid} onClick={() => editMut.mutate()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal title='Delete Disposition Code?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            Permanently delete <span className='font-mono font-medium text-gray-900'>{deleteTarget?.code}</span>? This cannot be undone.
          </p>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error || 'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant='danger' className='flex-1' loading={deleteMut.isPending} onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              Delete Code
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}