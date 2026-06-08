import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Modal, Input, Button, Select } from './ui';
import {
  api,
  CloudProvider,
  CloudImportConfig,
  createCloudImportConfig,
  updateCloudImportConfig,
  updateCloudImportConfigSchedule,
  getContactList,
  fetchCloudImportHeaders,
} from '../api/client';

export function parseCronToPreset(cron: string) {
  if (!cron) return { freq: 'daily', time: '09:00' };
  const parts = cron.split(' ');
  if (parts.length < 5) return { freq: 'custom', custom: cron };
  const [m, h, dom, mon, dow] = parts;
  if (mon !== '*') return { freq: 'custom', custom: cron };
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return { freq: 'daily', time };
  if (dom === '*' && dow !== '*' && !dow.includes(',') && !dow.includes('-'))
    return { freq: 'weekly', dow, time };
  if (dow === '*' && dom !== '*' && !dom.includes(',') && !dom.includes('-'))
    return { freq: 'monthly', dom, time };
  return { freq: 'custom', custom: cron };
}

export function buildCronPreset(
  freq: string,
  time: string,
  dow: string,
  dom: string,
  custom: string,
) {
  if (freq === 'custom') return custom;
  const [h, m] = (time || '00:00').split(':');
  if (freq === 'hourly') return `${m || '0'} * * * *`;
  if (freq === 'daily') return `${m || '0'} ${h || '0'} * * *`;
  if (freq === 'weekly') return `${m || '0'} ${h || '0'} * * ${dow || '0'}`;
  if (freq === 'monthly') return `${m || '0'} ${h || '0'} ${dom || '1'} * *`;
  return '';
}

const EMPTY_ARRAY: string[] = [];

