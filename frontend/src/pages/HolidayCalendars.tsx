import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listHolidayCalendars,
  createHolidayCalendar,
  updateHolidayCalendar,
  deleteHolidayCalendar,
  getHolidayCalendar,
  listHolidayDates,
  createHolidayDate,
  updateHolidayDate,
  deleteHolidayDate,
  type HolidayCalendar,
  type HolidayDate,
} from '../api/client';
import {
  Card,
  CardHeader,
  Table,
  Button,
  Modal,
  Input,
  Select,
  Badge,
  StatCard,
  PageLoader,
  EmptyState,
  SearchInput,
  FilterDropdown,
  FilterPill,
  ClearFiltersButton,
} from '../components/ui';
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  AlertTriangle,
  CalendarX,
  CalendarDays,
  Check,
  ChevronDown,
} from 'lucide-react';

// ── Country options ──────────────────────────────────────────
const COUNTRY_OPTIONS = [
  { value: '', label: '— None —' },
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'IN', label: '🇮🇳 India' },
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'AU', label: '🇦🇺 Australia' },
  { value: 'DE', label: '🇩🇪 Germany' },
  { value: 'FR', label: '🇫🇷 France' },
  { value: 'SG', label: '🇸🇬 Singapore' },
  { value: 'AE', label: '🇦🇪 UAE' },
];
const flagFor = (code: string | null) =>
  COUNTRY_OPTIONS.find((c) => c.value === code)?.label ?? code ?? ' ';

// ── Amber CalendarX icon — no background, icon only ──
function HolidayRowIcon() {
  return (
    <CalendarX className='w-4 h-4 flex-shrink-0' style={{ color: '#D97706' }} />
  );
}

