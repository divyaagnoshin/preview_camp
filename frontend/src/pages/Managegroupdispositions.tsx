import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader, SearchInput, Input, Select, Modal } from '../components/ui';
import { ArrowLeft, Plus, Tag, X, Save } from 'lucide-react';
import {
  listDispositionGroupCodes,
  listAvailableDispositionCodes,
  createDispositionGroupCode,
  setDispositionGroupCodes,
} from '../api/client';

const CAPABILITY_OPTIONS = [
  { value: 'CLOSED', label: 'Closed (terminal — call complete)' },
  { value: 'NEXT_ATTEMPT', label: 'Next Attempt (re-dial after delay)' },
  { value: 'RESCHEDULE', label: 'Reschedule (callback at specific time)' },
];

const capabilityBadge: Record<string, string> = {
  CLOSED: 'bg-emerald-50 text-emerald-700',
  NEXT_ATTEMPT: 'bg-amber-50 text-amber-700',
  RESCHEDULE: 'bg-indigo-50 text-indigo-700',
};

interface Props {
  group: any;
  onBack: () => void;
  onDone?: (group: any) => void;   // ← add this
  fromCreate?: boolean;             // ← add this
}

export default function ManageGroupDispositions({ group, onBack, onDone, fromCreate }: Props) {
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // ── queries ──────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['disposition-group-codes', group.id],
    queryFn: () => listDispositionGroupCodes(group.id),
  });
  const { data: availData, isLoading: availLoading } = useQuery({
    queryKey: ['disposition-codes-available', group.id],
    queryFn: () => listAvailableDispositionCodes(group.id),
  });

  const attachedCodes: any[] = data?.data || [];
  const availableCodes: any[] = availData?.data || [];

  // ── optimistic local pool ─────────────────────────────────────
  // Codes created this session are pushed here immediately on API success
  // so they show up in the Available pane right away, before the refetch
  // resolves. Once the server refetch includes the code, the Map merge
  // below means the server entry takes over (same id = same key).
  const [localCodes, setLocalCodes] = useState<any[]>([]);

  // ── selection state ───────────────────────────────────────────
  // Seeded once per group from the server's attached list.
  // Must NOT re-seed on refetch — that would clobber in-flight picks
  // and flip dirty back to false.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (seededFor.current === group.id) return;
    setSelectedIds(attachedCodes.map((c) => c.id));
    seededFor.current = group.id;
  }, [isLoading, attachedCodes, group.id]);

  // ── full pool: server codes + locally created (keyed by id) ───
  const codeById = useMemo(() => {
    const m = new Map<string, any>();
    attachedCodes.forEach((c) => m.set(c.id, c));
    availableCodes.forEach((c) => m.set(c.id, c));
    // localCodes fills the gap before refetch — skipped once server has it
    localCodes.forEach((c) => { if (!m.has(c.id)) m.set(c.id, c); });
    return m;
  }, [attachedCodes, availableCodes, localCodes]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ── available pane: everything NOT selected, filtered by search ─
  const availableForPane = useMemo(() => {
    const all = Array.from(codeById.values()).filter((c) => !selectedSet.has(c.id));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (c) =>
            (c.code || '').toLowerCase().includes(q) ||
            (c.label || '').toLowerCase().includes(q),
        )
      : all;
    return filtered.sort(
      (a, b) =>
        (a.display_order ?? 99) - (b.display_order ?? 99) ||
        (a.code || '').localeCompare(b.code || ''),
    );
  }, [codeById, selectedSet, search]);

  const totalAvailable = availableForPane.length;

  // ── selected pane (preserves user-chosen order) ───────────────
  const selectedRows = useMemo(
    () => selectedIds.map((id) => codeById.get(id)).filter(Boolean),
    [selectedIds, codeById],
  );

  // ── dirty check ───────────────────────────────────────────────
  const dirty = useMemo(() => {
    const a = new Set(selectedIds);
    const b = new Set(attachedCodes.map((c) => c.id));
    if (a.size !== b.size) return true;
    for (const id of a) if (!b.has(id)) return true;
    return false;
  }, [selectedIds, attachedCodes]);

  // ── mutations ─────────────────────────────────────────────────
  const saveMut = useMutation({
  mutationFn: () => setDispositionGroupCodes(group.id, selectedIds),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['disposition-group-codes', group.id] });
    qc.invalidateQueries({ queryKey: ['disposition-codes-available', group.id] });
    qc.invalidateQueries({ queryKey: ['disposition-groups'] });

    // KEY DECISION: where to go after saving?
    if (fromCreate && onDone) {
      onDone(group);  // → parent sets view to 'codes' (inside the group)
    } else {
      onBack();       // → existing behavior: go back to codes view
    }
  },
});

  // ── create custom code ────────────────────────────────────────
  const blank = { code: '', label: '', capability: 'CLOSED', retry_delay_min: '', notes_required: false, display_order: '99' };
  const [form, setForm] = useState({ ...blank });
  const setField = (k: keyof typeof blank, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const formValid =
    form.code.trim() !== '' &&
    form.label.trim() !== '' &&
    (form.capability !== 'NEXT_ATTEMPT' || form.retry_delay_min !== '');

  const createMut = useMutation({
    mutationFn: () =>
      createDispositionGroupCode(group.id, {
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
    onSuccess: (created: any) => {
      // 1. Push the new code into localCodes immediately so it appears in
      //    the Available pane right away (before refetch resolves).
      if (created?.id) {
        setLocalCodes((prev) =>
          prev.find((c) => c.id === created.id) ? prev : [...prev, created],
        );
      }
      // 2. Refresh the available pool from the server.
      //    Do NOT invalidate disposition-group-codes — that would re-seed
      //    selectedIds and reset dirty to false.
      qc.invalidateQueries({ queryKey: ['disposition-codes-available', group.id] });
      setShowCreate(false);
      setForm({ ...blank });
    },
  });

  // ── add / remove ──────────────────────────────────────────────
  const addOne = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const removeOne = (id: string) =>
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  const addAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      availableForPane.forEach((c: any) => next.add(c.id));
      return Array.from(next);
    });
  const removeAll = () => setSelectedIds([]);

  if (isLoading || availLoading) return <PageLoader />;

  return (
    <div className='flex flex-col h-full min-h-screen bg-[#faf9f7]'>
      {/* ── Top bar ── */}
      <div className='flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200 sticky top-0 z-10'>
        <div className='flex items-center gap-3'>
          <button
            onClick={onBack}
            className='p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-500'
          >
            <ArrowLeft className='w-4 h-4' />
          </button>
          <div>
            <div className='flex items-center gap-2 text-xs text-gray-400 mb-0.5'>
              <span className='cursor-pointer hover:text-[#F4521E] transition' onClick={onBack}>
                Disposition Groups
              </span>
              <span>/</span>
              <span className='cursor-pointer hover:text-[#F4521E] transition' onClick={onBack}>
                {group.name}
              </span>
              <span>/</span>
              <span className='text-gray-600'>Manage Dispositions</span>
            </div>
            <h1 className='text-xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>
              Manage Dispositions
            </h1>
            <p className='text-xs text-[#7A5C44] mt-0.5'>
              {group.name} · {selectedRows.length} selected
            </p>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Button
            icon={<Plus className='w-4 h-4' />}
            variant='secondary'
            onClick={() => setShowCreate(true)}
          >
            New Custom Code
          </Button>
          <Button
            icon={<Save className='w-4 h-4' />}
            disabled={!dirty}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save
          </Button>
        </div>
      </div>

      {saveMut.isError && (
        <div className='mx-8 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600'>
          Save failed. Please try again.
        </div>
      )}

      <p className='text-xs text-gray-500 px-8 pt-4 pb-2'>
        This page allows you to associate Dispositions with the selected group.
      </p>

      {/* ── Dual pane ── */}
      <div className='flex flex-1 gap-0 px-8 pb-8 pt-2'>
        {/* LEFT: Available */}
        <div className='flex flex-col w-1/2 bg-[#FFF8F3] border border-[#F5A62333] rounded-l-xl border-r-0 overflow-hidden'>
          <div className='flex items-center justify-between px-5 py-3 bg-[#FFF1E0] border-b border-[#F5A62333]'>
            <div className='text-sm font-semibold text-[#7A3B12]'>Available Dispositions</div>
            <button
              onClick={addAll}
              disabled={totalAvailable === 0}
              className='text-xs font-medium text-[#F4521E] hover:text-[#C53F12] disabled:opacity-40 disabled:cursor-not-allowed transition'
            >
              Add All
            </button>
          </div>

          <div className='px-4 py-2 bg-white border-b border-[#F5A62333]'>
            <SearchInput value={search} onChange={setSearch} placeholder='Search…' />
          </div>

          <div className='flex-1 overflow-y-auto divide-y divide-[#F5A62322] bg-white'>
            {totalAvailable === 0 ? (
              <div className='flex flex-col items-center justify-center py-16 text-center px-6'>
                <Tag className='w-7 h-7 text-gray-300 mb-3' />
                <p className='text-sm text-gray-500'>
                  {search ? 'No matches.' : 'All dispositions are already selected.'}
                </p>
                <p className='text-xs text-gray-400 mt-1'>
                  Use <span className='font-medium'>New Custom Code</span> to create one.
                </p>
              </div>
            ) : (
              availableForPane.map((c: any) => (
                <div
                  key={c.id}
                  className='flex items-center gap-3 px-5 py-3 hover:bg-[#FFF1E0] cursor-pointer group'
                  onClick={() => addOne(c.id)}
                >
                  <Tag className='w-3.5 h-3.5 text-[#F5A623] shrink-0' />
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='font-mono text-sm font-medium text-gray-900'>{c.code}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${capabilityBadge[c.capability] || 'bg-gray-100 text-gray-600'}`}>
                        {c.capability.replace('_', ' ')}
                      </span>
                      {c.notes_required && (
                        <span className='px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium'>Notes</span>
                      )}
                    </div>
                    <div className='text-xs text-gray-500 truncate'>{c.label}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); addOne(c.id); }}
                    className='shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-[#F5A62322] hover:bg-[#F4521E] text-[#F4521E] hover:text-white transition'
                  >
                    <Plus className='w-3.5 h-3.5' />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Selected */}
        <div className='flex flex-col w-1/2 bg-[#FFF5EE] border border-[#F4521E33] rounded-r-xl overflow-hidden'>
          <div className='flex items-center justify-between px-5 py-3 bg-[#FFE6D6] border-b border-[#F4521E33]'>
            <div className='text-sm font-semibold text-[#7A3B12]'>Selected Dispositions</div>
            {selectedRows.length > 0 && (
              <button
                onClick={removeAll}
                className='text-xs font-medium text-gray-500 hover:text-red-500 transition'
              >
                Remove All
              </button>
            )}
          </div>

          <div className='flex-1 overflow-y-auto divide-y divide-[#F4521E22] bg-white'>
            {selectedRows.length === 0 ? (
              <div className='flex flex-col items-center justify-center py-16 text-center px-6'>
                <Tag className='w-7 h-7 text-gray-300 mb-3' />
                <p className='text-sm text-gray-500'>No dispositions selected.</p>
                <p className='text-xs text-gray-400 mt-1'>
                  Click dispositions on the left to add them.
                </p>
              </div>
            ) : (
              selectedRows.map((c: any) => (
                <div
                  key={c.id}
                  className='flex items-center gap-3 px-5 py-3 hover:bg-[#FFE6D6] group'
                >
                  <Tag className='w-3.5 h-3.5 text-[#F4521E] shrink-0' />
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='font-mono text-sm font-medium text-gray-900 truncate'>
                        {c.code}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${capabilityBadge[c.capability] || 'bg-gray-100 text-gray-600'}`}>
                        {c.capability.replace('_', ' ')}
                      </span>
                      {c.notes_required && (
                        <span className='px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium'>Notes</span>
                      )}
                    </div>
                    <div className='text-xs text-gray-500 truncate'>{c.label}</div>
                  </div>
                  <button
                    onClick={() => removeOne(c.id)}
                    className='shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-400 transition'
                    title='Remove'
                  >
                    <X className='w-3.5 h-3.5' />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Create Custom Code modal ── */}
      <Modal
        title='New Custom Disposition Code'
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm({ ...blank }); }}
        size='lg'
      >
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <Input
              label='Code *'
              value={form.code}
              onChange={(e) => setField('code', e.target.value)}
              placeholder='e.g. CUSTOM_FOLLOWUP'
            />
            <Input
              label='Label *'
              value={form.label}
              onChange={(e) => setField('label', e.target.value)}
              placeholder='e.g. Customer Wants Follow-Up'
            />
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
              placeholder='e.g. 30'
            />
          )}
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>Notes</label>
              <label className='flex items-center gap-2 text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer'>
                <input
                  type='checkbox'
                  checked={form.notes_required}
                  onChange={(e) => setField('notes_required', e.target.checked)}
                />
                Required
              </label>
            </div>
          </div>
          {createMut.isError && (
            <p className='text-xs text-red-500'>
              {(createMut.error as any)?.response?.data?.error || 'Create failed'}
            </p>
          )}
          <div className='flex gap-3 pt-2'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={() => { setShowCreate(false); setForm({ ...blank }); }}
            >
              Cancel
            </Button>
            <Button
              className='flex-1'
              loading={createMut.isPending}
              disabled={!formValid}
              onClick={() => createMut.mutate()}
            >
              Create & Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}