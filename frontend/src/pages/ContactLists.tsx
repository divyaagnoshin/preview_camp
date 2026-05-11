import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getContactLists,
  createContactList,
  updateContactList,
  deleteContactList,
  getContactList,
  uploadCSV,
  addContact,
  downloadContactListCsvTemplate,
  getContactListAttributes,
  cloudImportContacts,
  listCloudImportConfigs,
  createCloudImportConfig,
  updateCloudImportConfig,
  deleteCloudImportConfig,
  updateCloudImportConfigSchedule,
  type CloudImportConfig,
  type CloudProvider,
} from '../api/client';
import {
  Card,
  CardHeader,
  Table,
  Button,
  Modal,
  Input,
  StatCard,
  PageLoader,
  EmptyState,
  Badge,
} from '../components/ui';
import {
  Plus,
  Upload,
  ArrowLeft,
  Download,
  Pencil,
  Trash2,
  Settings2,
  Cloud,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Power,
  PowerOff,
} from 'lucide-react';

// ── Contact Lists ─────────────────────────────────────────
export function ContactListsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: getContactLists,
  });

  const resetForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setName('');
    setDescription('');
  };

  const createMut = useMutation({
    mutationFn: () => createContactList({ name, description }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      resetForm();
      // Continue the new-list flow straight into attribute selection.
      if (created?.id) navigate(`/contact-lists/${created.id}/attributes`);
    },
  });
  const updateMut = useMutation({
    mutationFn: () => updateContactList(editingId!, { name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      resetForm();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (listId: string) => deleteContactList(listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setDeletingList(null);
    },
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setName(r.name);
    setDescription(r.description || '');
    setShowCreate(true);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: "Syne, sans-serif" }}>Contact Lists</h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {data?.data?.length || 0} lists total
          </p>
        </div>
        <Button
          icon={<Plus className='w-4 h-4' />}
          onClick={() => setShowCreate(true)}
        >
          New List
        </Button>
      </div>

      <Card>
        {data?.data?.length === 0 ? (
          <EmptyState
            title='No contact lists'
            description='Create a list and upload contacts to get started.'
            action={
              <Button
                icon={<Plus className='w-4 h-4' />}
                onClick={() => setShowCreate(true)}
              >
                Create List
              </Button>
            }
          />
        ) : (
          <Table
            cols={[
              {
                header: 'Name',
                render: (r: any) => (
                  <span className='font-medium text-gray-900'>{r.name}</span>
                ),
              },
              {
                header: 'Description',
                render: (r: any) => (
                  <span className='text-gray-500'>{r.description || '—'}</span>
                ),
              },
              {
                header: 'Contacts',
                render: (r: any) => (
                  <span className='font-medium text-indigo-600'>
                    {r.contact_count?.toLocaleString()}
                  </span>
                ),
              },
              {
                header: 'Created',
                render: (r: any) => new Date(r.created_at).toLocaleDateString(),
              },
              {
                header: 'Actions',
                render: (r: any) => (
                  <div
                    className='flex items-center gap-2'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size='sm'
                      variant='secondary'
                      icon={<Pencil className='w-3 h-3' />}
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      size='sm'
                      variant='danger'
                      icon={<Trash2 className='w-3 h-3' />}
                      onClick={() => setDeletingList(r)}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={data?.data || []}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => navigate(`/contact-lists/${r.id}`)}
          />
        )}
      </Card>

      <Modal
        title={editingId ? 'Edit Contact List' : 'Create Contact List'}
        open={showCreate}
        onClose={resetForm}
      >
        <div className='space-y-4'>
          <Input
            label='List Name *'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. Q2 Loan Prospects'
          />
          <Input
            label='Description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={resetForm}>
              Cancel
            </Button>
            <Button
              className='flex-1'
              loading={editingId ? updateMut.isPending : createMut.isPending}
              disabled={!name}
              onClick={() =>
                editingId ? updateMut.mutate() : createMut.mutate()
              }
            >
              {editingId ? 'Save Changes' : 'Next: Manage Attributes'}
            </Button>
          </div>
          {(createMut.isError || updateMut.isError) && (
            <p className='text-xs text-red-500'>
              {((editingId ? updateMut.error : createMut.error) as any)
                ?.response?.data?.error || 'Operation failed'}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        title='Delete Contact List'
        open={!!deletingList}
        onClose={() => setDeletingList(null)}
      >
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            Are you sure you want to delete{' '}
            <span className='font-medium text-gray-900'>
              {deletingList?.name}
            </span>
            ? This will permanently remove the list and all{' '}
            <span className='font-medium'>
              {deletingList?.contact_count?.toLocaleString() || 0}
            </span>{' '}
            contacts in it. This action cannot be undone.
          </p>
          <p className='text-xs text-gray-400'>
            Lists attached to active campaign jobs cannot be deleted.
          </p>
          <div className='flex gap-3'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={() => setDeletingList(null)}
            >
              Cancel
            </Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={deleteMut.isPending}
              onClick={() => deleteMut.mutate(deletingList.id)}
            >
              Delete List
            </Button>
          </div>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error ||
                'Delete failed'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Contact List Detail ───────────────────────────────────
export function ContactListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  // Per-row validation errors returned by the upload endpoint (phone format,
  // duplicates, header mismatch, etc.). Rendered as a collapsible panel so a
  // long error list doesn't blow up the page.
  const [uploadErrors, setUploadErrors] = useState<
    { row: number; phone: string; error: string }[]
  >([]);
  const [showUploadErrors, setShowUploadErrors] = useState(false);
  // Add Contact modal mode: 'single' uses the existing form, 'bulk' renders a
  // spreadsheet-style grid for multi-row entry.
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [contact, setContact] = useState({
    phone_number: '',
    first_name: '',
    last_name: '',
    email: '',
    timezone: '',
    priority: '100',
  });
  // Values for selected non-system attributes (system_contact_id, address_*,
  // and any list-scoped custom fields). Keyed by field_key.
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, any>
  >({});
  // Bulk-mode state. Each row is { phone_number, [field_key]: value }.
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([
    { phone_number: '' },
    { phone_number: '' },
    { phone_number: '' },
  ]);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    failed: number;
    total: number;
    errors: { row: number; error: string }[];
  } | null>(null);

  // Cloud Import is now a two-pane experience:
  //   1. A table modal listing every saved cloud_import_configs row for the
  //      org, with Activate / Inactive / Edit / Delete actions per row.
  //   2. An Add/Edit modal with a provider dropdown (S3 / FTP / GCS) whose
  //      form fields swap based on the selection.
  const [showCloudImport, setShowCloudImport] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);

  const [showCfgEditor, setShowCfgEditor] = useState(false);
  const [editingCfg, setEditingCfg] = useState<CloudImportConfig | null>(null);
  const [cfgName, setCfgName] = useState('');
  const [cfgProvider, setCfgProvider] = useState<CloudProvider>('s3');
  const [s3Form, setS3Form] = useState({
    access_key_id: '',
    secret_access_key: '',
    bucket_name: 'demo-test-bucket',
    folder: 'demo',
    region: 'us-east-1',
    file_name: '',
    source_path: '',
  });
  const [ftpForm, setFtpForm] = useState({
    protocol: 'sftp' as 'ftp' | 'sftp',
    host: '',
    port: '22',
    username: '',
    password: '',
    folder: 'demo',
    file_name: '',
    source_path: '',
  });
  const [gcsForm, setGcsForm] = useState({
    bucket_name: '',
    folder: '',
    file_name: '',
    service_account_json: '',
    source_path: '',
  });
  // Wizard state — Step 1 is the connection form (above), Step 2 is the
  // schedule form. `savedCfgId` holds the id returned from POST /configs so
  // Step 2 can target the freshly created row.
  const [cfgStep, setCfgStep] = useState<1 | 2>(1);
  const [savedCfgId, setSavedCfgId] = useState<string | null>(null);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // Cron is mandatory — schedEnabled always true. Kept as state so the
  // existing prop plumbing into CloudConfigEditor stays intact.
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [schedFreq, setSchedFreq] = useState<
    'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
  >('daily');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDow, setSchedDow] = useState('1'); // Monday
  const [schedDom, setSchedDom] = useState('1');
  const [schedCustomCron, setSchedCustomCron] = useState('0 9 * * *');
  const [schedTz, setSchedTz] = useState(browserTz);
  const closeCloudImport = () => {
    setShowCloudImport(false);
    setCloudStatus(null);
  };
  const resetCfgForm = () => {
    setEditingCfg(null);
    setCfgName('');
    setCfgProvider('s3');
    setCfgStep(1);
    setSavedCfgId(null);
    setSchedEnabled(true);
    setSchedFreq('daily');
    setSchedTime('09:00');
    setSchedDow('1');
    setSchedDom('1');
    setSchedCustomCron('0 9 * * *');
    setSchedTz(browserTz);
    setS3Form({
      access_key_id: '',
      secret_access_key: '',
      bucket_name: 'demo-test-bucket',
      folder: 'demo',
      region: 'us-east-1',
      file_name: '',
      source_path: '',
    });
    setFtpForm({
      protocol: 'sftp',
      host: '',
      port: '22',
      username: '',
      password: '',
      folder: 'demo',
      file_name: '',
      source_path: '',
    });
    setGcsForm({
      bucket_name: '',
      folder: '',
      file_name: '',
      service_account_json: '',
      source_path: '',
    });
  };
  const openCfgEditor = (cfg?: CloudImportConfig) => {
    resetCfgForm();
    if (cfg) {
      setEditingCfg(cfg);
      setCfgName(cfg.name);
      setCfgProvider(cfg.provider);
      const c = cfg.credentials || {};
      const o = cfg.options || {};
      if (cfg.provider === 's3') {
        setS3Form({
          access_key_id: c.access_key_id || '',
          secret_access_key: '',
          bucket_name: o.bucket_name || '',
          folder: o.folder || '',
          region: c.region || 'us-east-1',
          file_name: o.file_name || '',
          source_path: o.source_path || '',
        });
      } else if (cfg.provider === 'ftp') {
        setFtpForm({
          protocol: c.protocol === 'ftp' ? 'ftp' : 'sftp',
          host: c.host || '',
          port: c.port || (c.protocol === 'ftp' ? '21' : '22'),
          username: c.username || '',
          password: '',
          folder: o.folder || '',
          file_name: o.file_name || '',
          source_path: o.source_path || '',
        });
      } else {
        setGcsForm({
          bucket_name: o.bucket_name || '',
          folder: o.folder || '',
          file_name: o.file_name || '',
          service_account_json: '',
          source_path: o.source_path || '',
        });
      }
      // Hydrate schedule fields from the saved row so the user can review /
      // tweak existing settings on Step 2. Cron is mandatory now, so the
      // editor always treats the schedule as enabled.
      setSchedEnabled(true);
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

  // ── Cron helpers ─────────────────────────────────────────
  // Build a 5-field cron from the simple-mode inputs, or pass through the
  // raw expression in custom mode. The backend (cron-parser) re-validates it.
  const buildCron = (): string => {
    if (schedFreq === 'custom') return schedCustomCron.trim();
    const [hh, mm] = (schedTime || '00:00')
      .split(':')
      .map((s) => parseInt(s, 10) || 0);
    if (schedFreq === 'hourly') return `0 * * * *`;
    if (schedFreq === 'daily') return `${mm} ${hh} * * *`;
    if (schedFreq === 'weekly') return `${mm} ${hh} * * ${schedDow}`;
    return `${mm} ${hh} ${schedDom} * *`;
  };
  // Best-effort reverse parse so editing an existing schedule shows the right
  // preset. Anything we can't classify falls into the custom bucket so the
  // raw cron stays editable.
  function parseCronToPreset(cron: string): {
    freq: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
    time?: string;
    dow?: string;
    dom?: string;
    custom?: string;
  } {
    const parts = (cron || '').trim().split(/\s+/);
    if (parts.length !== 5) return { freq: 'daily' };
    const [m, h, dom, mon, dow] = parts;
    const isNum = (s: string) => /^[0-9]+$/.test(s);
    const time = (hh: string, mm: string) =>
      `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
    if (m === '0' && h === '*' && dom === '*' && mon === '*' && dow === '*')
      return { freq: 'hourly' };
    if (isNum(m) && isNum(h) && dom === '*' && mon === '*' && dow === '*')
      return { freq: 'daily', time: time(h, m) };
    if (isNum(m) && isNum(h) && dom === '*' && mon === '*' && isNum(dow))
      return { freq: 'weekly', time: time(h, m), dow };
    if (isNum(m) && isNum(h) && isNum(dom) && mon === '*' && dow === '*')
      return { freq: 'monthly', time: time(h, m), dom };
    return { freq: 'custom', custom: cron };
  }

  const { data, isLoading } = useQuery({
    queryKey: ['contact-list', id],
    queryFn: () => getContactList(id!),
  });
  // Server-side pagination for the Contacts table. Backend caps per_page at
  // 200; 5 keeps the table compact and the API response small.
  const CONTACTS_PER_PAGE = 5;
  const [contactsPage, setContactsPage] = useState(1);
  const { data: contacts, isLoading: loadC } = useQuery({
    queryKey: ['contacts', id, contactsPage],
    queryFn: () =>
      fetch(
        `/v1/contact-lists/${id}/contacts?per_page=${CONTACTS_PER_PAGE}&page=${contactsPage}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        },
      ).then((r) => r.json()),
    placeholderData: (prev) => prev,
  });
  const { data: attrs } = useQuery({
    queryKey: ['contact-list-attributes', id],
    queryFn: () => getContactListAttributes(id!),
  });

  // Reserved keys live as real columns on `contacts` and have dedicated
  // inputs in the modal. Everything else selected goes into custom_fields.
  const RESERVED_SYSTEM_KEYS = new Set([
    'phone_number',
    'first_name',
    'last_name',
    'email',
    'timezone',
    'alternate_phone_number',
    'priority',
    'assigned_agent_id',
  ]);
  const customFieldDefs = (attrs?.data || []).filter(
    (r: any) => r.is_selected && !RESERVED_SYSTEM_KEYS.has(r.field_key),
  );

  // Coerce form value strings into typed values per the attribute's data_type.
  const coerceCustom = (def: any, raw: any) => {
    if (raw === '' || raw === undefined || raw === null) return undefined;
    const t = String(def.data_type).toUpperCase();
    if (t === 'INTEGER' || t === 'LONG') {
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? raw : n;
    }
    if (t === 'FLOAT') {
      const n = parseFloat(raw);
      return Number.isNaN(n) ? raw : n;
    }
    if (t === 'BOOLEAN') return !!raw;
    return raw;
  };

  const closeAddContact = () => {
    setShowAddContact(false);
    setAddMode('single');
    setContact({
      phone_number: '',
      first_name: '',
      last_name: '',
      email: '',
      timezone: '',
      priority: '100',
    });
    setCustomFieldValues({});
    setBulkRows([
      { phone_number: '' },
      { phone_number: '' },
      { phone_number: '' },
    ]);
    setBulkProgress(null);
  };

  // Build a typed custom_fields object for one bulk row.
  const buildBulkCustomFields = (row: Record<string, any>) => {
    const cf: Record<string, any> = {};
    for (const def of customFieldDefs) {
      const v = coerceCustom(def, row[def.field_key]);
      if (v !== undefined) cf[def.field_key] = v;
    }
    return cf;
  };

  // Submits each non-empty bulk row sequentially. Captures per-row errors so
  // partial success is preserved (already-imported rows stay in the DB).
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
      for (const { row, idx } of candidates) {
        try {
          await addContact({
            contact_list_id: id,
            phone_number: String(row.phone_number).trim(),
            priority: 100,
            custom_fields: buildBulkCustomFields(row),
          });
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
    },
  });

  const addMut = useMutation({
    mutationFn: () => {
      const cf: Record<string, any> = {};
      for (const def of customFieldDefs) {
        const v = coerceCustom(def, customFieldValues[def.field_key]);
        if (v !== undefined) cf[def.field_key] = v;
      }
      return addContact({
        contact_list_id: id,
        ...contact,
        priority: parseInt(contact.priority),
        custom_fields: cf,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      closeAddContact();
    },
  });

  // List of saved cloud-import profiles for the current org. Loaded lazily
  // when the modal is opened so the page itself isn't slowed down.
  const cloudConfigsQ = useQuery({
    queryKey: ['cloud-import-configs'],
    queryFn: () => listCloudImportConfigs().then((r) => r.data),
    enabled: showCloudImport,
  });

  // Builds the { credentials, options } payload from whichever provider the
  // editor currently has selected. Shared by the create/update mutations.
  const buildCfgPayload = () => {
    if (cfgProvider === 's3') {
      return {
        credentials: {
          access_key_id: s3Form.access_key_id,
          secret_access_key: s3Form.secret_access_key,
          region: s3Form.region,
        },
        options: {
          bucket_name: s3Form.bucket_name,
          folder: s3Form.folder,
          file_name: s3Form.file_name || undefined,
          source_path: s3Form.source_path || undefined,
        },
      };
    }
    if (cfgProvider === 'ftp') {
      return {
        credentials: {
          protocol: ftpForm.protocol,
          host: ftpForm.host,
          port: ftpForm.port,
          username: ftpForm.username,
          password: ftpForm.password,
        },
        options: {
          folder: ftpForm.folder,
          file_name: ftpForm.file_name || undefined,
          source_path: ftpForm.source_path || undefined,
        },
      };
    }
    return {
      credentials: { service_account_json: gcsForm.service_account_json },
      options: {
        bucket_name: gcsForm.bucket_name,
        folder: gcsForm.folder,
        file_name: gcsForm.file_name || undefined,
        source_path: gcsForm.source_path || undefined,
      },
    };
  };

  // Step 1 commit: save the connection (POST or PUT) and advance to Step 2.
  // The new id (or the editing id) is captured into savedCfgId so the
  // schedule mutation can target the right row.
  const saveCfgMut = useMutation({
    mutationFn: () => {
      const body = {
        name: cfgName.trim(),
        provider: cfgProvider,
        ...buildCfgPayload(),
      };
      return editingCfg
        ? updateCloudImportConfig(editingCfg.id, body)
        : createCloudImportConfig(body);
    },
    onSuccess: (saved: CloudImportConfig) => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
      setSavedCfgId(saved.id);
      // Keep editingCfg in sync so re-saving Step 1 from Step 2's Back
      // button does a PUT instead of another POST.
      setEditingCfg(saved);
      setCfgStep(2);
    },
  });

  // Step 2 commit: PUT /:id/schedule. When enabled=false the backend clears
  // the cron / next_refresh. After save we close the wizard.
  const saveSchedMut = useMutation({
    mutationFn: () => {
      const cfgId = savedCfgId || editingCfg?.id;
      if (!cfgId) throw new Error('No config to schedule');
      return updateCloudImportConfigSchedule(cfgId, {
        enabled: schedEnabled,
        cron_expression: schedEnabled ? buildCron() : undefined,
        timezone: schedTz || 'UTC',
        contact_list_id: schedEnabled ? id! : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
      setShowCfgEditor(false);
      resetCfgForm();
      saveCfgMut.reset();
    },
  });

  const deleteCfgMut = useMutation({
    mutationFn: (cfgId: string) => deleteCloudImportConfig(cfgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });

  // Activate / Inactive toggle for the row's kebab menu. Reuses the schedule
  // endpoint: when enabling we have to re-send the previously stored cron and
  // contact_list_id (the backend rejects enabled=true without them).
  const toggleScheduleMut = useMutation({
    mutationFn: ({
      cfg,
      enabled,
    }: {
      cfg: CloudImportConfig;
      enabled: boolean;
    }) =>
      updateCloudImportConfigSchedule(cfg.id, {
        enabled,
        cron_expression: enabled ? cfg.cron_expression || undefined : undefined,
        timezone: cfg.timezone || 'UTC',
        contact_list_id: enabled ? cfg.contact_list_id || id! : undefined,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
      setCloudStatus(
        `✓ Schedule ${vars.enabled ? 'activated' : 'deactivated'}.`,
      );
    },
    onError: (err: any) => {
      setCloudStatus(
        `Error: ${err.response?.data?.error || err.message || 'Failed to update schedule'}`,
      );
    },
  });

  // Kebab menu open state. We track the screen-space anchor coords so the
  // dropdown can render with position:fixed — the Table wrapper uses
  // overflow-x-auto which clips absolute children on the y-axis.
  const [rowMenu, setRowMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // Manual on-demand run of a saved profile against the current contact list.
  // The backend reads the credentials/options from the cloud_import_configs
  // row identified by config_id, connects to S3 / FTP / GCS, downloads the
  // file(s), parses the CSV, and inserts the rows into contacts. The result
  // counts (imported / failed / files) are surfaced in the status banner.
  const runCfgMut = useMutation({
    mutationFn: (cfgId: string) =>
      cloudImportContacts(id!, { config_id: cfgId }),
    onMutate: () => setCloudStatus('Connecting and downloading...'),
    onSuccess: (result: any) => {
      const failedNote =
        result.failed_rows > 0 ? `, ${result.failed_rows} failed` : '';
      setCloudStatus(
        `✓ Imported ${result.imported_rows} of ${result.total_rows} contacts from ${result.files?.length || 0} file(s)${failedNote}.`,
      );
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
    onError: (err: any) => {
      setCloudStatus(
        `Error: ${err.response?.data?.error || err.message || 'Cloud import failed'}`,
      );
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Uploading...');
    setUploadErrors([]);
    setShowUploadErrors(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('contact_list_id', id!);
      const result = await uploadCSV(fd);
      const errs = (result.errors || []) as {
        row: number;
        phone: string;
        error: string;
      }[];
      setUploadErrors(errs);
      setShowUploadErrors(errs.length > 0 && errs.length <= 50);
      const prefix = result.imported_rows > 0 ? '✓' : '⚠';
      setUploadStatus(
        `${prefix} Imported ${result.imported_rows} of ${result.total_rows} contacts` +
          (result.failed_rows > 0 ? `, ${result.failed_rows} failed` : ''),
      );
      qc.invalidateQueries({ queryKey: ['contacts', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
    } catch (err: any) {
      setUploadStatus(`Error: ${err.response?.data?.error || 'Upload failed'}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (isLoading) return <PageLoader />;
  if (!data) return <div className='p-6 text-gray-400'>List not found</div>;

  return (
    <div className='p-6 space-y-5'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <button
          onClick={() => navigate('/contact-lists')}
          className='p-1.5 hover:bg-gray-100 rounded-lg'
        >
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: "Syne, sans-serif" }}>{data.name}</h1>
          {data.description && (
            <p className='text-sm text-[#7A5C44] mt-0.5'>{data.description}</p>
          )}
        </div>
        <div className='flex gap-2'>
          <Button
            variant='secondary'
            icon={<Settings2 className='w-4 h-4' />}
            onClick={() => navigate(`/contact-lists/${id}/attributes`)}
          >
            Manage Attributes
          </Button>
          <Button
            variant='secondary'
            icon={<Download className='w-4 h-4' />}
            onClick={() => downloadContactListCsvTemplate(id!, data.name)}
          >
            CSV Template
          </Button>
          <Button
            variant='secondary'
            icon={<Upload className='w-4 h-4' />}
            onClick={() => fileRef.current?.click()}
          >
            Upload CSV
          </Button>
          <input
            ref={fileRef}
            type='file'
            accept='.csv'
            className='hidden'
            onChange={handleFileUpload}
          />
          <Button
            variant='secondary'
            icon={<Cloud className='w-4 h-4' />}
            onClick={() => setShowCloudImport(true)}
          >
            Cloud Import
          </Button>
          <Button
            icon={<Plus className='w-4 h-4' />}
            onClick={() => setShowAddContact(true)}
          >
            Add Contact
          </Button>
        </div>
      </div>

      {uploadStatus && (
        <div
          className={`p-3 rounded-lg text-sm ${
            uploadStatus.startsWith('✓')
              ? 'bg-green-50 text-green-700'
              : uploadStatus.startsWith('⚠')
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
          }`}
        >
          {uploadStatus}
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className='border border-amber-200 bg-amber-50 rounded-lg text-sm'>
          <button
            type='button'
            onClick={() => setShowUploadErrors((s) => !s)}
            className='w-full flex items-center justify-between px-4 py-2.5 text-left text-amber-800 font-medium'
          >
            <span>
              {uploadErrors.length} validation{' '}
              {uploadErrors.length === 1 ? 'error' : 'errors'}
            </span>
            <span className='text-xs text-amber-600'>
              {showUploadErrors ? 'Hide' : 'Show'} details
            </span>
          </button>
          {showUploadErrors && (
            <div className='border-t border-amber-200 max-h-64 overflow-auto'>
              <table className='w-full text-xs'>
                <thead className='bg-amber-100/50 sticky top-0'>
                  <tr>
                    <th className='text-left px-3 py-1.5 text-amber-800 font-medium w-16'>
                      Row
                    </th>
                    <th className='text-left px-3 py-1.5 text-amber-800 font-medium w-40'>
                      Phone
                    </th>
                    <th className='text-left px-3 py-1.5 text-amber-800 font-medium'>
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {uploadErrors.slice(0, 200).map((e, i) => (
                    <tr key={i} className='border-t border-amber-100 align-top'>
                      <td className='px-3 py-1.5 font-mono text-amber-700'>
                        {e.row === 0 ? '—' : e.row}
                      </td>
                      <td className='px-3 py-1.5 font-mono text-gray-700'>
                        {e.phone || '—'}
                      </td>
                      <td className='px-3 py-1.5 text-gray-700'>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uploadErrors.length > 200 && (
                <div className='px-3 py-2 text-xs text-amber-700 border-t border-amber-100'>
                  Showing first 200 of {uploadErrors.length} errors.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className='grid grid-cols-3 gap-4'>
        <StatCard
          label='Total Contacts'
          value={(data.contact_count || 0).toLocaleString()}
          color='indigo'
        />
        <StatCard
          label='Field Definitions'
          value={data.field_definitions?.length || 0}
          color='gray'
        />
        <StatCard
          label='Last Updated'
          value={new Date(data.updated_at || data.created_at).toLocaleString()}
          color='gray'
        />
      </div>

      {/* Contacts table */}
      <Card>
        <CardHeader title={`Contacts (${contacts?.total || 0})`} />
        {loadC ? (
          <PageLoader />
        ) : (
          (() => {
            // Only library attributes saved (selected) in Manage Attributes
            // get a dedicated column. Reserved system keys read from real
            // `contacts` columns; remaining library keys read from
            // `custom_fields`. phone_number is rendered as the leading Phone
            // column instead.
            const libraryCols = (attrs?.data || [])
              .filter(
                (d: any) =>
                  d.source === 'library' &&
                  d.is_selected &&
                  d.field_key !== 'phone_number',
              )
              .map((d: any) => {
                const isReserved = RESERVED_SYSTEM_KEYS.has(d.field_key);
                return {
                  header: d.name,
                  render: (r: any) => {
                    const v = isReserved
                      ? r[d.field_key]
                      : r.custom_fields?.[d.field_key];
                    if (v === undefined || v === null || v === '')
                      return <span className='text-gray-400'>—</span>;
                    return (
                      <span className='text-gray-700 text-sm'>{String(v)}</span>
                    );
                  },
                };
              });
            // Only `source === 'custom_list'` keys belong in the consolidated
            // Custom Fields column.
            const customListKeys = customFieldDefs
              .filter((d: any) => d.source === 'custom_list')
              .map((d: any) => d.field_key);
            const cols: any[] = [
              { header: 'Phone', key: 'phone_number' },
              ...libraryCols,
            ];
            if (customListKeys.length > 0) {
              cols.push({
                header: 'Custom Fields',
                render: (r: any) => {
                  const entries = customListKeys
                    .map((k: string) => [k, r.custom_fields?.[k]])
                    .filter(
                      ([, v]: any) => v !== undefined && v !== null && v !== '',
                    );
                  if (!entries.length)
                    return <span className='text-gray-400'>—</span>;
                  return (
                    <span className='text-xs text-gray-500 font-mono'>
                      {entries.map(([k, v]: any) => `${k}: ${v}`).join(' · ')}
                    </span>
                  );
                },
              });
            }
            const total = contacts?.total || 0;
            const totalPages = Math.max(
              1,
              Math.ceil(total / CONTACTS_PER_PAGE),
            );
            const startIdx =
              total === 0 ? 0 : (contactsPage - 1) * CONTACTS_PER_PAGE + 1;
            const endIdx = Math.min(contactsPage * CONTACTS_PER_PAGE, total);
            return (
              <>
                <Table
                  cols={cols}
                  rows={contacts?.data || []}
                  keyFn={(r: any) => r.id}
                  emptyMessage='No contacts yet — upload a CSV or add manually'
                />
                {total > 0 && (
                  <div className='flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm'>
                    <span className='text-gray-500'>
                      Showing {startIdx}–{endIdx} of {total}
                    </span>
                    <div className='flex items-center gap-2'>
                      <Button
                        variant='secondary'
                        icon={<ChevronLeft className='w-4 h-4' />}
                        disabled={contactsPage <= 1}
                        onClick={() =>
                          setContactsPage((p) => Math.max(1, p - 1))
                        }
                      >
                        Prev
                      </Button>
                      <span className='text-gray-600 px-2'>
                        Page {contactsPage} of {totalPages}
                      </span>
                      <Button
                        variant='secondary'
                        icon={<ChevronRight className='w-4 h-4' />}
                        disabled={contactsPage >= totalPages}
                        onClick={() =>
                          setContactsPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()
        )}
      </Card>

      {/* Add contact modal */}
      <Modal
        title='Add Contact'
        open={showAddContact}
        onClose={closeAddContact}
        size={addMode === 'bulk' ? 'xl' : 'lg'}
      >
        <div className='mb-4 flex items-center gap-3'>
          <label className='text-xs text-gray-500'>Mode</label>
          <select
            value={addMode}
            onChange={(e) => setAddMode(e.target.value as 'single' | 'bulk')}
            className='border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
          >
            <option value='single'>Single Upload</option>
            <option value='bulk'>Bulk Upload</option>
          </select>
        </div>

        {addMode === 'single' ? (
          <div className='space-y-5 max-h-[70vh] overflow-y-auto pr-1'>
            <Input
              label='Phone Number (E.164) *'
              value={contact.phone_number}
              onChange={(e) =>
                setContact((c) => ({ ...c, phone_number: e.target.value }))
              }
              placeholder='+12125550101'
            />

            {customFieldDefs.length > 0 && (
              <section>
                <div className='grid grid-cols-2 gap-3'>
                  {customFieldDefs.map((def: any) => {
                    const t = String(def.data_type).toUpperCase();
                    const isNumber =
                      t === 'INTEGER' || t === 'LONG' || t === 'FLOAT';
                    const isDate = t === 'TIMESTAMP';
                    const isBool = t === 'BOOLEAN';
                    const required = def.field_key === 'system_contact_id';
                    const labelEl = (
                      <span className='flex items-center gap-1'>
                        {def.name}
                        {required && <span className='text-red-500'>*</span>}
                        {def.source === 'custom_list' && (
                          <span className='text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-purple-50 text-purple-700 font-medium'>
                            custom
                          </span>
                        )}
                      </span>
                    );
                    if (isBool) {
                      return (
                        <label
                          key={def.id}
                          className='flex items-center gap-2 text-xs text-gray-700 col-span-2 px-3 py-2 border border-gray-200 rounded-lg'
                        >
                          <input
                            type='checkbox'
                            checked={!!customFieldValues[def.field_key]}
                            onChange={(e) =>
                              setCustomFieldValues((v) => ({
                                ...v,
                                [def.field_key]: e.target.checked,
                              }))
                            }
                            className='rounded text-indigo-600'
                          />
                          {labelEl}
                        </label>
                      );
                    }
                    return (
                      <div key={def.id}>
                        <label className='block text-xs text-gray-500 mb-1'>
                          {labelEl}
                        </label>
                        <input
                          type={
                            isNumber
                              ? 'number'
                              : isDate
                                ? 'datetime-local'
                                : 'text'
                          }
                          value={customFieldValues[def.field_key] ?? ''}
                          onChange={(e) =>
                            setCustomFieldValues((v) => ({
                              ...v,
                              [def.field_key]: e.target.value,
                            }))
                          }
                          placeholder={def.field_key}
                          className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : (
          <BulkGrid
            customFieldDefs={customFieldDefs}
            rows={bulkRows}
            setRows={setBulkRows}
            progress={bulkProgress}
            disabled={bulkMut.isPending}
          />
        )}

        <div className='flex gap-3 pt-4 mt-4 border-t border-gray-100'>
          <Button
            variant='secondary'
            className='flex-1'
            onClick={closeAddContact}
          >
            Cancel
          </Button>
          {addMode === 'single' ? (
            <Button
              className='flex-1'
              loading={addMut.isPending}
              disabled={!contact.phone_number}
              onClick={() => addMut.mutate()}
            >
              Add Contact
            </Button>
          ) : (
            <Button
              className='flex-1'
              loading={bulkMut.isPending}
              disabled={bulkRows.every(
                (r) => String(r.phone_number || '').trim() === '',
              )}
              onClick={() => bulkMut.mutate()}
            >
              Import Contacts
            </Button>
          )}
        </div>
        {addMut.isError && addMode === 'single' && (
          <p className='text-xs text-red-500 mt-2'>
            {(addMut.error as any)?.response?.data?.error}
          </p>
        )}
      </Modal>

      {/* Cloud Import — table of saved S3/FTP/GCS profiles. Each row can be
          run, edited, or deleted; a separate Add/Edit modal handles the form. */}
      <Modal
        title='Cloud Import'
        open={showCloudImport}
        onClose={closeCloudImport}
        size='xl'
      >
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <p className='text-xs text-gray-500'>
              Saved connections to S3, FTP/SFTP, or Google Cloud Storage. Run a
              profile to import its CSVs into{' '}
              <span className='font-medium text-gray-700'>{data.name}</span>.
            </p>
            <Button
              size='sm'
              icon={<Plus className='w-4 h-4' />}
              onClick={() => openCfgEditor()}
            >
              Add New
            </Button>
          </div>

          {cloudStatus && (
            <div
              className={`p-3 rounded-lg text-xs ${
                cloudStatus.startsWith('✓')
                  ? 'bg-green-50 text-green-700'
                  : cloudStatus.startsWith('Error')
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700'
              }`}
            >
              {cloudStatus}
            </div>
          )}

          {cloudConfigsQ.isLoading ? (
            <div className='py-10 text-center text-xs text-gray-400'>
              Loading…
            </div>
          ) : (cloudConfigsQ.data || []).length === 0 ? (
            <EmptyState
              title='No cloud connections yet'
              description='Add an S3 bucket, FTP server, or GCS bucket to import contacts on demand.'
            />
          ) : (
            <Table<CloudImportConfig>
              keyFn={(r) => r.id}
              rows={cloudConfigsQ.data || []}
              cols={[
                {
                  header: 'Name',
                  render: (r) => (
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  ),
                },
                {
                  header: 'Provider',
                  width: '120px',
                  render: (r) => {
                    const styles: Record<CloudProvider, string> = {
                      s3: 'bg-orange-50 text-orange-700',
                      ftp: 'bg-blue-50 text-blue-700',
                      gcs: 'bg-emerald-50 text-emerald-700',
                    };
                    const labels: Record<CloudProvider, string> = {
                      s3: 'Amazon S3',
                      ftp: 'FTP / SFTP',
                      gcs: 'Google Cloud',
                    };
                    return (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${styles[r.provider]}`}
                      >
                        {labels[r.provider]}
                      </span>
                    );
                  },
                },
                {
                  header: 'Source',
                  render: (r) => {
                    const o = r.options || {};
                    const c = r.credentials || {};
                    // source_path overrides folder + file_name when set; the
                    // bucket / host prefix is always shown for context.
                    const path =
                      o.source_path ||
                      `${o.folder || ''}${o.file_name ? (o.folder ? '/' : '') + o.file_name : ''}`;
                    const prefix =
                      r.provider === 'ftp'
                        ? `${c.protocol || 'sftp'}://${c.host || '?'}/`
                        : `${o.bucket_name || '?'}/`;
                    return (
                      <span className='font-mono text-xs text-gray-600'>
                        {prefix}
                        {path}
                      </span>
                    );
                  },
                },
                {
                  header: 'Status',
                  width: '90px',
                  render: (r) =>
                    r.schedule_enabled ? (
                      <Badge label='Active' color='green' />
                    ) : (
                      <Badge label='Inactive' color='gray' />
                    ),
                },
                {
                  header: 'Last Refresh',
                  width: '160px',
                  render: (r) =>
                    r.last_refresh ? (
                      <span className='text-xs text-gray-500'>
                        {new Date(r.last_refresh).toLocaleString()}
                      </span>
                    ) : (
                      <span className='text-xs text-gray-300'>—</span>
                    ),
                },
                {
                  header: 'Next Refresh',
                  width: '160px',
                  render: (r) =>
                    r.schedule_enabled && r.next_refresh ? (
                      <span className='text-xs text-indigo-700'>
                        {new Date(r.next_refresh).toLocaleString()}
                      </span>
                    ) : (
                      <span className='text-xs text-gray-300'>—</span>
                    ),
                },
                {
                  header: 'Actions',
                  width: '80px',
                  render: (r) => (
                    <button
                      type='button'
                      title='More actions'
                      onClick={(e) => {
                        e.stopPropagation();
                        // Anchor the fixed-position dropdown to the kebab's
                        // bottom-right so it lines up under the icon even
                        // when the table is mid-scroll.
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        setRowMenu(
                          rowMenu?.id === r.id
                            ? null
                            : {
                                id: r.id,
                                x: rect.right,
                                y: rect.bottom + 4,
                              },
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

          {/* Row kebab menu. Rendered with position:fixed so the table's
              overflow-x-auto wrapper can't clip it. The transparent backdrop
              swallows outside clicks to close. */}
          {rowMenu &&
            (() => {
              const r = (cloudConfigsQ.data || []).find(
                (c) => c.id === rowMenu.id,
              );
              if (!r) return null;
              const close = () => setRowMenu(null);
              return (
                <>
                  <div className='fixed inset-0 z-40' onClick={close} />
                  <div
                    style={{
                      position: 'fixed',
                      left: rowMenu.x - 176, // 11rem panel width, right-aligned
                      top: rowMenu.y,
                    }}
                    className='z-50 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm'
                  >
                    {r.schedule_enabled ? (
                      <MenuItem
                        icon={<PowerOff className='w-3.5 h-3.5' />}
                        label='Inactive'
                        onClick={() => {
                          close();
                          toggleScheduleMut.mutate({ cfg: r, enabled: false });
                        }}
                      />
                    ) : (
                      <MenuItem
                        icon={<Power className='w-3.5 h-3.5' />}
                        label='Activate'
                        onClick={() => {
                          close();
                          // Activate = pull the cloud file right now.
                          // If a cron is already set, also flip the schedule
                          // on so the toggle reflects the new state. No cron
                          // means we still run the immediate import; the
                          // schedule stays off until the user sets one.
                          runCfgMut.mutate(r.id);
                          if (r.cron_expression) {
                            toggleScheduleMut.mutate({ cfg: r, enabled: true });
                          }
                        }}
                      />
                    )}
                    <MenuItem
                      icon={<Pencil className='w-3.5 h-3.5' />}
                      label='Edit'
                      onClick={() => {
                        close();
                        openCfgEditor(r);
                      }}
                    />
                    <MenuItem
                      icon={<Trash2 className='w-3.5 h-3.5' />}
                      label='Delete'
                      danger
                      onClick={() => {
                        close();
                        if (
                          window.confirm(`Delete cloud connection "${r.name}"?`)
                        )
                          deleteCfgMut.mutate(r.id);
                      }}
                    />
                  </div>
                </>
              );
            })()}
        </div>
      </Modal>

      {/* Cloud Import — Add/Edit profile modal. Provider dropdown swaps the
          form fields below it. */}
      <CloudConfigEditor
        open={showCfgEditor}
        editing={editingCfg}
        name={cfgName}
        setName={setCfgName}
        provider={cfgProvider}
        setProvider={setCfgProvider}
        s3Form={s3Form}
        setS3Form={setS3Form}
        ftpForm={ftpForm}
        setFtpForm={setFtpForm}
        gcsForm={gcsForm}
        setGcsForm={setGcsForm}
        saving={saveCfgMut.isPending}
        error={
          (saveCfgMut.error as any)?.response?.data?.error ||
          (saveSchedMut.error as any)?.response?.data?.error
        }
        step={cfgStep}
        setStep={setCfgStep}
        schedEnabled={schedEnabled}
        setSchedEnabled={setSchedEnabled}
        schedFreq={schedFreq}
        setSchedFreq={setSchedFreq}
        schedTime={schedTime}
        setSchedTime={setSchedTime}
        schedDow={schedDow}
        setSchedDow={setSchedDow}
        schedDom={schedDom}
        setSchedDom={setSchedDom}
        schedCustomCron={schedCustomCron}
        setSchedCustomCron={setSchedCustomCron}
        schedTz={schedTz}
        setSchedTz={setSchedTz}
        cronPreview={buildCron()}
        savingSched={saveSchedMut.isPending}
        onClose={() => {
          setShowCfgEditor(false);
          resetCfgForm();
          saveCfgMut.reset();
          saveSchedMut.reset();
        }}
        onSaveStep1={() => saveCfgMut.mutate()}
        onSaveStep2={() => saveSchedMut.mutate()}
      />
    </div>
  );
}

// Spreadsheet-style grid for bulk contact entry. Phone is always the first
// column; remaining columns are derived from the list's selected attributes.
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
  progress: {
    done: number;
    failed: number;
    total: number;
    errors: { row: number; error: string }[];
  } | null;
  disabled: boolean;
}) {
  const updateCell = (i: number, key: string, value: any) =>
    setRows((rs) =>
      rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)),
    );
  const addRow = () => setRows((rs) => [...rs, { phone_number: '' }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  const cellCls =
    'w-full border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset bg-transparent';
  const thCls =
    'text-left text-[11px] uppercase tracking-wide text-gray-500 font-medium px-2 py-2 border-b border-gray-200 bg-gray-50';
  const tdCls = 'border-b border-gray-100 align-top';

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-xs text-gray-500'>
          Enter one contact per row. Empty rows are skipped on import.
        </p>
        <Button
          variant='secondary'
          icon={<Plus className='w-3.5 h-3.5' />}
          onClick={addRow}
          disabled={disabled}
        >
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
                  <span className='flex items-center gap-1'>
                    {def.name}
                    {def.field_key === 'system_contact_id' && (
                      <span className='text-red-500'>*</span>
                    )}
                    {def.source === 'custom_list' && (
                      <span className='text-[9px] normal-case px-1 py-0.5 rounded bg-purple-50 text-purple-700'>
                        custom
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className={thCls + ' w-10'}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className='hover:bg-gray-50/50'>
                <td className={tdCls + ' text-xs text-gray-400 px-2 py-1.5'}>
                  {i + 1}
                </td>
                <td className={tdCls}>
                  <input
                    type='tel'
                    value={row.phone_number ?? ''}
                    onChange={(e) =>
                      updateCell(i, 'phone_number', e.target.value)
                    }
                    placeholder='+12125550101'
                    disabled={disabled}
                    className={cellCls}
                  />
                </td>
                {customFieldDefs.map((def: any) => {
                  const t = String(def.data_type).toUpperCase();
                  const isNumber =
                    t === 'INTEGER' || t === 'LONG' || t === 'FLOAT';
                  const isDate = t === 'TIMESTAMP';
                  const isBool = t === 'BOOLEAN';
                  if (isBool) {
                    return (
                      <td key={def.id} className={tdCls + ' px-2 py-1.5'}>
                        <input
                          type='checkbox'
                          checked={!!row[def.field_key]}
                          onChange={(e) =>
                            updateCell(i, def.field_key, e.target.checked)
                          }
                          disabled={disabled}
                          className='rounded text-indigo-600'
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={def.id} className={tdCls}>
                      <input
                        type={
                          isNumber
                            ? 'number'
                            : isDate
                              ? 'datetime-local'
                              : 'text'
                        }
                        value={row[def.field_key] ?? ''}
                        onChange={(e) =>
                          updateCell(i, def.field_key, e.target.value)
                        }
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
                    title='Remove row'
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
            {progress.failed > 0 && (
              <span className='text-red-600'> · {progress.failed} failed</span>
            )}
          </p>
          {progress.errors.length > 0 && (
            <ul className='text-red-500 list-disc pl-5 max-h-24 overflow-y-auto'>
              {progress.errors.map((e, idx) => (
                <li key={idx}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Single row in the kebab dropdown. `danger` recolours the label red and
// `disabled` greys it out / blocks the click while still showing the tooltip.
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

// Add/Edit modal for a single cloud_import_configs row. Two-step wizard:
// Step 1 — connection (provider dropdown swaps the form fields between
// S3 / FTP / GCS schemas). Step 2 — schedule (frequency preset + cron).
function CloudConfigEditor({
  open,
  editing,
  name,
  setName,
  provider,
  setProvider,
  s3Form,
  setS3Form,
  ftpForm,
  setFtpForm,
  gcsForm,
  setGcsForm,
  saving,
  error,
  step,
  setStep,
  schedEnabled,
  setSchedEnabled,
  schedFreq,
  setSchedFreq,
  schedTime,
  setSchedTime,
  schedDow,
  setSchedDow,
  schedDom,
  setSchedDom,
  schedCustomCron,
  setSchedCustomCron,
  schedTz,
  setSchedTz,
  cronPreview,
  savingSched,
  onClose,
  onSaveStep1,
  onSaveStep2,
}: {
  open: boolean;
  editing: CloudImportConfig | null;
  name: string;
  setName: (v: string) => void;
  provider: CloudProvider;
  setProvider: (v: CloudProvider) => void;
  s3Form: any;
  setS3Form: React.Dispatch<React.SetStateAction<any>>;
  ftpForm: any;
  setFtpForm: React.Dispatch<React.SetStateAction<any>>;
  gcsForm: any;
  setGcsForm: React.Dispatch<React.SetStateAction<any>>;
  saving: boolean;
  error?: string;
  step: 1 | 2;
  setStep: (s: 1 | 2) => void;
  schedEnabled: boolean;
  setSchedEnabled: (v: boolean) => void;
  schedFreq: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  setSchedFreq: (
    v: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom',
  ) => void;
  schedTime: string;
  setSchedTime: (v: string) => void;
  schedDow: string;
  setSchedDow: (v: string) => void;
  schedDom: string;
  setSchedDom: (v: string) => void;
  schedCustomCron: string;
  setSchedCustomCron: (v: string) => void;
  schedTz: string;
  setSchedTz: (v: string) => void;
  cronPreview: string;
  savingSched: boolean;
  onClose: () => void;
  onSaveStep1: () => void;
  onSaveStep2: () => void;
}) {
  // When editing, secret fields are intentionally blank (the backend never
  // ships them back). An empty value tells the backend to keep the previously
  // stored secret, so the Save button doesn't require them to be re-typed.
  const canSave =
    name.trim().length > 0 &&
    (provider === 's3'
      ? s3Form.bucket_name &&
        s3Form.access_key_id &&
        (editing || s3Form.secret_access_key)
      : provider === 'ftp'
        ? ftpForm.host && ftpForm.username && (editing || ftpForm.password)
        : gcsForm.bucket_name && (editing || gcsForm.service_account_json));

  return (
    <Modal
      title={
        step === 1
          ? editing
            ? 'Edit Cloud Connection'
            : 'Add Cloud Connection'
          : 'Schedule Automatic Imports'
      }
      open={open}
      onClose={onClose}
      size='lg'
    >
      {/* Step indicator */}
      <div className='flex items-center gap-2 mb-4 text-xs'>
        <span
          className={`px-2 py-1 rounded-full ${step === 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}
        >
          1. Connection
        </span>
        <span className='text-gray-300'>→</span>
        <span
          className={`px-2 py-1 rounded-full ${step === 2 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}
        >
          2. Schedule
        </span>
      </div>

      {step === 1 && (
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <Input
              label='Connection Name *'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. Production S3 nightly'
            />
            <div>
              <label className='block text-xs text-gray-500 mb-1'>
                Provider *
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as CloudProvider)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                disabled={!!editing}
              >
                <option value='s3'>Amazon S3</option>
                <option value='ftp'>FTP / SFTP</option>
                <option value='gcs'>Google Cloud Storage</option>
              </select>
            </div>
          </div>

          {provider === 's3' && (
            <div className='grid grid-cols-2 gap-3'>
              <Input
                label='Access Key ID *'
                value={s3Form.access_key_id}
                onChange={(e) =>
                  setS3Form((f: any) => ({
                    ...f,
                    access_key_id: e.target.value,
                  }))
                }
                placeholder='AKIA...'
              />
              <Input
                label={
                  editing
                    ? 'Secret Access Key (leave blank to keep)'
                    : 'Secret Access Key *'
                }
                type='password'
                value={s3Form.secret_access_key}
                onChange={(e) =>
                  setS3Form((f: any) => ({
                    ...f,
                    secret_access_key: e.target.value,
                  }))
                }
                placeholder='••••••••••••'
              />
              <Input
                label='Bucket Name *'
                value={s3Form.bucket_name}
                onChange={(e) =>
                  setS3Form((f: any) => ({ ...f, bucket_name: e.target.value }))
                }
                placeholder='demo-test-bucket'
              />
              <Input
                label='Folder'
                value={s3Form.folder}
                onChange={(e) =>
                  setS3Form((f: any) => ({ ...f, folder: e.target.value }))
                }
                placeholder='demo'
              />
              <Input
                label='Region'
                value={s3Form.region}
                onChange={(e) =>
                  setS3Form((f: any) => ({ ...f, region: e.target.value }))
                }
                placeholder='us-east-1'
              />
              <Input
                label='File Name (optional)'
                value={s3Form.file_name}
                onChange={(e) =>
                  setS3Form((f: any) => ({ ...f, file_name: e.target.value }))
                }
                placeholder='contacts.csv'
              />
              <div className='col-span-2'>
                <Input
                  label='Source Path (optional, overrides Folder + File Name)'
                  value={s3Form.source_path}
                  onChange={(e) =>
                    setS3Form((f: any) => ({
                      ...f,
                      source_path: e.target.value,
                    }))
                  }
                  placeholder='data/2024/01/contacts.csv'
                />
              </div>
            </div>
          )}

          {provider === 'ftp' && (
            <div className='grid grid-cols-2 gap-3'>
              <div className='col-span-2 grid grid-cols-3 gap-3'>
                <div className='col-span-1'>
                  <label className='block text-xs text-gray-500 mb-1'>
                    Protocol
                  </label>
                  <select
                    value={ftpForm.protocol}
                    onChange={(e) =>
                      setFtpForm((f: any) => ({
                        ...f,
                        protocol: e.target.value as 'ftp' | 'sftp',
                      }))
                    }
                    className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                  >
                    <option value='sftp'>SFTP</option>
                    <option value='ftp'>FTP</option>
                  </select>
                </div>
                <div className='col-span-1'>
                  <Input
                    label='Host *'
                    value={ftpForm.host}
                    onChange={(e) =>
                      setFtpForm((f: any) => ({ ...f, host: e.target.value }))
                    }
                    placeholder='ftp.example.com'
                  />
                </div>
                <div className='col-span-1'>
                  <Input
                    label='Port'
                    value={ftpForm.port}
                    onChange={(e) =>
                      setFtpForm((f: any) => ({ ...f, port: e.target.value }))
                    }
                    placeholder='22'
                  />
                </div>
              </div>
              <Input
                label='Username *'
                value={ftpForm.username}
                onChange={(e) =>
                  setFtpForm((f: any) => ({ ...f, username: e.target.value }))
                }
              />
              <Input
                label={
                  editing ? 'Password (leave blank to keep)' : 'Password *'
                }
                type='password'
                value={ftpForm.password}
                onChange={(e) =>
                  setFtpForm((f: any) => ({ ...f, password: e.target.value }))
                }
                placeholder='••••••••••••'
              />
              <Input
                label='Folder'
                value={ftpForm.folder}
                onChange={(e) =>
                  setFtpForm((f: any) => ({ ...f, folder: e.target.value }))
                }
                placeholder='demo'
              />
              <Input
                label='File Name (optional)'
                value={ftpForm.file_name}
                onChange={(e) =>
                  setFtpForm((f: any) => ({ ...f, file_name: e.target.value }))
                }
                placeholder='contacts.csv'
              />
              <div className='col-span-2'>
                <Input
                  label='Source Path (optional, overrides Folder + File Name)'
                  value={ftpForm.source_path}
                  onChange={(e) =>
                    setFtpForm((f: any) => ({
                      ...f,
                      source_path: e.target.value,
                    }))
                  }
                  placeholder='/incoming/2024/contacts.csv'
                />
              </div>
            </div>
          )}

          {provider === 'gcs' && (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <Input
                  label='Bucket Name *'
                  value={gcsForm.bucket_name}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({
                      ...f,
                      bucket_name: e.target.value,
                    }))
                  }
                  placeholder='my-gcs-bucket'
                />
                <Input
                  label='Folder'
                  value={gcsForm.folder}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({ ...f, folder: e.target.value }))
                  }
                  placeholder='demo'
                />
                <Input
                  label='File Name (optional)'
                  value={gcsForm.file_name}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({
                      ...f,
                      file_name: e.target.value,
                    }))
                  }
                  placeholder='contacts.csv'
                />
                <div className='col-span-2'>
                  <Input
                    label='Source Path (optional, overrides Folder + File Name)'
                    value={gcsForm.source_path}
                    onChange={(e) =>
                      setGcsForm((f: any) => ({
                        ...f,
                        source_path: e.target.value,
                      }))
                    }
                    placeholder='data/2024/contacts.csv'
                  />
                </div>
              </div>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>
                  {editing
                    ? 'Service Account JSON (leave blank to keep)'
                    : 'Service Account JSON *'}
                </label>
                <textarea
                  value={gcsForm.service_account_json}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({
                      ...f,
                      service_account_json: e.target.value,
                    }))
                  }
                  rows={6}
                  className='w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500'
                  placeholder='{ "type": "service_account", ... }'
                />
                <p className='text-xs text-amber-600 mt-2'>
                  Note: GCS support is queued for a future release. Saving is
                  allowed, but Run will return “Not implemented”.
                </p>
              </div>
            </div>
          )}

          {error && step === 1 && (
            <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>
              {error}
            </div>
          )}

          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button variant='secondary' className='flex-1' onClick={onClose}>
              Cancel
            </Button>
            <Button
              className='flex-1'
              loading={saving}
              disabled={!canSave}
              onClick={onSaveStep1}
            >
              {editing ? 'Save & Next' : 'Save & Continue'}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs text-gray-500 mb-1'>
                Frequency
              </label>
              <select
                value={schedFreq}
                onChange={(e) => setSchedFreq(e.target.value as any)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
              >
                <option value='hourly'>Hourly (every hour)</option>
                <option value='daily'>Daily</option>
                <option value='weekly'>Weekly</option>
                <option value='monthly'>Monthly</option>
                <option value='custom'>Custom cron</option>
              </select>
            </div>
            <Input
              label='Timezone (IANA)'
              value={schedTz}
              onChange={(e) => setSchedTz(e.target.value)}
              placeholder='Asia/Kolkata'
            />
          </div>

          {(schedFreq === 'daily' ||
            schedFreq === 'weekly' ||
            schedFreq === 'monthly') && (
            <div className='grid grid-cols-2 gap-3'>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>
                  Time of day
                </label>
                <input
                  type='time'
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                />
              </div>
              {schedFreq === 'weekly' && (
                <div>
                  <label className='block text-xs text-gray-500 mb-1'>
                    Day of week
                  </label>
                  <select
                    value={schedDow}
                    onChange={(e) => setSchedDow(e.target.value)}
                    className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
                  >
                    <option value='0'>Sunday</option>
                    <option value='1'>Monday</option>
                    <option value='2'>Tuesday</option>
                    <option value='3'>Wednesday</option>
                    <option value='4'>Thursday</option>
                    <option value='5'>Friday</option>
                    <option value='6'>Saturday</option>
                  </select>
                </div>
              )}
              {schedFreq === 'monthly' && (
                <Input
                  label='Day of month (1–31)'
                  value={schedDom}
                  onChange={(e) => setSchedDom(e.target.value)}
                  placeholder='1'
                />
              )}
            </div>
          )}

          {schedFreq === 'custom' && (
            <Input
              label='Cron expression (5 fields: m h dom mon dow)'
              value={schedCustomCron}
              onChange={(e) => setSchedCustomCron(e.target.value)}
              placeholder='0 9 * * *'
            />
          )}

          <div className='p-3 rounded-lg bg-gray-50 text-xs text-gray-600 font-mono'>
            Cron preview:{' '}
            <span className='text-indigo-700'>{cronPreview || '—'}</span>
          </div>
          <p className='text-xs text-gray-500'>
            The schedule imports into the contact list you opened this wizard
            from.
          </p>

          {error && step === 2 && (
            <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>
              {error}
            </div>
          )}

          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button
              variant='secondary'
              onClick={() => setStep(1)}
              disabled={savingSched}
            >
              Back
            </Button>
            <Button
              className='flex-1'
              loading={savingSched}
              onClick={onSaveStep2}
            >
              Save Schedule
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