// ── CountryPicker ────────────────────────────────────────────
function CountryPicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COUNTRY_OPTIONS.filter(
      (c) => !q || c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q),
    );
  }, [query]);

  const selected = COUNTRY_OPTIONS.find((c) => c.value === value);
  const display = open ? query : (selected?.label ?? '');

  return (
    <div ref={wrapRef} className='relative'>
      {label && (
        <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2'>
          {label}
        </label>
      )}
      <div className='relative'>
        <input
          value={display}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder='Search country…'
          className='w-full border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 bg-white transition-colors'
        />
        <ChevronDown className='w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none' />
      </div>
      {open && (
        <div className='absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg'>
          {filtered.length === 0 ? (
            <div className='px-3 py-3 text-xs text-gray-400 text-center'>No matches found</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.value}
                type='button'
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(c.value);
                  setOpen(false);
                  setQuery('');
                }}
                className='w-full text-left px-3 py-2 text-sm hover:bg-violet-50 flex items-center justify-between transition-colors'
              >
                <span className='text-gray-700'>{c.label}</span>
                {c.value === value && <Check className='w-3.5 h-3.5 text-violet-600' />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared ConfirmDeleteModal ────────────────────────────────
function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  loading,
  title,
  description,
  confirmLabel = 'Delete',
  errorMessage,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  errorMessage?: string;
}) {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title=''>
      <div className='space-y-5'>
        <div className='flex flex-col items-center text-center pt-2 pb-1'>
          <div className='w-14 h-14 rounded-2xl bg-red-50 border-2 border-red-100 flex items-center justify-center mb-4'>
            <Trash2 className='w-6 h-6 text-red-500' />
          </div>
          <h3 className='text-base font-bold text-gray-900'>{title}</h3>
          <p className='text-sm text-gray-500 mt-1.5 max-w-xs leading-relaxed'>{description}</p>
        </div>

        <div className='flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl'>
          <AlertTriangle className='w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5' />
          <p className='text-xs text-amber-700 leading-relaxed'>
            This action is <span className='font-semibold'>permanent</span> and cannot be undone.
          </p>
        </div>

        {errorMessage && (
          <div className='flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl'>
            <AlertTriangle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
            <p className='text-xs text-red-700 leading-relaxed'>{errorMessage}</p>
          </div>
        )}

        <div className='flex gap-3 pt-1'>
          <Button variant='secondary' onClick={onClose} className='flex-1'>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className='flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm'
          >
            {loading ? (
              <svg className='animate-spin w-4 h-4' viewBox='0 0 24 24' fill='none'>
                <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z' />
              </svg>
            ) : (
              <Trash2 className='w-4 h-4' />
            )}
            {loading ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Page 1: Calendars list ───────────────────────────────────
export function HolidayCalendarsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<HolidayCalendar | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HolidayCalendar | null>(null);
  const [search, setSearch] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['holiday-calendars'],
    queryFn: listHolidayCalendars,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteHolidayCalendar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holiday-calendars'] });
      setDeleteTarget(null);
    },
  });

  const rows = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      if (filterCountry && (r.country_code || '') !== filterCountry) return false;
      return true;
    });
  }, [rows, search, filterCountry]);

  if (isLoading) return <PageLoader />;

  const hasActiveFilters = !!(search || filterCountry);
  const clearAll = () => { setSearch(''); setFilterCountry(''); };
  const countryOpts = COUNTRY_OPTIONS.filter((c) => c.value).map((c) => ({ value: c.value, label: c.label }));

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading'>Holidays</h1>
          <p className='text-sm text-gray-500 mt-1'>
            {hasActiveFilters
              ? `${filtered.length} of ${rows.length} calendar(s)`
              : 'Calendars of dates and time-blocks that campaigns must skip.'}
          </p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New Calendar
        </Button>
      </div>

      {rows.length > 0 && (
        <div className='space-y-3'>
          <div className='filter-bar'>
            <SearchInput value={search} onChange={setSearch} placeholder='Search calendars…' />
            <div className='flex items-center gap-2 flex-wrap'>
              <FilterDropdown label='Country' value={filterCountry} onChange={setFilterCountry} color='indigo' options={countryOpts} />
              {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
            </div>
          </div>
          {hasActiveFilters && (
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
              {search && <FilterPill label={`Name: "${search}"`} onRemove={() => setSearch('')} />}
              {filterCountry && <FilterPill label={`Country: ${filterCountry}`} onRemove={() => setFilterCountry('')} />}
            </div>
          )}
        </div>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title='No holiday calendars yet'
            description='Create one to block dates from campaigns.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create Calendar
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState title='No matches' description='Try adjusting or clearing the filters above.' />
        ) : (
          <Table<HolidayCalendar>
            keyFn={(r) => r.id}
            rows={filtered}
            onRowClick={(r) => navigate(`/holiday-calendars/${r.id}`)}
            cols={[
              {
                header: 'Name',
                render: (r) => (
                  <div className='flex items-center gap-2.5'>
                    <HolidayRowIcon />
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  </div>
                ),
              },
              {
                header: 'Country',
                render: (r) => <span className='text-gray-600'>{flagFor(r.country_code)}</span>,
              },
              {
                header: 'Holidays',
                render: (r) => <span className='schedule-pill'>{r.holiday_count ?? 0}</span>,
              },
              {
                header: 'Used by',
                render: (r) =>
                  r.campaign_usage_count ? (
                    <Badge label={`${r.campaign_usage_count} campaign${r.campaign_usage_count > 1 ? 's' : ''}`} color='blue' />
                  ) : (
                    <span className='text-gray-400'>—</span>
                  ),
              },
              {
                header: 'Created',
                render: (r) => new Date(r.created_at).toLocaleDateString(),
              },
              {
                header: 'Actions',
                width: '160px',
                render: (r) => (
                  <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditTarget(r)}
                      title='Edit calendar'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      title='Delete calendar'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' /> Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {(showCreate || editTarget) && (
        <CalendarEditor
          target={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null); }}
          onCreated={(id) => navigate(`/holiday-calendars/${id}`)}
        />
      )}

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); delMut.reset(); }}
        onConfirm={() => deleteTarget && delMut.mutate(deleteTarget.id)}
        loading={delMut.isPending}
        title={`Delete "${deleteTarget?.name}"?`}
        description='All holiday dates associated with this calendar will be permanently removed.'
        confirmLabel='Delete Calendar'
        errorMessage={delMut.isError ? 'Could not delete this calendar. Please try again.' : undefined}
      />
    </div>
  );
}

// ── CalendarEditor ───────────────────────────────────────────
function CalendarEditor({
  target, onClose, onCreated,
}: {
  target: HolidayCalendar | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(target?.name ?? '');
  const [country, setCountry] = useState(target?.country_code ?? '');
  const isEdit = !!target;

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), country_code: country || null };
      return isEdit ? updateHolidayCalendar(target!.id, body) : createHolidayCalendar(body);
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['holiday-calendars'] });
      if (!isEdit && onCreated) onCreated(res.id);
      else onClose();
    },
  });

  return (
    <Modal open title={isEdit ? 'Edit Calendar' : 'New Holiday Calendar'} onClose={onClose}>
      <div className='space-y-4'>
        <Input label='Name' placeholder='e.g. US Federal 2026' value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <CountryPicker label='Country (optional)' value={country ?? ''} onChange={setCountry} />
        {mut.isError && (
          <div className='flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg'>
            <AlertTriangle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
            <p className='text-xs text-red-700 leading-relaxed'>
              Could not save this calendar. Please check your input and try again.
            </p>
          </div>
        )}
        <div className='flex justify-end gap-2 pt-2'>
          <Button variant='secondary' onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!name.trim()}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Page 2: Calendar detail ──────────────────────────────────
