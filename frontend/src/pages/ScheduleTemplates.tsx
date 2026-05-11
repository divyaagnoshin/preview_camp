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
  type ScheduleTemplate,
  type ScheduleWindow,
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
} from '../components/ui';
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  MoreVertical,
  Clock,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';

// 0=Sun … 6=Sat — matches the schedule_windows.day_of_week CHECK constraint.
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Trim "HH:MM:SS" → "HH:MM" so the value is acceptable to <input type='time'>.
const toHHMM = (t: string) => (t || '').slice(0, 5);

// ── List page ────────────────────────────────────────────────
export function ScheduleTemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleTemplate | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['schedule-templates'],
    queryFn: listScheduleTemplates,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteScheduleTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-templates'] }),
    onError: (e: any) => alert(e?.response?.data?.error || 'Delete failed'),
  });

  if (isLoading) return <PageLoader />;
  const rows = data?.data || [];

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>
            Schedule Templates
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            Reusable day-of-week time windows that campaigns dial within.
          </p>
        </div>
        <Button
          icon={<Plus className='w-4 h-4' />}
          onClick={() => setShowCreate(true)}
        >
          New Template
        </Button>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title='No schedule templates yet'
            description='Create one to define the days and times your campaigns may dial.'
            action={
              <Button
                icon={<Plus className='w-4 h-4' />}
                onClick={() => setShowCreate(true)}
              >
                Create Template
              </Button>
            }
          />
        ) : (
          <Table<ScheduleTemplate>
            keyFn={(r) => r.id}
            rows={rows}
            onRowClick={(r) => navigate(`/schedule-templates/${r.id}`)}
            cols={[
              {
                header: 'Name',
                render: (r) => (
                  <span className='font-medium text-gray-900'>{r.name}</span>
                ),
              },
              {
                header: 'Timezone',
                render: (r) => (
                  <span className='text-gray-600'>{r.timezone}</span>
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
                      navigate(`/schedule-templates/${r.id}`);
                    }}
                    className='w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2'
                  >
                    <Clock className='w-3.5 h-3.5 text-gray-500' /> Manage
                    Windows
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
                          `Delete "${r.name}"? All its day-windows will be removed.`,
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
        <TemplateEditor
          target={editTarget}
          onClose={() => {
            setShowCreate(false);
            setEditTarget(null);
          }}
          onCreated={(id) => navigate(`/schedule-templates/${id}`)}
        />
      )}
    </div>
  );
}

