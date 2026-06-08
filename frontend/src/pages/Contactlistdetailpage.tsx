import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getContactList,
  getContacts,
  getContactListAttributes,
  addContact,
  deleteContact,
  deleteAllContacts,
  deleteContactsBulk,
  uploadCSV,
  updateContact,
  downloadContactListCsvTemplate,
  runCloudImport,
  listCloudImportConfigs,
  createCloudImportConfig,
  updateCloudImportConfig,
  deleteCloudImportConfig,
  updateCloudImportConfigSchedule,
  type CloudImportConfig,
  type CloudProvider,
} from '../api/client';
import { Card, Button, Modal, Input, Table, Badge, StatCard, PageLoader, EmptyState, Pagination } from '../components/ui';
import { CloudConfigEditor } from '../components/CloudConfigEditor';
import {
  ArrowLeft,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  Settings2,
  Download,
  Upload,
  Cloud,
  MoreVertical,
  Power,
  PowerOff,
  Save,
} from 'lucide-react';


// ─── Cron helpers ────────────────────────────────────────────────────────────

function buildCron(
  freq: string,
  time: string,
  dow: string,
  dom: string,
  custom: string,
): string {
  if (freq === 'custom') return custom.trim();
  const [hh, mm] = (time || '00:00').split(':').map((s) => parseInt(s, 10) || 0);
  if (freq === 'hourly') return `0 * * * *`;
  if (freq === 'daily') return `${mm} ${hh} * * *`;
  if (freq === 'weekly') return `${mm} ${hh} * * ${dow}`;
  return `${mm} ${hh} ${dom} * *`;
}

