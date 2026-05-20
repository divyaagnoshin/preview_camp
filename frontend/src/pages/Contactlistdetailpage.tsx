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
  downloadContactListCsvTemplate,
  cloudImportContacts,
  listCloudImportConfigs,
  createCloudImportConfig,
  updateCloudImportConfig,
  deleteCloudImportConfig,
  updateCloudImportConfigSchedule,
  type CloudImportConfig,
  type CloudProvider,
} from '../api/client';
import { Card, Button, Modal, Input, Table, Badge, StatCard, PageLoader, EmptyState } from '../components/ui';
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
  ChevronLeft,
  ChevronRight,
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

function parseCronToPreset(cron: string): {
  freq: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  time?: string;
  dow?: string;
  dom?: string;
  custom?: string;
} {
  const parts = (cron || '').trim().split(/\s+/);
  if (parts.length !== 5) return { freq: 'daily' };
  const [m, h, dom, , dow] = parts;
  const isNum = (s: string) => /^[0-9]+$/.test(s);
  const time = (hh: string, mm: string) =>
    `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
  if (m === '0' && h === '*' && dom === '*' && dow === '*')
    return { freq: 'hourly' };
  if (isNum(m) && isNum(h) && dom === '*' && dow === '*')
    return { freq: 'daily', time: time(h, m) };
  if (isNum(m) && isNum(h) && dom === '*' && isNum(dow))
    return { freq: 'weekly', time: time(h, m), dow };
  if (isNum(m) && isNum(h) && isNum(dom) && dow === '*')
    return { freq: 'monthly', time: time(h, m), dom };
  return { freq: 'custom', custom: cron };
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
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition ${
        disabled
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
  customFieldDefs,
  rows,
  setRows,
  progress,
  disabled,
}: {
  customFieldDefs: any[];
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
              {customFieldDefs.map((def: any) => (
                <th key={def.id} className={thCls + ' min-w-[160px]'}>
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
                {customFieldDefs.map((def: any) => {
                  const t = String(def.data_type).toUpperCase();
                  const isNum = t === 'INTEGER' || t === 'LONG' || t === 'FLOAT';
                  const isDate = t === 'TIMESTAMP';
                  const isBool = t === 'BOOLEAN';
                  if (isBool) {
                    return (
                      <td key={def.id} className={tdCls + ' px-2 py-1.5'}>
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
                    <td key={def.id} className={tdCls}>
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

// ─── CloudConfigEditor ────────────────────────────────────────────────────────
function CloudConfigEditor({
  open, editing, name, setName, provider, setProvider,
  s3Form, setS3Form, ftpForm, setFtpForm, gcsForm, setGcsForm,
  saving, error, step, setStep,
  schedFreq, setSchedFreq, schedTime, setSchedTime,
  schedDow, setSchedDow, schedDom, setSchedDom,
  schedCustomCron, setSchedCustomCron, schedTz, setSchedTz,
  cronPreview, savingSched, onClose, onSaveStep1, onSaveStep2,
}: {
  open: boolean; editing: CloudImportConfig | null;
  name: string; setName: (v: string) => void;
  provider: CloudProvider; setProvider: (v: CloudProvider) => void;
  s3Form: any; setS3Form: React.Dispatch<React.SetStateAction<any>>;
  ftpForm: any; setFtpForm: React.Dispatch<React.SetStateAction<any>>;
  gcsForm: any; setGcsForm: React.Dispatch<React.SetStateAction<any>>;
  saving: boolean; error?: string; step: 1 | 2; setStep: (s: 1 | 2) => void;
  schedFreq: string; setSchedFreq: (v: any) => void;
  schedTime: string; setSchedTime: (v: string) => void;
  schedDow: string; setSchedDow: (v: string) => void;
  schedDom: string; setSchedDom: (v: string) => void;
  schedCustomCron: string; setSchedCustomCron: (v: string) => void;
  schedTz: string; setSchedTz: (v: string) => void;
  cronPreview: string; savingSched: boolean;
  onClose: () => void; onSaveStep1: () => void; onSaveStep2: () => void;
}) {
  const canSave =
    name.trim().length > 0 &&
    (provider === 's3'
      ? s3Form.bucket_name && s3Form.access_key_id && (editing || s3Form.secret_access_key)
      : provider === 'ftp'
      ? ftpForm.host && ftpForm.username && (editing || ftpForm.password)
      : gcsForm.bucket_name && (editing || gcsForm.service_account_json));

  return (
    <Modal
      title={step === 1 ? (editing ? 'Edit Cloud Connection' : 'Add Cloud Connection') : 'Schedule Automatic Imports'}
      open={open}
      onClose={onClose}
      size='lg'
    >
      {/* Step indicator */}
      <div className='flex items-center gap-2 mb-4 text-xs'>
        {(['1. Connection', '2. Schedule'] as const).map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className='text-gray-300'>→</span>}
            <span className={`px-2 py-1 rounded-full ${step === i + 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
              {label}
            </span>
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <Input label='Connection Name *' value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. Production S3 nightly' />
            <div>
              <label className='block text-xs text-gray-500 mb-1'>Provider *</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as CloudProvider)}
                disabled={!!editing}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
              >
                <option value='s3'>Amazon S3</option>
                <option value='ftp'>FTP / SFTP</option>
                <option value='gcs'>Google Cloud Storage</option>
              </select>
            </div>
          </div>

          {provider === 's3' && (
            <div className='grid grid-cols-2 gap-3'>
              <Input label='Access Key ID *' value={s3Form.access_key_id} onChange={(e) => setS3Form((f: any) => ({ ...f, access_key_id: e.target.value }))} placeholder='AKIA...' />
              <Input label={editing ? 'Secret Access Key (leave blank to keep)' : 'Secret Access Key *'} type='password' value={s3Form.secret_access_key} onChange={(e) => setS3Form((f: any) => ({ ...f, secret_access_key: e.target.value }))} placeholder='••••••••••••' />
              <Input label='Bucket Name *' value={s3Form.bucket_name} onChange={(e) => setS3Form((f: any) => ({ ...f, bucket_name: e.target.value }))} placeholder='my-bucket' />
              <Input label='Folder' value={s3Form.folder} onChange={(e) => setS3Form((f: any) => ({ ...f, folder: e.target.value }))} placeholder='data/imports' />
              <Input label='Region' value={s3Form.region} onChange={(e) => setS3Form((f: any) => ({ ...f, region: e.target.value }))} placeholder='us-east-1' />
              <Input label='File Name (optional)' value={s3Form.file_name} onChange={(e) => setS3Form((f: any) => ({ ...f, file_name: e.target.value }))} placeholder='contacts.csv' />
              <div className='col-span-2'>
                <Input label='Source Path (optional — overrides Folder + File Name)' value={s3Form.source_path} onChange={(e) => setS3Form((f: any) => ({ ...f, source_path: e.target.value }))} placeholder='data/2024/contacts.csv' />
              </div>
            </div>
          )}

          {provider === 'ftp' && (
            <div className='grid grid-cols-2 gap-3'>
              <div className='col-span-2 grid grid-cols-3 gap-3'>
                <div>
                  <label className='block text-xs text-gray-500 mb-1'>Protocol</label>
                  <select value={ftpForm.protocol} onChange={(e) => setFtpForm((f: any) => ({ ...f, protocol: e.target.value }))} className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'>
                    <option value='sftp'>SFTP</option>
                    <option value='ftp'>FTP</option>
                  </select>
                </div>
                <Input label='Host *' value={ftpForm.host} onChange={(e) => setFtpForm((f: any) => ({ ...f, host: e.target.value }))} placeholder='ftp.example.com' />
                <Input label='Port' value={ftpForm.port} onChange={(e) => setFtpForm((f: any) => ({ ...f, port: e.target.value }))} placeholder='22' />
              </div>
              <Input label='Username *' value={ftpForm.username} onChange={(e) => setFtpForm((f: any) => ({ ...f, username: e.target.value }))} />
              <Input label={editing ? 'Password (leave blank to keep)' : 'Password *'} type='password' value={ftpForm.password} onChange={(e) => setFtpForm((f: any) => ({ ...f, password: e.target.value }))} placeholder='••••••••••••' />
              <Input label='Folder' value={ftpForm.folder} onChange={(e) => setFtpForm((f: any) => ({ ...f, folder: e.target.value }))} placeholder='imports' />
              <Input label='File Name (optional)' value={ftpForm.file_name} onChange={(e) => setFtpForm((f: any) => ({ ...f, file_name: e.target.value }))} placeholder='contacts.csv' />
              <div className='col-span-2'>
                <Input label='Source Path (optional — overrides Folder + File Name)' value={ftpForm.source_path} onChange={(e) => setFtpForm((f: any) => ({ ...f, source_path: e.target.value }))} placeholder='/incoming/contacts.csv' />
              </div>
            </div>
          )}

          {provider === 'gcs' && (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <Input label='Bucket Name *' value={gcsForm.bucket_name} onChange={(e) => setGcsForm((f: any) => ({ ...f, bucket_name: e.target.value }))} placeholder='my-gcs-bucket' />
                <Input label='Folder' value={gcsForm.folder} onChange={(e) => setGcsForm((f: any) => ({ ...f, folder: e.target.value }))} placeholder='imports' />
                <Input label='File Name (optional)' value={gcsForm.file_name} onChange={(e) => setGcsForm((f: any) => ({ ...f, file_name: e.target.value }))} placeholder='contacts.csv' />
                <div className='col-span-2'>
                  <Input label='Source Path (optional)' value={gcsForm.source_path} onChange={(e) => setGcsForm((f: any) => ({ ...f, source_path: e.target.value }))} placeholder='data/contacts.csv' />
                </div>
              </div>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>{editing ? 'Service Account JSON (leave blank to keep)' : 'Service Account JSON *'}</label>
                <textarea value={gcsForm.service_account_json} onChange={(e) => setGcsForm((f: any) => ({ ...f, service_account_json: e.target.value }))} rows={6} className='w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500' placeholder='{ "type": "service_account", ... }' />
                <p className='text-xs text-amber-600 mt-1'>Note: GCS support is queued for a future release.</p>
              </div>
            </div>
          )}

          {error && step === 1 && <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>{error}</div>}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button variant='secondary' className='flex-1' onClick={onClose}>Cancel</Button>
            <Button className='flex-1' loading={saving} disabled={!canSave} onClick={onSaveStep1}>
              {editing ? 'Save & Next' : 'Save & Continue'}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs text-gray-500 mb-1'>Frequency</label>
              <select value={schedFreq} onChange={(e) => setSchedFreq(e.target.value)} className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'>
                <option value='hourly'>Hourly</option>
                <option value='daily'>Daily</option>
                <option value='weekly'>Weekly</option>
                <option value='monthly'>Monthly</option>
                <option value='custom'>Custom cron</option>
              </select>
            </div>
            <Input label='Timezone (IANA)' value={schedTz} onChange={(e) => setSchedTz(e.target.value)} placeholder='Asia/Kolkata' />
          </div>
          {(schedFreq === 'daily' || schedFreq === 'weekly' || schedFreq === 'monthly') && (
            <div className='grid grid-cols-2 gap-3'>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>Time of day</label>
                <input type='time' value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
              </div>
              {schedFreq === 'weekly' && (
                <div>
                  <label className='block text-xs text-gray-500 mb-1'>Day of week</label>
                  <select value={schedDow} onChange={(e) => setSchedDow(e.target.value)} className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'>
                    {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                      <option key={i} value={String(i)}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              {schedFreq === 'monthly' && (
                <Input label='Day of month (1–31)' value={schedDom} onChange={(e) => setSchedDom(e.target.value)} placeholder='1' />
              )}
            </div>
          )}
          {schedFreq === 'custom' && (
            <Input label='Cron expression (5 fields: m h dom mon dow)' value={schedCustomCron} onChange={(e) => setSchedCustomCron(e.target.value)} placeholder='0 9 * * *' />
          )}
          <div className='p-3 rounded-lg bg-gray-50 text-xs text-gray-600 font-mono'>
            Cron preview: <span className='text-indigo-700'>{cronPreview || '—'}</span>
          </div>
          <p className='text-xs text-gray-500'>The schedule will import into the contact list you opened this wizard from.</p>
          {error && step === 2 && <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>{error}</div>}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button variant='secondary' onClick={() => setStep(1)} disabled={savingSched}>Back</Button>
            <Button className='flex-1' loading={savingSched} onClick={onSaveStep2}>Save Schedule</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── File ref for CSV upload ───────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ row: number; phone: string; error: string }[]>([]);
  const [showUploadErrors, setShowUploadErrors] = useState(false);

  // ── Contacts pagination + search ──────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // ── Gmail-style checkbox select ───────────────────────────────────────────
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const anySelected = selectedContactIds.size > 0;

  // ── Delete modals ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showDeleteSelected, setShowDeleteSelected] = useState(false);

  // ── Add Contact modal ─────────────────────────────────────────────────────
  const [showAddContact, setShowAddContact] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [contact, setContact] = useState({ phone_number: '', first_name: '', last_name: '', email: '', timezone: '', priority: '100' });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([{ phone_number: '' }, { phone_number: '' }, { phone_number: '' }]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; failed: number; total: number; errors: { row: number; error: string }[] } | null>(null);

  // ── Cloud Import modal ────────────────────────────────────────────────────
  const [showCloudImport, setShowCloudImport] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [showCfgEditor, setShowCfgEditor] = useState(false);
  const [editingCfg, setEditingCfg] = useState<CloudImportConfig | null>(null);
  const [cfgName, setCfgName] = useState('');
  const [cfgProvider, setCfgProvider] = useState<CloudProvider>('s3');
  const [s3Form, setS3Form] = useState({ access_key_id: '', secret_access_key: '', bucket_name: '', folder: '', region: 'us-east-1', file_name: '', source_path: '' });
  const [ftpForm, setFtpForm] = useState({ protocol: 'sftp' as 'ftp' | 'sftp', host: '', port: '22', username: '', password: '', folder: '', file_name: '', source_path: '' });
  const [gcsForm, setGcsForm] = useState({ bucket_name: '', folder: '', file_name: '', service_account_json: '', source_path: '' });
  const [cfgStep, setCfgStep] = useState<1 | 2>(1);
  const [savedCfgId, setSavedCfgId] = useState<string | null>(null);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [schedFreq, setSchedFreq] = useState<'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDow, setSchedDow] = useState('1');
  const [schedDom, setSchedDom] = useState('1');
  const [schedCustomCron, setSchedCustomCron] = useState('0 9 * * *');
  const [schedTz, setSchedTz] = useState(browserTz);
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
    queryKey: ['contacts', id, page, search],
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

  // ── Attribute columns — only selected, non-system attrs ───────────────────
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

  // ── Coerce custom field values ────────────────────────────────────────────
  const coerceCustom = (def: any, raw: any) => {
    if (raw === '' || raw == null) return undefined;
    const t = String(def.data_type).toUpperCase();
    if (t === 'INTEGER' || t === 'LONG') { const n = parseInt(raw, 10); return isNaN(n) ? raw : n; }
    if (t === 'FLOAT') { const n = parseFloat(raw); return isNaN(n) ? raw : n; }
    if (t === 'BOOLEAN') return !!raw;
    return raw;
  };

  // ── Add contact helpers ───────────────────────────────────────────────────
  const closeAddContact = () => {
    setShowAddContact(false);
    setAddMode('single');
    setContact({ phone_number: '', first_name: '', last_name: '', email: '', timezone: '', priority: '100' });
    setCustomFieldValues({});
    setBulkRows([{ phone_number: '' }, { phone_number: '' }, { phone_number: '' }]);
    setBulkProgress(null);
  };

  // ── Cloud import helpers ──────────────────────────────────────────────────
  const resetCfgForm = () => {
    setEditingCfg(null); setCfgName(''); setCfgProvider('s3'); setCfgStep(1); setSavedCfgId(null);
    setSchedFreq('daily'); setSchedTime('09:00'); setSchedDow('1'); setSchedDom('1');
    setSchedCustomCron('0 9 * * *'); setSchedTz(browserTz);
    setS3Form({ access_key_id: '', secret_access_key: '', bucket_name: '', folder: '', region: 'us-east-1', file_name: '', source_path: '' });
    setFtpForm({ protocol: 'sftp', host: '', port: '22', username: '', password: '', folder: '', file_name: '', source_path: '' });
    setGcsForm({ bucket_name: '', folder: '', file_name: '', service_account_json: '', source_path: '' });
  };

  const openCfgEditor = (cfg?: CloudImportConfig) => {
    resetCfgForm();
    if (cfg) {
      setEditingCfg(cfg); setCfgName(cfg.name); setCfgProvider(cfg.provider);
      const c = cfg.credentials || {}; const o = cfg.options || {};
      if (cfg.provider === 's3') setS3Form({ access_key_id: c.access_key_id || '', secret_access_key: '', bucket_name: o.bucket_name || '', folder: o.folder || '', region: c.region || 'us-east-1', file_name: o.file_name || '', source_path: o.source_path || '' });
      else if (cfg.provider === 'ftp') setFtpForm({ protocol: c.protocol === 'ftp' ? 'ftp' : 'sftp', host: c.host || '', port: c.port || '22', username: c.username || '', password: '', folder: o.folder || '', file_name: o.file_name || '', source_path: o.source_path || '' });
      else setGcsForm({ bucket_name: o.bucket_name || '', folder: o.folder || '', file_name: o.file_name || '', service_account_json: '', source_path: o.source_path || '' });
      setSchedTz(cfg.timezone || browserTz);
      const parsed = parseCronToPreset(cfg.cron_expression || '');
      setSchedFreq(parsed.freq);
      if (parsed.time) setSchedTime(parsed.time);
      if (parsed.dow) setSchedDow(parsed.dow);
      if (parsed.dom) setSchedDom(parsed.dom);
      if (parsed.custom) setSchedCustomCron(parsed.custom);
    }
    setShowCfgEditor(true);
  };

  const buildCfgPayload = () => {
    if (cfgProvider === 's3') return { credentials: { access_key_id: s3Form.access_key_id, secret_access_key: s3Form.secret_access_key, region: s3Form.region }, options: { bucket_name: s3Form.bucket_name, folder: s3Form.folder, file_name: s3Form.file_name || undefined, source_path: s3Form.source_path || undefined } };
    if (cfgProvider === 'ftp') return { credentials: { protocol: ftpForm.protocol, host: ftpForm.host, port: ftpForm.port, username: ftpForm.username, password: ftpForm.password }, options: { folder: ftpForm.folder, file_name: ftpForm.file_name || undefined, source_path: ftpForm.source_path || undefined } };
    return { credentials: { service_account_json: gcsForm.service_account_json }, options: { bucket_name: gcsForm.bucket_name, folder: gcsForm.folder, file_name: gcsForm.file_name || undefined, source_path: gcsForm.source_path || undefined } };
  };

  const cronPreview = buildCron(schedFreq, schedTime, schedDow, schedDom, schedCustomCron);

  // ── Mutations ─────────────────────────────────────────────────────────────

  // CSV upload — uses existing fileRef + uploadCSV API exactly like old code
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
      setUploadStatus(`${prefix} Imported ${result.imported_rows} of ${result.total_rows} contacts${result.failed_rows > 0 ? `, ${result.failed_rows} failed` : ''}`);
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
    } catch (err: any) {
      setUploadStatus(`Error: ${err.response?.data?.error || 'Upload failed'}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const addMut = useMutation({
    mutationFn: () => {
      const cf: Record<string, any> = {};
      for (const def of customFieldDefs) {
        const v = coerceCustom(def, customFieldValues[def.field_key]);
        if (v !== undefined) cf[def.field_key] = v;
      }
      return addContact({ contact_list_id: id, ...contact, priority: parseInt(contact.priority), custom_fields: cf });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', id] }); qc.invalidateQueries({ queryKey: ['contact-list', id] }); closeAddContact(); },
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      const candidates = bulkRows.map((r, i) => ({ row: r, idx: i })).filter(({ row }) => String(row.phone_number || '').trim() !== '');
      const total = candidates.length;
      setBulkProgress({ done: 0, failed: 0, total, errors: [] });
      let done = 0; let failed = 0; const errors: { row: number; error: string }[] = [];
      for (const { row, idx } of candidates) {
        try {
          const cf: Record<string, any> = {};
          for (const def of customFieldDefs) { const v = coerceCustom(def, row[def.field_key]); if (v !== undefined) cf[def.field_key] = v; }
          await addContact({ contact_list_id: id, phone_number: String(row.phone_number).trim(), priority: 100, custom_fields: cf });
          done += 1;
        } catch (e: any) { failed += 1; errors.push({ row: idx + 1, error: e?.response?.data?.error || e?.message || 'Insert failed' }); }
        setBulkProgress({ done, failed, total, errors });
      }
      return { done, failed, total, errors };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', id] }); qc.invalidateQueries({ queryKey: ['contact-list', id] }); closeAddContact();},
  });

  const deleteMut = useMutation({
    mutationFn: (cid: string) => deleteContact(id!, cid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', id] }); qc.invalidateQueries({ queryKey: ['contact-list', id] }); setDeleteTarget(null); },
  });

  const deleteAllMut = useMutation({
    mutationFn: () => deleteAllContacts(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', id] }); qc.invalidateQueries({ queryKey: ['contact-list', id] }); setShowDeleteAll(false); setSelectedContactIds(new Set()); },
  });

  const deleteSelectedMut = useMutation({
    mutationFn: () => deleteContactsBulk(id!, Array.from(selectedContactIds)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', id] }); qc.invalidateQueries({ queryKey: ['contact-list', id] }); setShowDeleteSelected(false); setSelectedContactIds(new Set()); },
  });

  const saveCfgMut = useMutation({
    mutationFn: () => {
      const body = { name: cfgName.trim(), provider: cfgProvider, ...buildCfgPayload() };
      return editingCfg ? updateCloudImportConfig(editingCfg.id, body) : createCloudImportConfig(body);
    },
    onSuccess: (saved: CloudImportConfig) => { qc.invalidateQueries({ queryKey: ['cloud-import-configs'] }); setSavedCfgId(saved.id); setEditingCfg(saved); setCfgStep(2); },
  });

  const saveSchedMut = useMutation({
    mutationFn: () => {
      const cfgId = savedCfgId || editingCfg?.id;
      if (!cfgId) throw new Error('No config to schedule');
      return updateCloudImportConfigSchedule(cfgId, { enabled: true, cron_expression: cronPreview, timezone: schedTz || 'UTC', contact_list_id: id! });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cloud-import-configs'] }); setShowCfgEditor(false); resetCfgForm(); saveCfgMut.reset(); },
  });

  const deleteCfgMut = useMutation({
    mutationFn: (cfgId: string) => deleteCloudImportConfig(cfgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-import-configs'] }),
  });

  const toggleScheduleMut = useMutation({
    mutationFn: ({ cfg, enabled }: { cfg: CloudImportConfig; enabled: boolean }) =>
      updateCloudImportConfigSchedule(cfg.id, { enabled, cron_expression: enabled ? cfg.cron_expression || undefined : undefined, timezone: cfg.timezone || 'UTC', contact_list_id: enabled ? cfg.contact_list_id || id! : undefined }),
    onSuccess: (_data, vars) => { qc.invalidateQueries({ queryKey: ['cloud-import-configs'] }); setCloudStatus(`✓ Schedule ${vars.enabled ? 'activated' : 'deactivated'}.`); },
    onError: (err: any) => setCloudStatus(`Error: ${err.response?.data?.error || err.message || 'Failed'}`),
  });

  const runCfgMut = useMutation({
    mutationFn: (cfgId: string) => cloudImportContacts(id!, { config_id: cfgId }),
    onMutate: () => setCloudStatus('Connecting and downloading…'),
    onSuccess: (result: any) => {
      const failedNote = result.failed_rows > 0 ? `, ${result.failed_rows} failed` : '';
      setCloudStatus(`✓ Imported ${result.imported_rows} of ${result.total_rows} contacts from ${result.files?.length || 0} file(s)${failedNote}.`);
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
    onError: (err: any) => setCloudStatus(`Error: ${err.response?.data?.error || err.message || 'Cloud import failed'}`),
  });

  // ── Select helpers ────────────────────────────────────────────────────────
  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selectedContactIds.has(c.id));
  const toggleSelectAll = () => {
    if (allOnPageSelected) { setSelectedContactIds((prev) => { const next = new Set(prev); contacts.forEach((c) => next.delete(c.id)); return next; }); }
    else { setSelectedContactIds((prev) => { const next = new Set(prev); contacts.forEach((c) => next.add(c.id)); return next; }); }
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
          <Button variant='secondary' icon={<Settings2 className='w-4 h-4' />} onClick={() => navigate(`/contact-lists/${id}/attributes`)}>Manage Attributes</Button>
          {/* CSV Template — calls downloadContactListCsvTemplate from api/client exactly like old code */}
          <Button variant='secondary' icon={<Download className='w-4 h-4' />} onClick={() => downloadContactListCsvTemplate(id!, listData?.name || 'contacts')}>CSV Template</Button>
          {/* Upload CSV — triggers hidden file input, handler posts FormData via uploadCSV */}
          <Button variant='secondary' icon={<Upload className='w-4 h-4' />} onClick={() => fileRef.current?.click()}>Upload CSV</Button>
          <input ref={fileRef} type='file' accept='.csv' className='hidden' onChange={handleFileUpload} />
          <Button variant='secondary' icon={<Cloud className='w-4 h-4' />} onClick={() => setShowCloudImport(true)}>Cloud Import</Button>
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
              <input type='text' value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder='Search contacts…' className='w-full pl-9 pr-8 py-1.5 text-sm rounded-xl transition placeholder:text-[#C09070]' style={{ border: '2px solid #FFD0B0', background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)', color: '#1A0F00' }} />
              {search && <button onClick={() => { setSearch(''); setPage(1); }} className='absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition'><X className='w-3.5 h-3.5' /></button>}
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

        {/* Table body */}
        {contactsLoading ? (
          <div className='py-12 text-center text-sm text-gray-400'>Loading…</div>
        ) : contacts.length === 0 ? (
          <div className='py-16 text-center'>
            <p className='text-sm font-medium text-gray-500'>No contacts found</p>
            <p className='text-xs text-gray-400 mt-1'>{search ? 'Try a different search term' : 'Upload a CSV or add contacts manually'}</p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-100 bg-gray-50/50'>
                  <th className='w-10 px-4 py-2.5 text-left'>
                    {anySelected && <input type='checkbox' checked={allOnPageSelected} onChange={toggleSelectAll} className='w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer' title='Select / deselect all on this page' />}
                  </th>
                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'>Phone</th>
                  {attrColumns.map((col) => (
                    <th key={col.key} className='px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap'>{col.label}</th>
                  ))}
                  <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-50'>
                {contacts.map((c) => {
                  const isSelected = selectedContactIds.has(c.id);
                  const isHovered = hoveredId === c.id;
                  const checkboxVisible = anySelected || isHovered;
                  return (
                    <tr key={c.id} onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)} className={`transition-colors ${isSelected ? 'bg-indigo-50' : isHovered ? 'bg-gray-50' : ''}`}>
                      <td className='px-4 py-2.5 w-10'>
                        {checkboxVisible
                          ? <input type='checkbox' checked={isSelected} onChange={() => toggleOne(c.id)} className='w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer' />
                          : <span className='inline-block w-4 h-4' />}
                      </td>
                      <td className='px-4 py-2.5 text-gray-900 font-medium whitespace-nowrap'>{c.phone_number}</td>
                      {attrColumns.map((col) => (
                        <td key={col.key} className='px-4 py-2.5 text-gray-600 whitespace-nowrap'>
                          {c[col.key] != null && c[col.key] !== ''
                            ? (typeof c[col.key] === 'object' ? JSON.stringify(c[col.key]) : String(c[col.key]))
                            : <span className='text-gray-300'>—</span>}
                        </td>
                      ))}
                      <td className='px-4 py-2.5'>
                        <div className='flex items-center gap-1'>
                          <button onClick={() => navigate(`/contact-lists/${id}/contacts/${c.id}/edit`)} className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'><Pencil className='w-3 h-3' />Edit</button>
                          <button onClick={() => setDeleteTarget(c)} className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'><Trash2 className='w-3 h-3' />Delete</button>
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
          <div className='flex items-center justify-between px-4 py-3 border-t border-gray-100'>
            <span className='text-xs text-gray-500'>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
            <div className='flex items-center gap-2'>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className='flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition'>‹ Prev</button>
              <span className='text-xs text-gray-500'>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className='flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition'>Next ›</button>
            </div>
          </div>
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
            <Input label='Phone Number (E.164) *' value={contact.phone_number} onChange={(e) => setContact((c) => ({ ...c, phone_number: e.target.value }))} placeholder='+12125550101' />
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
                        <input type='checkbox' checked={!!customFieldValues[def.field_key]} onChange={(e) => setCustomFieldValues((v) => ({ ...v, [def.field_key]: e.target.checked }))} className='rounded text-indigo-600' />
                        {def.name}
                      </label>
                    );
                  }
                  return (
                    <div key={def.id}>
                      <label className='block text-xs text-gray-500 mb-1'>{def.name}</label>
                      <input type={isNum ? 'number' : isDate ? 'datetime-local' : 'text'} value={customFieldValues[def.field_key] ?? ''} onChange={(e) => setCustomFieldValues((v) => ({ ...v, [def.field_key]: e.target.value }))} placeholder={def.field_key} className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <BulkGrid customFieldDefs={customFieldDefs} rows={bulkRows} setRows={setBulkRows} progress={bulkProgress} disabled={bulkMut.isPending} />
        )}

        <div className='flex gap-3 pt-4 mt-4 border-t border-gray-100'>
          <Button variant='secondary' className='flex-1' onClick={closeAddContact}>Cancel</Button>
          {addMode === 'single' ? (
            <Button className='flex-1' loading={addMut.isPending} disabled={!contact.phone_number} onClick={() => addMut.mutate()}>Add Contact</Button>
          ) : (
            <Button className='flex-1' loading={bulkMut.isPending} disabled={bulkRows.every((r) => String(r.phone_number || '').trim() === '')} onClick={() => bulkMut.mutate()}>Import Contacts</Button>
          )}
        </div>
        {addMut.isError && addMode === 'single' && <p className='text-xs text-red-500 mt-2'>{(addMut.error as any)?.response?.data?.error}</p>}
      </Modal>

      {/* ── Cloud Import modal — table of saved profiles ──────────────────── */}
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
              rows={cloudConfigsQ.data || []}
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

          {/* Kebab dropdown (fixed position to escape overflow clips) */}
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

      {/* ── Cloud Config Editor (Add / Edit wizard) ───────────────────────── */}
      <CloudConfigEditor
        open={showCfgEditor} editing={editingCfg}
        name={cfgName} setName={setCfgName}
        provider={cfgProvider} setProvider={setCfgProvider}
        s3Form={s3Form} setS3Form={setS3Form}
        ftpForm={ftpForm} setFtpForm={setFtpForm}
        gcsForm={gcsForm} setGcsForm={setGcsForm}
        saving={saveCfgMut.isPending}
        error={(saveCfgMut.error as any)?.response?.data?.error || (saveSchedMut.error as any)?.response?.data?.error}
        step={cfgStep} setStep={setCfgStep}
        schedFreq={schedFreq} setSchedFreq={setSchedFreq}
        schedTime={schedTime} setSchedTime={setSchedTime}
        schedDow={schedDow} setSchedDow={setSchedDow}
        schedDom={schedDom} setSchedDom={setSchedDom}
        schedCustomCron={schedCustomCron} setSchedCustomCron={setSchedCustomCron}
        schedTz={schedTz} setSchedTz={setSchedTz}
        cronPreview={cronPreview}
        savingSched={saveSchedMut.isPending}
        onClose={() => { setShowCfgEditor(false); resetCfgForm(); saveCfgMut.reset(); saveSchedMut.reset(); }}
        onSaveStep1={() => saveCfgMut.mutate()}
        onSaveStep2={() => saveSchedMut.mutate()}
      />

      {/* ── Delete single contact ─────────────────────────────────────────── */}
      {deleteTarget && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'><div><h3 className='text-base font-semibold text-gray-900'>Delete Contact</h3><p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p></div><button onClick={() => { setDeleteTarget(null); deleteMut.reset(); }} className='p-1 text-gray-400 hover:text-gray-600'><X className='w-5 h-5' /></button></div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'><AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' /><div><p className='text-sm font-semibold text-red-800'>Delete contact {deleteTarget.phone_number}?</p><p className='text-xs text-red-600 mt-1'>This contact will be permanently removed from the list.</p></div></div>
              {deleteMut.isError && <p className='text-xs text-red-600'>Delete failed. Please try again.</p>}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'><Button variant='secondary' onClick={() => { setDeleteTarget(null); deleteMut.reset(); }}>Cancel</Button><Button loading={deleteMut.isPending} onClick={() => deleteMut.mutate(deleteTarget.id)} className='!bg-red-600 hover:!bg-red-700 !text-white'>Delete Contact</Button></div>
          </div>
        </div>
      )}

      {/* ── Delete selected ───────────────────────────────────────────────── */}
      {showDeleteSelected && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'><div><h3 className='text-base font-semibold text-gray-900'>Delete Selected Contacts</h3><p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p></div><button onClick={() => { setShowDeleteSelected(false); deleteSelectedMut.reset(); }} className='p-1 text-gray-400 hover:text-gray-600'><X className='w-5 h-5' /></button></div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'><AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' /><div><p className='text-sm font-semibold text-red-800'>Delete {selectedContactIds.size} selected contact{selectedContactIds.size !== 1 ? 's' : ''}?</p><p className='text-xs text-red-600 mt-1'>These contacts will be permanently removed.</p></div></div>
              {deleteSelectedMut.isError && <p className='text-xs text-red-600'>Delete failed. Please try again.</p>}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'><Button variant='secondary' onClick={() => { setShowDeleteSelected(false); deleteSelectedMut.reset(); }}>Cancel</Button><Button loading={deleteSelectedMut.isPending} onClick={() => deleteSelectedMut.mutate()} className='!bg-red-600 hover:!bg-red-700 !text-white'>Delete {selectedContactIds.size} Contact{selectedContactIds.size !== 1 ? 's' : ''}</Button></div>
          </div>
        </div>
      )}

      {/* ── Delete all ────────────────────────────────────────────────────── */}
      {showDeleteAll && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'><div><h3 className='text-base font-semibold text-gray-900'>Delete All Contacts</h3><p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p></div><button onClick={() => { setShowDeleteAll(false); deleteAllMut.reset(); }} className='p-1 text-gray-400 hover:text-gray-600'><X className='w-5 h-5' /></button></div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'><AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' /><div><p className='text-sm font-semibold text-red-800'>Delete all {total} contact{total !== 1 ? 's' : ''} from this list?</p><p className='text-xs text-red-600 mt-1 leading-relaxed'>Every contact in <strong>{listData?.name}</strong> will be permanently deleted. The contact list itself will remain.</p></div></div>
              {deleteAllMut.isError && <p className='text-xs text-red-600'>Delete failed. Please try again.</p>}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'><Button variant='secondary' onClick={() => { setShowDeleteAll(false); deleteAllMut.reset(); }}>Cancel</Button><Button loading={deleteAllMut.isPending} onClick={() => deleteAllMut.mutate()} className='!bg-red-600 hover:!bg-red-700 !text-white'>Delete All Contacts</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}