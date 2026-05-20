import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listScheduleTemplates,
  getScheduleTemplate,
  createScheduleTemplate,
  updateScheduleTemplate,
  deleteScheduleTemplate,
  createScheduleWindow,
  updateScheduleWindow,
  deleteScheduleWindow,
  listTimezones,
  getSystemConfig,
  type ScheduleTemplate,
  type ScheduleWindow,
  type SystemConfig,
} from '../api/client';
import {
  Card,
  Table,
  Button,
  Modal,
  Input,
  Badge,
  PageLoader,
  EmptyState,
  SearchInput,
} from '../components/ui';
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  Clock,
  ChevronDown,
  Check,
  X,
  CalendarDays,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};
const DAY_SHORT: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

const toHHMM = (t: string) => (t || '').slice(0, 5);
const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

// ── Teal clock icon — no background, icon only ──
function ScheduleRowIcon() {
  return (
    <Clock className='w-4 h-4 flex-shrink-0' style={{ color: '#0F766E' }} />
  );
}

// ── List page ────────────────────────────────────────────────
export function ScheduleTemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTemplate | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['schedule-templates'],
    queryFn: listScheduleTemplates,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteScheduleTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-templates'] });
      setDeleteTarget(null);
    },
  });

  const rows: ScheduleTemplate[] = data?.data || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.timezone || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading'>Schedule Templates</h1>
          <p className='text-sm text-gray-500 mt-1'>
            {search
              ? `${filtered.length} of ${rows.length} template(s)`
              : 'Reusable day-of-week time windows that campaigns dial within.'}
          </p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New Template
        </Button>
      </div>

      {rows.length > 0 && (
        <div className='filter-bar'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search templates or timezones…' />
        </div>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title='No schedule templates yet'
            description='Create one to define the days and times your campaigns may dial.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create Template
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState title='No matches' description={`No templates match "${search}".`} />
        ) : (
          <Table<ScheduleTemplate>
            keyFn={(r) => r.id}
            rows={filtered}
            onRowClick={(r) => navigate(`/schedule-templates/${r.id}`)}
            cols={[
              {
                header: 'Name',
                render: (r) => (
                  <div className='flex items-center gap-2.5'>
                    <ScheduleRowIcon />
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  </div>
                ),
              },
              {
                header: 'Timezone',
                render: (r) => <span className='text-gray-600'>{r.timezone}</span>,
              },
              {
                header: 'Created',
                render: (r) => new Date(r.created_at).toLocaleDateString(),
              },
              {
                header: 'Actions',
                width: '110px',
                render: (r) => (
                  <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
                    <button
                      title='Edit template'
                      onClick={() => setEditTarget(r)}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      title='Delete template'
                      onClick={() => setDeleteTarget(r)}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {(showCreate || editTarget) && (
        <TemplateEditor
          target={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null); }}
          onCreated={(id) => navigate(`/schedule-templates/${id}`)}
        />
      )}

      {deleteTarget && (
        <Modal open onClose={() => { setDeleteTarget(null); delMut.reset(); }} title='Delete Template'>
          <div className='space-y-4'>
            <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
              <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
              <div>
                <p className='text-sm font-semibold text-red-800'>Delete "{deleteTarget.name}"?</p>
                <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                  All day-windows associated with this template will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            {delMut.isError && (
              <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
                Could not delete this template. Please try again.
              </div>
            )}
            <div className='flex gap-2 justify-end pt-1'>
              <Button variant='secondary' onClick={() => { setDeleteTarget(null); delMut.reset(); }}>Cancel</Button>
              <Button
                loading={delMut.isPending}
                onClick={() => delMut.mutate(deleteTarget.id)}
                className='!bg-red-600 hover:!bg-red-700 !text-white'
              >
                Delete Template
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── TemplateEditor ────────────────────────────────────────────
function TemplateEditor({
  target, onClose, onCreated,
}: {
  target: ScheduleTemplate | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [name, setName] = useState(target?.name ?? '');
  const [timezone, setTimezone] = useState(target?.timezone ?? browserTz);
  const isEdit = !!target;

  const mut = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), timezone: timezone.trim() || 'UTC' };
      return isEdit ? updateScheduleTemplate(target!.id, body) : createScheduleTemplate(body);
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['schedule-templates'] });
      if (!isEdit && onCreated) onCreated(res.id);
      else onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Template' : 'New Schedule Template'}>
      <div className='space-y-4'>
        <Input
          label='Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. Mon-Fri 9-5'
          autoFocus
        />
        <TimezonePicker label='Timezone (IANA)' value={timezone} onChange={setTimezone} />
        <p className='text-xs text-gray-500'>
          {isEdit
            ? 'Update the template name or timezone.'
            : 'After saving you will be taken to the template to add time windows.'}
        </p>
        {mut.isError && (
          <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
            Could not save this template. Please check your input and try again.
          </div>
        )}
        <div className='flex gap-2 justify-end pt-2'>
          <Button variant='secondary' onClick={onClose}>Cancel</Button>
          <Button loading={mut.isPending} disabled={!name.trim()} onClick={() => mut.mutate()}>
            {isEdit ? 'Save' : 'Create & Open'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Detail page ───────────────────────────────────────────────
export function ScheduleTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editWin, setEditWin] = useState<ScheduleWindow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteWinTarget, setDeleteWinTarget] = useState<ScheduleWindow | null>(null);

  const { data: tmpl, isLoading } = useQuery({
    queryKey: ['schedule-template', id],
    queryFn: () => getScheduleTemplate(id!),
    enabled: !!id,
  });

  const delWinMut = useMutation({
    mutationFn: (winId: string) => deleteScheduleWindow(id!, winId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-template', id] });
      setDeleteWinTarget(null);
    },
  });

  if (isLoading || !tmpl) return <PageLoader />;
  const windows = tmpl.windows || [];

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      <div>
        <button
          onClick={() => navigate('/schedule-templates')}
          className='inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-2 transition-colors'
        >
          <ArrowLeft className='w-4 h-4' /> Back to templates
        </button>
        <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading'>{tmpl.name}</h1>
            <p className='text-sm text-gray-500 mt-1'>
              Timezone: <span className='font-medium text-gray-700'>{tmpl.timezone}</span>
              {typeof tmpl.campaigns_using === 'number' && tmpl.campaigns_using > 0 && (
                <> · <Badge label={`${tmpl.campaigns_using} campaign(s)`} color='blue' /></>
              )}
            </p>
          </div>
          <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowAdd(true)}>
            Add Window
          </Button>
        </div>
      </div>

      <Card>
        {windows.length === 0 ? (
          <EmptyState
            title='No windows defined'
            description='Add a day-of-week window to allow the campaign to dial in that slot.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowAdd(true)}>
                Add Window
              </Button>
            }
          />
        ) : (
          <Table<ScheduleWindow>
            keyFn={(w) => w.id}
            rows={windows}
            cols={[
              {
                header: 'Day',
                render: (w) => (
                  <span className='font-medium text-gray-900'>{DAY_NAMES[w.day_of_week]}</span>
                ),
              },
              {
                header: 'Start',
                render: (w) => (
                  <span className='text-gray-700 font-mono text-sm'>{toHHMM(w.start_time)}</span>
                ),
              },
              {
                header: 'End',
                render: (w) => (
                  <span className='text-gray-700 font-mono text-sm'>{toHHMM(w.end_time)}</span>
                ),
              },
              {
                header: '',
                width: '100px',
                render: (w) => (
                  <div className='flex items-center gap-1 justify-end'>
                    <button
                      title='Edit'
                      onClick={() => setEditWin(w)}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      title='Delete'
                      onClick={() => setDeleteWinTarget(w)}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {(showAdd || editWin) && (
        <WindowEditor
          templateId={id!}
          target={editWin}
          existingWindows={windows}
          onClose={() => { setShowAdd(false); setEditWin(null); }}
        />
      )}

      {deleteWinTarget && (
        <Modal open onClose={() => { setDeleteWinTarget(null); delWinMut.reset(); }} title='Delete Window' size='sm'>
          <div className='space-y-4'>
            <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
              <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
              <div>
                <p className='text-sm font-semibold text-red-800'>
                  Delete the {DAY_NAMES[deleteWinTarget.day_of_week]} window?
                </p>
                <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                  {toHHMM(deleteWinTarget.start_time)} – {toHHMM(deleteWinTarget.end_time)}. This cannot be undone.
                </p>
              </div>
            </div>
            {delWinMut.isError && (
              <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
                Could not delete this window. Please try again.
              </div>
            )}
            <div className='flex gap-2 justify-end pt-1'>
              <Button variant='secondary' onClick={() => { setDeleteWinTarget(null); delWinMut.reset(); }}>Cancel</Button>
              <Button
                loading={delWinMut.isPending}
                onClick={() => delWinMut.mutate(deleteWinTarget.id)}
                className='!bg-red-600 hover:!bg-red-700 !text-white'
              >
                Delete Window
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────
type TimeSlot = { start: string; end: string };

// ── Time Guard helpers ────────────────────────────────────────
type GuardWindow = { start: string; end: string } | null | undefined;

function guardForDay(cfg: SystemConfig | undefined, day: number): GuardWindow {
  if (!cfg || !cfg.time_guard_enabled) return undefined;
  const w = cfg.time_guard_windows?.[String(day)];
  return w ? { start: toHHMM(w.start), end: toHHMM(w.end) } : null;
}

// ── Slot validation ───────────────────────────────────────────
function getSlotError(
  slot: TimeSlot,
  allSlotsForDay: TimeSlot[],
  myIdx: number,
  savedWindowsForDay: { start: string; end: string }[],
  guard?: GuardWindow,
): string | null {
  if (!slot.start || !slot.end) return 'Start and end times are required.';
  if (slot.start >= slot.end) return 'End time must be after start time.';

  if (guard === null)
    return 'Time Guard blocks new windows on this day.';
  if (guard && (slot.start < guard.start || slot.end > guard.end))
    return `Outside Time Guard window (${guard.start}–${guard.end}).`;

  const slotStart = toMinutes(slot.start);
  const slotEnd = toMinutes(slot.end);

  const otherNew = allSlotsForDay.filter((_, i) => i !== myIdx && _.start < _.end);
  const overlapsNew = otherNew.some((o) => {
    const oStart = toMinutes(o.start);
    const oEnd = toMinutes(o.end);
    return slotStart < oEnd && slotEnd > oStart;
  });
  if (overlapsNew) return 'Overlaps with another slot on the same day.';

  const overlapsSaved = savedWindowsForDay.some((saved) => {
    const sStart = toMinutes(toHHMM(saved.start));
    const sEnd = toMinutes(toHHMM(saved.end));
    return slotStart < sEnd && slotEnd > sStart;
  });
  if (overlapsSaved) return 'Overlaps with an existing saved window.';

  return null;
}

// ── WindowEditor ──────────────────────────────────────────────
function WindowEditor({
  templateId,
  target,
  existingWindows,
  onClose,
}: {
  templateId: string;
  target: ScheduleWindow | null;
  existingWindows: ScheduleWindow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!target;

  const { data: systemConfig } = useQuery<SystemConfig>({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
    staleTime: 60 * 1000,
  });

  // Edit mode state
  const [editDay, setEditDay] = useState<number>(target?.day_of_week ?? 1);
  const [editStart, setEditStart] = useState(toHHMM(target?.start_time || '09:00'));
  const [editEnd, setEditEnd] = useState(toHHMM(target?.end_time || '17:00'));

  // Add mode state
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const [openDays, setOpenDays] = useState<Set<number>>(new Set());
  const [daySlots, setDaySlots] = useState<Record<number, TimeSlot[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const savedByDay = useMemo(() => {
    const map: Record<number, { start: string; end: string }[]> = {};
    existingWindows.forEach((w) => {
      if (isEdit && w.id === target?.id) return;
      const d = w.day_of_week;
      if (!map[d]) map[d] = [];
      map[d].push({ start: w.start_time, end: w.end_time });
    });
    return map;
  }, [existingWindows, isEdit, target?.id]);

  const availableDays = useMemo(
    () => DAY_ORDER.filter((d) => !addedDays.includes(d)),
    [addedDays],
  );

  const handleAddDay = (d: number) => {
    setAddedDays((prev) => {
      const next = [...prev, d];
      next.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
      return next;
    });
    setOpenDays((prev) => new Set([...prev, d]));
    if (!daySlots[d]) {
      setDaySlots((prev) => ({ ...prev, [d]: [{ start: '09:00', end: '17:00' }] }));
    }
  };

  const handleRemoveDay = (d: number) => {
    setAddedDays((prev) => prev.filter((x) => x !== d));
    setOpenDays((prev) => { const n = new Set(prev); n.delete(d); return n; });
  };

  const toggleOpen = (d: number) => {
    setOpenDays((prev) => {
      const n = new Set(prev);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });
  };

  const addSlot = (d: number) => {
    setDaySlots((prev) => ({
      ...prev,
      [d]: [...(prev[d] || []), { start: '09:00', end: '17:00' }],
    }));
  };

  const removeSlot = (d: number, idx: number) => {
    setDaySlots((prev) => {
      const updated = (prev[d] || []).filter((_, i) => i !== idx);
      return { ...prev, [d]: updated.length > 0 ? updated : [{ start: '09:00', end: '17:00' }] };
    });
  };

  const updateSlot = (d: number, idx: number, patch: Partial<TimeSlot>) => {
    setSubmitError(null);
    setDaySlots((prev) => ({
      ...prev,
      [d]: (prev[d] || []).map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const allSlots = useMemo(() => {
    const result: { day: number; start: string; end: string }[] = [];
    addedDays.forEach((d) => {
      (daySlots[d] || []).forEach((s) => result.push({ day: d, start: s.start, end: s.end }));
    });
    return result;
  }, [addedDays, daySlots]);

  const allErrors = useMemo(() => {
    const errs: { day: number; idx: number; msg: string }[] = [];
    addedDays.forEach((d) => {
      const slots = daySlots[d] || [];
      const saved = savedByDay[d] || [];
      const guard = guardForDay(systemConfig, d);
      slots.forEach((s, i) => {
        const err = getSlotError(s, slots, i, saved, guard);
        if (err) errs.push({ day: d, idx: i, msg: err });
      });
    });
    return errs;
  }, [addedDays, daySlots, savedByDay, systemConfig]);

  const isValid = allErrors.length === 0 && allSlots.length > 0;
  const totalSlotCount = allSlots.length;

  const mut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return updateScheduleWindow(templateId, target!.id, {
          day_of_week: editDay,
          start_time: editStart,
          end_time: editEnd,
        });
      }
      for (const s of allSlots) {
        await createScheduleWindow(templateId, {
          day_of_week: s.day,
          start_time: s.start,
          end_time: s.end,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-template', templateId] });
      onClose();
    },
    onError: (e: any) => {
      setSubmitError(
        e?.response?.data?.error || 'Save failed. Please check for conflicts with existing windows.',
      );
    },
  });

  // ── Edit mode UI ──────────────────────────────────────────
  if (isEdit) {
    const savedForEditDay = savedByDay[editDay] || [];
    const editGuard = guardForDay(systemConfig, editDay);
    const editOutsideGuard =
      editStart < editEnd &&
      ((editGuard === null) ||
        (!!editGuard && (editStart < editGuard.start || editEnd > editGuard.end)));
    const editOverlapsSaved =
      editStart < editEnd &&
      savedForEditDay.some((saved) => {
        const sStart = toMinutes(toHHMM(saved.start));
        const sEnd = toMinutes(toHHMM(saved.end));
        const eStart = toMinutes(editStart);
        const eEnd = toMinutes(editEnd);
        return eStart < sEnd && eEnd > sStart;
      });
    const valid = editStart < editEnd && !editOverlapsSaved && !editOutsideGuard;

    return (
      <Modal open onClose={onClose} title='Edit Window'>
        <div className='space-y-4'>
          <div>
            <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2'>
              Day of Week
            </label>
            <select
              value={editDay}
              onChange={(e) => setEditDay(parseInt(e.target.value, 10))}
              className='w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400 bg-white transition-colors'
            >
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>{DAY_NAMES[d]}</option>
              ))}
            </select>
          </div>

          {savedByDay[editDay]?.length > 0 && (
            <div className='flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3'>
              <Clock className='w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5' />
              <div>
                <p className='text-[11px] font-semibold text-blue-700 mb-1.5'>
                  Existing windows on {DAY_NAMES[editDay]} — cannot overlap:
                </p>
                <div className='flex flex-wrap gap-1.5'>
                  {savedByDay[editDay].map((w, i) => (
                    <span
                      key={i}
                      className='text-xs bg-white border border-blue-200 text-blue-700 rounded-lg px-2 py-0.5 font-mono'
                    >
                      {toHHMM(w.start)} – {toHHMM(w.end)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {editGuard && (
            <div className='flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2'>
              <ShieldAlert className='w-3.5 h-3.5 flex-shrink-0' />
              Time Guard: windows on {DAY_NAMES[editDay]} must fall within{' '}
              <span className='font-mono font-semibold'>{editGuard.start}–{editGuard.end}</span>.
            </div>
          )}
          {editGuard === null && (
            <div className='flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5'>
              <AlertCircle className='w-3.5 h-3.5 flex-shrink-0' />
              Time Guard blocks new windows on {DAY_NAMES[editDay]}.
            </div>
          )}

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2'>
                Start Time
              </label>
              <input
                type='time'
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className='w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400 bg-white transition-colors'
              />
            </div>
            <div>
              <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2'>
                End Time
              </label>
              <input
                type='time'
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className='w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400 bg-white transition-colors'
              />
            </div>
          </div>

          {editStart >= editEnd && (
            <div className='flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5'>
              <AlertCircle className='w-3.5 h-3.5 flex-shrink-0' />
              End time must be after start time.
            </div>
          )}
          {editOverlapsSaved && editStart < editEnd && (
            <div className='flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5'>
              <AlertCircle className='w-3.5 h-3.5 flex-shrink-0' />
              This time range overlaps with an existing window on {DAY_NAMES[editDay]}.
            </div>
          )}

          <div className='flex gap-2 justify-end pt-1'>
            <Button variant='secondary' onClick={onClose}>Cancel</Button>
            <Button loading={mut.isPending} disabled={!valid} onClick={() => mut.mutate()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Add mode UI ───────────────────────────────────────────
  const DAY_COLORS: Record<number, {
    badge: string;
    badgeText: string;
    cardBg: string;
    headerBg: string;
    bodyBg: string;
    border: string;
    slotBg: string;
    pillBg: string;
    pillText: string;
    accentText: string;
  }> = {
    1: {
      badge: '#F59E0B', badgeText: '#FFFFFF',
      cardBg: '#FFFBEB', headerBg: '#FEF3C7', bodyBg: '#FFFDF5',
      border: '#FCD34D', slotBg: '#FFFBEB',
      pillBg: '#FEF3C7', pillText: '#92400E', accentText: '#92400E',
    },
    2: {
      badge: '#0EA5E9', badgeText: '#FFFFFF',
      cardBg: '#F0F9FF', headerBg: '#E0F2FE', bodyBg: '#F7FCFF',
      border: '#7DD3FC', slotBg: '#F0F9FF',
      pillBg: '#E0F2FE', pillText: '#0369A1', accentText: '#0369A1',
    },
    3: {
      badge: '#8B5CF6', badgeText: '#FFFFFF',
      cardBg: '#F5F3FF', headerBg: '#EDE9FE', bodyBg: '#FAFAFF',
      border: '#C4B5FD', slotBg: '#F5F3FF',
      pillBg: '#EDE9FE', pillText: '#5B21B6', accentText: '#5B21B6',
    },
    4: {
      badge: '#10B981', badgeText: '#FFFFFF',
      cardBg: '#ECFDF5', headerBg: '#D1FAE5', bodyBg: '#F5FFFE',
      border: '#6EE7B7', slotBg: '#ECFDF5',
      pillBg: '#D1FAE5', pillText: '#065F46', accentText: '#065F46',
    },
    5: {
      badge: '#F43F5E', badgeText: '#FFFFFF',
      cardBg: '#FFF1F2', headerBg: '#FFE4E6', bodyBg: '#FFF8F9',
      border: '#FDA4AF', slotBg: '#FFF1F2',
      pillBg: '#FFE4E6', pillText: '#9F1239', accentText: '#9F1239',
    },
    6: {
      badge: '#F97316', badgeText: '#FFFFFF',
      cardBg: '#FFF7ED', headerBg: '#FFEDD5', bodyBg: '#FFFAF5',
      border: '#FDC9A0', slotBg: '#FFF7ED',
      pillBg: '#FFEDD5', pillText: '#9A3412', accentText: '#9A3412',
    },
    0: {
      badge: '#D946EF', badgeText: '#FFFFFF',
      cardBg: '#FDF4FF', headerBg: '#FAE8FF', bodyBg: '#FEF9FF',
      border: '#E879F9', slotBg: '#FDF4FF',
      pillBg: '#FAE8FF', pillText: '#86198F', accentText: '#86198F',
    },
  };

  return (
    <Modal open={true} onClose={onClose} title='Add Schedule Windows' size='lg'>
      <div
        className='flex flex-col rounded-2xl'
        style={{
          height: '62vh',
          maxHeight: '620px',
          background: '#FFF8F5',
        }}
      >

        {/* ── Day selector row ── */}
        <div
          className='flex items-center gap-3 mb-4 pb-4 px-1'
          style={{ borderBottom: '1px solid #F0E6DF' }}
        >
          <CalendarDays className='w-4 h-4 flex-shrink-0' style={{ color: '#C4704A' }} />
          <label className='text-sm font-semibold whitespace-nowrap' style={{ color: '#7A4030' }}>
            Add day
          </label>
          <select
            value=''
            onChange={(e) => {
              const val = e.target.value;
              if (val !== '') handleAddDay(parseInt(val, 10));
              (e.target as HTMLSelectElement).value = '';
            }}
            className='flex-1 rounded-xl px-3 py-2.5 text-sm cursor-pointer focus:outline-none transition-all duration-150'
            style={{
              color: '#5C3522',
              background: '#FFFFFF',
              border: '1px solid #E8C9B8',
              boxShadow: '0 1px 3px rgba(180,90,50,0.08)',
            }}
          >
            <option value=''>
              {availableDays.length === 0 ? '✓ All 7 days added' : 'Select a day to add…'}
            </option>
            {availableDays.map((d) => (
              <option key={d} value={d}>{DAY_NAMES[d]}</option>
            ))}
          </select>
        </div>

        {/* ── Scrollable content ── */}
        <div
          className='flex-1 overflow-y-auto pr-1'
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#E8C9B8 transparent' }}
        >
          <div className='flex flex-col gap-2.5 pb-4'>

            {addedDays.length === 0 ? (
              <div className='flex flex-col items-center justify-center py-16 gap-4 text-center select-none'>
                <div
                  className='w-16 h-16 rounded-3xl flex items-center justify-center'
                  style={{ background: '#FFF0E8', border: '1.5px dashed #E8C9B8' }}
                >
                  <CalendarDays className='w-7 h-7' style={{ color: '#C4704A' }} />
                </div>
                <div>
                  <p className='text-sm font-semibold' style={{ color: '#7A4030' }}>
                    No days added yet
                  </p>
                  <p className='text-xs mt-1 leading-relaxed max-w-xs' style={{ color: '#B08070' }}>
                    Pick a day from the dropdown above to start building your schedule.
                  </p>
                </div>
              </div>
            ) : (
              addedDays.map((d) => {
                const slots = daySlots[d] || [{ start: '09:00', end: '17:00' }];
                const isOpen = openDays.has(d);
                const saved = savedByDay[d] || [];
                const guard = guardForDay(systemConfig, d);
                const C = DAY_COLORS[d];

                const errCount = slots.filter((s, i) =>
                  getSlotError(s, slots, i, saved, guard),
                ).length;
                const hasErrors = errCount > 0;

                return (
                  <div
                    key={d}
                    className='rounded-2xl overflow-hidden transition-all duration-200'
                    style={{
                      border: `1.5px solid ${hasErrors ? '#FCA5A5' : C.border}`,
                      background: C.cardBg,
                      boxShadow: isOpen
                        ? `0 3px 14px ${C.badge}22`
                        : '0 1px 4px rgba(0,0,0,0.05)',
                    }}
                  >

                    {/* ── Header ── */}
                    <div
                      onClick={() => toggleOpen(d)}
                      className='flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-all duration-150'
                      style={{
                        background: hasErrors ? '#FEF2F2' : isOpen ? C.headerBg : C.cardBg,
                      }}
                    >
                      <div className='flex items-center gap-3 min-w-0'>
                        <span
                          className='inline-flex items-center justify-center w-11 h-7 rounded-lg text-[11px] font-bold tracking-wider flex-shrink-0'
                          style={{
                            background: hasErrors ? '#EF4444' : C.badge,
                            color: C.badgeText,
                          }}
                        >
                          {DAY_SHORT[d]}
                        </span>

                        <div className='min-w-0'>
                          <span
                            className='text-[13px] font-semibold'
                            style={{
                              color: hasErrors ? '#B91C1C' : isOpen ? C.accentText : '#1F2937',
                            }}
                          >
                            {DAY_NAMES[d]}
                          </span>

                          {!isOpen && (
                            <div className='flex items-center gap-1.5 mt-1 flex-wrap'>
                              {slots.slice(0, 3).map((s, i) => (
                                <span
                                  key={i}
                                  className='text-[10px] font-mono rounded px-1.5 py-px'
                                  style={{
                                    color: C.accentText,
                                    background: C.pillBg,
                                    border: `1px solid ${C.border}`,
                                  }}
                                >
                                  {s.start}–{s.end}
                                </span>
                              ))}
                              {slots.length > 3 && (
                                <span className='text-[10px]' style={{ color: C.pillText }}>
                                  +{slots.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {hasErrors && (
                          <span
                            className='inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0'
                            style={{ color: '#DC2626', background: '#FEE2E2' }}
                          >
                            <AlertTriangle className='w-3 h-3' />
                            {errCount} error{errCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <div className='flex items-center gap-2 flex-shrink-0'>
                        <span
                          className='text-[11px] font-semibold rounded-full px-2.5 py-0.5'
                          style={{
                            background: hasErrors ? '#FEE2E2' : C.pillBg,
                            color: hasErrors ? '#DC2626' : C.pillText,
                          }}
                        >
                          {slots.length} slot{slots.length !== 1 ? 's' : ''}
                        </span>

                        <button
                          title={`Remove ${DAY_NAMES[d]}`}
                          onClick={(e) => { e.stopPropagation(); handleRemoveDay(d); }}
                          className='w-7 h-7 flex items-center justify-center rounded-lg transition-colors'
                          style={{ color: '#9CA3AF' }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#EF4444';
                            (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF';
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }}
                        >
                          <X className='w-3.5 h-3.5' />
                        </button>

                        <ChevronDown
                          className='w-4 h-4 transition-transform duration-200 flex-shrink-0'
                          style={{
                            color: hasErrors ? '#F87171' : isOpen ? C.badge : '#9CA3AF',
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          }}
                        />
                      </div>
                    </div>

                    {/* ── Body ── */}
                    {isOpen && (
                      <div
                        className='px-4 pt-4 pb-5'
                        style={{
                          background: C.bodyBg,
                          borderTop: `1px solid ${C.border}`,
                        }}
                      >
                        {saved.length > 0 && (
                          <div
                            className='flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-3'
                            style={{ background: C.pillBg, border: `1px solid ${C.border}` }}
                          >
                            <Clock className='w-3.5 h-3.5 flex-shrink-0 mt-0.5' style={{ color: C.badge }} />
                            <div>
                              <p className='text-[11px] font-semibold mb-1.5' style={{ color: C.accentText }}>
                                Already saved on {DAY_NAMES[d]}
                              </p>
                              <div className='flex flex-wrap gap-1.5'>
                                {saved.map((w, i) => (
                                  <span
                                    key={i}
                                    className='text-[11px] font-mono rounded-lg px-2 py-0.5'
                                    style={{
                                      color: C.accentText,
                                      background: '#FFFFFF',
                                      border: `1px solid ${C.border}`,
                                    }}
                                  >
                                    {toHHMM(w.start)} – {toHHMM(w.end)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {guard && (
                          <div className='flex items-center gap-2 rounded-xl px-3 py-2 mb-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-100'>
                            <ShieldAlert className='w-3.5 h-3.5 flex-shrink-0' />
                            Time Guard permits{' '}
                            <span className='font-mono font-semibold'>{guard.start}–{guard.end}</span>{' '}
                            on {DAY_NAMES[d]}.
                          </div>
                        )}
                        {guard === null && (
                          <div className='flex items-center gap-2 rounded-xl px-3 py-2 mb-3 text-[11px] text-red-700 bg-red-50 border border-red-100'>
                            <AlertCircle className='w-3.5 h-3.5 flex-shrink-0' />
                            Time Guard blocks new windows on {DAY_NAMES[d]}.
                          </div>
                        )}

                        <div className='grid gap-2 mb-2 px-1' style={{ gridTemplateColumns: '1fr 1fr 32px' }}>
                          <span className='text-[10px] font-bold uppercase tracking-widest' style={{ color: C.pillText }}>
                            Start time
                          </span>
                          <span className='text-[10px] font-bold uppercase tracking-widest' style={{ color: C.pillText }}>
                            End time
                          </span>
                          <span />
                        </div>

                        <div className='flex flex-col gap-2'>
                          {slots.map((slot, idx) => {
                            const err = getSlotError(slot, slots, idx, saved, guard);

                            return (
                              <div key={idx}>
                                <div
                                  className='grid gap-2 items-center rounded-xl px-2.5 py-2 transition-all duration-150'
                                  style={{
                                    gridTemplateColumns: '1fr 1fr 32px',
                                    background: err ? '#FEF2F2' : '#FFFFFF',
                                    border: `1px solid ${err ? '#FCA5A5' : C.border}`,
                                    boxShadow: `0 1px 3px ${C.badge}18`,
                                  }}
                                >
                                  <input
                                    type='time'
                                    value={slot.start}
                                    onChange={(e) => updateSlot(d, idx, { start: e.target.value })}
                                    className='w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors'
                                    style={{
                                      background: C.slotBg,
                                      border: `1px solid ${C.border}`,
                                      color: '#111827',
                                    }}
                                    onFocus={(e) => {
                                      e.target.style.borderColor = C.badge;
                                      e.target.style.boxShadow = `0 0 0 2px ${C.badge}30`;
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.borderColor = C.border;
                                      e.target.style.boxShadow = 'none';
                                    }}
                                  />
                                  <input
                                    type='time'
                                    value={slot.end}
                                    onChange={(e) => updateSlot(d, idx, { end: e.target.value })}
                                    className='w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors'
                                    style={{
                                      background: C.slotBg,
                                      border: `1px solid ${C.border}`,
                                      color: '#111827',
                                    }}
                                    onFocus={(e) => {
                                      e.target.style.borderColor = C.badge;
                                      e.target.style.boxShadow = `0 0 0 2px ${C.badge}30`;
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.borderColor = C.border;
                                      e.target.style.boxShadow = 'none';
                                    }}
                                  />
                                  <button
                                    type='button'
                                    title='Remove slot'
                                    onClick={() => removeSlot(d, idx)}
                                    disabled={slots.length === 1}
                                    className='w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed'
                                    style={{ color: '#9CA3AF' }}
                                    onMouseEnter={(e) => {
                                      if (slots.length > 1) {
                                        (e.currentTarget as HTMLButtonElement).style.color = '#EF4444';
                                        (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF';
                                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                    }}
                                  >
                                    <X className='w-3.5 h-3.5' />
                                  </button>
                                </div>

                                {err && (
                                  <div className='flex items-center gap-1.5 text-[11px] font-medium mt-1 px-1' style={{ color: '#DC2626' }}>
                                    <AlertCircle className='w-3 h-3 flex-shrink-0' />
                                    {err}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type='button'
                          onClick={() => addSlot(d)}
                          className='mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150'
                          style={{
                            color: C.accentText,
                            border: `1px dashed ${C.badge}`,
                            background: 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = C.pillBg;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }}
                        >
                          <Plus className='w-3.5 h-3.5' />
                          Add another slot
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {submitError && (
          <div
            className='mt-3 flex items-start gap-2.5 px-3.5 py-3 rounded-xl'
            style={{ background: '#FFF1F2', border: '1px solid #FECACA' }}
          >
            <AlertCircle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
            <p className='text-xs font-medium text-red-700'>{submitError}</p>
          </div>
        )}

        <div
          className='sticky bottom-0 flex items-center justify-between pt-4 pb-1 mt-auto'
          style={{ background: '#FFF8F5', borderTop: '1px solid #F0E0D0' }}
        >
          <div className='flex items-center gap-2 text-xs' style={{ color: '#B08070' }}>
            <CalendarDays className='w-3.5 h-3.5' style={{ color: '#C4B0A8' }} />
            <span>
              {totalSlotCount > 0
                ? `${totalSlotCount} slot${totalSlotCount !== 1 ? 's' : ''} across ${addedDays.length} day${addedDays.length !== 1 ? 's' : ''}`
                : 'No slots configured yet'}
            </span>
          </div>
          <div className='flex gap-2'>
            <Button variant='secondary' onClick={onClose}>Cancel</Button>
            <Button
              loading={mut.isPending}
              disabled={!isValid}
              onClick={() => { setSubmitError(null); mut.mutate(); }}
            >
              {totalSlotCount <= 1 ? 'Add Window' : `Add ${totalSlotCount} Windows`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── TimezonePicker ────────────────────────────────────────────
function TimezonePicker({
  label, value, onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ['timezones'],
    queryFn: listTimezones,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const all = data?.data || [];
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
    if (!q) return all.slice(0, 200);
    return all.filter((z) => z.toLowerCase().includes(q)).slice(0, 200);
  }, [all, query]);

  const display = open ? query : value;

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
          placeholder='Search timezone…'
          className='w-full border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 bg-white transition-colors'
        />
        <ChevronDown className='w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none' />
      </div>
      {open && (
        <div className='absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg'>
          {filtered.length === 0 ? (
            <div className='px-3 py-3 text-xs text-gray-400 text-center'>No matches found</div>
          ) : (
            filtered.map((z) => (
              <button
                key={z}
                type='button'
                onClick={() => { onChange(z); setOpen(false); setQuery(''); }}
                className='w-full text-left px-3 py-2 text-sm hover:bg-violet-50 flex items-center justify-between transition-colors'
              >
                <span className='text-gray-700'>{z}</span>
                {z === value && <Check className='w-3.5 h-3.5 text-violet-600' />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}