// ─── MenuItem (kebab dropdown) ────────────────────────────────────────────────
function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type='button'
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition ${disabled
        ? 'text-gray-300 cursor-not-allowed'
        : danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-50'
        }`}
    >
      <span className='shrink-0'>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── BulkGrid ─────────────────────────────────────────────────────────────────
function BulkGrid({
  allFieldDefs,
  rows,
  setRows,
  progress,
  disabled,
}: {
  allFieldDefs: any[];
  rows: Record<string, any>[];
  setRows: React.Dispatch<React.SetStateAction<Record<string, any>[]>>;
  progress: { done: number; failed: number; total: number; errors: { row: number; error: string }[] } | null;
  disabled: boolean;
}) {
  const updateCell = (i: number, key: string, value: any) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, { phone_number: '' }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  const cellCls = 'w-full border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset bg-transparent';
  const thCls = 'text-left text-[11px] uppercase tracking-wide text-gray-500 font-medium px-2 py-2 border-b border-gray-200 bg-gray-50';
  const tdCls = 'border-b border-gray-100 align-top';

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-xs text-gray-500'>Enter one contact per row. Empty rows are skipped.</p>
        <Button variant='secondary' icon={<Plus className='w-3.5 h-3.5' />} onClick={addRow} disabled={disabled}>
          Add Row
        </Button>
      </div>
      <div className='border border-gray-200 rounded-lg overflow-auto max-h-[60vh]'>
        <table className='w-full'>
          <thead className='sticky top-0'>
            <tr>
              <th className={thCls + ' w-10'}>#</th>
              <th className={thCls + ' min-w-[180px]'}>Phone Number *</th>
              {allFieldDefs.map((def: any) => (
                <th key={def.field_key} className={thCls + ' min-w-[160px]'}>
                  {def.name}
                  {def.field_key === 'system_contact_id' && <span className='text-red-500 ml-0.5'>*</span>}
                </th>
              ))}
              <th className={thCls + ' w-10'} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className='hover:bg-gray-50/50'>
                <td className={tdCls + ' text-xs text-gray-400 px-2 py-1.5'}>{i + 1}</td>
                <td className={tdCls}>
                  <input
                    type='tel'
                    value={row.phone_number ?? ''}
                    onChange={(e) => updateCell(i, 'phone_number', e.target.value)}
                    placeholder='+12125550101'
                    disabled={disabled}
                    className={cellCls}
                  />
                </td>
                {allFieldDefs.map((def: any) => {
                  const t = String(def.data_type).toUpperCase();
                  const isNum = t === 'INTEGER' || t === 'LONG' || t === 'FLOAT';
                  const isDate = t === 'TIMESTAMP';
                  const isBool = t === 'BOOLEAN';
                  if (isBool) {
                    return (
                      <td key={def.field_key} className={tdCls + ' px-2 py-1.5'}>
                        <input
                          type='checkbox'
                          checked={!!row[def.field_key]}
                          onChange={(e) => updateCell(i, def.field_key, e.target.checked)}
                          disabled={disabled}
                          className='rounded text-indigo-600'
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={def.field_key} className={tdCls}>
                      <input
                        type={isNum ? 'number' : isDate ? 'datetime-local' : 'text'}
                        value={row[def.field_key] ?? ''}
                        onChange={(e) => updateCell(i, def.field_key, e.target.value)}
                        disabled={disabled}
                        className={cellCls}
                      />
                    </td>
                  );
                })}
                <td className={tdCls + ' px-2 py-1.5 text-right'}>
                  <button
                    onClick={() => removeRow(i)}
                    disabled={disabled || rows.length === 1}
                    className='p-1 text-gray-400 hover:text-red-500 disabled:opacity-30'
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
            {progress.failed > 0 && <span className='text-red-600'> · {progress.failed} failed</span>}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ row: number; phone: string; error: string }[]>([]);
  const [showUploadErrors, setShowUploadErrors] = useState(false);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const anySelected = selectedContactIds.size > 0;

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showDeleteSelected, setShowDeleteSelected] = useState(false);

  // ── Edit contact modal state ──────────────────────────────────────────────
  const [editContactTarget, setEditContactTarget] = useState<any | null>(null);
  const [editContactForm, setEditContactForm] = useState<Record<string, any>>({});

  const [showAddContact, setShowAddContact] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [formValues, setFormValues] = useState<Record<string, any>>({ priority: '100' });
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([{ phone_number: '' }, { phone_number: '' }, { phone_number: '' }]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; failed: number; total: number; errors: { row: number; error: string }[] } | null>(null);

  const [showCloudImport, setShowCloudImport] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [showCfgEditor, setShowCfgEditor] = useState(false);
  const [editingCfg, setEditingCfg] = useState<CloudImportConfig | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ['contact-list', id],
    queryFn: () => getContactList(id!),
  });

  const { data: attrData } = useQuery({
    queryKey: ['contact-list-attributes', id],
    queryFn: () => getContactListAttributes(id!),
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<any>({
    queryKey: ['contacts', id, page, search, pageSize],
    queryFn: () => getContacts(id!, { page, page_size: pageSize, search }),
    placeholderData: keepPreviousData,
  });

  const cloudConfigsQ = useQuery({
    queryKey: ['cloud-import-configs'],
    queryFn: () => listCloudImportConfigs().then((r: any) => r.data),
    enabled: showCloudImport,
  });

  const contacts: any[] = contactsData?.data || [];
  const total: number = contactsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const RESERVED_SYSTEM_KEYS = new Set(['phone_number', 'first_name', 'last_name', 'email', 'timezone', 'alternate_phone_number', 'priority', 'assigned_agent_id']);
  const SYSTEM_KEYS = new Set(['id', 'phone_number', 'contact_list_id', 'created_at', 'updated_at']);

  const attrColumns: { key: string; label: string }[] = useMemo(() => {
    const attrs: any[] = attrData?.data || [];
    return attrs
      .filter((a: any) => a.is_selected && !SYSTEM_KEYS.has(a.field_key))
      .map((a: any) => ({ key: a.field_key, label: a.name }));
  }, [attrData]);

  const customFieldDefs = useMemo(() =>
    (attrData?.data || []).filter((r: any) => r.is_selected && !RESERVED_SYSTEM_KEYS.has(r.field_key)),
    [attrData]);

  const coerceCustom = (def: any, raw: any) => {
    if (raw === '' || raw == null) return undefined;
    const t = String(def.data_type).toUpperCase();
    if (t === 'INTEGER' || t === 'LONG') { const n = parseInt(raw, 10); return isNaN(n) ? raw : n; }
    if (t === 'FLOAT') { const n = parseFloat(raw); return isNaN(n) ? raw : n; }
    if (t === 'BOOLEAN') return !!raw;
    return raw;
  };

  const closeAddContact = () => {
    setShowAddContact(false);
    setAddMode('single');
    setFormValues({ priority: '100' });
    setBulkRows([{ phone_number: '' }, { phone_number: '' }, { phone_number: '' }]);
    setBulkProgress(null);
  };

  // ── Close edit contact modal ───────────────────────────────────────────────
  const closeEditContact = () => {
    setEditContactTarget(null);
    setEditContactForm({});
  };

  // ── Open edit contact modal — seeds form from contact row ─────────────────
  const openEditContact = (c: any) => {
    const form: Record<string, any> = {
      phone_number: c.phone_number ?? '',
    };
    for (const def of customFieldDefs) {
      const val = c[def.field_key] ?? c.custom_fields?.[def.field_key] ?? '';
      form[def.field_key] = val;
    }
    setEditContactTarget(c);
    setEditContactForm(form);
  };

  const openCfgEditor = (cfg?: CloudImportConfig) => {
    if (cfg) {
      setEditingCfg(cfg);
    } else {
      setEditingCfg(null);
    }
    setShowCfgEditor(true);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Uploading…');
    setUploadErrors([]);
    setShowUploadErrors(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('contact_list_id', id!);
      const result = await uploadCSV(fd);
      const errs = (result.errors || []) as { row: number; phone: string; error: string }[];
      setUploadErrors(errs);
      setShowUploadErrors(errs.length > 0 && errs.length <= 50);
      const prefix = result.imported_rows > 0 ? '✓' : '⚠';
      setUploadStatus(
        `${prefix} Imported ${result.imported_rows} of ${result.total_rows} contacts${result.failed_rows > 0 ? `, ${result.failed_rows} failed` : ''}`,
      );
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
    } catch (err: any) {
      setUploadStatus(`Error: ${err.response?.data?.error || 'Upload failed'}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const addMut = useMutation({
    mutationFn: () => {
      const systemPayload: Record<string, any> = { contact_list_id: id };
      const customPayload: Record<string, any> = {};

      // Get all selected attribute defs to know data types for coercion
      const allDefs = attrData?.data || [];

      for (const [key, value] of Object.entries(formValues)) {
        if (key === 'phone_number') {
          systemPayload[key] = value;
          continue;
        }
        if (RESERVED_SYSTEM_KEYS.has(key)) {
          // System field — coerce priority to int
          if (key === 'priority') {
            systemPayload[key] = parseInt(value) || 100;
          } else {
            systemPayload[key] = value || null;
          }
        } else {
          // Custom field — find its def for type coercion
          const def = allDefs.find((d: any) => d.field_key === key);
          const v = def ? coerceCustom(def, value) : value;
          if (v !== undefined) customPayload[key] = v;
        }
      }
      return addContact({ ...systemPayload, custom_fields: customPayload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      closeAddContact();
    },
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      const candidates = bulkRows
        .map((r, i) => ({ row: r, idx: i }))
        .filter(({ row }) => String(row.phone_number || '').trim() !== '');
      const total = candidates.length;
      setBulkProgress({ done: 0, failed: 0, total, errors: [] });
      let done = 0;
      let failed = 0;
      const errors: { row: number; error: string }[] = [];
      const allDefs = attrData?.data || [];

      for (const { row, idx } of candidates) {
        try {
          const systemPayload: Record<string, any> = {
            contact_list_id: id,
            phone_number: String(row.phone_number).trim(),
          };
          const customPayload: Record<string, any> = {};

          for (const def of allDefs.filter((d: any) => d.is_selected && d.field_key !== 'phone_number')) {
            const rawVal = row[def.field_key];
            if (RESERVED_SYSTEM_KEYS.has(def.field_key)) {
              // System field
              if (def.field_key === 'priority') {
                systemPayload[def.field_key] = parseInt(rawVal) || 100;
              } else {
                systemPayload[def.field_key] = rawVal || null;
              }
            } else {
              // Custom field
              const v = coerceCustom(def, rawVal);
              if (v !== undefined) customPayload[def.field_key] = v;
            }
          }

          await addContact({ ...systemPayload, custom_fields: customPayload });
          done += 1;
        } catch (e: any) {
          failed += 1;
          errors.push({
            row: idx + 1,
            error: e?.response?.data?.error || e?.message || 'Insert failed',
          });
        }
        setBulkProgress({ done, failed, total, errors });
      }
      return { done, failed, total, errors };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      closeAddContact();
    },
  });

  // ── Edit contact mutation — calls PATCH /contacts/:id ─────────────────────
  const editContactMut = useMutation({
    mutationFn: () => {
      if (!editContactTarget) throw new Error('No contact selected');
      // Build custom_fields payload from form, coercing types
      const cf: Record<string, any> = {};
      for (const def of customFieldDefs) {
        const raw = editContactForm[def.field_key];
        const v = coerceCustom(def, raw);
        if (v !== undefined) cf[def.field_key] = v;
      }
      return updateContact(editContactTarget.id, {
        phone_number: editContactForm.phone_number,
        custom_fields: cf,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      closeEditContact();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (cid: string) => deleteContact(id!, cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setDeleteTarget(null);
    },
  });

  const deleteAllMut = useMutation({
    mutationFn: () => deleteAllContacts(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setShowDeleteAll(false);
      setSelectedContactIds(new Set());
    },
  });

  const deleteSelectedMut = useMutation({
    mutationFn: () => deleteContactsBulk(id!, Array.from(selectedContactIds)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setShowDeleteSelected(false);
      setSelectedContactIds(new Set());
    },
  });

  const deleteCfgMut = useMutation({
    mutationFn: (cfgId: string) => deleteCloudImportConfig(cfgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-import-configs'] }),
  });

  const toggleScheduleMut = useMutation({
    mutationFn: ({ cfg, enabled }: { cfg: CloudImportConfig; enabled: boolean }) =>
      updateCloudImportConfigSchedule(cfg.id, { enabled, cron_expression: enabled ? cfg.cron_expression || undefined : undefined, timezone: cfg.timezone || 'UTC', contact_list_ids: cfg.contact_list_ids || [id!] }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
      setCloudStatus(`✓ Schedule ${vars.enabled ? 'activated' : 'deactivated'}.`);
    },
    onError: (err: any) => setCloudStatus(`Error: ${err.response?.data?.error || err.message || 'Failed'}`),
  });

  const runCfgMut = useMutation({
    mutationFn: (cfgId: string) => runCloudImport([id!], { config_id: cfgId }),
    onMutate: () => setCloudStatus('Connecting and downloading…'),
    onSuccess: (result: any) => {
      const failedNote = result.failed_rows > 0 ? `, ${result.failed_rows} failed` : '';
      setCloudStatus(`✓ Imported ${result.imported_rows} of ${result.total_rows} contacts from ${result.files?.length || 0} file(s)${failedNote}.`);
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
    onError: (err: any) => setCloudStatus(`Error: ${err.response?.data?.error || err.message || 'Cloud import failed'}`),
  });

  // ── Select helpers ────────────────────────────────────────────────────────
  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selectedContactIds.has(c.id));
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedContactIds((prev) => { const next = new Set(prev); contacts.forEach((c) => next.delete(c.id)); return next; });
    } else {
      setSelectedContactIds((prev) => { const next = new Set(prev); contacts.forEach((c) => next.add(c.id)); return next; });
    }
  };
  const toggleOne = (cid: string) => {
    setSelectedContactIds((prev) => { const next = new Set(prev); next.has(cid) ? next.delete(cid) : next.add(cid); return next; });
  };

  if (listLoading) return <PageLoader />;
  const listData = list?.data ?? list;

  return (
    <div className='p-6 space-y-5'>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className='flex items-center gap-3'>
        <button onClick={() => navigate('/contact-lists')} className='p-1.5 hover:bg-gray-100 rounded-lg transition'>
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>{listData?.name || 'Contact List'}</h1>
          {listData?.description && <p className='text-sm text-gray-400 mt-0.5'>{listData.description}</p>}
        </div>
        <div className='flex items-center gap-2 flex-wrap justify-end'>
          <Button variant='secondary' icon={<Cloud className='w-4 h-4' />} onClick={() => setShowCloudImport(true)}>Cloud Import</Button>
          <Button variant='secondary' icon={<Settings2 className='w-4 h-4' />} onClick={() => navigate(`/contact-lists/${id}/attributes`)}>Manage Attributes</Button>
          <Button variant='secondary' icon={<Download className='w-4 h-4' />} onClick={() => downloadContactListCsvTemplate(id!, listData?.name || 'contacts')}>CSV Template</Button>
          <Button variant='secondary' icon={<Upload className='w-4 h-4' />} onClick={() => fileRef.current?.click()}>Upload CSV</Button>
          <input ref={fileRef} type='file' accept='.csv' className='hidden' onChange={handleFileUpload} />
          <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowAddContact(true)}>Add Contact</Button>
        </div>
      </div>

      {/* Upload status banner */}
      {uploadStatus && (
        <div className={`p-3 rounded-lg text-sm flex items-center justify-between ${uploadStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : uploadStatus.startsWith('⚠') ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
          <span>{uploadStatus}</span>
          <button onClick={() => setUploadStatus(null)} className='ml-2 opacity-60 hover:opacity-100'><X className='w-4 h-4' /></button>
        </div>
      )}

      {/* Upload validation errors panel */}
      {uploadErrors.length > 0 && (
        <div className='border border-amber-200 bg-amber-50 rounded-lg text-sm'>
          <button type='button' onClick={() => setShowUploadErrors((s) => !s)} className='w-full flex items-center justify-between px-4 py-2.5 text-left text-amber-800 font-medium'>
            <span>{uploadErrors.length} validation {uploadErrors.length === 1 ? 'error' : 'errors'}</span>
            <span className='text-xs text-amber-600'>{showUploadErrors ? 'Hide' : 'Show'} details</span>
          </button>
          {showUploadErrors && (
            <div className='border-t border-amber-200 max-h-64 overflow-auto'>
              <table className='w-full text-xs'>
                <thead className='bg-amber-100/50 sticky top-0'>
                  <tr>
                    <th className='text-left px-3 py-1.5 text-amber-800 font-medium w-16'>Row</th>
                    <th className='text-left px-3 py-1.5 text-amber-800 font-medium w-40'>Phone</th>
                    <th className='text-left px-3 py-1.5 text-amber-800 font-medium'>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadErrors.slice(0, 200).map((e, i) => (
                    <tr key={i} className='border-t border-amber-100 align-top'>
                      <td className='px-3 py-1.5 font-mono text-amber-700'>{e.row === 0 ? '—' : e.row}</td>
                      <td className='px-3 py-1.5 font-mono text-gray-700'>{e.phone || '—'}</td>
                      <td className='px-3 py-1.5 text-gray-700'>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uploadErrors.length > 200 && <div className='px-3 py-2 text-xs text-amber-700 border-t border-amber-100'>Showing first 200 of {uploadErrors.length} errors.</div>}
            </div>
          )}
        </div>
      )}

      {/* ── Stats cards ──────────────────────────────────────────────────── */}
      <div className='grid grid-cols-3 gap-4'>
        <StatCard label='Total Contacts' value={(listData?.contact_count ?? total).toLocaleString()} color='orange' />
        <StatCard label='Field Definitions' value={listData?.field_count ?? attrColumns.length} color='blue' />
        <StatCard label='Last Updated' value={listData?.updated_at ? new Date(listData.updated_at).toLocaleDateString() : '—'} color='amber' />
      </div>

      {/* ── Contacts table ───────────────────────────────────────────────── */}
      <Card>
        {/* Toolbar */}
        <div className='flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-wrap'>
          <div className='flex items-center gap-3 flex-1 min-w-0'>
            <h3 className='font-semibold text-gray-900 text-sm whitespace-nowrap'>Contacts ({total})</h3>
            <div className='relative w-64'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none' />
              <input
                type='text'
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder='Search contacts…'
                className='w-full pl-9 pr-8 py-1.5 text-sm rounded-xl transition placeholder:text-[#C09070]'
                style={{ border: '2px solid #FFD0B0', background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)', color: '#1A0F00' }}
              />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1); }} className='absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition'>
                  <X className='w-3.5 h-3.5' />
                </button>
              )}
            </div>
          </div>
          <div className='flex items-center gap-2'>
            {anySelected && (
              <button onClick={() => setShowDeleteSelected(true)} className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition'>
                <Trash2 className='w-3.5 h-3.5' /> Delete Selected ({selectedContactIds.size})
              </button>
            )}
            <button onClick={() => setShowDeleteAll(true)} disabled={total === 0} className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed'>
              <Trash2 className='w-3.5 h-3.5' /> Delete All
            </button>
          </div>
        </div>

        {/* ── Fixed-height scrollable table ─────────────────────────────── */}
        {contactsLoading ? (
          <div className='py-12 text-center text-sm text-gray-400'>Loading…</div>
        ) : contacts.length === 0 ? (
          <div className='py-16 text-center'>
            <p className='text-sm font-medium text-gray-500'>No contacts found</p>
            <p className='text-xs text-gray-400 mt-1'>{search ? 'Try a different search term' : 'Upload a CSV or add contacts manually'}</p>
          </div>
        ) : (
          <div className='overflow-x-auto overflow-y-auto' style={{ maxHeight: '565px' }}>
            <table className='w-full text-sm'>
              {/* Sticky header stays visible while scrolling */}
              <thead className='sticky top-0 z-10'>
                <tr className='border-b border-gray-100 bg-gray-50'>
                  <th className='w-10 px-4 py-2.5 text-left bg-gray-50'>
                    {anySelected && (
                      <input
                        type='checkbox'
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        className='w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer'
                        title='Select / deselect all on this page'
                      />
                    )}
                  </th>
                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50'>Phone</th>
                  {attrColumns.map((col) => (
                    <th key={col.key} className='px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50'>
                      {col.label}
                    </th>
                  ))}
                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-50'>
                {contacts.map((c) => {
                  const isSelected = selectedContactIds.has(c.id);
                  const isHovered = hoveredId === c.id;
                  const checkboxVisible = anySelected || isHovered;
                  return (
                    <tr
                      key={c.id}
                      onMouseEnter={() => setHoveredId(c.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`transition-colors ${isSelected ? 'bg-indigo-50' : isHovered ? 'bg-gray-50' : ''}`}
                    >
                      <td className='px-4 py-2.5 w-10'>
                        {checkboxVisible
                          ? <input type='checkbox' checked={isSelected} onChange={() => toggleOne(c.id)} className='w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer' />
                          : <span className='inline-block w-4 h-4' />}
                      </td>
                      <td className='px-4 py-2.5 text-gray-900 font-medium whitespace-nowrap'>{c.phone_number}</td>
                      {attrColumns.map((col) => {
                        const value = c[col.key] ?? c.custom_fields?.[col.key];
                        return (
                          <td key={col.key} className='px-4 py-2.5 text-gray-600 whitespace-nowrap'>
                            {value != null && value !== ''
                              ? (typeof value === 'object' ? JSON.stringify(value) : String(value))
                              : <span className='text-gray-300'>—</span>}
                          </td>
                        );
                      })}
                      <td className='px-4 py-2.5'>
                        <div className='flex items-center gap-1'>
                          {/* Edit button — opens inline modal, no navigation */}
                          <button
                            onClick={() => openEditContact(c)}
                            className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                          >
                            <Pencil className='w-3 h-3' />Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                          >
                            <Trash2 className='w-3 h-3' />Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize as any}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
          />
        )}
      </Card>

      {/* ── Add Contact modal ─────────────────────────────────────────────── */}
      <Modal title='Add Contact' open={showAddContact} onClose={closeAddContact} size={addMode === 'bulk' ? 'xl' : 'lg'}>
        <div className='mb-4 flex items-center gap-3'>
          <label className='text-xs text-gray-500'>Mode</label>
          <select value={addMode} onChange={(e) => setAddMode(e.target.value as 'single' | 'bulk')} className='border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'>
            <option value='single'>Single Upload</option>
            <option value='bulk'>Bulk Upload</option>
          </select>
        </div>

        {addMode === 'single' ? (
          <div className='space-y-4 max-h-[70vh] overflow-y-auto pr-1'>
            {/* Phone number always first */}
            <Input
              label='Phone Number (E.164) *'
              value={formValues.phone_number ?? ''}
              onChange={(e) => setFormValues((v) => ({ ...v, phone_number: e.target.value }))}
              placeholder='+12125550101'
            />

            {/* Render ALL selected attributes except phone_number dynamically */}
            {(attrData?.data || [])
              .filter((r: any) => r.is_selected && r.field_key !== 'phone_number')
              .length > 0 && (
                <div className='grid grid-cols-2 gap-3'>
                  {(attrData?.data || [])
                    .filter((r: any) => r.is_selected && r.field_key !== 'phone_number')
                    .map((def: any) => {
                      const t = String(def.data_type).toUpperCase();
                      const isNum = t === 'INTEGER' || t === 'LONG' || t === 'FLOAT';
                      const isDate = t === 'TIMESTAMP';
                      const isBool = t === 'BOOLEAN';

                      if (isBool) {
                        return (
                          <label
                            key={def.field_key}
                            className='flex items-center gap-2 text-xs text-gray-700 col-span-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer'
                          >
                            <input
                              type='checkbox'
                              checked={!!formValues[def.field_key]}
                              onChange={(e) =>
                                setFormValues((v) => ({ ...v, [def.field_key]: e.target.checked }))
                              }
                              className='rounded text-indigo-600'
                            />
                            {def.name}
                          </label>
                        );
                      }

                      return (
                        <div key={def.field_key}>
                          <label className='block text-xs text-gray-500 mb-1'>{def.name}</label>
                          <input
                            type={isNum ? 'number' : isDate ? 'datetime-local' : 'text'}
                            value={formValues[def.field_key] ?? ''}
                            onChange={(e) =>
                              setFormValues((v) => ({ ...v, [def.field_key]: e.target.value }))
                            }
                            placeholder={def.field_key}
                            className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                          />
                        </div>
                      );
                    })}
                </div>
              )}
          </div>
        ) : (
          <BulkGrid
            allFieldDefs={(attrData?.data || []).filter((r: any) => r.is_selected && r.field_key !== 'phone_number')}
            rows={bulkRows}
            setRows={setBulkRows}
            progress={bulkProgress}
            disabled={bulkMut.isPending}
          />
        )}

        <div className='flex gap-3 pt-4 mt-4 border-t border-gray-100'>
          <Button variant='secondary' className='flex-1' onClick={closeAddContact}>Cancel</Button>
          {addMode === 'single' ? (
            <Button className='flex-1' loading={addMut.isPending} disabled={!formValues.phone_number} onClick={() => addMut.mutate()}>Add Contact</Button>
          ) : (
            <Button className='flex-1' loading={bulkMut.isPending} disabled={bulkRows.every((r) => String(r.phone_number || '').trim() === '')} onClick={() => bulkMut.mutate()}>Import Contacts</Button>
          )}
        </div>
        {addMut.isError && addMode === 'single' && (
          <p className='text-xs text-red-500 mt-2'>{(addMut.error as any)?.response?.data?.error}</p>
        )}
      </Modal>

      {/* ── Cloud Import modal ────────────────────────────────────────────── */}
      <Modal title='Cloud Import' open={showCloudImport} onClose={() => { setShowCloudImport(false); setCloudStatus(null); }} size='xl'>
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <p className='text-xs text-gray-500'>Saved connections to S3, FTP/SFTP, or GCS. Run a profile to import its CSVs into <span className='font-medium text-gray-700'>{listData?.name}</span>.</p>
            <Button size='sm' icon={<Plus className='w-4 h-4' />} onClick={() => openCfgEditor()}>Add New</Button>
          </div>

          {cloudStatus && (
            <div className={`p-3 rounded-lg text-xs flex items-center justify-between ${cloudStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : cloudStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
              <span>{cloudStatus}</span>
              <button onClick={() => setCloudStatus(null)} className='ml-2 opacity-60 hover:opacity-100'><X className='w-3.5 h-3.5' /></button>
            </div>
          )}

          {cloudConfigsQ.isLoading ? (
            <div className='py-10 text-center text-xs text-gray-400'>Loading…</div>
          ) : (cloudConfigsQ.data || []).length === 0 ? (
            <EmptyState title='No cloud connections yet' description='Add an S3 bucket, FTP server, or GCS bucket to import contacts on demand.' />
          ) : (
            <Table<CloudImportConfig>
              keyFn={(r) => r.id}
              rows={(cloudConfigsQ.data || []).filter((c: CloudImportConfig) => (c.contact_list_ids || []).includes(id!))}
              cols={[
                { header: 'Name', render: (r) => <span className='font-medium text-gray-900'>{r.name}</span> },
                {
                  header: 'Provider', width: '120px',
                  render: (r) => {
                    const styles: Record<CloudProvider, string> = { s3: 'bg-orange-50 text-orange-700', ftp: 'bg-blue-50 text-blue-700', gcs: 'bg-emerald-50 text-emerald-700' };
                    const labels: Record<CloudProvider, string> = { s3: 'Amazon S3', ftp: 'FTP / SFTP', gcs: 'Google Cloud' };
                    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[r.provider]}`}>{labels[r.provider]}</span>;
                  },
                },
                {
                  header: 'Source',
                  render: (r) => {
                    const o = r.options || {}; const c = r.credentials || {};
                    const path = o.source_path || `${o.folder || ''}${o.file_name ? (o.folder ? '/' : '') + o.file_name : ''}`;
                    const prefix = r.provider === 'ftp' ? `${c.protocol || 'sftp'}://${c.host || '?'}/` : `${o.bucket_name || '?'}/`;
                    return <span className='font-mono text-xs text-gray-600'>{prefix}{path}</span>;
                  },
                },
                { header: 'Status', width: '90px', render: (r) => r.schedule_enabled ? <Badge label='Active' color='green' /> : <Badge label='Inactive' color='gray' /> },
                { header: 'Last Refresh', width: '150px', render: (r) => r.last_refresh ? <span className='text-xs text-gray-500'>{new Date(r.last_refresh).toLocaleString()}</span> : <span className='text-xs text-gray-300'>—</span> },
                { header: 'Next Refresh', width: '150px', render: (r) => r.schedule_enabled && r.next_refresh ? <span className='text-xs text-indigo-700'>{new Date(r.next_refresh).toLocaleString()}</span> : <span className='text-xs text-gray-300'>—</span> },
                {
                  header: 'Actions', width: '60px',
                  render: (r) => (
                    <button type='button' onClick={(e) => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setRowMenu(rowMenu?.id === r.id ? null : { id: r.id, x: rect.right, y: rect.bottom + 4 }); }} className='p-1.5 rounded hover:bg-gray-100 text-gray-500'>
                      <MoreVertical className='w-4 h-4' />
                    </button>
                  ),
                },
              ]}
            />
          )}

          {rowMenu && (() => {
            const r = (cloudConfigsQ.data || []).find((c: CloudImportConfig) => c.id === rowMenu.id);
            if (!r) return null;
            const close = () => setRowMenu(null);
            return (
              <>
                <div className='fixed inset-0 z-40' onClick={close} />
                <div style={{ position: 'fixed', left: rowMenu.x - 176, top: rowMenu.y }} className='z-50 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm'>
                  {r.schedule_enabled
                    ? <MenuItem icon={<PowerOff className='w-3.5 h-3.5' />} label='Deactivate' onClick={() => { close(); toggleScheduleMut.mutate({ cfg: r, enabled: false }); }} />
                    : <MenuItem icon={<Power className='w-3.5 h-3.5' />} label='Activate' onClick={() => { close(); runCfgMut.mutate(r.id); if (r.cron_expression) toggleScheduleMut.mutate({ cfg: r, enabled: true }); }} />}
                  <MenuItem icon={<Pencil className='w-3.5 h-3.5' />} label='Edit' onClick={() => { close(); openCfgEditor(r); }} />
                  <MenuItem icon={<Trash2 className='w-3.5 h-3.5' />} label='Delete' danger onClick={() => { close(); if (window.confirm(`Delete "${r.name}"?`)) deleteCfgMut.mutate(r.id); }} />
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      {/* ── Cloud Config Editor ───────────────────────────────────────────── */}
      <CloudConfigEditor
        open={showCfgEditor}
        editing={editingCfg}
        defaultContactListIds={[id!]}
        onClose={() => setShowCfgEditor(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
        }}
      />

      {/* ── Edit Contact modal ────────────────────────────────────────────── */}
      {editContactTarget && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Edit Contact</h3>
                <p className='text-xs text-gray-500 mt-0.5'>{editContactTarget.phone_number}</p>
              </div>
              <button
                onClick={() => { closeEditContact(); editContactMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            <div className='p-5 space-y-4 max-h-[60vh] overflow-y-auto'>
              {/* Phone number field */}
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>Phone Number *</label>
                <input
                  value={editContactForm.phone_number ?? ''}
                  onChange={(e) => setEditContactForm((f) => ({ ...f, phone_number: e.target.value }))}
                  placeholder='+12125550101'
                  className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
                />
              </div>

              {/* Dynamic custom fields */}
              {customFieldDefs.length > 0 && (
                <div className='grid grid-cols-2 gap-3'>
                  {customFieldDefs.map((def: any) => {
                    const t = String(def.data_type).toUpperCase();
                    const isNum = t === 'INTEGER' || t === 'LONG' || t === 'FLOAT';
                    const isDate = t === 'TIMESTAMP';
                    const isBool = t === 'BOOLEAN';
                    if (isBool) {
                      return (
                        <label key={def.id} className='flex items-center gap-2 text-xs text-gray-700 col-span-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer'>
                          <input
                            type='checkbox'
                            checked={!!editContactForm[def.field_key]}
                            onChange={(e) => setEditContactForm((f) => ({ ...f, [def.field_key]: e.target.checked }))}
                            className='rounded text-indigo-600'
                          />
                          {def.name}
                        </label>
                      );
                    }
                    return (
                      <div key={def.id}>
                        <label className='block text-xs text-gray-500 mb-1'>{def.name}</label>
                        <input
                          type={isNum ? 'number' : isDate ? 'datetime-local' : 'text'}
                          value={editContactForm[def.field_key] ?? ''}
                          onChange={(e) => setEditContactForm((f) => ({ ...f, [def.field_key]: e.target.value }))}
                          placeholder={def.field_key}
                          className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Error message */}
              {editContactMut.isError && (
                <div className='flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300'>
                  <AlertCircle className='w-4 h-4 text-red-700 shrink-0' />
                  <p className='text-sm font-medium text-red-800'>
                    {(editContactMut.error as any)?.response?.data?.error || 'Failed to update contact. Please try again.'}
                  </p>
                </div>
              )}
            </div>

            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button
                variant='secondary'
                onClick={() => { closeEditContact(); editContactMut.reset(); }}
              >
                Cancel
              </Button>
              <Button
                icon={<Save className='w-4 h-4' />}
                loading={editContactMut.isPending}
                disabled={!editContactForm.phone_number?.trim()}
                onClick={() => editContactMut.mutate()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete single contact ─────────────────────────────────────────── */}
      {deleteTarget && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete Contact</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button onClick={() => { setDeleteTarget(null); deleteMut.reset(); }} className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>Delete contact {deleteTarget.phone_number}?</p>
                  <p className='text-xs text-red-600 mt-1'>This contact will be permanently removed from the list.</p>
                </div>
              </div>
              {deleteMut.isError && <p className='text-xs text-red-600'>Delete failed. Please try again.</p>}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={() => { setDeleteTarget(null); deleteMut.reset(); }}>Cancel</Button>
              <Button loading={deleteMut.isPending} onClick={() => deleteMut.mutate(deleteTarget.id)} className='!bg-red-600 hover:!bg-red-700 !text-white'>Delete Contact</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete selected ───────────────────────────────────────────────── */}
      {showDeleteSelected && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete Selected Contacts</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button onClick={() => { setShowDeleteSelected(false); deleteSelectedMut.reset(); }} className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>Delete {selectedContactIds.size} selected contact{selectedContactIds.size !== 1 ? 's' : ''}?</p>
                  <p className='text-xs text-red-600 mt-1'>These contacts will be permanently removed.</p>
                </div>
              </div>
              {deleteSelectedMut.isError && <p className='text-xs text-red-600'>Delete failed. Please try again.</p>}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={() => { setShowDeleteSelected(false); deleteSelectedMut.reset(); }}>Cancel</Button>
              <Button loading={deleteSelectedMut.isPending} onClick={() => deleteSelectedMut.mutate()} className='!bg-red-600 hover:!bg-red-700 !text-white'>
                Delete {selectedContactIds.size} Contact{selectedContactIds.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete all ────────────────────────────────────────────────────── */}
      {showDeleteAll && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete All Contacts</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button onClick={() => { setShowDeleteAll(false); deleteAllMut.reset(); }} className='p-1 text-gray-400 hover:text-gray-600'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>Delete all {total} contact{total !== 1 ? 's' : ''} from this list?</p>
                  <p className='text-xs text-red-600 mt-1 leading-relaxed'>Every contact in <strong>{listData?.name}</strong> will be permanently deleted. The contact list itself will remain.</p>
                </div>
              </div>
              {deleteAllMut.isError && <p className='text-xs text-red-600'>Delete failed. Please try again.</p>}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={() => { setShowDeleteAll(false); deleteAllMut.reset(); }}>Cancel</Button>
              <Button loading={deleteAllMut.isPending} onClick={() => deleteAllMut.mutate()} className='!bg-red-600 hover:!bg-red-700 !text-white'>Delete All Contacts</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}