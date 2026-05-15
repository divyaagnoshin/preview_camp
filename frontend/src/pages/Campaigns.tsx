import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  runCampaign,
  stopCampaign,
  getContactLists,
  getDncGroups,
  listScheduleTemplates,
  listHolidayCalendars,
  listDispositionGroups,
} from '../api/client';
import {
  Card,
  Table,
  StatusBadge,
  Button,
  Modal,
  Input,
  Select,
  PageLoader,
  EmptyState,
} from '../components/ui';
import {
  Plus,
  Play,
  Pause,
  ChevronRight,
  ArrowLeft,
  Pencil,
  Trash2,
  Search,
  Filter,
  X,
  ChevronDown,
} from 'lucide-react';

// ─── Filter dropdown component ────────────────────────────────────────────────
function FilterDropdown({
  label,
  options,
  value,
  onChange,
  color = 'indigo',
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  color?: 'indigo' | 'amber' | 'green' | 'red';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const isActive = !!value;

  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    red:    'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div ref={ref} className='relative'>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
          isActive
            ? colorMap[color]
            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <Filter className='w-3.5 h-3.5' />
        <span>{isActive ? selected?.label : label}</span>
        {isActive ? (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className='ml-0.5 hover:opacity-70'
          >
            <X className='w-3 h-3' />
          </span>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className='absolute top-full left-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden'>
          <div className='p-1'>
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className='w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 rounded-lg transition'
            >
              All {label}s
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition flex items-center justify-between ${
                  value === opt.value
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
                {value === opt.value && (
                  <span className='w-1.5 h-1.5 rounded-full bg-indigo-500' />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Active filter pill ───────────────────────────────────────────────────────
function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium'>
      {label}
      <button onClick={onRemove} className='hover:text-indigo-900 transition'>
        <X className='w-3 h-3' />
      </button>
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMaxAttempts, setFilterMaxAttempts] = useState('');
  const [filterAgentPriority, setFilterAgentPriority] = useState('');

  // ── Modal / form state ────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: '',
    schedule_type: 'finite',
    max_attempts: '5',
    wrapup_time_sec: '3',
    auto_dial_delay_sec: '8',
    caller_id: '',
    start_date: '',
    end_date: '',
    agent_priority_enabled: false,
    contact_list_ids: [] as string[],
    schedule_template_id: '',
    holiday_calendar_id: '',
    dnc_group_ids: [] as string[],
    disposition_group_id: '',
  });

  const { data, isLoading } = useQuery({ queryKey: ['campaigns'], queryFn: getCampaigns });
  const { data: lists } = useQuery({ queryKey: ['contact-lists'], queryFn: getContactLists });
  const { data: templates } = useQuery({ queryKey: ['schedule-templates'], queryFn: listScheduleTemplates });
  const { data: calendars } = useQuery({ queryKey: ['holiday-calendars'], queryFn: listHolidayCalendars });
  const { data: dncGroups } = useQuery({ queryKey: ['dnc-groups'], queryFn: getDncGroups });
  const { data: dispositionGroups } = useQuery({ queryKey: ['disposition-groups'], queryFn: listDispositionGroups });

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const allCampaigns: any[] = data?.data || [];

  const filtered = useMemo(() => {
    return allCampaigns.filter((r) => {
      if (search && !r.name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterType && r.schedule_type !== filterType) return false;
      if (filterMaxAttempts) {
        if (filterMaxAttempts === 'infinite' && r.max_attempts != null) return false;
        if (filterMaxAttempts !== 'infinite' && String(r.max_attempts) !== filterMaxAttempts) return false;
      }
      if (filterAgentPriority) {
        const want = filterAgentPriority === 'yes';
        if (!!r.agent_priority_enabled !== want) return false;
      }
      return true;
    });
  }, [allCampaigns, search, filterStatus, filterType, filterMaxAttempts, filterAgentPriority]);

  const hasActiveFilters = !!(search || filterStatus || filterType || filterMaxAttempts || filterAgentPriority);

  const clearAllFilters = () => {
    setSearch('');
    setFilterStatus('');
    setFilterType('');
    setFilterMaxAttempts('');
    setFilterAgentPriority('');
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: () =>
      createCampaign({
        ...form,
        max_attempts: form.schedule_type === 'infinite' ? null : parseInt(form.max_attempts),
        wrapup_time_sec: parseInt(form.wrapup_time_sec),
        auto_dial_delay_sec: parseInt(form.auto_dial_delay_sec),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); closeCreate(); },
  });

  const editMut = useMutation({
    mutationFn: () =>
      updateCampaign(editingId!, {
        name: form.name,
        max_attempts: form.schedule_type === 'infinite' ? null : parseInt(form.max_attempts),
        wrapup_time_sec: parseInt(form.wrapup_time_sec),
        auto_dial_delay_sec: parseInt(form.auto_dial_delay_sec),
        agent_priority_enabled: form.agent_priority_enabled,
        schedule_template_id: form.schedule_template_id,
        holiday_calendar_id: form.holiday_calendar_id,
        contact_list_ids: form.contact_list_ids,
        dnc_group_ids: form.dnc_group_ids,
        disposition_group_id: form.disposition_group_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); closeCreate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); setDeleteTarget(null); },
  });

  const runMut = useMutation({
    mutationFn: (id: string) => runCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  const stopMut = useMutation({
    mutationFn: (id: string) => stopCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const resetForm = () =>
    setForm({
      name: '', schedule_type: 'finite', max_attempts: '5',
      wrapup_time_sec: '90', auto_dial_delay_sec: '8',
      caller_id: '', start_date: '', end_date: '',
      agent_priority_enabled: false, contact_list_ids: [],
      schedule_template_id: '', holiday_calendar_id: '', dnc_group_ids: [],
      disposition_group_id: '',
    });

  const closeCreate = () => { setShowCreate(false); setEditingId(null); setStep(1); resetForm(); };

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      name: r.name || '',
      schedule_type: r.schedule_type || 'finite',
      max_attempts: r.max_attempts != null ? String(r.max_attempts) : '5',
      wrapup_time_sec: String(r.wrapup_time_sec ?? 90),
      auto_dial_delay_sec: String(r.auto_dial_delay_sec ?? 8),
      caller_id: r.caller_id || '',
      start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
      agent_priority_enabled: !!r.agent_priority_enabled,
      contact_list_ids: (r.contact_lists || []).map((l: any) => l.id),
      schedule_template_id: r.schedule_template_id || '',
      holiday_calendar_id: r.holiday_calendar_id || '',
      dnc_group_ids: Array.isArray(r.dnc_group_ids)
        ? r.dnc_group_ids
        : r.dnc_group_id ? [r.dnc_group_id] : [],
      disposition_group_id: r.disposition_group_id || '',
    });
    setStep(1);
    setShowCreate(true);
  };

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>
            Campaigns
          </h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {hasActiveFilters
              ? `${filtered.length} of ${allCampaigns.length} campaigns`
              : `${allCampaigns.length} campaigns total`}
          </p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New Campaign
        </Button>
      </div>

      {/* ── Search + Filters bar ─────────────────────────────────────────── */}
      <div className='space-y-3'>
        <div className='flex items-center gap-3 flex-wrap'>
          {/* Search input */}
          <div className='relative flex-1 min-w-[200px] max-w-sm'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none' />
            <input
              type='text'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search campaigns…'
              className='w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder:text-gray-400'
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            )}
          </div>

          {/* Filter dropdowns */}
          <div className='flex items-center gap-2 flex-wrap'>
            <FilterDropdown
              label='Status'
              value={filterStatus}
              onChange={setFilterStatus}
              color='green'
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
            <FilterDropdown
              label='Type'
              value={filterType}
              onChange={setFilterType}
              color='indigo'
              options={[
                { value: 'finite', label: 'Finite' },
                { value: 'infinite', label: 'Infinite' },
              ]}
            />
            <FilterDropdown
              label='Max Attempts'
              value={filterMaxAttempts}
              onChange={setFilterMaxAttempts}
              color='amber'
              options={[
                { value: 'infinite', label: 'Infinite (∞)' },
                { value: '1', label: '1 attempt' },
                { value: '2', label: '2 attempts' },
                { value: '3', label: '3 attempts' },
                { value: '5', label: '5 attempts' },
                { value: '10', label: '10 attempts' },
                { value: '15', label: '15 attempts' },
                { value: '20', label: '20 attempts' },
              ]}
            />
            <FilterDropdown
              label='Agent Priority'
              value={filterAgentPriority}
              onChange={setFilterAgentPriority}
              color='indigo'
              options={[
                { value: 'yes', label: 'Enabled' },
                { value: 'no', label: 'Disabled' },
              ]}
            />

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className='flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition font-medium'
              >
                <X className='w-3.5 h-3.5' />
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Active filter pills summary row */}
        {hasActiveFilters && (
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
            {search && (
              <FilterPill label={`Name: "${search}"`} onRemove={() => setSearch('')} />
            )}
            {filterStatus && (
              <FilterPill
                label={`Status: ${filterStatus}`}
                onRemove={() => setFilterStatus('')}
              />
            )}
            {filterType && (
              <FilterPill
                label={`Type: ${filterType}`}
                onRemove={() => setFilterType('')}
              />
            )}
            {filterMaxAttempts && (
              <FilterPill
                label={`Max attempts: ${filterMaxAttempts === 'infinite' ? '∞' : filterMaxAttempts}`}
                onRemove={() => setFilterMaxAttempts('')}
              />
            )}
            {filterAgentPriority && (
              <FilterPill
                label={`Agent priority: ${filterAgentPriority === 'yes' ? 'Enabled' : 'Disabled'}`}
                onRemove={() => setFilterAgentPriority('')}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <Card>
        {allCampaigns.length === 0 ? (
          <EmptyState
            title='No campaigns yet'
            description='Create your first campaign to start outbound calling.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create Campaign
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-14 gap-3'>
            <div className='w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center'>
              <Search className='w-5 h-5 text-gray-400' />
            </div>
            <div className='text-center'>
              <p className='text-sm font-medium text-gray-700'>No campaigns match your filters</p>
              <p className='text-xs text-gray-400 mt-0.5'>Try adjusting or clearing the filters above</p>
            </div>
            <button
              onClick={clearAllFilters}
              className='text-xs text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2 transition'
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <Table
            cols={[
              {
                header: 'Name',
                render: (r: any) => (
                  <div>
                    <div className='font-medium text-gray-900'>{r.name}</div>
                    {r.agent_priority_enabled && (
                      <span className='text-xs text-indigo-500'>Agent priority</span>
                    )}
                  </div>
                ),
              },
              {
                header: 'Type',
                render: (r: any) => <StatusBadge status={r.schedule_type} />,
              },
              {
                header: 'Status',
                render: (r: any) => <StatusBadge status={r.status} />,
              },
              {
                header: 'Max Attempts',
                render: (r: any) => r.max_attempts || '∞',
              },
              {
                header: 'Actions',
                width: '220px',
                render: (r: any) => (
                  <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
                    {r.status === 'active' ? (
                      <button
                        onClick={() => stopMut.mutate(r.id)}
                        disabled={stopMut.isPending}
                        title='Pause campaign'
                        className='p-1.5 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50'
                      >
                        <Pause className='w-4 h-4' />
                      </button>
                    ) : (
                      <button
                        onClick={() => runMut.mutate(r.id)}
                        disabled={runMut.isPending}
                        title='Run campaign'
                        className='p-1.5 rounded-md text-green-600 hover:text-green-700 hover:bg-green-50 transition disabled:opacity-50'
                      >
                        <Play className='w-4 h-4' />
                      </button>
                    )}
                    {r.status !== 'active' ? (
                      <button
                        onClick={() => openEdit(r)}
                        title='Edit campaign'
                        className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                      >
                        <Pencil className='w-3 h-3' />
                       
                      </button>
                    ) : (
                      <span className='inline-block w-[58px] h-[26px]' />
                    )}
                    {r.status !== 'active' ? (
                      <button
                        onClick={() => setDeleteTarget(r)}
                        title='Delete campaign'
                        className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                      >
                        <Trash2 className='w-3 h-3' />
                       
                      </button>
                    ) : (
                      <span className='inline-block w-[70px] h-[26px]' />
                    )}
                    {/* Highlighted View button */}
                    <button
                      onClick={() => navigate(`/campaigns/${r.id}`)}
                      title='View details'
                      className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold transition'
                    >
                      View
                      <ChevronRight className='w-3.5 h-3.5' />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => navigate(`/campaigns/${r.id}`)}
          />
        )}
      </Card>

      {/* ── Create / Edit Modal ──────────────────────────────────────────── */}
      <Modal
        title={editingId ? 'Edit Campaign' : 'Create Campaign'}
        open={showCreate}
        onClose={closeCreate}
        size='lg'
      >
        <div className='space-y-4'>
          {/* Step indicator */}
          <div className='flex items-center gap-2 text-xs flex-wrap'>
            {[
              { n: 1, label: '1. Details' },
              { n: 2, label: '2. Contacts' },
              { n: 3, label: '3. Schedule' },
              { n: 4, label: '4. DNC' },
              { n: 5, label: '5. Dispositions' },
            ].map((s, i) => (
              <React.Fragment key={s.n}>
                {i > 0 && <span className='text-gray-300'>—</span>}
                <span
                  className={
                    step === s.n
                      ? 'px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium'
                      : 'px-2 py-0.5 rounded-full bg-gray-100 text-gray-500'
                  }
                >
                  {s.label}
                </span>
              </React.Fragment>
            ))}
          </div>

          {step === 1 && (
            <>
              <Input
                label='Campaign Name *'
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder='e.g. Q2 Loan Outreach'
              />
              <div className='grid grid-cols-2 gap-3'>
                <Select
                  label='Schedule Type'
                  value={form.schedule_type}
                  onChange={(e) => set('schedule_type', e.target.value)}
                  options={[
                    { value: 'finite', label: 'Finite (runs to completion)' },
                    { value: 'infinite', label: 'Infinite (runs until stopped)' },
                  ]}
                />
                <Select
                  label='Max Attempts'
                  value={form.max_attempts}
                  onChange={(e) => set('max_attempts', e.target.value)}
                  options={[
                    { value: 'infinite', label: 'Infinite (no limit)' },
                    { value: '1', label: '1 attempt' },
                    { value: '2', label: '2 attempts' },
                    { value: '3', label: '3 attempts' },
                    { value: '5', label: '5 attempts' },
                    { value: '10', label: '10 attempts' },
                    { value: '15', label: '15 attempts' },
                    { value: '20', label: '20 attempts' },
                  ]}
                />
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <Input
                  label='Wrap-up Time (seconds)'
                  type='number'
                  value={form.wrapup_time_sec}
                  onChange={(e) => set('wrapup_time_sec', e.target.value)}
                />
                <Input
                  label='Auto-dial Delay (seconds)'
                  type='number'
                  value={form.auto_dial_delay_sec}
                  onChange={(e) => set('auto_dial_delay_sec', e.target.value)}
                />
              </div>
              <Input
                label='Caller ID (E.164 format)'
                value={form.caller_id}
                onChange={(e) => set('caller_id', e.target.value)}
                placeholder='+18005550100'
              />
              <div className='flex gap-3 pt-2'>
                <Button variant='secondary' className='flex-1' onClick={closeCreate}>Cancel</Button>
                <Button className='flex-1' disabled={!form.name} onClick={() => setStep(2)}>Next</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>Contact Lists *</label>
                <div className='border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto'>
                  {lists?.data?.length === 0 && (
                    <p className='text-xs text-gray-400 p-3'>No contact lists. Create one first.</p>
                  )}
                  {lists?.data?.map((l: any) => (
                    <label key={l.id} className='flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer'>
                      <input
                        type='checkbox'
                        value={l.id}
                        checked={form.contact_list_ids.includes(l.id)}
                        onChange={(e) =>
                          set('contact_list_ids', e.target.checked
                            ? [...form.contact_list_ids, l.id]
                            : form.contact_list_ids.filter((x: string) => x !== l.id))
                        }
                        className='w-4 h-4 text-indigo-600 rounded'
                      />
                      <div>
                        <div className='text-sm font-medium text-gray-900'>{l.name}</div>
                        <div className='text-xs text-gray-400'>{l.contact_count} contacts</div>
                      </div>
                    </label>
                  ))}
                </div>
                {editingId && (
                  <p className='text-xs text-gray-400 mt-1'>
                    Changing lists affects only future job runs; in-progress contacts on the current job are unaffected.
                  </p>
                )}
              </div>
              <label className='flex items-center gap-3 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={form.agent_priority_enabled}
                  onChange={(e) => set('agent_priority_enabled', e.target.checked)}
                  className='w-4 h-4 text-indigo-600 rounded'
                />
                <div>
                  <div className='text-sm font-medium text-gray-900'>Enable Agent Priority</div>
                  <div className='text-xs text-gray-400'>Route contacts to their assigned agent</div>
                </div>
              </label>
              <div className='flex gap-3 pt-2'>
                <Button variant='secondary' className='flex-1' icon={<ArrowLeft className='w-4 h-4' />} onClick={() => setStep(1)}>Back</Button>
                <Button className='flex-1' disabled={!editingId && !form.contact_list_ids.length} onClick={() => setStep(3)}>Next</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className={`grid gap-3 ${form.schedule_type === 'infinite' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <Input label='Start Date' type='date' value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                {form.schedule_type !== 'infinite' && (
                  <Input label='End Date' type='date' value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
                )}
              </div>
              <Select
                label='Schedule Template'
                value={form.schedule_template_id}
                onChange={(e) => set('schedule_template_id', e.target.value)}
                options={[
                  { value: '', label: '— None —' },
                  ...(templates?.data || []).map((t: any) => ({
                    value: t.id,
                    label: `${t.name}${t.timezone ? ` (${t.timezone})` : ''}`,
                  })),
                ]}
              />
              <Select
                label='Holiday Calendar'
                value={form.holiday_calendar_id}
                onChange={(e) => set('holiday_calendar_id', e.target.value)}
                options={[
                  { value: '', label: '— None —' },
                  ...(calendars?.data || []).map((c: any) => ({
                    value: c.id,
                    label: c.country_code ? `${c.name} (${c.country_code})` : c.name,
                  })),
                ]}
              />
              <div className='flex gap-3 pt-2'>
                <Button variant='secondary' className='flex-1' icon={<ArrowLeft className='w-4 h-4' />} onClick={() => setStep(2)}>Back</Button>
                <Button className='flex-1' onClick={() => setStep(4)}>Next</Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>DNC Groups</label>
                <div className='border border-gray-200 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1 bg-white'>
                  {(dncGroups?.data || []).length === 0 ? (
                    <p className='text-xs text-gray-400 px-1 py-1'>No DNC groups yet.</p>
                  ) : (
                    (dncGroups?.data || []).map((g: any) => {
                      const checked = form.dnc_group_ids.includes(g.id);
                      return (
                        <label key={g.id} className='flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5'>
                          <input
                            type='checkbox'
                            checked={checked}
                            onChange={(e) =>
                              set('dnc_group_ids', e.target.checked
                                ? [...form.dnc_group_ids, g.id]
                                : form.dnc_group_ids.filter((id) => id !== g.id))
                            }
                            className='rounded border-gray-300'
                          />
                          <span className='truncate'>{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className='text-xs text-gray-400 mt-1'>
                  {form.dnc_group_ids.length
                    ? `${form.dnc_group_ids.length} selected`
                    : 'None selected — campaign will not suppress any numbers.'}
                </p>
              </div>
              <div className='flex gap-3 pt-2'>
                <Button variant='secondary' className='flex-1' icon={<ArrowLeft className='w-4 h-4' />} onClick={() => setStep(3)}>Back</Button>
                <Button className='flex-1' onClick={() => setStep(5)}>Next</Button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>Disposition Group</label>
                <div className='border border-gray-200 rounded-lg max-h-64 overflow-y-auto p-2 space-y-1 bg-white'>
                  {(dispositionGroups?.data || []).length === 0 ? (
                    <p className='text-xs text-gray-400 px-1 py-1'>
                      No disposition groups yet. Create one in the Dispositions page.
                    </p>
                  ) : (
                    <>
                      <label className='flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5'>
                        <input
                          type='radio'
                          name='disposition_group'
                          checked={!form.disposition_group_id}
                          onChange={() => set('disposition_group_id', '')}
                          className='border-gray-300'
                        />
                        <span className='text-gray-500 italic'>— None (system codes only) —</span>
                      </label>
                      {(dispositionGroups?.data || []).map((g: any) => {
                        const checked = form.disposition_group_id === g.id;
                        return (
                          <label key={g.id} className='flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5'>
                            <input
                              type='radio'
                              name='disposition_group'
                              checked={checked}
                              onChange={() => set('disposition_group_id', g.id)}
                              className='border-gray-300'
                            />
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-2'>
                                <span className='truncate font-medium text-gray-900'>{g.name}</span>
                               {/*  {g.custom_code_count != null && (
                                  <span className='text-xs text-indigo-600'>
                                    {g.custom_code_count} custom
                                  </span>
                                )} */}
                              </div>
                              {g.description && (
                                <div className='text-xs text-gray-500 truncate'>{g.description}</div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
                <p className='text-xs text-gray-400 mt-1'>
                  {form.disposition_group_id
                    ? 'Agents will see the system dispositions plus this group\u2019s custom codes.'
                    : 'Agents will see only the org-wide system dispositions.'}
                </p>
              </div>
              <div className='flex gap-3 pt-2'>
                <Button variant='secondary' className='flex-1' icon={<ArrowLeft className='w-4 h-4' />} onClick={() => setStep(4)}>Back</Button>
                <Button
                  className='flex-1'
                  loading={editingId ? editMut.isPending : createMut.isPending}
                  disabled={!form.name || !form.contact_list_ids.length}
                  onClick={() => editingId ? editMut.mutate() : createMut.mutate()}
                >
                  {editingId ? 'Save Changes' : 'Create Campaign'}
                </Button>
              </div>
              {(editingId ? editMut.isError : createMut.isError) && (
                <p className='text-xs text-red-500'>
                  {((editingId ? editMut.error : createMut.error) as any)?.response?.data?.error || 'Save failed'}
                </p>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <Modal title='Delete campaign?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            This will permanently delete{' '}
            <span className='font-medium text-gray-900'>{deleteTarget?.name}</span>{' '}
            and all of its job history. This action cannot be undone.
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
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}