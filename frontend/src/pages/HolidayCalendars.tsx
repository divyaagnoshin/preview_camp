import React, { useState } from 'react';
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
} from '../components/ui';
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  MoreVertical,
  CalendarOff,
} from 'lucide-react';

// ── Country options ──────────────────────────────────────────
// Short list of common ISO-2 codes; extend as needed.
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
  COUNTRY_OPTIONS.find((c) => c.value === code)?.label ?? code ?? '—';

// ── Page 1: Calendars list ───────────────────────────────────
export function HolidayCalendarsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<HolidayCalendar | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['holiday-calendars'],
    queryFn: listHolidayCalendars,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteHolidayCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holiday-calendars'] }),
    onError: (e: any) => alert(e?.response?.data?.error || 'Delete failed'),
  });

  if (isLoading) return <PageLoader />;
  const rows = data?.data || [];

  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>Holidays</h1>
          <p className='text-sm text-gray-500 mt-1'>
            Calendars of dates and time-blocks that campaigns must skip.
          </p>
        </div>
        <Button
          icon={<Plus className='w-4 h-4' />}
          onClick={() => setShowCreate(true)}
        >
          New Calendar
        </Button>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title='No holiday calendars yet'
            description='Create one to block dates from campaigns.'
            action={
              <Button
                icon={<Plus className='w-4 h-4' />}
                onClick={() => setShowCreate(true)}
              >
                Create Calendar
              </Button>
            }
          />
        ) : (
          <Table<HolidayCalendar>
            keyFn={(r) => r.id}
            rows={rows}
            onRowClick={(r) => navigate(`/holiday-calendars/${r.id}`)}
            cols={[
              {
                header: 'Name',
                render: (r) => (
                  <span className='font-medium text-gray-900'>{r.name}</span>
                ),
              },
              {
                header: 'Country',
                render: (r) => (
                  <span className='text-gray-600'>
                    {flagFor(r.country_code)}
                  </span>
                ),
              },
              {
                header: 'Holidays',
                render: (r) => (
                  <span className='font-medium text-indigo-600'>
                    {r.holiday_count ?? 0}
                  </span>
                ),
              },
              {
                header: 'Used by',
                render: (r) =>
                  r.campaign_usage_count ? (
                    <Badge
                      label={`${r.campaign_usage_count} campaign${r.campaign_usage_count > 1 ? 's' : ''}`}
                      color='blue'
                    />
                  ) : (
                    <span className='text-gray-400'>—</span>
                  ),
              },
              {
                header: 'Created',
                render: (r) => new Date(r.created_at).toLocaleDateString(),
              },
              {
                header: '',
                width: '60px',
                render: (r) => (
                  <button
                    type='button'
                    title='More actions'
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      setRowMenu(
                        rowMenu?.id === r.id
                          ? null
                          : { id: r.id, x: rect.right, y: rect.bottom + 4 },
                      );
                    }}
                    className='p-1.5 rounded hover:bg-gray-100 text-gray-500'
                  >
                    <MoreVertical className='w-4 h-4' />
                  </button>
                ),
              },
            ]}
          />
        )}

        {rowMenu &&
          (() => {
            const r = rows.find((x) => x.id === rowMenu.id);
            if (!r) return null;
            const close = () => setRowMenu(null);
            return (
              <>
                <div className='fixed inset-0 z-40' onClick={close} />
                <div
                  style={{
                    position: 'fixed',
                    left: rowMenu.x - 176,
                    top: rowMenu.y,
                  }}
                  className='z-50 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1'
                >
                  <button
                    onClick={() => {
                      close();
                      navigate(`/holiday-calendars/${r.id}`);
                    }}
                    className='w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2'
                  >
                    <CalendarOff className='w-3.5 h-3.5 text-gray-500' /> Manage
                    Dates
                  </button>
                  <button
                    onClick={() => {
                      close();
                      setEditTarget(r);
                    }}
                    className='w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2'
                  >
                    <Pencil className='w-3.5 h-3.5 text-gray-500' /> Edit
                  </button>
                  <button
                    onClick={() => {
                      close();
                      if (
                        confirm(
                          `Delete "${r.name}"? All its holiday dates will be removed.`,
                        )
                      )
                        delMut.mutate(r.id);
                    }}
                    className='w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2'
                  >
                    <Trash2 className='w-3.5 h-3.5' /> Delete
                  </button>
                </div>
              </>
            );
          })()}
      </Card>

      {(showCreate || editTarget) && (
        <CalendarEditor
          target={editTarget}
          onClose={() => {
            setShowCreate(false);
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── CalendarEditor: create / rename calendar ─────────────────
function CalendarEditor({
  target,
  onClose,
}: {
  target: HolidayCalendar | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(target?.name ?? '');
  const [country, setCountry] = useState(target?.country_code ?? '');
  const isEdit = !!target;

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), country_code: country || null };
      return isEdit
        ? updateHolidayCalendar(target!.id, body)
        : createHolidayCalendar(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holiday-calendars'] });
      onClose();
    },
    onError: (e: any) => alert(e?.response?.data?.error || 'Save failed'),
  });

  return (
    <Modal
      open
      title={isEdit ? 'Edit Calendar' : 'New Holiday Calendar'}
      onClose={onClose}
    >
      <div className='space-y-4'>
        <Input
          label='Name'
          placeholder='e.g. US Federal 2026'
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Select
          label='Country (optional)'
          value={country ?? ''}
          onChange={(e) => setCountry(e.target.value)}
          options={COUNTRY_OPTIONS}
        />
        <div className='flex justify-end gap-2 pt-2'>
          <Button variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={!name.trim()}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Page 2: Calendar detail (dates) ──────────────────────────
const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '');
// Parse a date-only value (YYYY-MM-DD or full ISO) as a local Date so the
// weekday / day-of-month aren't shifted by the browser's timezone.
const parseDateOnly = (value: string): Date => {
  const datePart = String(value).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const monthLabel = (iso: string) =>
  parseDateOnly(iso).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

export function HolidayCalendarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<HolidayDate | null>(null);

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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['holiday-dates', id, year] }),
    onError: (e: any) => alert(e?.response?.data?.error || 'Delete failed'),
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

  // Group by month for readability
  const grouped: Record<string, HolidayDate[]> = {};
  rows.forEach((r) => {
    const key = String(r.holiday_date).slice(0, 7);
    (grouped[key] ||= []).push(r);
  });

  return (
    <div className='p-6 space-y-6'>
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
            <h1 className='text-2xl font-bold text-gray-900'>{cal.name}</h1>
            <p className='text-sm text-gray-500 mt-1'>
              {flagFor(cal.country_code)}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Select
            value={String(year)}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            options={yearOptions}
          />
          <Button
            icon={<Plus className='w-4 h-4' />}
            onClick={() => setShowAdd(true)}
          >
            Add Holiday
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <StatCard label='Total in Year' value={rows.length} color='indigo' />
        <StatCard label='Full-Day Blocks' value={fullDayCount} color='green' />
        <StatCard label='Time-Range Blocks' value={blockCount} color='orange' />
      </div>

      <Card>
        <CardHeader title={`Holidays in ${year}`} />
        {rows.length === 0 ? (
          <EmptyState
            title='No holidays in this year'
            description='Add a date to start blocking it from campaigns.'
            action={
              <Button
                icon={<Plus className='w-4 h-4' />}
                onClick={() => setShowAdd(true)}
              >
                Add Holiday
              </Button>
            }
          />
        ) : (
          <div className='divide-y divide-gray-100'>
            {Object.keys(grouped)
              .sort()
              .map((monthKey) => (
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
                        onDelete={() => {
                          if (
                            confirm(
                              `Delete holiday on ${d.holiday_date}${d.holiday_name ? ` (${d.holiday_name})` : ''}?`,
                            )
                          )
                            delMut.mutate(d.id);
                        }}
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
          onClose={() => {
            setShowAdd(false);
            setEditTarget(null);
          }}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ['holiday-dates', id, year] })
          }
        />
      )}
    </div>
  );
}