const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '');
const parseDateOnly = (value: string): Date => {
  const datePart = String(value).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const monthLabel = (iso: string) =>
  parseDateOnly(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function HolidayCalendarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<HolidayDate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HolidayDate | null>(null);
  const [search, setSearch] = useState('');

  const calQ = useQuery({
    queryKey: ['holiday-calendar', id],
    queryFn: () => getHolidayCalendar(id!),
    enabled: !!id,
  });
  const datesQ = useQuery({
    queryKey: ['holiday-dates', id, year],
    queryFn: () => listHolidayDates(id!, year),
    enabled: !!id,
  });

  const delMut = useMutation({
    mutationFn: (dateId: string) => deleteHolidayDate(id!, dateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holiday-dates', id, year] });
      setDeleteTarget(null);
    },
  });

  if (calQ.isLoading || datesQ.isLoading) return <PageLoader />;
  if (!calQ.data) return null;
  const cal = calQ.data;
  const rows = datesQ.data?.data || [];

  const fullDayCount = rows.filter((r) => r.is_full_day_block).length;
  const blockCount = rows.length - fullDayCount;
  const yearOptions = Array.from({ length: 7 }).map((_, i) => {
    const y = new Date().getFullYear() - 2 + i;
    return { value: String(y), label: String(y) };
  });

  const q = search.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter(
        (r) =>
          (r.holiday_name || '').toLowerCase().includes(q) ||
          String(r.holiday_date).toLowerCase().includes(q),
      )
    : rows;

  const grouped: Record<string, HolidayDate[]> = {};
  filteredRows.forEach((r) => {
    const key = String(r.holiday_date).slice(0, 7);
    (grouped[key] ||= []).push(r);
  });

  const deleteDesc = deleteTarget
    ? `"${deleteTarget.holiday_name || 'Unnamed holiday'}" on ${String(deleteTarget.holiday_date).slice(0, 10)} will be permanently removed.`
    : '';

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <button
            onClick={() => navigate('/holiday-calendars')}
            className='p-2 rounded-lg hover:bg-gray-100 text-gray-500'
            title='Back'
          >
            <ArrowLeft className='w-4 h-4' />
          </button>
          <div>
            <h1 className='text-2xl font-bold page-heading'>{cal.name}</h1>
            <p className='text-sm text-gray-500 mt-1'>{flagFor(cal.country_code)}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Select
            value={String(year)}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            options={yearOptions}
          />
          <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowAdd(true)}>
            Add Holiday
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <StatCard label='Total in Year' value={rows.length} color='orange' />
        <StatCard label='Full-Day Blocks' value={fullDayCount} color='red' />
        <StatCard label='Time-Range Blocks' value={blockCount} color='amber' />
      </div>

      {rows.length > 0 && (
        <div className='filter-bar'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search holidays by name or date (YYYY-MM-DD)…' />
          {search && <FilterPill label={`Name/Date: "${search}"`} onRemove={() => setSearch('')} />}
        </div>
      )}

      <Card>
        <CardHeader
          title={
            search
              ? `${filteredRows.length} of ${rows.length} holidays in ${year}`
              : `Holidays in ${year}`
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title='No holidays in this year'
            description='Add a date to start blocking it from campaigns.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowAdd(true)}>
                Add Holiday
              </Button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState title='No matches' description='Try adjusting or clearing the search above.' />
        ) : (
          <div className='divide-y divide-gray-100'>
            {Object.keys(grouped).sort().map((monthKey) => (
              <div key={monthKey} className='px-5 py-4'>
                <h4 className='text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3'>
                  {monthLabel(monthKey + '-01')}
                </h4>
                <div className='space-y-2'>
                  {grouped[monthKey].map((d) => (
                    <HolidayRow
                      key={d.id}
                      date={d}
                      onEdit={() => setEditTarget(d)}
                      onDelete={() => setDeleteTarget(d)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {(showAdd || editTarget) && (
        <HolidayDateEditor
          calendarId={id!}
          target={editTarget}
          onClose={() => { setShowAdd(false); setEditTarget(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ['holiday-dates', id, year] })}
        />
      )}

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); delMut.reset(); }}
        onConfirm={() => deleteTarget && delMut.mutate(deleteTarget.id)}
        loading={delMut.isPending}
        title='Delete Holiday?'
        description={deleteDesc}
        confirmLabel='Delete Holiday'
        errorMessage={delMut.isError ? 'Could not delete this holiday. Please try again.' : undefined}
      />
    </div>
  );
}

// ── HolidayRow ───────────────────────────────────────────────
function HolidayRow({
  date, onEdit, onDelete,
}: {
  date: HolidayDate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const day = parseDateOnly(date.holiday_date);
  return (
    <div className='holiday-card flex items-center justify-between gap-4'>
      <div className='flex items-center gap-4 min-w-0'>
        <div className='text-center w-12 shrink-0'>
          <p className='text-xs text-gray-400 uppercase'>
            {day.toLocaleDateString(undefined, { weekday: 'short' })}
          </p>
          <p className='text-lg font-bold text-gray-900'>{day.getDate()}</p>
        </div>
        <div className='min-w-0'>
          <p className='font-medium text-gray-900 truncate'>
            {date.holiday_name || <span className='text-gray-400 italic'>Unnamed</span>}
          </p>
          <p className='text-xs text-gray-500 mt-0.5'>
            {date.is_full_day_block ? (
              <Badge label='Full day' color='red' />
            ) : (
              <Badge label={`${fmtTime(date.block_start)} – ${fmtTime(date.block_end)}`} color='orange' />
            )}
          </p>
        </div>
      </div>
      <div className='flex items-center gap-2'>
        <button
          onClick={onEdit}
          title='Edit'
          className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
        >
          <Pencil className='w-3 h-3' />
          Edit
        </button>
        <button
          onClick={onDelete}
          title='Delete'
          className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
        >
          <Trash2 className='w-3 h-3' />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── HolidayDateEditor ────────────────────────────────────────
function HolidayDateEditor({
  calendarId, target, onClose, onSaved,
}: {
  calendarId: string;
  target: HolidayDate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!target;
  const [holidayDate, setHolidayDate] = useState(target?.holiday_date ?? new Date().toISOString().slice(0, 10));
  const [name, setName] = useState(target?.holiday_name ?? '');
  const [isFullDay, setIsFullDay] = useState(target?.is_full_day_block ?? true);
  const [blockStart, setBlockStart] = useState(target?.block_start ? target.block_start.slice(0, 5) : '09:00');
  const [blockEnd, setBlockEnd] = useState(target?.block_end ? target.block_end.slice(0, 5) : '17:00');

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        holiday_date: holidayDate,
        holiday_name: name.trim() || undefined,
        is_full_day_block: isFullDay,
        block_start: isFullDay ? undefined : blockStart,
        block_end: isFullDay ? undefined : blockEnd,
      };
      return isEdit
        ? updateHolidayDate(calendarId, target!.id, body)
        : createHolidayDate(calendarId, body as any);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  const timesValid = isFullDay || (blockStart && blockEnd && blockStart < blockEnd);

  return (
    <Modal open title={isEdit ? 'Edit Holiday' : 'Add Holiday'} onClose={onClose}>
      <div className='space-y-4'>
        <Input label='Date' type='date' value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
        <Input label='Holiday Name (optional)' placeholder='e.g. Independence Day' value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <label className='block text-xs text-gray-500 mb-2'>Block Type</label>
          <div className='flex gap-2'>
            <button type='button' onClick={() => setIsFullDay(true)} className={clsxBtn(isFullDay)}>Full Day</button>
            <button type='button' onClick={() => setIsFullDay(false)} className={clsxBtn(!isFullDay)}>Time Range</button>
          </div>
        </div>
        {!isFullDay && (
          <div className='grid grid-cols-2 gap-3'>
            <Input label='From' type='time' value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
            <Input label='To' type='time' value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
          </div>
        )}
        {mut.isError && (
          <div className='flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg'>
            <AlertTriangle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
            <p className='text-xs text-red-700 leading-relaxed'>
              Could not save this holiday. Please check the date and time values and try again.
            </p>
          </div>
        )}
        <div className='flex justify-end gap-2 pt-2'>
          <Button variant='secondary' onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!holidayDate || !timesValid}>
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const clsxBtn = (active: boolean) =>
  `flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition ${
    active
      ? 'bg-indigo-600 border-indigo-600 text-white'
      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
  }`;