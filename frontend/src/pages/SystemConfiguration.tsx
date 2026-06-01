import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, PageLoader } from '../components/ui';
import {
  getSystemConfig,
  updateSystemConfig,
  getGlobalAttributes,
  updateGlobalAttribute,
  deleteGlobalAttribute,
  createGlobalAttribute,
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
  RefreshCw,
  Database,
  Lock,
  Trash2,
  AlertCircle,
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
      <div className='flex items-start gap-4 p-5 border-b border-gray-100'>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          {icon}
        </div>
        <div className='flex-1 min-w-0'>
          <h2 className='text-base font-semibold text-[#1A0F00]'>{title}</h2>
          <p className='text-xs text-gray-400 mt-0.5'>{description}</p>
        </div>
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
      <div className='p-5 space-y-4'>{children(editing)}</div>
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type Day = typeof DAYS[number];

const DAY_TO_DOW: Record<Day, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const DEFAULT_DAY_TIMES: Record<Day, { start: string; end: string }> = {
  Sunday:    { start: '00:00', end: '23:00' },
  Monday:    { start: '00:00', end: '23:00' },
  Tuesday:   { start: '00:00', end: '23:00' },
  Wednesday: { start: '00:00', end: '23:00' },
  Thursday:  { start: '00:00', end: '23:00' },
  Friday:    { start: '00:00', end: '23:00' },
  Saturday:  { start: '00:00', end: '23:00' },
};

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

const CUSTOM_DATA_TYPES = [
  'STRING', 'INTEGER', 'FLOAT', 'LONG', 'PHONE', 'EMAIL', 'TIMESTAMP', 'BOOLEAN',
] as const;

// ─── Manage Attributes Section ────────────────────────────────────────────────
function ManageAttributesSection() {
  const qc = useQueryClient();

  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const [editingAttr, setEditingAttr] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string; data_type: string;
    is_private: boolean; is_masked_reports: boolean; is_editable_agent: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', data_type: 'STRING',
    is_private: false, is_masked_reports: false, is_editable_agent: true,
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const { data: attrData, isLoading } = useQuery({
    queryKey: ['global-attributes'],
    queryFn: () => getGlobalAttributes(),
  });

  const allAttrs: any[] = attrData?.data || [];
  const systemAttrs = allAttrs.filter(
    (a: any) => a.source === 'system' || (a.source === 'library' && a.field_type !== 'custom'),
  );
  const customAttrs = allAttrs.filter(
    (a: any) => a.source === 'custom_list' || a.field_type === 'custom',
  );

  const filterAttrs = (list: any[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (a: any) =>
        a.name?.toLowerCase().includes(q) ||
        a.field_key?.toLowerCase().includes(q) ||
        a.data_type?.toLowerCase().includes(q),
    );
  };

  const filteredSystem = filterAttrs(systemAttrs);
  const filteredCustom = filterAttrs(customAttrs);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredCustom.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCustom = filteredCustom.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pageIds = pagedCustom.map((a: any) => a.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id: string) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id: string) => selectedIds.has(id));
  const anySelected = selectedIds.size > 0;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const togglePageAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.add(id));
        return next;
      });
    }
  };

  const toFieldKey = (s: string) =>
    s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const flash = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 2500);
  };

  const updateAttrMut = useMutation({
    mutationFn: () => updateGlobalAttribute(editingAttr!.id, editForm!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['global-attributes'] });
      flash('✓ Attribute updated');
      setEditingAttr(null);
      setEditForm(null);
    },
  });

  const deleteAttrMut = useMutation({
    mutationFn: (id: string) => deleteGlobalAttribute(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['global-attributes'] });
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget?.id); return n; });
      setDeleteTarget(null);
      flash('✓ Attribute deleted');
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await deleteGlobalAttribute(id);
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ['global-attributes'] });
      setSelectedIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      setBulkDeleteOpen(false);
      flash(`✓ ${ids.length} attribute${ids.length > 1 ? 's' : ''} deleted`);
    },
  });

  const deleteAllMut = useMutation({
    mutationFn: async () => {
      for (const a of filteredCustom) await deleteGlobalAttribute(a.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['global-attributes'] });
      setSelectedIds(new Set());
      setDeleteAllOpen(false);
      flash('✓ All custom attributes deleted');
    },
  });

  const createAttrMut = useMutation({
  mutationFn: (body: any) => createGlobalAttribute(body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['global-attributes'] });
    setCreateOpen(false);
    setCreateForm({ name: '', data_type: 'STRING', is_private: false, is_masked_reports: false, is_editable_agent: true });
    setCreateError(null);
    flash('✓ Attribute created');
  },
  onError: (e: any) => setCreateError(e?.response?.data?.error || e?.message || 'Failed to create attribute'),
});

  const openEdit = (attr: any) => {
    setEditingAttr(attr);
    setEditForm({
      name: attr.name || '',
      data_type: String(attr.data_type || 'STRING').toUpperCase(),
      is_private: !!attr.is_private,
      is_masked_reports: !!attr.is_masked_reports,
      is_editable_agent: !!attr.is_editable_agent,
    });
  };

  const iCls = 'w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition';

  const PermTiles = ({ form, setForm }: { form: any; setForm: (f: any) => void }) => (
    <div>
      <div className='text-xs font-medium text-gray-600 mb-2'>Permissions</div>
      <div className='grid grid-cols-3 gap-2'>
        {(
          [
            ['is_private', 'Private', 'Hidden from agents'],
            ['is_masked_reports', 'Masked for Users', 'Hidden in reports'],
            ['is_editable_agent', 'Agent Can Edit', 'Agents can modify'],
          ] as const
        ).map(([key, label, hint]) => {
          const checked = form[key] as boolean;
          return (
            <label
              key={key}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                checked ? 'border-indigo-200 bg-indigo-50/70' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type='checkbox'
                className='w-4 h-4 accent-indigo-600 mt-0.5 shrink-0'
                checked={checked}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              <span className='min-w-0'>
                <span className='block text-xs font-medium text-gray-800 leading-tight'>{label}</span>
                <span className='block text-[10px] text-gray-400 mt-0.5'>{hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Card shell ── */}
      <div className='rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden'>

        {/* ── Header ── */}
        <div className='flex items-center gap-4 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50'>
          <div className='w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0'>
            <Database className='w-5 h-5 text-white' />
          </div>
          <div className='flex-1 min-w-0'>
            <h2 className='text-base font-semibold text-gray-900'>Manage Attributes</h2>
            <p className='text-xs text-gray-400 mt-0.5'>
              View system attributes and manage custom attributes across all contact lists.
            </p>
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-white hover:bg-gray-50 border border-gray-200 transition flex-shrink-0'
          >
            {collapsed ? (
              <ChevronDown className='w-4 h-4' />
            ) : (
              <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M5 15l7-7 7 7' />
              </svg>
            )}
            
          </button>
        </div>

        {!collapsed && (
          <div className='p-5 space-y-5'>

            {/* ── Flash message ── */}
            {savedMsg && (
              <div className='px-3 py-2 rounded-lg text-sm bg-green-50 text-green-700 border border-green-100'>
                {savedMsg}
              </div>
            )}

            {/* ── Search toolbar ── */}
            <div className='relative'>
              <svg className='w-4 h-4 text-gray-400 absolute left-2.5 top-2.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z' />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search attributes…'
                className='w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white'
              />
              {search && (
                <button onClick={() => setSearch('')} className='absolute right-2.5 top-2.5 text-gray-300 hover:text-gray-500'>
                  <X className='w-4 h-4' />
                </button>
              )}
            </div>

            {isLoading ? (
              <p className='text-sm text-gray-400 py-8 text-center'>Loading attributes…</p>
            ) : (
              <>
                {/* ── System Attributes ── */}
                <div>
                  <div className='flex items-center gap-2 mb-2'>
                    <Lock className='w-3.5 h-3.5 text-amber-500' />
                    <span className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>System Attributes</span>
                    <span className='text-xs text-gray-400'>({filteredSystem.length})</span>
                  </div>
                  <div className='rounded-xl border border-gray-100 overflow-hidden' style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    {filteredSystem.length === 0 ? (
                      <p className='px-4 py-8 text-center text-sm text-gray-400'>No system attributes found</p>
                    ) : (
                      <table className='w-full text-sm'>
                        <thead className='sticky top-0 z-10 bg-gray-50'>
                          <tr className='border-b border-gray-100'>
                            <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Name</th>
                            <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Field Key</th>
                            <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Data Type</th>
                            <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Status</th>
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-gray-50'>
                          {filteredSystem.map((attr: any) => (
                            <tr key={attr.id} className='hover:bg-gray-50/50'>
                              <td className='px-4 py-2.5 font-medium text-gray-800 text-sm'>{attr.name}</td>
                              <td className='px-4 py-2.5'>
                                <code className='text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded'>{attr.field_key}</code>
                              </td>
                              <td className='px-4 py-2.5 text-gray-500 text-xs'>{attr.data_type}</td>
                              <td className='px-4 py-2.5'>
                                <span className='inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-100'>
                                  <Lock className='w-2.5 h-2.5' />
                                  Predefined
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <p className='text-[11px] text-gray-400 mt-1.5 flex items-center gap-1'>
                    <Lock className='w-3 h-3 text-amber-400' />
                    System attributes are predefined and cannot be edited or deleted.
                  </p>
                </div>

                {/* ── Custom Attributes ── */}
                <div>
                  {/* Section header row — LEFT: title/count/selected | RIGHT: buttons */}
                  <div className='flex items-center justify-between mb-2'>
                    {/* LEFT */}
                    <div className='flex items-center gap-2'>
                      <span className='w-3.5 h-3.5 rounded-sm bg-purple-500 flex items-center justify-center'>
                        <svg className='w-2.5 h-2.5 text-white' fill='none' viewBox='0 0 10 10' stroke='currentColor' strokeWidth={1.8}>
                          <path strokeLinecap='round' d='M5 2v6M2 5h6' />
                        </svg>
                      </span>
                      <span className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>Custom Attributes</span>
                      <span className='text-xs text-gray-400'>({filteredCustom.length})</span>
                      {anySelected && (
                        <span className='text-xs text-indigo-600 font-medium'>· {selectedIds.size} selected</span>
                      )}
                    </div>
                    {/* RIGHT */}
                    <div className='flex items-center gap-1.5'>
                      {anySelected && (
                        <button
                          onClick={() => setBulkDeleteOpen(true)}
                          className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition'
                        >
                          <Trash2 className='w-3 h-3' />
                          Delete Selected ({selectedIds.size})
                        </button>
                      )}
                      {filteredCustom.length > 0 && (
                        <button
                          onClick={() => setDeleteAllOpen(true)}
                          className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-white hover:bg-red-50 border border-red-200 transition'
                        >
                          <Trash2 className='w-3 h-3' />
                          Delete All
                        </button>
                      )}
                      <button
                        onClick={() => setCreateOpen(true)}
                        className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition'
                      >
                        <svg className='w-3 h-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                          <path strokeLinecap='round' strokeLinejoin='round' d='M12 4v16m8-8H4' />
                        </svg>
                        New Attribute
                      </button>
                    </div>
                  </div>

                  <div className='rounded-xl border border-gray-100 overflow-hidden'>
                    {filteredCustom.length === 0 ? (
                      <p className='px-4 py-10 text-center text-sm text-gray-400'>
                        {search ? 'No custom attributes match your search' : 'No custom attributes yet — click "New Attribute" to create one'}
                      </p>
                    ) : (
                      <>
                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                          <table className='w-full text-sm'>
                            <thead className='sticky top-0 z-10 bg-gray-50'>
                              <tr className='border-b border-gray-100'>
                                <th className='px-4 py-2.5 w-10'>
                                  <input
                                    type='checkbox'
                                    className='w-4 h-4 accent-indigo-600 rounded cursor-pointer transition-opacity'
                                    checked={allPageSelected}
                                    ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                                    onChange={togglePageAll}
                                    style={{ opacity: anySelected ? 1 : undefined }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                                    onMouseLeave={(e) => { if (!anySelected) (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                                  />
                                </th>
                                <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Name</th>
                                <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Field Key</th>
                                <th className='px-4 py-2.5 text-left text-xs font-medium text-gray-500'>Data Type</th>
                                <th className='px-4 py-2.5 text-right text-xs font-medium text-gray-500'>Actions</th>
                              </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-50'>
                              {pagedCustom.map((attr: any) => {
                                const isSelected = selectedIds.has(attr.id);
                                const isHovered = hoveredId === attr.id;
                                return (
                                  <tr
                                    key={attr.id}
                                    onMouseEnter={() => setHoveredId(attr.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    className={`transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-gray-50/60'}`}
                                  >
                                    <td className='px-4 py-2.5'>
                                      <input
                                        type='checkbox'
                                        className='w-4 h-4 accent-indigo-600 rounded cursor-pointer transition-opacity'
                                        style={{ opacity: isSelected || isHovered ? 1 : 0 }}
                                        checked={isSelected}
                                        onChange={() => toggleSelect(attr.id)}
                                      />
                                    </td>
                                    <td className='px-4 py-2.5 font-medium text-gray-800'>
                                      <span className='flex items-center gap-1.5'>
                                        {attr.name}
                                        <span className='text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium'>
                                          custom
                                        </span>
                                      </span>
                                    </td>
                                    <td className='px-4 py-2.5'>
                                      <code className='text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded'>{attr.field_key}</code>
                                    </td>
                                    <td className='px-4 py-2.5 text-gray-500 text-xs'>{attr.data_type}</td>
                                    <td className='px-4 py-2.5'>
                                      <span className='flex items-center justify-end gap-1.5'>
                                        <button
                                          onClick={() => openEdit(attr)}
                                          className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                                        >
                                          <Pencil className='w-3 h-3' />
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => setDeleteTarget(attr)}
                                          className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                                        >
                                          <Trash2 className='w-3 h-3' />
                                          Delete
                                        </button>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className='flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/60'>
                            <span className='text-xs text-gray-400'>
                              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredCustom.length)} of {filteredCustom.length}
                            </span>
                            <div className='flex items-center gap-1'>
                              <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                                className='w-7 h-7 flex items-center justify-center rounded-lg text-xs border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition'
                              >‹</button>
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setPage(p)}
                                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs border transition ${
                                    p === safePage
                                      ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                                      : 'border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600'
                                  }`}
                                >{p}</button>
                              ))}
                              <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                                className='w-7 h-7 flex items-center justify-center rounded-lg text-xs border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition'
                              >›</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {createOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
          onClick={() => { setCreateOpen(false); setCreateError(null); }}>
          <div className='bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-indigo-50/60'>
              <div>
                <h3 className='font-semibold text-gray-900'>New Custom Attribute</h3>
                <p className='text-xs text-gray-400 mt-0.5'>
                  {createForm.name.trim()
                    ? <>field_key: <code className='text-gray-600'>{toFieldKey(createForm.name)}</code></>
                    : 'field_key is auto-generated from the name'}
                </p>
              </div>
              <button onClick={() => { setCreateOpen(false); setCreateError(null); }}
                className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Attribute Name *</label>
                <input value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder='e.g. Customer Score' className={iCls} />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Data Type</label>
                <select value={createForm.data_type}
                  onChange={(e) => setCreateForm({ ...createForm, data_type: e.target.value })}
                  className={iCls}>
                  {CUSTOM_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <PermTiles form={createForm} setForm={setCreateForm} />
              {createError && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <AlertCircle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
                  <p className='text-xs text-red-700'>{createError}</p>
                </div>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <button onClick={() => { setCreateOpen(false); setCreateError(null); }}
                className='px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition'>
                Cancel
              </button>
              <button disabled={createAttrMut.isPending || !createForm.name.trim()}
                onClick={() => createAttrMut.mutate(createForm)}
                className='flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-60'>
                <Save className='w-3.5 h-3.5' />
                {createAttrMut.isPending ? 'Creating…' : 'Create Attribute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingAttr && editForm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
          onClick={() => { setEditingAttr(null); setEditForm(null); }}>
          <div className='bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-indigo-50/60'>
              <div>
                <h3 className='font-semibold text-gray-900'>Edit Custom Attribute</h3>
                <p className='text-xs text-gray-400 mt-0.5'>
                  field_key: <code className='text-gray-600'>{editingAttr.field_key}</code> (locked)
                </p>
              </div>
              <button onClick={() => { setEditingAttr(null); setEditForm(null); }}
                className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Attribute Name *</label>
                <input value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={iCls} />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Data Type</label>
                <select value={editForm.data_type}
                  onChange={(e) => setEditForm({ ...editForm, data_type: e.target.value })}
                  className={iCls}>
                  {CUSTOM_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <PermTiles form={editForm} setForm={setEditForm} />
              {updateAttrMut.isError && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <AlertCircle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
                  <p className='text-xs text-red-700'>
                    {(updateAttrMut.error as any)?.response?.data?.error || 'Could not save changes.'}
                  </p>
                </div>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <button onClick={() => { setEditingAttr(null); setEditForm(null); }}
                className='px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition'>
                Cancel
              </button>
              <button disabled={updateAttrMut.isPending} onClick={() => updateAttrMut.mutate()}
                className='flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-60'>
                <Save className='w-3.5 h-3.5' />
                {updateAttrMut.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Single Delete Modal ── */}
      {deleteTarget && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete Custom Attribute</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button onClick={() => { setDeleteTarget(null); deleteAttrMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>Delete "{deleteTarget.name}"?</p>
                  <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                    Permanently removes this attribute and all stored values from every contact list.
                  </p>
                </div>
              </div>
              {deleteAttrMut.isError && (
                <div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
                  Could not delete this attribute. Please try again.
                </div>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <button onClick={() => { setDeleteTarget(null); deleteAttrMut.reset(); }}
                className='px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition'>
                Cancel
              </button>
              <button disabled={deleteAttrMut.isPending}
                onClick={() => deleteAttrMut.mutate(deleteTarget.id)}
                className='flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-60'>
                <Trash2 className='w-3.5 h-3.5' />
                {deleteAttrMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Selected Modal ── */}
      {bulkDeleteOpen && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>
                  Delete {selectedIds.size} Attribute{selectedIds.size > 1 ? 's' : ''}
                </h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button onClick={() => { setBulkDeleteOpen(false); bulkDeleteMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>
                    Delete {selectedIds.size} selected attribute{selectedIds.size > 1 ? 's' : ''}?
                  </p>
                  <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                    All stored values will be permanently removed from every contact list they belong to.
                  </p>
                </div>
              </div>
              {bulkDeleteMut.isError && (
                <div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
                  Could not delete some attributes. Please try again.
                </div>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <button onClick={() => { setBulkDeleteOpen(false); bulkDeleteMut.reset(); }}
                className='px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition'>
                Cancel
              </button>
              <button disabled={bulkDeleteMut.isPending}
                onClick={() => bulkDeleteMut.mutate([...selectedIds])}
                className='flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-60'>
                <Trash2 className='w-3.5 h-3.5' />
                {bulkDeleteMut.isPending ? 'Deleting…' : `Delete ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete All Modal ── */}
      {deleteAllOpen && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete All Custom Attributes</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button onClick={() => { setDeleteAllOpen(false); deleteAllMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>
                    Delete all {filteredCustom.length} custom attribute{filteredCustom.length > 1 ? 's' : ''}?
                  </p>
                  <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                    {search ? `This will delete all ${filteredCustom.length} attributes matching your current search. ` : ''}
                    All stored values will be permanently removed from every contact list.
                  </p>
                </div>
              </div>
              {deleteAllMut.isError && (
                <div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
                  Could not delete all attributes. Please try again.
                </div>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <button onClick={() => { setDeleteAllOpen(false); deleteAllMut.reset(); }}
                className='px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition'>
                Cancel
              </button>
              <button disabled={deleteAllMut.isPending}
                onClick={() => deleteAllMut.mutate()}
                className='flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-60'>
                <Trash2 className='w-3.5 h-3.5' />
                {deleteAllMut.isPending ? 'Deleting…' : `Delete All ${filteredCustom.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SystemConfigurationPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery<SystemConfig>({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
  });

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

  const [guardEnabled, setGuardEnabled] = useState(true);
  const [guardDays, setGuardDays] = useState<Day[]>([...DAYS]);
  const [dayTimes, setDayTimes] = useState<Record<Day, { start: string; end: string }>>(DEFAULT_DAY_TIMES);

  const [tgEdit, setTgEdit] = useState(false);
  const [tgDraftEnabled, setTgDraftEnabled] = useState(true);
  const [tgDraftDays, setTgDraftDays] = useState<Day[]>([]);
  const [tgDraftTimes, setTgDraftTimes] = useState<Record<Day, { start: string; end: string }>>({ ...DEFAULT_DAY_TIMES });
  const [tgSaved, setTgSaved] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

  const [injectInterval, setInjectInterval] = useState('5');
  const [intEdit, setIntEdit] = useState(false);
  const [intDraft, setIntDraft] = useState('5');
  const [intSaved, setIntSaved] = useState(false);
  const [intError, setIntError] = useState<string | null>(null);

  const [recheckInterval, setRecheckInterval] = useState('60');
  const [rcEdit, setRcEdit] = useState(false);
  const [rcDraft, setRcDraft] = useState('60');
  const [rcSaved, setRcSaved] = useState(false);
  const [rcError, setRcError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    setInjectInterval(String(config.inject_poll_minutes));
    setRecheckInterval(String(config.recheck_interval));
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
      await updateMut.mutateAsync({ time_guard_enabled: tgDraftEnabled, time_guard_windows: windows });
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

  const openRcEdit = () => { setRcDraft(recheckInterval); setRcError(null); setRcEdit(true); };
  const cancelRcEdit = () => { setRcError(null); setRcEdit(false); };
  const saveRc = async () => {
    setRcError(null);
    const n = parseInt(rcDraft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setRcError('Recheck interval must be a positive number.');
      return;
    }
    try {
      await updateMut.mutateAsync({ recheck_interval: n });
      setRcSaved(true);
      setRcEdit(false);
      setTimeout(() => setRcSaved(false), 3000);
    } catch (e: any) {
      setRcError(e?.response?.data?.error || 'Failed to save recheck interval.');
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div>
        <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
          System Configuration
        </h1>
        <p className='text-sm text-gray-400 mt-0.5'>Platform-wide settings and integrations.</p>
      </div>

      {/* ── 1. Timezone ── */}
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

      {/* ── 2. Time Guard ── */}
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
                          style={{ background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC' }}
                        >
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
                              active ? 'bg-white border-violet-200 shadow-sm' : 'bg-gray-100 border-gray-200'
                            }`}
                          >
                            <button
                              onClick={() => editing && toggleDraftDay(day)}
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
                                active ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-300'
                              } ${editing ? 'cursor-pointer hover:border-violet-400' : 'cursor-default'}`}
                            >
                              {active && (
                                <svg className='w-3 h-3' fill='none' viewBox='0 0 12 12'>
                                  <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
                                </svg>
                              )}
                            </button>
                            <span className={`text-sm font-medium w-10 flex-shrink-0 ${active ? 'text-gray-800' : 'text-gray-400'}`}>
                              {day.slice(0, 3)}
                            </span>
                            <div className='flex items-center gap-2'>
                              <input
                                type='time'
                                value={times.start}
                                readOnly={!editing || !active}
                                onChange={(e) => updateDraftTime(day, 'start', e.target.value)}
                                className={`px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
                                  active ? 'border-gray-200 bg-white text-gray-800' : 'border-transparent bg-transparent text-gray-400'
                                }`}
                              />
                              <span className='text-xs text-gray-400'>to</span>
                              <input
                                type='time'
                                value={times.end}
                                readOnly={!editing || !active}
                                onChange={(e) => updateDraftTime(day, 'end', e.target.value)}
                                className={`px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
                                  active ? 'border-gray-200 bg-white text-gray-800' : 'border-transparent bg-transparent text-gray-400'
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
                    {editing && tgError && <p className='text-xs text-red-600 mt-2'>{tgError}</p>}
                  </div>
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

      {/* ── 3. Injection Interval ── */}
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
            {editing && intError && <p className='text-xs text-red-600'>{intError}</p>}
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

      {/* ── 4. Recheck Interval ── */}
      <SectionCard
        icon={<RefreshCw className='w-5 h-5 text-white' />}
        iconColor='bg-sky-500'
        title='Empty Queue Recheck Interval'
        description='How long the backend waits before rechecking the queue after all contacts have been exhausted by agents.'
        editing={rcEdit}
        onEditToggle={openRcEdit}
        onSave={saveRc}
        onCancel={cancelRcEdit}
        saving={updateMut.isPending}
        saved={rcSaved}
      >
        {(editing) => (
          <>
            <SettingNumber
              label='Recheck Interval'
              description='Wait time before the backend re-scans the queue once it is fully exhausted.'
              value={editing ? rcDraft : recheckInterval}
              onChange={setRcDraft}
              unit='seconds'
              disabled={!editing}
            />
            {editing && rcError && <p className='text-xs text-red-600'>{rcError}</p>}
            <div className='rounded-lg bg-sky-50 border border-sky-100 px-4 py-3'>
              <p className='text-xs text-sky-700'>
                <span className='font-semibold'>Current interval:</span>{' '}
                {recheckInterval || '—'} second{recheckInterval === '1' ? '' : 's'}
              </p>
              <p className='text-xs text-sky-600 mt-0.5'>
                Once all queued contacts are completed, the backend will wait this duration before checking for new contacts again.
              </p>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── 5. Manage Attributes ── */}
      <ManageAttributesSection />
    </div>
  );
}