export function CloudConfigEditor({
  open,
  editing,
  contactLists,
  defaultContactListIds = EMPTY_ARRAY,
  onClose,
  onSuccess,
}: {
  open: boolean;
  editing: CloudImportConfig | null;
  contactLists?: { id: string; name: string }[];
  defaultContactListIds?: string[];
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [savedCfgId, setSavedCfgId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'fresh' | 'append'>('append');
  const [mapping, setMapping] = useState<Record<string, string[]>>({});
  const [draggedAlias, setDraggedAlias] = useState<{ fieldKey: string; index: number } | null>(null);
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const mappingInitializedRef = React.useRef(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.combo-dropdown-container')) {
        setOpenDropdownKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<CloudProvider>('s3');
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);

  const [s3Form, setS3Form] = useState<any>({
    access_key_id: '',
    secret_access_key: '',
    bucket_name: '',
    folder: '',
    archive_folder: '',
    region: 'us-east-1',
    source_path: '',
  });
  const [ftpForm, setFtpForm] = useState<any>({
    protocol: 'sftp',
    host: '',
    port: '22',
    username: '',
    password: '',
    folder: '',
    archive_folder: '',
    source_path: '',
  });
  const [gcsForm, setGcsForm] = useState<any>({
    bucket_name: '',
    folder: '',
    archive_folder: '',
    service_account_json: '',
    source_path: '',
  });

  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const [schedFreq, setSchedFreq] = useState('daily');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDow, setSchedDow] = useState('1');
  const [schedDom, setSchedDom] = useState('1');
  const [schedCustomCron, setSchedCustomCron] = useState('0 9 * * *');
  const [schedTz, setSchedTz] = useState(browserTz);

  const cronPreview = useMemo(
    () =>
      buildCronPreset(
        schedFreq,
        schedTime,
        schedDow,
        schedDom,
        schedCustomCron,
      ),
    [schedFreq, schedTime, schedDow, schedDom, schedCustomCron],
  );

  useEffect(() => {
    if (open) {
      setStep(1);
      setSavedCfgId(null);
      if (editing) {
        setName(editing.name);
        setProvider(editing.provider);
        setSelectedListIds(editing.contact_list_ids || defaultContactListIds);

        const c = editing.credentials || {};
        const o = editing.options || {};
        setImportMode(o.import_mode || 'append');
        if (editing.provider === 's3')
          setS3Form({
            access_key_id: c.access_key_id || '',
            secret_access_key:
              c.secret_access_key !== undefined ? '••••••••••••••••' : '',
            bucket_name: o.bucket_name || '',
            folder: o.folder || '',
            region: c.region || 'us-east-1',
            archive_folder: o.archive_folder || '',
            source_path: o.source_path || '',
          });
        else if (editing.provider === 'ftp')
          setFtpForm({
            protocol: c.protocol === 'ftp' ? 'ftp' : 'sftp',
            host: c.host || '',
            port: c.port || '22',
            username: c.username || '',
            password: '••••••••••••••••',
            folder: o.folder || '',
            archive_folder: o.archive_folder || '',
            source_path: o.source_path || '',
          });
        else
          setGcsForm({
            bucket_name: o.bucket_name || '',
            folder: o.folder || '',
            archive_folder: o.archive_folder || '',
            service_account_json: '••••••••••••••••',
            source_path: o.source_path || '',
          });

        setMapping(o.mapping || {});
        setSchedTz(editing.timezone || browserTz);
        const parsed = parseCronToPreset(editing.cron_expression || '');
        setSchedFreq(parsed.freq);
        if (parsed.time) setSchedTime(parsed.time);
        if (parsed.dow) setSchedDow(parsed.dow);
        if (parsed.dom) setSchedDom(parsed.dom);
        if (parsed.custom) setSchedCustomCron(parsed.custom);
      } else {
        setName('');
        setProvider('s3');
        setSelectedListIds(defaultContactListIds);
        setS3Form({
          access_key_id: '',
          secret_access_key: '',
          bucket_name: '',
          folder: '',
          region: 'us-east-1',
          archive_folder: '',
          source_path: '',
        });
        setFtpForm({
          protocol: 'sftp',
          host: '',
          port: '22',
          username: '',
          password: '',
          folder: '',
          archive_folder: '',
          source_path: '',
        });
        setGcsForm({
          bucket_name: '',
          folder: '',
          archive_folder: '',
          service_account_json: '',
          source_path: '',
        });
        setMapping({});
        setSchedFreq('daily');
        setSchedTime('09:00');
        setSchedDow('1');
        setSchedDom('1');
        setSchedCustomCron('0 9 * * *');
        setSchedTz(browserTz);
      }
    }
  }, [open, editing]); // Intentionally omitting defaultContactListIds and browserTz to avoid reset on every keystroke

  const buildCfgPayload = () => {
    const finalMapping: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(mapping)) {
      const validAliases = Array.isArray(v)
        ? v.filter((alias) => alias.trim() !== '')
        : [];
      if (validAliases.length > 0) finalMapping[k] = validAliases;
    }
    if (provider === 's3')
      return {
        credentials: {
          access_key_id: s3Form.access_key_id,
          secret_access_key:
            s3Form.secret_access_key === '••••••••••••••••'
              ? ''
              : s3Form.secret_access_key,
          region: s3Form.region,
        },
        options: {
          bucket_name: s3Form.bucket_name,
          folder: s3Form.folder,
          archive_folder: s3Form.archive_folder || undefined,
          source_path: s3Form.source_path || undefined,
          import_mode: importMode,
          mapping: finalMapping,
        },
      };
    if (provider === 'ftp')
      return {
        credentials: {
          protocol: ftpForm.protocol,
          host: ftpForm.host,
          port: ftpForm.port,
          username: ftpForm.username,
          password:
            ftpForm.password === '••••••••••••••••' ? '' : ftpForm.password,
        },
        options: {
          folder: ftpForm.folder,
          archive_folder: ftpForm.archive_folder || undefined,
          source_path: ftpForm.source_path || undefined,
          import_mode: importMode,
          mapping: finalMapping,
        },
      };
    return {
      credentials: {
        service_account_json:
          gcsForm.service_account_json === '••••••••••••••••'
            ? ''
            : gcsForm.service_account_json,
      },
      options: {
        bucket_name: gcsForm.bucket_name,
        folder: gcsForm.folder,
        archive_folder: gcsForm.archive_folder || undefined,
        source_path: gcsForm.source_path || undefined,
        import_mode: importMode,
        mapping: finalMapping,
      },
    };
  };

  const saveCfgMut = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        provider,
        contact_list_ids: selectedListIds,
        ...buildCfgPayload(),
      };
      return editing
        ? updateCloudImportConfig(editing.id, body)
        : createCloudImportConfig(body);
    },
    onSuccess: (saved: CloudImportConfig) => {
      setSavedCfgId(saved.id);
      setStep(2);
      onSuccess?.();
    },
  });

  const { data: contactList } = useQuery({
    queryKey: ['contact-list', selectedListIds[0]],
    queryFn: () => getContactList(selectedListIds[0]),
    enabled: step === 2 && !!selectedListIds[0],
  });
  const fields = contactList?.field_definitions || [];

  const duplicateAliases = useMemo(() => {
    if (step !== 2) return [];
    const counts = new Map<string, string[]>();
    for (const [fieldKey, aliases] of Object.entries(mapping)) {
      if (Array.isArray(aliases)) {
        for (const a of aliases) {
          const trimmed = typeof a === 'string' ? a.trim() : '';
          if (trimmed) {
            if (!counts.has(trimmed)) counts.set(trimmed, []);
            counts.get(trimmed)!.push(fieldKey);
          }
        }
      }
    }
    const dups = [];
    for (const [alias, mappedFields] of counts.entries()) {
      if (mappedFields.length > 1) {
        dups.push(alias);
      }
    }
    return dups;
  }, [mapping, step]);

  const connectionPayloadStr = useMemo(() => JSON.stringify(buildCfgPayload()), [
    provider, s3Form, ftpForm, gcsForm
  ]);

  const { data: headersData, isLoading: isLoadingHeaders } = useQuery({
    queryKey: ['cloud-headers', savedCfgId || editing?.id, provider, connectionPayloadStr],
    queryFn: () => {
      const payload = JSON.parse(connectionPayloadStr);
      return fetchCloudImportHeaders({
        config_id: savedCfgId || editing?.id || undefined,
        provider,
        credentials: payload.credentials,
        options: payload.options,
      });
    },
    enabled: step === 2,
    retry: false,
  });

  useEffect(() => {
    mappingInitializedRef.current = false;
  }, [editing?.id, contactList?.id]);

  useEffect(() => {
    if (contactList && step === 2 && !mappingInitializedRef.current) {
      // If we are editing and have a specific mapping saved for this config, use it.
      if (editing?.options?.mapping && Object.keys(editing.options.mapping).length > 0) {
        setMapping(editing.options.mapping);
      } else {
        // Fall back to the contact list global aliases as a starting point.
        const initialMapping: Record<string, string[]> = {};
        for (const f of contactList.field_definitions) {
          if (f.aliases && f.aliases.length > 0) {
            initialMapping[f.field_key] = f.aliases;
          }
        }
        setMapping(initialMapping);
      }
      mappingInitializedRef.current = true;
    }
  }, [contactList, step, editing]);

  const saveMappingMut = useMutation({
    mutationFn: () => {
      const finalMapping: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(mapping)) {
        const validAliases = Array.isArray(v)
          ? v.filter((alias) => alias.trim() !== '')
          : [];
        if (validAliases.length > 0) finalMapping[k] = validAliases;
      }
      
      const cfgId = savedCfgId || editing?.id;
      if (!cfgId) throw new Error('No config to update');

      const payload = buildCfgPayload();
      payload.options.mapping = finalMapping;

      return updateCloudImportConfig(cfgId, {
        name: name.trim(),
        provider,
        contact_list_ids: selectedListIds,
        ...payload,
      });
    },
    onSuccess: () => {
      setStep(3);
    },
  });

  const saveSchedMut = useMutation({
    mutationFn: () => {
      const cfgId = savedCfgId || editing?.id;
      if (!cfgId) throw new Error('No config to schedule');
      return updateCloudImportConfigSchedule(cfgId, {
        enabled: true,
        cron_expression: cronPreview,
        timezone: schedTz || 'UTC',
        contact_list_ids: selectedListIds,
      });
    },
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
  });

  const canSave =
    name.trim().length > 0 &&
    (contactLists ? selectedListIds.length > 0 : true) &&
    (provider === 's3'
      ? s3Form.bucket_name &&
        s3Form.access_key_id &&
        (editing || s3Form.secret_access_key) &&
        s3Form.source_path
      : provider === 'ftp'
        ? ftpForm.host && ftpForm.username && (editing || ftpForm.password) &&
          ftpForm.source_path
        : gcsForm.bucket_name &&
          (editing || gcsForm.service_account_json) &&
          gcsForm.source_path);

  const error =
    (saveCfgMut.error as any)?.response?.data?.error ||
    (saveSchedMut.error as any)?.response?.data?.error ||
    (saveMappingMut.error as any)?.response?.data?.error ||
    (saveMappingMut.error as any)?.message;

  return (
    <Modal
      title={
        step === 1
          ? editing
            ? 'Edit Cloud Connection'
            : 'Add Cloud Connection'
          : step === 2
            ? 'Field Mapping'
            : 'Schedule Automatic Imports'
      }
      open={open}
      onClose={onClose}
      size='lg'
    >
      <div className='flex items-center gap-2 mb-4 text-xs'>
        {(['1. Connection', '2. Field Mapping', '3. Schedule'] as const).map(
          (label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <span className='text-gray-300'>→</span>}
              <span
                className={`px-2 py-1 rounded-full ${step === i + 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {label}
              </span>
            </React.Fragment>
          ),
        )}
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
              <Select
                label='Provider *'
                value={provider}
                onChange={(e) => setProvider(e.target.value as CloudProvider)}
                disabled={!!editing}
                options={[
                  { value: 's3', label: 'Amazon S3' },
                  { value: 'ftp', label: 'FTP / SFTP' },
                  { value: 'gcs', label: 'Google Cloud Storage' },
                ]}
              />
            </div>
          </div>

          <div className={`grid gap-4 items-end ${contactLists ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {contactLists && (
              <div>
                <Select
                  label='Target Contact List *'
                  value={selectedListIds[0] || ''}
                  onChange={(e) =>
                    setSelectedListIds(e.target.value ? [e.target.value] : [])
                  }
                  options={[
                    { value: '', label: 'Select a contact list' },
                    ...contactLists.map((list) => ({
                      value: list.id,
                      label: list.name,
                    })),
                  ]}
                />
              </div>
            )}
            <div className='flex flex-col gap-2 pb-1'>
              <label className='text-xs font-medium text-gray-700'>Import Mode</label>
              <div className='flex p-1 bg-gray-100 rounded-lg'>
                <button
                  type="button"
                  onClick={() => setImportMode('fresh')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                    importMode === 'fresh'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Fresh (Insert All)
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('append')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all duration-200 ${
                    importMode === 'append'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Append (Update Existing)
                </button>
              </div>
            </div>
          </div>

          {provider === 's3' && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  label='Bucket Name *'
                  value={s3Form.bucket_name}
                  onChange={(e) =>
                    setS3Form((f: any) => ({
                      ...f,
                      bucket_name: e.target.value,
                    }))
                  }
                  placeholder='my-bucket'
                />
                <Input
                  label='Region'
                  value={s3Form.region}
                  onChange={(e) =>
                    setS3Form((f: any) => ({ ...f, region: e.target.value }))
                  }
                  placeholder='us-east-1'
                />
              </div>
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
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  label='Reading Folder'
                  value={s3Form.folder}
                  onChange={(e) =>
                    setS3Form((f: any) => ({ ...f, folder: e.target.value }))
                  }
                  placeholder='/'
                />
                <Input
                  label='Archive Folder (Optional)'
                  value={s3Form.archive_folder}
                  onChange={(e) =>
                    setS3Form((f: any) => ({
                      ...f,
                      archive_folder: e.target.value,
                    }))
                  }
                  placeholder='/archive'
                />
              </div>
              <div className='col-span-2'>
                <Input
                  label='Source Path *'
                  value={s3Form.source_path}
                  onChange={(e) =>
                    setS3Form((f: any) => ({
                      ...f,
                      source_path: e.target.value,
                    }))
                  }
                  placeholder='/incoming/contacts.csv or /incoming/contacts*'
                />
                <p className='text-[11px] text-gray-500 mt-1 italic'>
                  * Note: Uploads only the .csv file format.
                </p>
              </div>
            </div>
          )}

          {provider === 'ftp' && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  label='Host *'
                  value={ftpForm.host}
                  onChange={(e) =>
                    setFtpForm((f: any) => ({ ...f, host: e.target.value }))
                  }
                  placeholder='ftp.example.com'
                />
                <div>
                  <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>
                    Protocol
                  </label>
                  <select
                    value={ftpForm.protocol}
                    onChange={(e) =>
                      setFtpForm((f: any) => ({
                        ...f,
                        protocol: e.target.value,
                      }))
                    }
                    className='w-full border-2 border-[#FFD0B0] rounded-xl px-3.5 py-2.5 text-sm bg-white text-[#1A0F00] focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all'
                  >
                    <option value='sftp'>SFTP</option>
                    <option value='ftp'>FTP</option>
                  </select>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
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
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  label='Reading Folder'
                  value={ftpForm.folder}
                  onChange={(e) =>
                    setFtpForm((f: any) => ({ ...f, folder: e.target.value }))
                  }
                  placeholder='/'
                />
                <Input
                  label='Archive Folder (Optional)'
                  value={ftpForm.archive_folder}
                  onChange={(e) =>
                    setFtpForm((f: any) => ({
                      ...f,
                      archive_folder: e.target.value,
                    }))
                  }
                  placeholder='/archive'
                />
              </div>
              <div className='col-span-2'>
                <Input
                  label='Source Path *'
                  value={ftpForm.source_path}
                  onChange={(e) =>
                    setFtpForm((f: any) => ({
                      ...f,
                      source_path: e.target.value,
                    }))
                  }
                  placeholder='/incoming/contacts.csv or /incoming/contacts*'
                />
                <p className='text-[11px] text-gray-500 mt-1 italic'>
                  * Note: Uploads only the .csv file format.
                </p>
              </div>
            </div>
          )}

          {provider === 'gcs' && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
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
                  label='Reading Folder'
                  value={gcsForm.folder}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({ ...f, folder: e.target.value }))
                  }
                  placeholder='/'
                />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  label='Archive Folder (Optional)'
                  value={gcsForm.archive_folder}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({
                      ...f,
                      archive_folder: e.target.value,
                    }))
                  }
                  placeholder='/archive'
                />
              </div>
              <div className='col-span-2'>
                <Input
                  label='Source Path *'
                  value={gcsForm.source_path}
                  onChange={(e) =>
                    setGcsForm((f: any) => ({
                      ...f,
                      source_path: e.target.value,
                    }))
                  }
                  placeholder='data/contacts.csv or data/contacts*'
                />
                <p className='text-[11px] text-gray-500 mt-1 italic'>
                  * Note: Uploads only the .csv file format.
                </p>
              </div>
              <div>
                <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>
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
                  className='w-full border-2 border-[#FFD0B0] rounded-xl px-3.5 py-2.5 text-xs font-mono bg-white text-[#1A0F00] focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all'
                  placeholder='{ "type": "service_account", ... }'
                />
                <p className='text-xs text-amber-600 mt-1'>
                  Note: GCS support is queued for a future release.
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
              loading={saveCfgMut.isPending}
              disabled={!canSave}
              onClick={() => saveCfgMut.mutate()}
            >
              {editing ? 'Save & Next' : 'Save & Continue'}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className='space-y-4'>
          <div className='text-sm text-gray-600 mb-2 flex items-center justify-between'>
            <span>
              Add one or more exact alternate column names for each field. If a
              CSV column matches the field name exactly, you don't need to add it
              here.
            </span>
            {isLoadingHeaders && (
              <span className='text-xs text-indigo-500 animate-pulse'>Fetching file headers...</span>
            )}
            {headersData?.headers && !isLoadingHeaders && (
              <span className='text-xs text-green-600'>Headers loaded from file</span>
            )}
          </div>

          <div className='bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-96 overflow-y-auto space-y-4'>
            {fields.map((f: any) => {
              const aliases = Array.isArray(mapping[f.field_key])
                ? (mapping[f.field_key] as any as string[])
                : [];
              const displayAliases = aliases.length > 0 ? aliases : [''];
              return (
                <div key={f.field_key} className='flex items-start gap-3'>
                  <div className='w-2/5 flex items-center justify-between pt-2'>
                    <span className='text-sm font-medium text-gray-700'>
                      {f.field_label}
                    </span>
                    {f.is_required && (
                      <span className='text-[10px] uppercase tracking-wider font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded'>
                        Required
                      </span>
                    )}
                  </div>
                  <div className='w-3/5 space-y-2'>
                    {displayAliases.map((alias, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center gap-2 transition-all ${draggedAlias?.fieldKey === f.field_key && draggedAlias?.index === i ? 'opacity-50 scale-95' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          setDraggedAlias({ fieldKey: f.field_key, index: i });
                          e.dataTransfer.effectAllowed = 'move';
                          // For Firefox compatibility
                          e.dataTransfer.setData('text/plain', i.toString());
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!draggedAlias || draggedAlias.fieldKey !== f.field_key) return;
                          if (draggedAlias.index === i) return;

                          const newAliases = [...displayAliases];
                          const [removed] = newAliases.splice(draggedAlias.index, 1);
                          newAliases.splice(i, 0, removed);
                          setMapping({
                            ...mapping,
                            [f.field_key]: newAliases as any,
                          });
                          setDraggedAlias(null);
                        }}
                        onDragEnd={() => setDraggedAlias(null)}
                      >
                        <div className="cursor-move text-gray-400 hover:text-gray-600 px-1" title="Drag to reorder">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
                            <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
                          </svg>
                        </div>
                        <div className="relative w-full flex items-center combo-dropdown-container">
                          <input
                            type='text'
                            value={alias}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMapping(prev => {
                                const arr = Array.isArray(prev[f.field_key]) ? prev[f.field_key] : [];
                                const currentAliases = arr.length > 0 ? arr : [''];
                                const newAliases = [...currentAliases];
                                newAliases[i] = val;
                                return { ...prev, [f.field_key]: newAliases as any };
                              });
                            }}
                            onFocus={() => setOpenDropdownKey(`${f.field_key}-${i}-combo`)}
                            placeholder={i === 0 ? 'Priority CSV column name' : 'Alternate CSV column name'}
                            className={`w-full border ${i === 0 ? 'border-indigo-300 bg-indigo-50/30 ring-1 ring-indigo-100 pr-[88px]' : 'border-gray-200 pr-10'} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                          />
                          <div className="absolute right-1 flex items-center gap-1.5 pointer-events-none">
                            {i === 0 && (
                              <span className="bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider">Priority</span>
                            )}
                            <svg className="w-4 h-4 text-gray-400 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                          
                          {openDropdownKey === `${f.field_key}-${i}-combo` && (
                            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1 overflow-hidden flex flex-col max-h-60">
                              <div className="overflow-y-auto flex-1">
                                {headersData?.headers && headersData.headers.filter((h: string) => h.toLowerCase().includes(alias.toLowerCase())).map((h: string) => (
                                  <button
                                    key={h}
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setMapping(prev => {
                                        const arr = Array.isArray(prev[f.field_key]) ? prev[f.field_key] : [];
                                        const currentAliases = arr.length > 0 ? arr : [''];
                                        const newAliases = [...currentAliases];
                                        newAliases[i] = h;
                                        return { ...prev, [f.field_key]: newAliases as any };
                                      });
                                      setOpenDropdownKey(null);
                                    }}
                                  >
                                    {h}
                                  </button>
                                ))}

                              </div>
                              {displayAliases.length < 5 && (
                                <div className="border-t border-gray-100 mt-1">
                                  <button
                                    type="button"
                                    className='w-full text-left px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 font-medium flex items-center gap-2 transition-colors'
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setMapping(prev => {
                                        const arr = Array.isArray(prev[f.field_key]) ? prev[f.field_key] : [];
                                        const currentAliases = arr.length > 0 ? arr : [''];
                                        return { ...prev, [f.field_key]: [...currentAliases, ''] as any };
                                      });
                                      setOpenDropdownKey(null);
                                    }}
                                  >
                                    <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add alternate column
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setMapping(prev => {
                              const arr = Array.isArray(prev[f.field_key]) ? prev[f.field_key] : [];
                              const currentAliases = arr.length > 0 ? arr : [''];
                              const newAliases = currentAliases.filter((_, idx) => idx !== i);
                              return { ...prev, [f.field_key]: newAliases as any };
                            });
                          }}
                          className='text-gray-400 hover:text-red-500 p-1'
                          title='Remove'
                        >
                          <svg
                            className='w-4 h-4'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth={2}
                              d='M6 18L18 6M6 6l12 12'
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {fields.length === 0 && (
              <div className='text-sm text-gray-500 text-center py-4'>
                Loading fields...
              </div>
            )}
          </div>
          {duplicateAliases.length > 0 && step === 2 && (
            <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>
              Validation Error: "{duplicateAliases[0]}" is mapped to multiple fields. A CSV column can only map to one field.
            </div>
          )}
          {error && step === 2 && (
            <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>
              {error}
            </div>
          )}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button
              variant='secondary'
              onClick={() => setStep(1)}
              disabled={saveMappingMut.isPending}
            >
              Back
            </Button>
            <Button
              className='flex-1'
              loading={saveMappingMut.isPending}
              disabled={duplicateAliases.length > 0}
              onClick={() => saveMappingMut.mutate()}
            >
              Save Mapping & Next
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs text-gray-500 mb-1'>
                Frequency
              </label>
              <select
                value={schedFreq}
                onChange={(e) => setSchedFreq(e.target.value)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
              >
                <option value='hourly'>Hourly</option>
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
                    {[
                      'Sunday',
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                    ].map((d, i) => (
                      <option key={i} value={String(i)}>
                        {d}
                      </option>
                    ))}
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
          {!contactLists && (
            <p className='text-xs text-gray-500'>
              The schedule will import into the contact list you opened this
              wizard from.
            </p>
          )}
          {error && step === 3 && (
            <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>
              {error}
            </div>
          )}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button
              variant='secondary'
              onClick={() => setStep(2)}
              disabled={saveSchedMut.isPending}
            >
              Back
            </Button>
            <Button
              className='flex-1'
              loading={saveSchedMut.isPending}
              onClick={() => saveSchedMut.mutate()}
            >
              Save Schedule
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
