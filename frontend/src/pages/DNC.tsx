import React, { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Card,
  Table,
  Button,
  Modal,
  Input,
  Select,
  PageLoader,
  EmptyState,
  StatCard,
  SearchInput,
  FilterDropdown,
  FilterPill,
  ClearFiltersButton,
} from '../components/ui';
import {
  Plus,
  ShieldOff,
  Upload,
  Pencil,
  Trash2,
  ArrowLeft,
  List,
  Hash,
} from 'lucide-react';

// ─── API helpers ─────────────────────────────────────────────────────────────

const getDncGroups = () => api.get('/dnc-groups').then((r) => r.data);
const getDncLists = (groupId: string) =>
  api.get(`/dnc-groups/${groupId}/lists`).then((r) => r.data);
const getDncNumbers = (listId: string) =>
  api.get(`/dnc-lists/${listId}/numbers`).then((r) => r.data);

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseDncCsv(text: string): string[] {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const firstCell = lines[0].split(',')[0].trim().replace(/^"|"$/g, '');
  const isHeader = !/^\+?\d[\d\s\-().]{4,}$/.test(firstCell);
  const rows = isHeader ? lines.slice(1) : lines;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const cell = row.split(',')[0].trim().replace(/^"|"$/g, '');
    if (cell && !seen.has(cell)) {
      seen.add(cell);
      out.push(cell);
    }
  }
  return out;
}

// ─── Safe date formatter ──────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// ─── View stack type ──────────────────────────────────────────────────────────

type View =
  | { level: 'groups' }
  | { level: 'lists'; group: any }
  | { level: 'numbers'; group: any; list: any };

// ─── Main export ──────────────────────────────────────────────────────────────

export default function DNCPage() {
  // Callers (e.g. the Campaign Detail "View Group" button) can deep-link to a
  // specific group's lists view by passing the group object via location state.
  // Without state we land on the top-level groups list as before.
  const location = useLocation();
  const initialGroup = (location.state as any)?.group;
  const [view, setView] = useState<View>(
    initialGroup
      ? { level: 'lists', group: initialGroup }
      : { level: 'groups' },
  );

  if (view.level === 'groups')
    return (
      <DncGroupsView
        onOpenGroup={(group) => setView({ level: 'lists', group })}
      />
    );

  if (view.level === 'lists')
    return (
      <DncListsView
        group={view.group}
        onBack={() => setView({ level: 'groups' })}
        onOpenList={(list) =>
          setView({ level: 'numbers', group: view.group, list })
        }
      />
    );

  return (
    <DncNumbersView
      group={view.group}
      list={view.list}
      onBack={() => setView({ level: 'lists', group: view.group })}
    />
  );
}

// ============================================================================
// LEVEL 1 — DNC Groups
// ============================================================================