// ── TemplateEditor: create / rename ──────────────────────────
function TemplateEditor({
  target,
  onClose,
  onCreated,
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
      return isEdit
        ? updateScheduleTemplate(target!.id, body)
        : createScheduleTemplate(body);
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['schedule-templates'] });
      if (!isEdit && onCreated) {
        onCreated(res.id);
      } else {
        onClose();
      }
    },
    onError: (e: any) => alert(e?.response?.data?.error || 'Save failed'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit Template' : 'New Schedule Template'}
    >
      <div className='space-y-4'>
        <Input
          label='Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. Mon-Fri 9-5 ET'
          autoFocus
        />
        <TimezonePicker
          label='Timezone (IANA)'
          value={timezone}
          onChange={setTimezone}
        />
        <p className='text-xs text-gray-500'>
          {isEdit
            ? 'Update the template name or timezone.'
            : 'After saving you will be taken to the template to add time windows.'}
        </p>
        <div className='flex gap-2 justify-end pt-2'>
          <Button variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={mut.isPending}
            disabled={!name.trim()}
            onClick={() => mut.mutate()}
          >
            {isEdit ? 'Save' : 'Create & Open'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Detail page: manage day-wise windows ─────────────────────
export function ScheduleTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editWin, setEditWin] = useState<ScheduleWindow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: tmpl, isLoading } = useQuery({
    queryKey: ['schedule-template', id],
    queryFn: () => getScheduleTemplate(id!),
    enabled: !!id,
  });

  const delWinMut = useMutation({
    mutationFn: (winId: string) => deleteScheduleWindow(id!, winId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['schedule-template', id] }),
    onError: (e: any) => alert(e?.response?.data?.error || 'Delete failed'),
  });

  if (isLoading || !tmpl) return <PageLoader />;
  const windows = tmpl.windows || [];

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      <div>
        <button
          onClick={() => navigate('/schedule-templates')}
          className='inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-2'
        >
          <ArrowLeft className='w-4 h-4' /> Back to templates
        </button>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>{tmpl.name}</h1>
            <p className='text-sm text-gray-500 mt-1'>
              Timezone: <span className='font-medium'>{tmpl.timezone}</span>
              {typeof tmpl.campaigns_using === 'number' &&
                tmpl.campaigns_using > 0 && (
                  <>
                    {' '}
                    ·{' '}
                    <Badge
                      label={`${tmpl.campaigns_using} campaign(s)`}
                      color='blue'
                    />
                  </>
                )}
            </p>
          </div>
          <Button
            icon={<Plus className='w-4 h-4' />}
            onClick={() => setShowAdd(true)}
          >
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
              <Button
                icon={<Plus className='w-4 h-4' />}
                onClick={() => setShowAdd(true)}
              >
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
                  <span className='font-medium text-gray-900'>
                    {DAY_NAMES[w.day_of_week]}
                  </span>
                ),
              },
              {
                header: 'Start',
                render: (w) => (
                  <span className='text-gray-700 font-mono'>
                    {toHHMM(w.start_time)}
                  </span>
                ),
              },
              {
                header: 'End',
                render: (w) => (
                  <span className='text-gray-700 font-mono'>
                    {toHHMM(w.end_time)}
                  </span>
                ),
              },
              {
                header: '',
                width: '120px',
                render: (w) => (
                  <div className='flex items-center gap-1 justify-end'>
                    <button
                      title='Edit'
                      onClick={() => setEditWin(w)}
                      className='p-1.5 rounded hover:bg-gray-100 text-gray-500'
                    >
                      <Pencil className='w-4 h-4' />
                    </button>
                    <button
                      title='Delete'
                      onClick={() => {
                        if (
                          confirm(
                            `Delete the ${DAY_NAMES[w.day_of_week]} window?`,
                          )
                        )
                          delWinMut.mutate(w.id);
                      }}
                      className='p-1.5 rounded hover:bg-red-50 text-red-500'
                    >
                      <Trash2 className='w-4 h-4' />
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
          onClose={() => {
            setShowAdd(false);
            setEditWin(null);
          }}
        />
      )}
    </div>
  );
}

// ── WindowEditor: add (multi-slot) / edit (single) ───────────
type SlotRow = { day: number; start: string; end: string };

