import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, PageLoader } from '../components/ui';
import {
  getSystemConfig,
  updateSystemConfig,
  type SystemConfig,
} from '../api/client';
import {
  Globe,
  ShieldCheck,
  Timer,
  Save,
  CheckCircle2,
  ChevronDown,
  Pencil,
  X,
} from 'lucide-react';

// ─── Inline select ────────────────────────────────────────────────────────────
function SettingSelect({
  label,
  description,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className='block text-sm font-medium text-gray-800 mb-0.5'>{label}</label>
      {description && <p className='text-xs text-gray-400 mb-2'>{description}</p>}
      <div className='relative'>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className='w-full appearance-none px-3 py-2 pr-9 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none' />
      </div>
    </div>
  );
}

// ─── Number input ─────────────────────────────────────────────────────────────
function SettingNumber({
  label,
  description,
  value,
  onChange,
  min,
  max,
  unit,
  disabled,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className='block text-sm font-medium text-gray-800 mb-0.5'>{label}</label>
      {description && <p className='text-xs text-gray-400 mb-2'>{description}</p>}
      <div className='flex items-center gap-2'>
        <input
          type='number'
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className='w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
        />
        {unit && <span className='text-sm text-gray-400'>{unit}</span>}
      </div>
      {min !== undefined && max !== undefined && (
        <p className='text-xs text-gray-400 mt-1'>Allowed range: {min} – {max}</p>
      )}
    </div>
  );
}

// ─── Section card with edit toggle ───────────────────────────────────────────
interface SectionCardProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  children: (editing: boolean) => React.ReactNode;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saved?: boolean;
  editing: boolean;
  onEditToggle: () => void;
}