function DncGroupsView({ onOpenGroup }: { onOpenGroup: (g: any) => void }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [editName, setEditName] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dnc-groups'],
    queryFn: getDncGroups,
  });

  const allGroups: any[] = data?.data || [];
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter((r) => (r.name || '').toLowerCase().includes(q));
  }, [allGroups, search]);

  const resetCreate = () => { setShowCreate(false); setGroupName(''); };
  const resetEdit = () => { setEditTarget(null); setEditName(''); };
  const openEdit = (g: any) => { setEditTarget(g); setEditName(g.name || ''); };

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/dnc-groups', { name: groupName }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dnc-groups'] }); resetCreate(); },
  });

  const editMut = useMutation({
    mutationFn: () =>
      api.patch(`/dnc-groups/${editTarget.id}`, { name: editName }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dnc-groups'] }); resetEdit(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/dnc-groups/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>
            DNC Management
          </h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {search
              ? `${filteredGroups.length} of ${allGroups.length} groups`
              : `${allGroups.length} groups total`}
          </p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New DNC Group
        </Button>
      </div>

      {allGroups.length > 0 && (
        <div className='flex items-center gap-3 flex-wrap'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search groups…' />
        </div>
      )}

      <Card>
        {allGroups.length === 0 ? (
          <EmptyState
            title='No DNC groups'
            description='Create a group to organise your suppression lists.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create DNC Group
              </Button>
            }
          />
        ) : filteredGroups.length === 0 ? (
          <EmptyState title='No matches' description={`No groups match "${search}".`} />
        ) : (
          <Table
            cols={[
              {
                header: 'Group Name',
                render: (r: any) => (
                  <div className='flex items-center gap-2'>
                    <ShieldOff className='w-4 h-4 text-red-500' />
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  </div>
                ),
              },
              {
                header: 'Lists',
                render: (r: any) => (
                  <span className='font-medium text-indigo-600'>{r.list_count ?? 0}</span>
                ),
              },
              {
                header: 'Total Numbers',
                render: (r: any) => (
                  <span className='font-medium text-red-600'>
                    {r.number_count?.toLocaleString() ?? 0}
                  </span>
                ),
              },
              {
                header: 'Created',
                render: (r: any) => formatDate(r.created_at),
              },
              {
                header: 'Actions',
                render: (r: any) => (
                  <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
                    {/* <Button
                      size='sm'
                      variant='secondary'
                      icon={<List className='w-3.5 h-3.5' />}
                      onClick={() => onOpenGroup(r)}
                    >
                      View Lists
                    </Button> */}
                    <button
                      onClick={() => openEdit(r)}
                      title='Edit group'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      title='Delete group'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filteredGroups}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => onOpenGroup(r)}
          />
        )}
      </Card>

      {/* Create */}
      <Modal title='Create DNC Group' open={showCreate} onClose={resetCreate}>
        <div className='space-y-4'>
          <Input
            label='Group Name *'
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder='e.g. Federal DNC Registry'
          />
          <p className='text-xs text-gray-400'>
            After creating the group you can add lists and phone numbers inside it.
          </p>
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetCreate}>Cancel</Button>
            <Button
              className='flex-1'
              loading={createMut.isPending}
              disabled={!groupName.trim()}
              onClick={() => createMut.mutate()}
            >
              Create Group
            </Button>
          </div>
          {createMut.isError && (
            <p className='text-xs text-red-500'>
              {(createMut.error as any)?.response?.data?.error || 'Create failed'}
            </p>
          )}
        </div>
      </Modal>

      {/* Edit */}
      <Modal title='Edit DNC Group' open={!!editTarget} onClose={resetEdit}>
        <div className='space-y-4'>
          <Input label='Group Name *' value={editName} onChange={(e) => setEditName(e.target.value)} />
          {editMut.isError && (
            <p className='text-xs text-red-500'>
              {(editMut.error as any)?.response?.data?.error || 'Update failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetEdit}>Cancel</Button>
            <Button
              className='flex-1'
              loading={editMut.isPending}
              disabled={!editName.trim()}
              onClick={() => editMut.mutate()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete */}
      <Modal title='Delete DNC Group?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            This will permanently delete{' '}
            <span className='font-medium text-gray-900'>{deleteTarget?.name}</span>{' '}
            along with all its lists and phone numbers. This action cannot be undone.
          </p>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error || 'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Delete Group
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// LEVEL 2 — DNC Lists inside a Group
// ============================================================================

function DncListsView({
  group,
  onBack,
  onOpenList,
}: {
  group: any;
  onBack: () => void;
  onOpenList: (list: any) => void;
}) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [listName, setListName] = useState('');
  const [listSource, setListSource] = useState('manual');
  const [editName, setEditName] = useState('');
  const [editSource, setEditSource] = useState('manual');
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dnc-lists', group.id],
    queryFn: () => getDncLists(group.id),
  });

  const allLists: any[] = data?.data || [];
  const filteredLists = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLists.filter((r) => {
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      if (filterSource && r.source !== filterSource) return false;
      return true;
    });
  }, [allLists, search, filterSource]);
  const hasActiveFilters = !!(search || filterSource);
  const clearAll = () => { setSearch(''); setFilterSource(''); };

  const resetCreate = () => { setShowCreate(false); setListName(''); setListSource('manual'); };
  const resetEdit = () => { setEditTarget(null); setEditName(''); setEditSource('manual'); };
  const openEdit = (l: any) => {
    setEditTarget(l);
    setEditName(l.name || '');
    setEditSource(l.source || 'manual');
  };

  const createMut = useMutation({
    mutationFn: () =>
      api.post(`/dnc-groups/${group.id}/lists`, { name: listName, source: listSource }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      resetCreate();
    },
  });

  const editMut = useMutation({
    mutationFn: () =>
      api.patch(`/dnc-lists/${editTarget.id}`, { name: editName, source: editSource }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] }); resetEdit(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/dnc-lists/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center gap-3'>
        <button onClick={onBack} className='p-1.5 hover:bg-gray-100 rounded-lg transition'>
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <div className='flex items-center gap-2 text-sm text-gray-400 mb-0.5'>
            <span className='cursor-pointer hover:text-indigo-600 transition' onClick={onBack}>
              DNC Groups
            </span>
            <span>/</span>
            <span className='text-gray-600 font-medium'>{group.name}</span>
          </div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>
            {group.name}
          </h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {hasActiveFilters
              ? `${filteredLists.length} of ${allLists.length} lists`
              : 'Suppression lists in this group'}
          </p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New List
        </Button>
      </div>

      {allLists.length > 0 && (
        <div className='space-y-3'>
          <div className='flex items-center gap-3 flex-wrap'>
            <SearchInput value={search} onChange={setSearch} placeholder='Search lists…' />
            <FilterDropdown
              label='Source'
              value={filterSource}
              onChange={setFilterSource}
              color='indigo'
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'import', label: 'Import' },
                { value: 'agent_disposition', label: 'Agent Disposition' },
                { value: 'campaign_specific', label: 'Campaign Specific' },
              ]}
            />
            {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
          </div>
          {hasActiveFilters && (
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
              {search && <FilterPill label={`Search: "${search}"`} onRemove={() => setSearch('')} />}
              {filterSource && <FilterPill label={`Source: ${filterSource.replace(/_/g, ' ')}`} onRemove={() => setFilterSource('')} />}
            </div>
          )}
        </div>
      )}

      <Card>
        {allLists.length === 0 ? (
          <EmptyState
            title='No lists in this group'
            description='Create a list to start adding phone numbers.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create List
              </Button>
            }
          />
        ) : filteredLists.length === 0 ? (
          <EmptyState title='No matches' description='Try adjusting or clearing the filters above.' />
        ) : (
          <Table
            cols={[
              {
                header: 'List Name',
                render: (r: any) => (
                  <div className='flex items-center gap-2'>
                    <List className='w-4 h-4 text-indigo-500' />
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  </div>
                ),
              },
              {
                header: 'Source',
                render: (r: any) => (
                  <span className='text-gray-600 capitalize'>
                    {(r.source || '').replace(/_/g, ' ') || '—'}
                  </span>
                ),
              },
              {
                header: 'Phone Numbers',
                render: (r: any) => (
                  <span className='font-medium text-red-600'>
                    {r.number_count?.toLocaleString() ?? 0}
                  </span>
                ),
              },
              {
                header: 'Created',
                render: (r: any) => formatDate(r.created_at),
              },
              {
                header: 'Actions',
                render: (r: any) => (
                  <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
                    {/* <Button
                      size='sm'
                      variant='secondary'
                      icon={<Hash className='w-3.5 h-3.5' />}
                      onClick={() => onOpenList(r)}
                    >
                      View Numbers
                    </Button> */}
                    <button
                      onClick={() => openEdit(r)}
                      title='Edit list'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      title='Delete list'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filteredLists}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => onOpenList(r)}
          />
        )}
      </Card>

      {/* Create list */}
      <Modal title={`New List in "${group.name}"`} open={showCreate} onClose={resetCreate}>
        <div className='space-y-4'>
          <Input
            label='List Name *'
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder='e.g. TRAI_JAN_2026'
          />
          
          <p className='text-xs text-gray-400'>
            After creating the list you can add or import phone numbers into it.
          </p>
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetCreate}>Cancel</Button>
            <Button
              className='flex-1'
              loading={createMut.isPending}
              disabled={!listName.trim()}
              onClick={() => createMut.mutate()}
            >
              Create List
            </Button>
          </div>
          {createMut.isError && (
            <p className='text-xs text-red-500'>
              {(createMut.error as any)?.response?.data?.error || 'Create failed'}
            </p>
          )}
        </div>
      </Modal>

      {/* Edit list */}
      <Modal title='Edit List' open={!!editTarget} onClose={resetEdit}>
        <div className='space-y-4'>
          <Input label='List Name *' value={editName} onChange={(e) => setEditName(e.target.value)} />
          <div>
            <label className='block text-xs text-gray-500 mb-1'>Source *</label>
            <select
              value={editSource}
              onChange={(e) => setEditSource(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'
            >
              <option value='manual'>Manual</option>
              <option value='import'>Import</option>
              <option value='agent_disposition'>Agent Disposition</option>
              <option value='campaign_specific'>Campaign Specific</option>
            </select>
          </div>
          {editMut.isError && (
            <p className='text-xs text-red-500'>
              {(editMut.error as any)?.response?.data?.error || 'Update failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetEdit}>Cancel</Button>
            <Button
              className='flex-1'
              loading={editMut.isPending}
              disabled={!editName.trim()}
              onClick={() => editMut.mutate()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete list */}
      <Modal title='Delete List?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            This will permanently delete{' '}
            <span className='font-medium text-gray-900'>{deleteTarget?.name}</span>{' '}
            and all its phone numbers. This action cannot be undone.
          </p>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error || 'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Delete List
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// LEVEL 3 — DNC Numbers inside a List
// ============================================================================

function DncNumbersView({
  group,
  list,
  onBack,
}: {
  group: any;
  list: any;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const headerCsvRef = useRef<HTMLInputElement>(null);

  // ── Add numbers modal ─────────────────────────────────────────────────────
  const [showAddNumbers, setShowAddNumbers] = useState(false);
  // 'single' = one phone input field (like Contact List single mode)
  // 'bulk'   = spreadsheet-style grid (like Contact List bulk mode)
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  // Single mode
  const [singlePhone, setSinglePhone] = useState('');
  // Bulk mode — each row is { phone_number: string }
  const [bulkRows, setBulkRows] = useState<{ phone_number: string }[]>([
    { phone_number: '' },
    { phone_number: '' },
    { phone_number: '' },
  ]);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number; failed: number; total: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvNumbers, setCsvNumbers] = useState<string[]>([]);
  const [csvError, setCsvError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');

  // ── Header CSV upload (mirrors ContactList's Upload CSV button) ───────────
  const [headerUploadStatus, setHeaderUploadStatus] = useState<string | null>(null);

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // ── Edit ──────────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editReason, setEditReason] = useState('manual');
  const [editNotes, setEditNotes] = useState('');
  const openEdit = (r: any) => {
    setEditTarget(r);
    setEditPhone(r.phone_number || '');
    setEditReason(r.added_reason || 'manual');
    setEditNotes(r.notes || '');
  };
  const resetEdit = () => {
    setEditTarget(null);
    setEditPhone('');
    setEditReason('manual');
    setEditNotes('');
  };

  // ── Search / filter ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dnc-numbers', list.id],
    queryFn: () => getDncNumbers(list.id),
  });

  const numbers: any[] = data?.data || [];
  const totalNumbers = data?.total ?? numbers.length;
  const filteredNumbers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return numbers.filter((r) => {
      if (q && !(r.phone_number || '').toLowerCase().includes(q)) return false;
      if (filterReason && r.added_reason !== filterReason) return false;
      return true;
    });
  }, [numbers, search, filterReason]);
  const hasActiveFilters = !!(search || filterReason);
  const clearAll = () => { setSearch(''); setFilterReason(''); };

  // Derive last-added date — handles ISO strings, epoch ms numbers, and null
  const lastAddedDate = numbers.length
    ? numbers.reduce((latest: string | null, r: any) => {
        const raw = r.created_at ?? r.added_at;
        if (!raw) return latest;
        const d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
        if (isNaN(d.getTime())) return latest;
        if (!latest) return d.toISOString();
        return d > new Date(latest) ? d.toISOString() : latest;
      }, null)
    : null;

  // ── Reset modal ───────────────────────────────────────────────────────────
  const resetAddModal = () => {
    setShowAddNumbers(false);
    setAddMode('single');
    setSinglePhone('');
    setBulkRows([{ phone_number: '' }, { phone_number: '' }, { phone_number: '' }]);
    setBulkProgress(null);
    setCsvFile(null);
    setCsvNumbers([]);
    setCsvError('');
    setUploadStatus('');
  };

  // ── Header "Upload CSV" button handler (like ContactListDetailPage) ───────
  const handleHeaderCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderUploadStatus('Uploading…');
    try {
      const text = await file.text();
      const nums = parseDncCsv(text);
      if (!nums.length) {
        setHeaderUploadStatus('⚠ No phone numbers detected in this CSV.');
        if (headerCsvRef.current) headerCsvRef.current.value = '';
        return;
      }
      if (nums.length > 1000) {
        setHeaderUploadStatus(
          `⚠ Found ${nums.length} numbers — max 1000 per upload. Split the file and try again.`,
        );
        if (headerCsvRef.current) headerCsvRef.current.value = '';
        return;
      }
      const numbers = nums.map((phone) => ({ phone_number: phone, added_reason: 'import' }));
      const result = await api
        .post(`/dnc-lists/${list.id}/numbers`, { numbers })
        .then((r) => r.data);
      qc.invalidateQueries({ queryKey: ['dnc-numbers', list.id] });
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      const hasDupes = (result.duplicates ?? 0) > 0;
      const hasFailed = (result.failed ?? 0) > 0;
      const prefix = result.added === 0 && (hasDupes || hasFailed) ? '✗' : hasDupes || hasFailed ? '⚠' : '✓';
      setHeaderUploadStatus(
        `${prefix} Added ${result.added}, Duplicates ${result.duplicates ?? 0}, Failed ${result.failed ?? 0}`,
      );
    } catch (err: any) {
      setHeaderUploadStatus(`Error: ${err.response?.data?.error || 'Upload failed'}`);
    }
    if (headerCsvRef.current) headerCsvRef.current.value = '';
  };

  // ── Single add mutation ───────────────────────────────────────────────────
  const addSingleMut = useMutation({
    mutationFn: () =>
      api.post(`/dnc-lists/${list.id}/numbers`, {
        numbers: [{ phone_number: singlePhone.trim(), added_reason: 'manual' }],
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-numbers', list.id] });
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      resetAddModal();
    },
    onError: (err: any) => {
      setUploadStatus(`Error: ${err.response?.data?.error || 'Add failed'}`);
    },
  });

  // ── Bulk add mutation — submits each non-empty row sequentially ───────────
  const bulkMut = useMutation({
    mutationFn: async () => {
      const candidates = bulkRows
        .map((r, i) => ({ phone: r.phone_number.trim(), idx: i }))
        .filter(({ phone }) => phone !== '');
      const total = candidates.length;
      setBulkProgress({ done: 0, failed: 0, total, errors: [] });
      let done = 0; let failed = 0;
      const errors: { row: number; error: string }[] = [];
      for (const { phone, idx } of candidates) {
        try {
          await api.post(`/dnc-lists/${list.id}/numbers`, {
            numbers: [{ phone_number: phone, added_reason: 'manual' }],
          });
          done += 1;
        } catch (e: any) {
          failed += 1;
          errors.push({ row: idx + 1, error: e?.response?.data?.error || e?.message || 'Failed' });
        }
        setBulkProgress({ done, failed, total, errors });
      }
      return { done, failed, total, errors };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-numbers', list.id] });
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
       resetAddModal();
    },
  });

  // ── Edit number mutation ──────────────────────────────────────────────────
  const editNumMut = useMutation({
    mutationFn: () =>
      api
        .patch(`/dnc-numbers/${editTarget.id}`, {
          phone_number: editPhone.trim(),
          added_reason: editReason,
          notes: editNotes || null,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-numbers', list.id] });
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      resetEdit();
    },
  });

  // ── Delete number mutation ────────────────────────────────────────────────
  const deleteNumMut = useMutation({
    mutationFn: (numberId: string) =>
      api.delete(`/dnc-numbers/${numberId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-numbers', list.id] });
      qc.invalidateQueries({ queryKey: ['dnc-lists', group.id] });
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      {/* Header — mirrors ContactListDetailPage layout */}
      <div className='flex items-center gap-3'>
        <button onClick={onBack} className='p-1.5 hover:bg-gray-100 rounded-lg transition'>
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <div className='flex items-center gap-2 text-sm text-gray-400 mb-0.5'>
            <span className='cursor-pointer hover:text-indigo-600 transition'>DNC Groups</span>
            <span>/</span>
            <span className='cursor-pointer hover:text-indigo-600 transition' onClick={onBack}>
              {group.name}
            </span>
            <span>/</span>
            <span className='text-gray-600 font-medium'>{list.name}</span>
          </div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>
            {list.name}
          </h1>
          {list.source && (
            <p className='text-sm text-[#7A5C44] mt-0.5 capitalize'>
              {list.source.replace(/_/g, ' ')}
            </p>
          )}
        </div>

        {/* Action buttons — same pattern as ContactListDetailPage */}
        <div className='flex gap-2'>
          <Button
            variant='secondary'
            icon={<Upload className='w-4 h-4' />}
            onClick={() => headerCsvRef.current?.click()}
          >
            Upload CSV
          </Button>
          <input
            ref={headerCsvRef}
            type='file'
            accept='.csv,text/csv'
            className='hidden'
            onChange={handleHeaderCsvUpload}
          />
          <Button
            icon={<Plus className='w-4 h-4' />}
            onClick={() => setShowAddNumbers(true)}
          >
            Add Numbers
          </Button>
        </div>
      </div>

      {/* Header CSV upload status banner */}
      {headerUploadStatus && (
        <div
          className={`p-3 rounded-lg text-sm ${
            headerUploadStatus.startsWith('✓')
              ? 'bg-green-50 text-green-700'
              : headerUploadStatus.startsWith('⚠')
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
          }`}
        >
          {headerUploadStatus}
        </div>
      )}

      {/* Stat cards */}
      <div className='grid grid-cols-2 gap-4'>
        <StatCard
          label='Total Numbers'
          value={totalNumbers.toLocaleString()}
        />
        <StatCard
          label='Last Added'
          value={formatDateTime(lastAddedDate)}
        />
      </div>

      {/* Search / filter bar */}
      {numbers.length > 0 && (
        <div className='space-y-3'>
          <div className='flex items-center gap-3 flex-wrap'>
            <SearchInput value={search} onChange={setSearch} placeholder='Search phone numbers…' />
            <FilterDropdown
              label='Reason'
              value={filterReason}
              onChange={setFilterReason}
              color='red'
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'import', label: 'Import' },
                { value: 'agent_disposition', label: 'Agent Disposition' },
                { value: 'campaign_specific', label: 'Campaign Specific' },
              ]}
            />
            {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
            {hasActiveFilters && (
              <span className='text-xs text-gray-500'>
                Showing {filteredNumbers.length} of {numbers.length}
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
              {search && <FilterPill label={`Search: "${search}"`} onRemove={() => setSearch('')} />}
              {filterReason && <FilterPill label={`Reason: ${filterReason.replace(/_/g, ' ')}`} onRemove={() => setFilterReason('')} />}
            </div>
          )}
        </div>
      )}

      {/* Numbers table */}
      <Card>
        {numbers.length === 0 ? (
          <EmptyState
            title='No numbers in this list'
            description='Upload a CSV or add numbers manually.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowAddNumbers(true)}>
                Add Numbers
              </Button>
            }
          />
        ) : filteredNumbers.length === 0 ? (
          <EmptyState title='No matches' description='Try adjusting or clearing the filters above.' />
        ) : (
          <Table
            cols={[
              {
                header: 'Phone Number',
                render: (r: any) => (
                  <span className='font-mono font-medium text-gray-900'>{r.phone_number}</span>
                ),
              },
              {
                header: 'Added Reason',
                render: (r: any) => {
                  const reason = r.added_reason || '—';
                  const styles: Record<string, string> = {
                    manual: 'bg-blue-50 text-blue-700',
                    import: 'bg-purple-50 text-purple-700',
                    agent_disposition: 'bg-amber-50 text-amber-700',
                    campaign_specific: 'bg-green-50 text-green-700',
                  };
                  const cls = styles[reason] ?? 'bg-gray-100 text-gray-600';
                  return (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>
                      {reason.replace(/_/g, ' ')}
                    </span>
                  );
                },
              },
              {
                header: 'Added',
                render: (r: any) => (
                  <span className='text-sm text-gray-600'>{formatDate(r.added_at)}</span>
                ),
              },
              {
                header: 'Actions',
                render: (r: any) => (
                  <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEdit(r)}
                      title='Edit number'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      title='Remove number'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filteredNumbers}
            keyFn={(r: any) => r.id}
          />
        )}
      </Card>

      {/* Add Numbers modal — matches Contact List "Add Contact" UI exactly */}
      <Modal
        title='Add Numbers'
        open={showAddNumbers}
        onClose={resetAddModal}
        size={addMode === 'bulk' ? 'xl' : 'lg'}
      >
        <div className='space-y-4'>
          {/* Mode selector — identical <select> pattern to Contact List */}
          <div className='flex items-center gap-3'>
            <label className='text-xs text-gray-500'>Mode</label>
            <select
              value={addMode}
              onChange={(e) => {
                setAddMode(e.target.value as 'single' | 'bulk');
                setSinglePhone('');
                setBulkRows([{ phone_number: '' }, { phone_number: '' }, { phone_number: '' }]);
                setBulkProgress(null);
                setCsvFile(null);
                setCsvNumbers([]);
                setCsvError('');
                setUploadStatus('');
              }}
              className='border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
            >
              <option value='single'>Single Upload</option>
              <option value='bulk'>Bulk Upload</option>
            </select>
          </div>

          {/* ── Single mode ── */}
          {addMode === 'single' && (
            <div className='space-y-3'>
              <Input
                label='Phone Number (E.164) *'
                value={singlePhone}
                onChange={(e) => setSinglePhone(e.target.value)}
                placeholder='+12125550101'
              />
              <p className='text-xs text-gray-400'>
                Saved with reason <span className='font-medium text-blue-600'>manual</span>.
              </p>
              {uploadStatus && (
                <div className={`p-3 rounded-lg text-sm ${
                  uploadStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {uploadStatus}
                </div>
              )}
            </div>
          )}

          {/* ── Bulk mode — spreadsheet grid identical to BulkGrid in ContactList ── */}
          {addMode === 'bulk' && (
            <DncBulkGrid
              rows={bulkRows}
              setRows={setBulkRows}
              progress={bulkProgress}
              disabled={bulkMut.isPending}
            />
          )}

          {/* Footer buttons */}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button variant='secondary' className='flex-1' onClick={resetAddModal}>
              Cancel
            </Button>
            {addMode === 'single' ? (
              <Button
                variant='danger'
                className='flex-1'
                loading={addSingleMut.isPending}
                disabled={!singlePhone.trim()}
                onClick={() => addSingleMut.mutate()}
              >
                Add to DNC
              </Button>
            ) : (
              <Button
                variant='danger'
                className='flex-1'
                loading={bulkMut.isPending}
                disabled={bulkRows.every((r) => r.phone_number.trim() === '')}
                onClick={() => bulkMut.mutate()}
              >
                Import Numbers
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal title='Remove Number?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            Remove{' '}
            <span className='font-mono font-medium text-gray-900'>{deleteTarget?.phone_number}</span>{' '}
            from this list? It can be re-added later.
          </p>
          {deleteNumMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteNumMut.error as any)?.response?.data?.error || 'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={deleteNumMut.isPending}
              onClick={() => deleteTarget && deleteNumMut.mutate(deleteTarget.id)}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit number */}
      <Modal title='Edit DNC Number' open={!!editTarget} onClose={resetEdit} size='sm'>
        <div className='space-y-4'>
          <Input
            label='Phone Number'
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder='+1234567890'
            required
            autoFocus
          />
         {/*  <Select
            label='Added Reason'
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            options={[
              { value: 'manual', label: 'Manual' },
              { value: 'import', label: 'Import' },
              { value: 'agent_disposition', label: 'Agent Disposition' },
              { value: 'campaign_specific', label: 'Campaign Specific' },
            ]}
          />
          <Input
            label='Notes (optional)'
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder='Why is this number on DNC?'
          /> */}
          {editNumMut.isError && (
            <p className='text-xs text-red-500'>
              {(editNumMut.error as any)?.response?.data?.error || 'Save failed'}
            </p>
          )}
          <div className='flex gap-3 pt-1'>
            <Button variant='secondary' className='flex-1' onClick={resetEdit}>Cancel</Button>
            <Button
              className='flex-1'
              loading={editNumMut.isPending}
              disabled={!editPhone.trim()}
              onClick={() => editNumMut.mutate()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Spreadsheet-style bulk grid for DNC numbers (mirrors BulkGrid in ContactList) ──
function DncBulkGrid({
  rows,
  setRows,
  progress,
  disabled,
}: {
  rows: { phone_number: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ phone_number: string }[]>>;
  progress: { done: number; failed: number; total: number; errors: { row: number; error: string }[] } | null;
  disabled: boolean;
}) {
  const updateCell = (i: number, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { phone_number: value } : r)));
  const addRow = () => setRows((rs) => [...rs, { phone_number: '' }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  const thCls =
    'text-left text-[11px] uppercase tracking-wide text-gray-500 font-medium px-2 py-2 border-b border-gray-200 bg-gray-50';
  const tdCls = 'border-b border-gray-100 align-top';
  const cellCls =
    'w-full border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset bg-transparent font-mono';

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-xs text-gray-500'>
          Enter one phone number per row. Empty rows are skipped on import. Saved with reason{' '}
          <span className='font-medium text-blue-600'>manual</span>.
        </p>
        <Button
          variant='secondary'
          icon={<Plus className='w-3.5 h-3.5' />}
          onClick={addRow}
          disabled={disabled}
        >
          Add Row
        </Button>
      </div>

      <div className='border border-gray-200 rounded-lg overflow-auto max-h-[60vh]'>
        <table className='w-full'>
          <thead className='sticky top-0'>
            <tr>
              <th className={thCls + ' w-10'}>#</th>
              <th className={thCls + ' min-w-[220px]'}>Phone Number *</th>
              <th className={thCls + ' w-10'}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className='hover:bg-gray-50/50'>
                <td className={tdCls + ' text-xs text-gray-400 px-2 py-1.5'}>{i + 1}</td>
                <td className={tdCls}>
                  <input
                    type='tel'
                    value={row.phone_number}
                    onChange={(e) => updateCell(i, e.target.value)}
                    placeholder='+12125550101'
                    disabled={disabled}
                    className={cellCls}
                  />
                </td>
                <td className={tdCls + ' px-2 py-1.5 text-right'}>
                  <button
                    onClick={() => removeRow(i)}
                    disabled={disabled || rows.length === 1}
                    className='p-1 text-gray-400 hover:text-red-500 disabled:opacity-30'
                    title='Remove row'
                  >
                    <Trash2 className='w-3.5 h-3.5' />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {progress && (
        <div className='text-xs space-y-1'>
          <p className='text-gray-600'>
            Imported {progress.done} of {progress.total}
            {progress.failed > 0 && (
              <span className='text-red-600'> · {progress.failed} failed</span>
            )}
          </p>
          {progress.errors.length > 0 && (
            <ul className='text-red-500 list-disc pl-5 max-h-24 overflow-y-auto'>
              {progress.errors.map((e, idx) => (
                <li key={idx}>Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}