function HolidayRow({
  date,
  onEdit,
  onDelete,
}: {
  date: HolidayDate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const day = parseDateOnly(date.holiday_date);
  return (
    <div className='flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50'>
      <div className='flex items-center gap-4 min-w-0'>
        <div className='text-center w-12 shrink-0'>
          <p className='text-xs text-gray-400 uppercase'>
            {day.toLocaleDateString(undefined, { weekday: 'short' })}
          </p>
          <p className='text-lg font-bold text-gray-900'>{day.getDate()}</p>
        </div>
        <div className='min-w-0'>
          <p className='font-medium text-gray-900 truncate'>
            {date.holiday_name || (
              <span className='text-gray-400 italic'>Unnamed</span>
            )}
          </p>
          <p className='text-xs text-gray-500 mt-0.5'>
            {date.is_full_day_block ? (
              <Badge label='Full day' color='red' />
            ) : (
              <Badge
                label={`${fmtTime(date.block_start)} – ${fmtTime(date.block_end)}`}
                color='orange'
              />
            )}
          </p>
        </div>
      </div>
      <div className='flex items-center gap-1'>
        <button
          onClick={onEdit}
          className='p-1.5 rounded hover:bg-gray-200 text-gray-500'
          title='Edit'
        >
          <Pencil className='w-3.5 h-3.5' />
        </button>
        <button
          onClick={onDelete}
          className='p-1.5 rounded hover:bg-red-100 text-red-500'
          title='Delete'
        >
          <Trash2 className='w-3.5 h-3.5' />
        </button>
      </div>
    </div>
  );
}

// ── HolidayDateEditor: add / edit a single holiday ───────────
function HolidayDateEditor({
  calendarId,
  target,
  onClose,
  onSaved,
}: {
  calendarId: string;
  target: HolidayDate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!target;
  const [holidayDate, setHolidayDate] = useState(
    target?.holiday_date ?? new Date().toISOString().slice(0, 10),
  );
  const [name, setName] = useState(target?.holiday_name ?? '');
  const [isFullDay, setIsFullDay] = useState(target?.is_full_day_block ?? true);
  const [blockStart, setBlockStart] = useState(
    target?.block_start ? target.block_start.slice(0, 5) : '09:00',
  );
  const [blockEnd, setBlockEnd] = useState(
    target?.block_end ? target.block_end.slice(0, 5) : '17:00',
  );

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
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e: any) =>
      alert(
        e?.response?.data?.error || e?.response?.data?.detail || 'Save failed',
      ),
  });

  const timesValid =
    isFullDay || (blockStart && blockEnd && blockStart < blockEnd);

  return (
    <Modal
      open
      title={isEdit ? 'Edit Holiday' : 'Add Holiday'}
      onClose={onClose}
    >
      <div className='space-y-4'>
        <Input
          label='Date'
          type='date'
          value={holidayDate}
          onChange={(e) => setHolidayDate(e.target.value)}
        />
        <Input
          label='Holiday Name (optional)'
          placeholder='e.g. Independence Day'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div>
          <label className='block text-xs text-gray-500 mb-2'>Block Type</label>
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={() => setIsFullDay(true)}
              className={clsxBtn(isFullDay)}
            >
              Full Day
            </button>
            <button
              type='button'
              onClick={() => setIsFullDay(false)}
              className={clsxBtn(!isFullDay)}
            >
              Time Range
            </button>
          </div>
        </div>
        {!isFullDay && (
          <div className='grid grid-cols-2 gap-3'>
            <Input
              label='From'
              type='time'
              value={blockStart}
              onChange={(e) => setBlockStart(e.target.value)}
            />
            <Input
              label='To'
              type='time'
              value={blockEnd}
              onChange={(e) => setBlockEnd(e.target.value)}
            />
          </div>
        )}
        <div className='flex justify-end gap-2 pt-2'>
          <Button variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={!holidayDate || !timesValid}
          >
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