function WindowEditor({
  templateId,
  target,
  onClose,
}: {
  templateId: string;
  target: ScheduleWindow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!target;

  // Edit mode — single controlled row
  const [day, setDay] = useState<number>(target?.day_of_week ?? 1);
  const [start, setStart] = useState(toHHMM(target?.start_time || '09:00'));
  const [end, setEnd] = useState(toHHMM(target?.end_time || '17:00'));

  // Add mode — list of rows (any day, any count)
  const [slots, setSlots] = useState<SlotRow[]>([
    { day: 1, start: '09:00', end: '17:00' },
  ]);

  const addSlot = () =>
    setSlots((prev) => [...prev, { day: 1, start: '09:00', end: '17:00' }]);

  const removeSlot = (idx: number) =>
    setSlots((prev) => prev.filter((_, i) => i !== idx));

  const updateSlot = (idx: number, patch: Partial<SlotRow>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const mut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return updateScheduleWindow(templateId, target!.id, {
          day_of_week: day,
          start_time: start,
          end_time: end,
        });
      }
      // Add mode — fire all sequentially
      for (const s of slots) {
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
    onError: (e: any) => alert(e?.response?.data?.error || 'Save failed'),
  });

  // ── Edit mode UI ──────────────────────────────────────────
  if (isEdit) {
    const valid = start < end;
    return (
      <Modal open onClose={onClose} title='Edit Window'>
        <div className='space-y-4'>
          <div>
            <label className='block text-xs text-gray-500 mb-1'>Day</label>
            <select
              value={day}
              onChange={(e) => setDay(parseInt(e.target.value, 10))}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
            >
              {DAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs text-gray-500 mb-1'>Start</label>
              <input type='time' value={start}
                onChange={(e) => setStart(e.target.value)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
              />
            </div>
            <div>
              <label className='block text-xs text-gray-500 mb-1'>End</label>
              <input type='time' value={end}
                onChange={(e) => setEnd(e.target.value)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
              />
            </div>
          </div>
          {!valid && <p className='text-xs text-red-600'>End must be after start.</p>}
          <div className='flex gap-2 justify-end pt-2'>
            <Button variant='secondary' onClick={onClose}>Cancel</Button>
            <Button loading={mut.isPending} disabled={!valid} onClick={() => mut.mutate()}>Save</Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Add mode UI (multi-slot) ──────────────────────────────
  const allValid = slots.every((s) => s.start < s.end);

  return (
    <Modal open onClose={onClose} title='Add Schedule Windows'>
      <div className='space-y-3'>
        {/* Column headers */}
        <div className='grid gap-2 items-center' style={{ gridTemplateColumns: '1fr 110px 110px 32px' }}>
          <span className='text-xs font-medium text-gray-400'>Day</span>
          <span className='text-xs font-medium text-gray-400'>Start</span>
          <span className='text-xs font-medium text-gray-400'>End</span>
          <span />
        </div>

        {/* Slot rows — scrollable */}
        <div className='space-y-2 overflow-y-auto pr-1' style={{ maxHeight: '280px' }}>
        {slots.map((slot, idx) => {
          const rowInvalid = slot.start >= slot.end;
          return (
            <div key={idx} className='grid gap-2 items-center' style={{ gridTemplateColumns: '1fr 110px 110px 32px' }}>
              <select
                value={slot.day}
                onChange={(e) => updateSlot(idx, { day: parseInt(e.target.value, 10) })}
                className='border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full'
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>

              <input
                type='time'
                value={slot.start}
                onChange={(e) => updateSlot(idx, { start: e.target.value })}
                className={`border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full ${rowInvalid ? 'border-red-400' : 'border-gray-200'}`}
              />

              <input
                type='time'
                value={slot.end}
                onChange={(e) => updateSlot(idx, { end: e.target.value })}
                className={`border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full ${rowInvalid ? 'border-red-400' : 'border-gray-200'}`}
              />

              <button
                type='button'
                onClick={() => removeSlot(idx)}
                disabled={slots.length === 1}
                className='p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed'
                title='Remove'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          );
        })}
        </div>

        {/* Validation hint */}
        {!allValid && (
          <p className='text-xs text-red-600'>Each end time must be after its start time.</p>
        )}

        {/* Add another slot */}
        <button
          type='button'
          onClick={addSlot}
          className='flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium pt-1'
        >
          <span className='w-5 h-5 rounded-full bg-indigo-600 hover:bg-indigo-800 flex items-center justify-center flex-shrink-0'>
            <Plus className='w-3 h-3 text-white' strokeWidth={3} />
          </span>
          Add another slot
        </button>

        <div className='flex gap-2 justify-end pt-3 border-t border-gray-100'>
          <Button variant='secondary' onClick={onClose}>Cancel</Button>
          <Button
            loading={mut.isPending}
            disabled={!allValid}
            onClick={() => mut.mutate()}
          >
            {slots.length === 1 ? 'Add Window' : `Add ${slots.length} Windows`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── TimezonePicker: searchable combobox over the timezones catalog ─
// Pulls the full list once via react-query (cached), filters client-side as
// the user types, and keeps the dropdown anchored under the input.
function TimezonePicker({
  label,
  value,
  onChange,
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

  // Close the dropdown on outside click.
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
        <label className='block text-xs text-gray-500 mb-1'>{label}</label>
      )}
      <div className='relative'>
        <input
          value={display}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          placeholder='Search timezone…'
          className='w-full border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
        />
        <ChevronDown className='w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none' />
      </div>
      {open && (
        <div className='absolute z-50 mt-1 w-full max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg'>
          {filtered.length === 0 ? (
            <div className='px-3 py-2 text-xs text-gray-400'>No matches</div>
          ) : (
            filtered.map((z) => (
              <button
                key={z}
                type='button'
                onClick={() => {
                  onChange(z);
                  setOpen(false);
                  setQuery('');
                }}
                className='w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 flex items-center justify-between'
              >
                <span className='text-gray-700'>{z}</span>
                {z === value && (
                  <Check className='w-3.5 h-3.5 text-indigo-600' />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}