function SectionCard({
  icon,
  iconColor,
  title,
  description,
  children,
  onSave,
  onCancel,
  saving,
  saved,
  editing,
  onEditToggle,
}: SectionCardProps): JSX.Element {
  return (
    <Card className='overflow-hidden'>
      {/* Header */}
      <div className='flex items-start gap-4 p-5 border-b border-gray-100'>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          {icon}
        </div>
        <div className='flex-1 min-w-0'>
          <h2 className='text-base font-semibold text-[#1A0F00]'>{title}</h2>
          <p className='text-xs text-gray-400 mt-0.5'>{description}</p>
        </div>
        {/* Edit / Close button top-right */}
        {!editing ? (
          <button
            onClick={onEditToggle}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 transition flex-shrink-0'
          >
            <Pencil className='w-3 h-3' />
            Edit
          </button>
        ) : (
          <button
            onClick={onCancel}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition flex-shrink-0'
          >
            <X className='w-3 h-3' />
            Cancel
          </button>
        )}
      </div>

      {/* Body */}
      <div className='p-5 space-y-4'>
        {children(editing)}
      </div>

      {/* Footer — only visible while editing */}
      {editing && (
        <div className='px-5 pb-5 flex items-center justify-end gap-3'>
          {saved && (
            <span className='flex items-center gap-1.5 text-xs text-green-600 font-medium'>
              <CheckCircle2 className='w-3.5 h-3.5' />
              Saved
            </span>
          )}
          <button
            onClick={onSave}
            disabled={saving}
            className='flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition disabled:opacity-60'
          >
            <Save className='w-3.5 h-3.5' />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── Timezones ────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York', label: 'America/New_York — Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'America/Chicago — Central Time (CT)' },
  { value: 'America/Denver', label: 'America/Denver — Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles — Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'America/Phoenix — Arizona (no DST)' },
  { value: 'America/Anchorage', label: 'America/Anchorage — Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu — Hawaii Time (HST)' },
  { value: 'America/Toronto', label: 'America/Toronto — Eastern Time (Canada)' },
  { value: 'America/Vancouver', label: 'America/Vancouver — Pacific Time (Canada)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo — Brasília Time (BRT)' },
  { value: 'Europe/London', label: 'Europe/London — Greenwich Mean Time (GMT)' },
  { value: 'Europe/Paris', label: 'Europe/Paris — Central European Time (CET)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin — Central European Time (CET)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid — Central European Time (CET)' },
  { value: 'Europe/Rome', label: 'Europe/Rome — Central European Time (CET)' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam — Central European Time (CET)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow — Moscow Standard Time (MSK)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata — India Standard Time (IST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai — Gulf Standard Time (GST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore — Singapore Time (SGT)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai — China Standard Time (CST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo — Japan Standard Time (JST)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul — Korea Standard Time (KST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney — Australian Eastern Time (AEST)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne — Australian Eastern Time (AEST)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland — New Zealand Time (NZST)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo — Eastern European Time (EET)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg — South Africa Standard Time (SAST)' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',] as const;
type Day = typeof DAYS[number];

// Day-of-week index used by both the API (`time_guard_windows` keys) and
// schedule_windows.day_of_week. ISO Monday-first to match the UI ordering.
const DAY_TO_DOW: Record<Day, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// Default time per day shown until a real config is loaded.
const DEFAULT_DAY_TIMES: Record<Day, { start: string; end: string }> = {
  Sunday:    { start: '00:00', end: '23:00' },
  Monday:    { start: '00:00', end: '23:00' },
  Tuesday:   { start: '00:00', end: '23:00' },
  Wednesday: { start: '00:00', end: '23:00' },
  Thursday:  { start: '00:00', end: '23:00' },
  Friday:    { start: '00:00', end: '23:00' },
  Saturday:  { start: '00:00', end: '23:00' },
};

// Derive UI state from a SystemConfig payload. Days absent from the JSONB
// blob are not permitted while the guard is on.
function deriveGuardState(cfg: SystemConfig) {
  const days: Day[] = [];
  const times: Record<Day, { start: string; end: string }> = { ...DEFAULT_DAY_TIMES };
  for (const d of DAYS) {
    const dow = DAY_TO_DOW[d];
    const w = cfg.time_guard_windows?.[String(dow)];
    if (w) {
      days.push(d);
      times[d] = { start: String(w.start).slice(0, 5), end: String(w.end).slice(0, 5) };
    }
  }
  return { enabled: !!cfg.time_guard_enabled, days, times };
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SystemConfigurationPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery<SystemConfig>({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
  });

  // ── Timezone (display-only placeholder; not persisted on system_config) ─
  const [timezone, setTimezone] = useState('UTC');
  const [tzEdit, setTzEdit] = useState(false);
  const [tzDraft, setTzDraft] = useState('UTC');
  const [tzSaving, setTzSaving] = useState(false);
  const [tzSaved, setTzSaved] = useState(false);

  const openTzEdit = () => { setTzDraft(timezone); setTzEdit(true); };
  const cancelTzEdit = () => { setTzDraft(timezone); setTzEdit(false); };
  const saveTz = () => {
    setTzSaving(true);
    setTimeout(() => {
      setTimezone(tzDraft);
      setTzSaving(false);
      setTzSaved(true);
      setTzEdit(false);
      setTimeout(() => setTzSaved(false), 3000);
    }, 800);
  };

  // ── Time Guard (server-backed) ─────────────────────────────────────────
  const [guardEnabled, setGuardEnabled] = useState(true);
  const [guardDays, setGuardDays] = useState<Day[]>([...DAYS]);
  const [dayTimes, setDayTimes] = useState<Record<Day, { start: string; end: string }>>(DEFAULT_DAY_TIMES);

  const [tgEdit, setTgEdit] = useState(false);
  const [tgDraftEnabled, setTgDraftEnabled] = useState(true);
  const [tgDraftDays, setTgDraftDays] = useState<Day[]>([]);
  const [tgDraftTimes, setTgDraftTimes] = useState<Record<Day, { start: string; end: string }>>({ ...DEFAULT_DAY_TIMES });
  const [tgSaved, setTgSaved] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

  // ── Injection Interval (server-backed) ─────────────────────────────────
  const [injectInterval, setInjectInterval] = useState('5');
  const [intEdit, setIntEdit] = useState(false);
  const [intDraft, setIntDraft] = useState('5');
  const [intSaved, setIntSaved] = useState(false);
  const [intError, setIntError] = useState<string | null>(null);

  // Hydrate local state once the fetch resolves (or after a successful save).
  useEffect(() => {
    if (!config) return;
    setInjectInterval(String(config.inject_poll_minutes));
    const g = deriveGuardState(config);
    setGuardEnabled(g.enabled);
    setGuardDays(g.days);
    setDayTimes(g.times);
  }, [config]);

  const updateMut = useMutation({
    mutationFn: (body: Parameters<typeof updateSystemConfig>[0]) => updateSystemConfig(body),
    onSuccess: (fresh) => {
      qc.setQueryData(['system-config'], fresh);
    },
  });

  const openTgEdit = () => {
    setTgDraftEnabled(guardEnabled);
    setTgDraftDays([...guardDays]);
    setTgDraftTimes(JSON.parse(JSON.stringify(dayTimes)));
    setTgError(null);
    setTgEdit(true);
  };
  const cancelTgEdit = () => { setTgError(null); setTgEdit(false); };
  const saveTg = async () => {
    setTgError(null);
    const windows: Record<string, { start: string; end: string }> = {};
    for (const d of tgDraftDays) {
      const t = tgDraftTimes[d];
      if (!t?.start || !t?.end || t.start >= t.end) {
        setTgError(`Invalid time range for ${d}.`);
        return;
      }
      windows[String(DAY_TO_DOW[d])] = { start: t.start, end: t.end };
    }
    try {
      await updateMut.mutateAsync({
        time_guard_enabled: tgDraftEnabled,
        time_guard_windows: windows,
      });
      setTgSaved(true);
      setTgEdit(false);
      setTimeout(() => setTgSaved(false), 3000);
    } catch (e: any) {
      setTgError(e?.response?.data?.error || 'Failed to save Time Guard.');
    }
  };

  const toggleDraftDay = (day: Day) =>
    setTgDraftDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  const updateDraftTime = (day: Day, field: 'start' | 'end', val: string) =>
    setTgDraftTimes((prev) => ({ ...prev, [day]: { ...prev[day], [field]: val } }));

  const openIntEdit = () => { setIntDraft(injectInterval); setIntError(null); setIntEdit(true); };
  const cancelIntEdit = () => { setIntError(null); setIntEdit(false); };
  const saveInt = async () => {
    setIntError(null);
    const n = parseInt(intDraft, 10);
    if (!Number.isFinite(n) || n < 1 || n > 1440) {
      setIntError('Interval must be between 1 and 1440 minutes.');
      return;
    }
    try {
      await updateMut.mutateAsync({ inject_poll_minutes: n });
      setIntSaved(true);
      setIntEdit(false);
      setTimeout(() => setIntSaved(false), 3000);
    } catch (e: any) {
      setIntError(e?.response?.data?.error || 'Failed to save interval.');
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>

      {/* Page header */}
      <div>
        <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
          System Configuration
        </h1>
        <p className='text-sm text-gray-400 mt-0.5'>Platform-wide settings and integrations.</p>
      </div>

      {/* ── 1. Timezone ───────────────────────────────────────────────────── */}
      <SectionCard
        icon={<Globe className='w-5 h-5 text-white' />}
        iconColor='bg-violet-500'
        title='Default Timezone'
        description='The platform timezone used for scheduling, reporting, and time-based rules when no campaign-level override is set.'
        editing={tzEdit}
        onEditToggle={openTzEdit}
        onSave={saveTz}
        onCancel={cancelTzEdit}
        saving={tzSaving}
        saved={tzSaved}
      >
        {(editing) => (
          <>
            <SettingSelect
              label='Timezone'
              description='Select the IANA timezone that applies platform-wide.'
              value={editing ? tzDraft : timezone}
              onChange={setTzDraft}
              options={TIMEZONES}
              disabled={!editing}
            />
            <div className='rounded-lg bg-violet-50 border border-violet-100 px-4 py-3'>
              <p className='text-xs text-violet-700'>
                <span className='font-semibold'>Current selection:</span>{' '}
                {TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone}
              </p>
              <p className='text-xs text-violet-500 mt-0.5'>
                Local server time will be mapped to this zone for all outbound jobs.
              </p>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── 2. Time Guard ─────────────────────────────────────────────────── */}
      <SectionCard
        icon={<ShieldCheck className='w-5 h-5 text-white' />}
        iconColor='bg-amber-500'
        title='Time Guard'
        description='Restrict outbound dialling to permitted hours per day. Each day can have its own window; default is 00:00–23:00.'
        editing={tgEdit}
        onEditToggle={openTgEdit}
        onSave={saveTg}
        onCancel={cancelTgEdit}
        saving={updateMut.isPending}
        saved={tgSaved}
      >
        {(editing) => {
          const activeEnabled = editing ? tgDraftEnabled : guardEnabled;
          const activeDays = editing ? tgDraftDays : guardDays;
          const activeTimes = editing ? tgDraftTimes : dayTimes;

          return (
            <>
              {/* Enable toggle */}
              <label className='flex items-center gap-3 cursor-pointer'>
                <div
                  onClick={() => editing && setTgDraftEnabled((v) => !v)}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                    activeEnabled ? 'bg-violet-600' : 'bg-gray-200'
                  } ${editing ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      activeEnabled ? 'translate-x-4' : ''
                    }`}
                  />
                </div>
                <div>
                  <div className='text-sm font-medium text-gray-800'>
                    {activeEnabled ? 'Time Guard enabled' : 'Time Guard disabled'}
                  </div>
                  <div className='text-xs text-gray-400'>
                    {activeEnabled
                      ? 'Dialling is restricted to the windows below.'
                      : 'Dialling is allowed at any hour (not recommended).'}
                  </div>
                </div>
              </label>

              {activeEnabled && (
                <>
                  {/* Day selection + per-day times — compact card, not full-width rows */}
                  <div className='rounded-xl bg-gray-50 border border-gray-100 p-4'>
                   <div className='flex items-center justify-between mb-3'>
  <p className='text-sm font-medium text-gray-800'>Permitted Days & Hours</p>
  {editing && (
    <button
      type='button'
      onClick={() =>
        tgDraftDays.length === DAYS.length
          ? setTgDraftDays([])
          : setTgDraftDays([...DAYS])
      }
      className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition'
      style={{
        background: '#EEEDFE',
        color: '#3C3489',
        border: '0.5px solid #AFA9EC',
      }}
    >
      <svg className='w-3.5 h-3.5' fill='none' viewBox='0 0 14 14' stroke='currentColor' strokeWidth='1.8'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M2 4h10M2 7h6M2 10h4' />
      </svg>
      {tgDraftDays.length === DAYS.length ? 'Deselect all' : 'Select all'}
    </button>
  )}
</div>
                    <div className='inline-flex flex-col gap-2 min-w-0'>
                      {DAYS.map((day) => {
                        const active = activeDays.includes(day);
                        const times = activeTimes[day];
                        return (
                          <div
                            key={day}
                            className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border transition ${
                              active
                                ? 'bg-white border-violet-200 shadow-sm'
                                : 'bg-gray-100 border-gray-200'
                            }`}
                          >
                            {/* Checkbox — always clickable */}
                            <button
                              onClick={() => editing && toggleDraftDay(day)}
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
                                active
                                  ? 'bg-violet-600 border-violet-600 text-white'
                                  : 'bg-white border-gray-300'
                              } ${editing ? 'cursor-pointer hover:border-violet-400' : 'cursor-default'}`}
                            >
                              {active && (
                                <svg className='w-3 h-3' fill='none' viewBox='0 0 12 12'>
                                  <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
                                </svg>
                              )}
                            </button>

                            {/* Day name */}
                            <span className={`text-sm font-medium w-10 flex-shrink-0 ${active ? 'text-gray-800' : 'text-gray-400'}`}>
                              {day.slice(0, 3)}
                            </span>

                            {/* Time inputs — no disabled, always styled cleanly */}
                            <div className='flex items-center gap-2'>
                              <input
                                type='time'
                                value={times.start}
                                readOnly={!editing || !active}
                                onChange={(e) => updateDraftTime(day, 'start', e.target.value)}
                                className={`px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
                                  active
                                    ? 'border-gray-200 bg-white text-gray-800'
                                    : 'border-transparent bg-transparent text-gray-400'
                                }`}
                              />
                              <span className='text-xs text-gray-400'>to</span>
                              <input
                                type='time'
                                value={times.end}
                                readOnly={!editing || !active}
                                onChange={(e) => updateDraftTime(day, 'end', e.target.value)}
                                className={`px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
                                  active
                                    ? 'border-gray-200 bg-white text-gray-800'
                                    : 'border-transparent bg-transparent text-gray-400'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {editing && activeDays.length === 0 && (
                      <p className='text-xs text-red-500 mt-2'>Select at least one permitted day.</p>
                    )}
                    {editing && tgError && (
                      <p className='text-xs text-red-600 mt-2'>{tgError}</p>
                    )}
                  </div>

                  {/* Active windows summary — strong readable colors */}
                  <div className='rounded-xl bg-violet-400 px-4 py-3'>
                    <p className='text-xs font-semibold text-white mb-1.5'>Active windows</p>
                    {activeDays.length === 0 ? (
                      <p className='text-xs text-violet-200'>No days selected — all calls blocked.</p>
                    ) : (
                      <div className='flex flex-wrap gap-x-5 gap-y-0.5'>
                        {activeDays.map((d) => (
                          <p key={d} className='text-xs text-violet-100'>
                            <span className='font-semibold text-white'>{d.slice(0, 3)}:</span>{' '}
                            {activeTimes[d].start} – {activeTimes[d].end}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          );
        }}
      </SectionCard>

      {/* ── 3. Injection Interval ─────────────────────────────────────────── */}
      <SectionCard
        icon={<Timer className='w-5 h-5 text-white' />}
        iconColor='bg-green-500'
        title='Contact Injection Interval'
        description="How often the injector scans all infinite campaigns' contact lists for newly-added contacts and queues them for dialling."
        editing={intEdit}
        onEditToggle={openIntEdit}
        onSave={saveInt}
        onCancel={cancelIntEdit}
        saving={updateMut.isPending}
        saved={intSaved}
      >
        {(editing) => (
          <>
            <SettingNumber
              label='Injection Interval'
              description='Interval between each scan of the contact lists. Only runs while a job is active.'
              value={editing ? intDraft : injectInterval}
              onChange={setIntDraft}
              min={1}
              max={1440}
              unit='minutes'
              disabled={!editing}
            />
            {editing && intError && (
              <p className='text-xs text-red-600'>{intError}</p>
            )}
            <div className='rounded-lg bg-green-50 border border-green-100 px-4 py-3'>
              <p className='text-xs text-green-700'>
                <span className='font-semibold'>Current interval:</span>{' '}
                {injectInterval || '—'} minute{injectInterval === '1' ? '' : 's'}
              </p>
              <p className='text-xs text-green-600 mt-0.5'>
                Lower values = faster pickup of new contacts; higher values = less frequent polling overhead.
              </p>
            </div>
          </>
        )}
      </SectionCard>

    </div>
  );
}