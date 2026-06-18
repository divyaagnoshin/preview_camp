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
  PagedTable,
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

  const colorMap: Record<string, { active: string; dot: string }> = {
    indigo: { active: 'text-indigo-700', dot: '#6366F1' },
    amber: { active: 'text-amber-700', dot: '#D97706' },
    green: { active: 'text-green-700', dot: '#10B981' },
    red: { active: 'text-red-700', dot: '#EF4444' },
  };
  const cm = colorMap[color];

  return (
    <div ref={ref} className='relative'>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? cm.active : 'text-[#6A3A1A]'}`}
        style={isActive
          ? { background: 'linear-gradient(135deg, #FFF4EE, #FFE6D2)', border: '2px solid #FFB87A', boxShadow: '0 2px 8px rgba(244,82,30,0.15)' }
          : { background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)', border: '2px solid #FFD0B0', boxShadow: '0 1px 4px rgba(244,82,30,0.06)' }
        }
      >
        <Filter className='w-3.5 h-3.5' style={{ color: isActive ? cm.dot : '#C09070' }} />
        <span>{isActive ? selected?.label : label}</span>
        {isActive ? (
          <span onClick={(e) => { e.stopPropagation(); onChange(''); }} className='ml-0.5 hover:opacity-70'>
            <X className='w-3 h-3' />
          </span>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: '#C09070' }} />
        )}
      </button>

      {open && (
        <div className='absolute top-full left-0 mt-1.5 w-52 rounded-2xl z-20 overflow-hidden'
          style={{ background: 'white', border: '1.5px solid #FFD0B0', boxShadow: '0 8px 32px rgba(244,82,30,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className='p-1.5 max-h-72 overflow-y-auto'>
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className='w-full text-left px-3 py-2 text-sm text-[#9A6A50] hover:bg-[#FFF4EE] rounded-xl transition'
            >
              All {label.toLowerCase()}s
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className='w-full text-left px-3 py-2 text-sm rounded-xl transition flex items-center justify-between'
                style={value === opt.value
                  ? { background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', color: '#F4521E', fontWeight: 600 }
                  : { color: '#1A0F00' }
                }
                onMouseEnter={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = '#FFF8F4'; }}
                onMouseLeave={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                <span className='truncate'>{opt.label}</span>
                {value === opt.value && (
                  <span className='w-1.5 h-1.5 rounded-full shrink-0 ml-2' style={{ background: '#F4521E' }} />
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
    <span className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold'
      style={{ background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', border: '1.5px solid #FFB87A', color: '#E8470A' }}>
      {label}
      <button onClick={onRemove} className='hover:opacity-70 transition'>
        <X className='w-3 h-3' />
      </button>
    </span>
  );
}

// ─── Searchable dropdown component ───────────────────────────────────────────
function SearchableDropdown({
  label,
  placeholder = 'Search…',
  options,
  value,
  onChange,
  noneLabel = '— None —',
}: {
  label: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [{ value: '', label: noneLabel }, ...options];
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options, noneLabel]);

  const selected = options.find((o) => o.value === value);
  const display = open ? query : (selected?.label ?? '');

  return (
    <div ref={ref} className='relative'>
      <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>{label}</label>
      <div className='relative'>
        <input
          type='text'
          value={display}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selected ? selected.label : placeholder}
          className='w-full border-2 border-[#FFD0B0] rounded-xl pl-3 pr-8 py-2.5 text-sm text-[#1A0F00] bg-white focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all placeholder:text-[#B89070]'
        />
        <ChevronDown className='w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none' style={{ color: '#C09070' }} />
      </div>

      {open && (
        <div className='absolute z-30 mt-1.5 w-full rounded-2xl overflow-hidden'
          style={{ background: 'white', border: '1.5px solid #FFD0B0', boxShadow: '0 8px 32px rgba(244,82,30,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className='max-h-52 overflow-y-auto p-1.5'>
            {filtered.length === 0 ? (
              <p className='px-3 py-2 text-xs text-[#9A6A50]'>No results found</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type='button'
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className='w-full text-left px-3 py-2 text-sm rounded-xl transition flex items-center justify-between'
                  style={value === opt.value
                    ? { background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', color: '#F4521E', fontWeight: 600 }
                    : opt.value === ''
                      ? { color: '#9A6A50' }
                      : { color: '#1A0F00' }
                  }
                  onMouseEnter={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = '#FFF8F4'; }}
                  onMouseLeave={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <span className='truncate'>{opt.label}</span>
                  {value === opt.value && opt.value !== '' && (
                    <span className='w-1.5 h-1.5 rounded-full flex-shrink-0 ml-2' style={{ background: '#F4521E' }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Searchable multi-select ──────────────────────────────────────────────────
function SearchableMultiSelect({
  label,
  placeholder = 'Search…',
  items,
  selectedIds,
  onChange,
  renderItem,
  emptyText = 'No items found.',
  selectedCountLabel = (n: number) => `${n} selected`,
}: {
  label: string;
  placeholder?: string;
  items: { id: string; label: string; sub?: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  renderItem?: (item: { id: string; label: string; sub?: string }) => React.ReactNode;
  emptyText?: string;
  selectedCountLabel?: (n: number) => string;
}) {
  const [query, setQuery] = useState('');

  const filtered = items.filter((it) =>
    it.label.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));
  };

  const selectedItems = items.filter((it) => selectedIds.includes(it.id));

  return (
    <div>
      <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>{label}</label>
      <div className='relative mb-1.5'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none' style={{ color: '#F4521E' }} />
        <input
          type='text'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className='w-full pl-9 pr-8 py-2.5 text-sm border-2 border-[#FFD0B0] rounded-xl bg-white text-[#1A0F00] focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all placeholder:text-[#B89070]'
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className='absolute right-2.5 top-1/2 -translate-y-1/2 transition'
            style={{ color: '#C09070' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F4521E'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#C09070'; }}
          >
            <X className='w-3.5 h-3.5' />
          </button>
        )}
      </div>
      <div className='border-2 border-[#FFD0B0] rounded-xl divide-y divide-[#FFF0E8] max-h-44 overflow-y-auto bg-white'>
        {items.length === 0 ? (
          <p className='text-xs text-[#9A6A50] p-3'>{emptyText}</p>
        ) : filtered.length === 0 ? (
          <p className='text-xs text-[#9A6A50] p-3'>No results for "{query}"</p>
        ) : (
          filtered.map((it) => (
            <label
              key={it.id}
              className='flex items-center gap-3 px-3 py-2.5 cursor-pointer transition'
              style={selectedIds.includes(it.id)
                ? { background: 'linear-gradient(135deg, #FFF4EE, #FFE6D2)' }
                : {}}
              onMouseEnter={e => { if (!selectedIds.includes(it.id)) (e.currentTarget as HTMLElement).style.background = '#FFFAF7'; }}
              onMouseLeave={e => { if (!selectedIds.includes(it.id)) (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              <input
                type='checkbox'
                checked={selectedIds.includes(it.id)}
                onChange={(e) => toggle(it.id, e.target.checked)}
                className='w-4 h-4 rounded flex-shrink-0'
                style={{ accentColor: '#F4521E' }}
              />
              {renderItem ? renderItem(it) : (
                <div className='min-w-0'>
                  <div className='text-sm font-medium text-[#1A0F00] truncate'>{it.label}</div>
                  {it.sub && <div className='text-xs text-[#7A5C44]'>{it.sub}</div>}
                </div>
              )}
            </label>
          ))
        )}
      </div>
      {selectedItems.length > 0 ? (
        <div className='mt-2 space-y-1.5'>
          <p className='text-xs font-medium' style={{ color: '#F4521E' }}>{selectedCountLabel(selectedItems.length)}</p>
          <div className='flex flex-wrap gap-1.5'>
            {selectedItems.map((it) => (
              <span
                key={it.id}
                className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium'
                style={{ background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', border: '1.5px solid #FFB87A', color: '#E8470A' }}
              >
                {it.label}
                <button onClick={() => toggle(it.id, false)} className='hover:opacity-70 transition ml-0.5'>
                  <X className='w-3 h-3' />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className='text-xs text-[#9A6A50] mt-1.5'>None selected</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMaxAttempts, setFilterMaxAttempts] = useState('');
  const [filterAgentPriority, setFilterAgentPriority] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [errors, setErrors] = useState({
    start_date: '',
    end_date: '',
  });
  const [form, setForm] = useState({
    name: '',
    schedule_type: 'finite',
    max_attempts: '5',
    wrapup_time_sec: '90',
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
    setSearch(''); setFilterStatus(''); setFilterType('');
    setFilterMaxAttempts(''); setFilterAgentPriority('');
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
        schedule_type: form.schedule_type,
        max_attempts: form.schedule_type === 'infinite' ? null : parseInt(form.max_attempts),
        wrapup_time_sec: parseInt(form.wrapup_time_sec),
        auto_dial_delay_sec: parseInt(form.auto_dial_delay_sec),
        caller_id: form.caller_id || null,
        agent_priority_enabled: form.agent_priority_enabled,
        schedule_template_id: form.schedule_template_id || null,
        holiday_calendar_id: form.holiday_calendar_id || null,
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
      schedule_template_id: '', holiday_calendar_id: '',
      dnc_group_ids: [], disposition_group_id: '',
    });

  const closeCreate = () => { setShowCreate(false); setEditingId(null); setStep(1); setViewOnly(false); resetForm(); };

  const openEdit = (r: any, readOnly = false) => {
    setEditingId(r.id);
    setViewOnly(readOnly);
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

  const maxAttemptsValid =
    form.schedule_type === 'infinite' ||
    (/^\d+$/.test(form.max_attempts) &&
      parseInt(form.max_attempts) >= 1 &&
      parseInt(form.max_attempts) <= 20);

  const step1Disabled =
    !form.name ||
    !maxAttemptsValid ||
    (form.schedule_type !== 'infinite' && form.max_attempts === '');

  const validateDates = () => {
    const newErrors = {
      start_date: '',
      end_date: '',
    };

    if (!form.start_date) {
      newErrors.start_date = 'Start Date is required';
    }

    if (form.schedule_type !== 'infinite') {
      if (!form.end_date) {
        newErrors.end_date = 'End Date is required';
      } else if (
        form.start_date &&
        new Date(form.end_date) < new Date(form.start_date)
      ) {
        newErrors.end_date = 'End Date cannot be before Start Date';
      }
    }

    setErrors(newErrors);

    return !newErrors.start_date && !newErrors.end_date;
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>

      {/* ── Page header ── */}
      <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
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

      {/* ── Search + Filters ── */}
      <div className='space-y-3'>
        <div className='filter-bar'>
          <div className='relative flex-1 min-w-[200px] max-w-sm'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none' style={{ color: '#F4521E' }} />
            <input
              type='text'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search campaigns…'
              className='w-full pl-9 pr-9 py-2.5 text-sm rounded-xl transition placeholder:text-[#C09070]'
              style={{ border: '2px solid #FFD0B0', background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)', color: '#1A0F00' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className='absolute right-3 top-1/2 -translate-y-1/2 transition' style={{ color: '#C09070' }}>
                <X className='w-3.5 h-3.5' />
              </button>
            )}
          </div>
          <div className='flex items-center gap-2 flex-wrap'>
            <FilterDropdown label='Status' value={filterStatus} onChange={setFilterStatus} color='green'
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
            <FilterDropdown label='Type' value={filterType} onChange={setFilterType} color='indigo'
              options={[
                { value: 'finite', label: 'Finite' },
                { value: 'infinite', label: 'Infinite' },
              ]}
            />
            <FilterDropdown label='Agent Priority' value={filterAgentPriority} onChange={setFilterAgentPriority} color='indigo'
              options={[
                { value: 'yes', label: 'Enabled' },
                { value: 'no', label: 'Disabled' },
              ]}
            />
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className='flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-200'
                style={{ color: '#7A5C44', border: '1.5px solid #FFD0B0', background: 'white' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = '#EF4444';
                  (e.currentTarget as HTMLElement).style.background = '#FEF2F2';
                  (e.currentTarget as HTMLElement).style.borderColor = '#FECACA';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = '#7A5C44';
                  (e.currentTarget as HTMLElement).style.background = 'white';
                  (e.currentTarget as HTMLElement).style.borderColor = '#FFD0B0';
                }}
              >
                <X className='w-3.5 h-3.5' /> Clear all
              </button>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-xs text-[#7A5C44] font-medium'>Active filters:</span>
            {search && <FilterPill label={`Name: "${search}"`} onRemove={() => setSearch('')} />}
            {filterStatus && <FilterPill label={`Status: ${filterStatus}`} onRemove={() => setFilterStatus('')} />}
            {filterType && <FilterPill label={`Type: ${filterType}`} onRemove={() => setFilterType('')} />}
            {filterMaxAttempts && <FilterPill label={`Max attempts: ${filterMaxAttempts === 'infinite' ? '∞' : filterMaxAttempts}`} onRemove={() => setFilterMaxAttempts('')} />}
            {filterAgentPriority && <FilterPill label={`Agent priority: ${filterAgentPriority === 'yes' ? 'Enabled' : 'Disabled'}`} onRemove={() => setFilterAgentPriority('')} />}
          </div>
        )}
      </div>

      {/* ── PagedTable ── */}
      <Card>
        {allCampaigns.length === 0 ? (
          <EmptyState
            title='No campaigns yet'
            description='Create your first campaign to start outbound calling.'
            action={<Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>Create Campaign</Button>}
          />
        ) : filtered.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-14 gap-3'>
            <div className='w-12 h-12 rounded-full flex items-center justify-center' style={{ background: 'linear-gradient(135deg, #FFF4EE, #FFE0C8)' }}>
              <Search className='w-5 h-5' style={{ color: '#F4521E' }} />
            </div>
            <div className='text-center'>
              <p className='text-sm font-medium text-[#1A0F00]'>No campaigns match your filters</p>
              <p className='text-xs text-[#7A5C44] mt-0.5'>Try adjusting or clearing the filters above</p>
            </div>
            <button onClick={clearAllFilters} className='text-xs font-medium underline underline-offset-2 transition' style={{ color: '#F4521E' }}>
              Clear all filters
            </button>
          </div>
        ) : (
          <PagedTable
            cols={[
              {
                header: 'Name',
                render: (r: any, idx?: number) => {
                  const colors = [
                    { bg: 'linear-gradient(135deg,#FFF4EE,#FFE6D2)', dot: '#E8470A', border: '#FFD3B5' },
                    { bg: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', dot: '#3B82F6', border: '#BFDBFE' },
                    { bg: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', dot: '#8B5CF6', border: '#DDD6FE' },
                    { bg: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)', dot: '#10B981', border: '#A7F3D0' },
                  ];
                  const c = colors[(idx || 0) % colors.length];
                  return (
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs'
                        style={{ background: c.bg, color: c.dot, border: `1px solid ${c.border}` }}>
                        {r.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className='font-semibold text-[#0F1117]'>{r.name}</div>
                        {r.agent_priority_enabled && (
                          <span className='text-[10px] font-bold text-[#E8470A] bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-100'>⚡ Agent priority</span>
                        )}
                      </div>
                    </div>
                  );
                },
              },
              { header: 'Type', render: (r: any) => <StatusBadge status={r.schedule_type} /> },
              { header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Max Attempts', render: (r: any) => r.max_attempts || '∞' },
              {
                header: 'Actions',
                width: '220px',
                render: (r: any) => (
                  <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
                    {r.status === 'active' ? (
                      <button onClick={() => stopMut.mutate(r.id)} disabled={stopMut.isPending} title='Pause campaign'
                        className='p-1.5 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50'>
                        <Pause className='w-4 h-4' />
                      </button>
                    ) : (
                      <button onClick={() => runMut.mutate(r.id)} disabled={runMut.isPending} title='Run campaign'
                        className='p-1.5 rounded-md text-green-600 hover:text-green-700 hover:bg-green-50 transition disabled:opacity-50'>
                        <Play className='w-4 h-4' />
                      </button>
                    )}
                    <div className="w-[32px] flex justify-center">
                      {/* infinite: editable when not active/completed */}
                      {r.schedule_type !== 'finite' && r.status !== 'active' && r.status !== 'completed' ? (
                        <button
                          onClick={() => openEdit(r)}
                          title="Edit campaign"
                          className="inline-flex items-center justify-center p-1.5 rounded-md text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      ) : r.schedule_type === 'finite' ? (
                        /* finite: draft → editable; others → view-only */
                        <button
                          onClick={() => openEdit(r, r.status !== 'draft')}
                          title={r.status === 'draft' ? 'Edit campaign' : 'View campaign details'}
                          className={`inline-flex items-center justify-center p-1.5 rounded-md ${
                            r.status === 'draft'
                              ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                              : 'text-gray-400 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      ) : (
                        <div className="w-[24px] h-[24px]" />
                      )}
                    </div>
                    {r.status !== 'active' ? (
                      <button onClick={() => setDeleteTarget(r)} title='Delete campaign'
                        className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'>
                        <Trash2 className='w-3 h-3' />
                      </button>
                    ) : <span className='inline-block w-[70px] h-[26px]' />}
                    <button onClick={() => navigate(`/campaigns/${r.id}`)} title='View details'
                      className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition'
                      style={{ background: 'linear-gradient(135deg, #FFF4EE, #FFE6D2)', color: '#E8470A', border: '1px solid #FFD3B5' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #FFE6D2, #FFD3B5)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #FFF4EE, #FFE6D2)'; }}
                    >
                      View <ChevronRight className='w-3.5 h-3.5' />
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

      {/* ── Create / Edit Modal ── */}
      <Modal
        title={editingId ? (viewOnly ? 'Campaign Details (Read-only)' : 'Edit Campaign') : 'Create Campaign'}
        open={showCreate}
        onClose={closeCreate}
        size='lg'
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '450px' }}>

          {/* ── Step indicator ── */}
          <div className='flex items-center gap-2 text-xs flex-wrap pb-4 flex-shrink-0'>
            {[
              { n: 1, label: '1. Details' },
              { n: 2, label: '2. Contacts' },
              { n: 3, label: '3. Schedule' },
              { n: 4, label: '4. DNC' },
              { n: 5, label: '5. Dispositions' },
            ].map((s, i) => (
              <React.Fragment key={s.n}>
                {i > 0 && <span className='text-[#FFD0B0]'>—</span>}
                <span style={step === s.n
                  ? { background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', color: '#E8470A', border: '1.5px solid #FFB87A', padding: '2px 10px', borderRadius: '999px', fontWeight: 600 }
                  : { background: '#FFF4EE', color: '#9A6A50', border: '1.5px solid #FFE0C8', padding: '2px 10px', borderRadius: '999px' }
                }>
                  {s.label}
                </span>
              </React.Fragment>
            ))}
          </div>

          {/* ── Scrollable step content ── */}
          <div className='flex-1 overflow-y-auto space-y-4 pr-2' style={{ minHeight: 0, overflowX: 'visible' }}>

            {/* Step 1: Details */}
            {step === 1 && (
              <>
                {viewOnly && (
                  <div className='flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium'
                    style={{ background: 'linear-gradient(135deg,#F8FAFF,#EEF2FF)', border: '1.5px solid #C7D2FE', color: '#4338CA' }}>
                    <span>🔒</span>
                    <span>This campaign has already started. Details are read-only.</span>
                  </div>
                )}
                <Input
                  label='Campaign Name *'
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder='e.g. Q2 Loan Outreach'
                  disabled={viewOnly}
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
                    disabled={viewOnly}
                  />
                  <div>
                    <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>Max Attempts</label>
                    {form.schedule_type === 'infinite' ? (
                      <div className='w-full px-3.5 py-2.5 text-sm border-2 border-[#FFD0B0] rounded-xl bg-[#FFF4EE] text-[#7A5C44] select-none flex items-center' style={{ minHeight: '42px' }}>
                        ∞ Unlimited
                      </div>
                    ) : (
                      <>
                        <input
                          type='number'
                          min={1}
                          max={20}
                          value={form.max_attempts}
                          onChange={(e) => set('max_attempts', e.target.value)}
                          placeholder='1 – 20'
                          disabled={viewOnly}
                          className={`w-full px-3.5 py-2.5 text-sm border-2 rounded-xl text-[#1A0F00] focus:outline-none focus:ring-4 transition-all ${
                            viewOnly
                              ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-70'
                              : !maxAttemptsValid
                                ? 'bg-white border-red-300 focus:ring-red-200 focus:border-red-400'
                                : 'bg-white border-[#FFD0B0] focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890]'
                          }`}
                        />
                        {!viewOnly && (!maxAttemptsValid ? (
                          <p className='text-xs text-red-500 mt-1'>Enter a number between 1 and 20</p>
                        ) : (
                          <p className='text-xs text-[#9A6A50] mt-1'>Enter a value between 1 and 20</p>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <Input label='Wrap-up Time (seconds)' type='number' value={form.wrapup_time_sec} onChange={(e) => set('wrapup_time_sec', e.target.value)} disabled={viewOnly} />
                  <Input label='Auto-dial Delay (seconds)' type='number' value={form.auto_dial_delay_sec} onChange={(e) => set('auto_dial_delay_sec', e.target.value)} disabled={viewOnly} />
                </div>
                <Input
                  label='Caller ID (E.164 format)'
                  value={form.caller_id}
                  onChange={(e) => set('caller_id', e.target.value)}
                  placeholder='+18005550100'
                  disabled={viewOnly}
                />
                {!viewOnly && editMut.isError && editingId && (
                  <p className='text-xs text-red-500'>{(editMut.error as any)?.response?.data?.error || 'Save failed'}</p>
                )}
              </>
            )}

            {/* Step 2: Contacts */}
            {step === 2 && (
              <>
                <div style={viewOnly ? { pointerEvents: 'none', opacity: 0.65 } : {}}>
                  <SearchableMultiSelect
                    label='Contact Lists *'
                    placeholder='Search contact lists…'
                    emptyText='No contact lists. Create one first.'
                    selectedCountLabel={(n) => `${n} list${n !== 1 ? 's' : ''} selected`}
                    items={(lists?.data || []).map((l: any) => ({ id: l.id, label: l.name, sub: `${l.contact_count ?? 0} contacts` }))}
                    selectedIds={form.contact_list_ids}
                    onChange={(ids) => { if (!viewOnly) set('contact_list_ids', ids); }}
                  />
                </div>
                {editingId && !viewOnly && (
                  <p className='text-xs text-[#9A6A50]'>
                    Changing lists affects only future job runs; in-progress contacts on the current job are unaffected.
                  </p>
                )}
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  viewOnly
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-65'
                    : 'cursor-pointer border-[#FFE0C8] hover:border-[#FFB890] hover:bg-[#FFFAF7]'
                }`}>
                  <input
                    type='checkbox'
                    checked={form.agent_priority_enabled}
                    onChange={(e) => { if (!viewOnly) set('agent_priority_enabled', e.target.checked); }}
                    disabled={viewOnly}
                    className='w-4 h-4 rounded flex-shrink-0'
                    style={{ accentColor: '#F4521E' }}
                  />
                  <div>
                    <div className='text-sm font-medium text-[#1A0F00]'>Enable Agent Priority</div>
                    <div className='text-xs text-[#7A5C44]'>Route contacts to their assigned agent</div>
                  </div>
                </label>
                {!viewOnly && editMut.isError && editingId && (
                  <p className='text-xs text-red-500'>{(editMut.error as any)?.response?.data?.error || 'Save failed'}</p>
                )}
              </>
            )}

            {/* Step 3: Schedule */}
            {step === 3 && (
              <>
                <div className={`grid gap-3 ${form.schedule_type === 'infinite' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <Input
                      label='Start Date'
                      type='date'
                      value={form.start_date}
                      onChange={(e) => set('start_date', e.target.value)}
                      disabled={viewOnly}
                    />
                    {!viewOnly && errors.start_date && (
                      <p className='text-xs text-red-500 mt-1'>{errors.start_date}</p>
                    )}
                  </div>
                  {form.schedule_type !== 'infinite' && (
                    <div>
                      <Input
                        label='End Date'
                        type='date'
                        min={form.start_date}
                        value={form.end_date}
                        onChange={(e) => set('end_date', e.target.value)}
                        disabled={viewOnly}
                      />
                      {!viewOnly && errors.end_date && (
                        <p className='text-xs text-red-500 mt-1'>{errors.end_date}</p>
                      )}
                    </div>
                  )}
                </div>
                <div style={viewOnly ? { pointerEvents: 'none', opacity: 0.65 } : {}}>
                  <SearchableDropdown
                    label='Schedule Template'
                    placeholder='Search templates…'
                    value={form.schedule_template_id}
                    onChange={(v) => { if (!viewOnly) set('schedule_template_id', v); }}
                    noneLabel='— None —'
                    options={(templates?.data || []).map((t: any) => ({
                      value: t.id,
                      label: `${t.name}${t.timezone ? ` (${t.timezone})` : ''}`,
                    }))}
                  />
                </div>
                <div style={viewOnly ? { pointerEvents: 'none', opacity: 0.65 } : {}}>
                  <SearchableDropdown
                    label='Holiday Calendar'
                    placeholder='Search calendars…'
                    value={form.holiday_calendar_id}
                    onChange={(v) => { if (!viewOnly) set('holiday_calendar_id', v); }}
                    noneLabel='— None —'
                    options={(calendars?.data || []).map((c: any) => ({
                      value: c.id,
                      label: c.country_code ? `${c.name} (${c.country_code})` : c.name,
                    }))}
                  />
                </div>
                {!viewOnly && editMut.isError && editingId && (
                  <p className='text-xs text-red-500'>{(editMut.error as any)?.response?.data?.error || 'Save failed'}</p>
                )}
              </>
            )}

            {/* Step 4: DNC */}
            {step === 4 && (
              <>
                <div style={viewOnly ? { pointerEvents: 'none', opacity: 0.65 } : {}}>
                  <SearchableMultiSelect
                    label='DNC Groups'
                    placeholder='Search DNC groups…'
                    emptyText='No DNC groups yet.'
                    selectedCountLabel={(n) => `${n} group${n !== 1 ? 's' : ''} selected — numbers in these lists will be suppressed`}
                    items={(dncGroups?.data || []).map((g: any) => ({ id: g.id, label: g.name }))}
                    selectedIds={form.dnc_group_ids}
                    onChange={(ids) => { if (!viewOnly) set('dnc_group_ids', ids); }}
                  />
                </div>
                {!viewOnly && editMut.isError && editingId && (
                  <p className='text-xs text-red-500'>{(editMut.error as any)?.response?.data?.error || 'Save failed'}</p>
                )}
              </>
            )}

            {/* Step 5: Dispositions */}
            {step === 5 && (
              <>
                <div style={viewOnly ? { pointerEvents: 'none', opacity: 0.65 } : {}}>
                  <SearchableDropdown
                    label='Disposition Group'
                    placeholder='Search disposition groups…'
                    value={form.disposition_group_id}
                    onChange={(v) => { if (!viewOnly) set('disposition_group_id', v); }}
                    noneLabel='— None (system codes only) —'
                    options={(dispositionGroups?.data || []).map((g: any) => ({
                      value: g.id,
                      label: g.name + (g.description ? ` — ${g.description}` : ''),
                    }))}
                  />
                </div>
                {(dispositionGroups?.data || []).length === 0 && (
                  <p className='text-xs text-[#9A6A50]'>No disposition groups yet. Create one in the Dispositions page.</p>
                )}
                <p className='text-xs text-[#9A6A50]'>
                  {form.disposition_group_id
                    ? 'Agents will see the system dispositions plus this group\u2019s custom codes.'
                    : 'Agents will see only the org-wide system dispositions.'}
                </p>
                {!viewOnly && (editingId ? editMut.isError : createMut.isError) && (
                  <p className='text-xs text-red-500'>
                    {((editingId ? editMut.error : createMut.error) as any)?.response?.data?.error || 'Save failed'}
                  </p>
                )}
              </>
            )}

          </div>

          {/* ── Fixed footer ── */}
          <div className='flex-shrink-0 pt-4 mt-2 border-t border-[#FFE8D6]'>
            {viewOnly ? (
              /* View-only footer: navigation + Close only, no save actions */
              <div className='flex gap-3'>
                {step === 1 ? (
                  <Button variant='secondary' className='flex-1' onClick={closeCreate}>
                    Close
                  </Button>
                ) : (
                  <Button variant='secondary' className='flex-1' icon={<ArrowLeft className='w-4 h-4' />} onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                {step < 5 ? (
                  <Button className='flex-1' onClick={() => setStep(step + 1)}>
                    Next
                  </Button>
                ) : (
                  <Button className='flex-1' onClick={closeCreate}>
                    Close
                  </Button>
                )}
              </div>
            ) : (
              <div className='flex gap-3'>
                {step === 1 ? (
                  <Button variant='secondary' className='flex-1' onClick={closeCreate}>
                    Cancel
                  </Button>
                ) : (
                  <Button variant='secondary' className='flex-1' icon={<ArrowLeft className='w-4 h-4' />} onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}

                {editingId && step < 5 && (
                  <Button
                    variant='secondary'
                    className='flex-1'
                    loading={editMut.isPending}
                    disabled={step === 1 ? step1Disabled : (step === 2 ? !form.contact_list_ids.length : false)}
                    onClick={() => editMut.mutate()}
                  >
                    Save
                  </Button>
                )}

                {step < 5 ? (
                  <Button
                    className='flex-1'
                    disabled={
                      step === 1 ? step1Disabled :
                        step === 2 ? (!editingId && !form.contact_list_ids.length) :
                          false
                    }
                    onClick={() => setStep(step + 1)}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    className='flex-1'
                    loading={editingId ? editMut.isPending : createMut.isPending}
                    disabled={!form.name || !form.contact_list_ids.length}
                    onClick={() => editingId ? editMut.mutate() : createMut.mutate()}
                  >
                    {editingId ? 'Save Changes' : 'Create Campaign'}
                  </Button>
                )}
              </div>
            )}
          </div>

        </div>
      </Modal>

      {/* ── Delete confirmation ── */}
      <Modal title='Delete campaign?' open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size='sm'>
        <div className='space-y-4'>
          <p className='text-sm text-[#5C4030]'>
            This will permanently delete{' '}
            <span className='font-medium text-[#1A0F00]'>{deleteTarget?.name}</span>{' '}
            and all of its job history. This action cannot be undone.
          </p>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error || 'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant='danger' className='flex-1' loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}