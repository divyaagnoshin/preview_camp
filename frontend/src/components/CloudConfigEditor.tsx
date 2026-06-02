import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Input, Button } from './ui';
import { CloudProvider, CloudImportConfig, createCloudImportConfig, updateCloudImportConfig, updateCloudImportConfigSchedule } from '../api/client';

export function parseCronToPreset(cron: string) {
  if (!cron) return { freq: 'daily', time: '09:00' };
  const parts = cron.split(' ');
  if (parts.length < 5) return { freq: 'custom', custom: cron };
  const [m, h, dom, mon, dow] = parts;
  if (mon !== '*') return { freq: 'custom', custom: cron };
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return { freq: 'daily', time };
  if (dom === '*' && dow !== '*' && !dow.includes(',') && !dow.includes('-')) return { freq: 'weekly', dow, time };
  if (dow === '*' && dom !== '*' && !dom.includes(',') && !dom.includes('-')) return { freq: 'monthly', dom, time };
  return { freq: 'custom', custom: cron };
}

export function buildCronPreset(freq: string, time: string, dow: string, dom: string, custom: string) {
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
  onSuccess
}: {
  open: boolean;
  editing: CloudImportConfig | null;
  contactLists?: { id: string; name: string }[];
  defaultContactListIds?: string[];
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [savedCfgId, setSavedCfgId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<CloudProvider>('s3');
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);

  const [s3Form, setS3Form] = useState<any>({ access_key_id: '', secret_access_key: '', bucket_name: '', folder: '', archive_folder: '', region: 'us-east-1', source_path: '' });
  const [ftpForm, setFtpForm] = useState<any>({ protocol: 'sftp', host: '', port: '22', username: '', password: '', folder: '', archive_folder: '', source_path: '' });
  const [gcsForm, setGcsForm] = useState<any>({ bucket_name: '', folder: '', archive_folder: '', service_account_json: '', source_path: '' });

  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [schedFreq, setSchedFreq] = useState('daily');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDow, setSchedDow] = useState('1');
  const [schedDom, setSchedDom] = useState('1');
  const [schedCustomCron, setSchedCustomCron] = useState('0 9 * * *');
  const [schedTz, setSchedTz] = useState(browserTz);

  const cronPreview = useMemo(() => buildCronPreset(schedFreq, schedTime, schedDow, schedDom, schedCustomCron), [schedFreq, schedTime, schedDow, schedDom, schedCustomCron]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSavedCfgId(null);
      if (editing) {
        setName(editing.name);
        setProvider(editing.provider);
        setSelectedListIds(editing.contact_list_ids || defaultContactListIds);

        const c = editing.credentials || {}; const o = editing.options || {};
        if (editing.provider === 's3') setS3Form({ access_key_id: c.access_key_id || '', secret_access_key: '', bucket_name: o.bucket_name || '', folder: o.folder || '', region: c.region || 'us-east-1', archive_folder: o.archive_folder || '', source_path: o.source_path || '' });
        else if (editing.provider === 'ftp') setFtpForm({ protocol: c.protocol === 'ftp' ? 'ftp' : 'sftp', host: c.host || '', port: c.port || '22', username: c.username || '', password: '', folder: o.folder || '', archive_folder: o.archive_folder || '', source_path: o.source_path || '' });
        else setGcsForm({ bucket_name: o.bucket_name || '', folder: o.folder || '', archive_folder: o.archive_folder || '', service_account_json: '', source_path: o.source_path || '' });
        
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
        setS3Form({ access_key_id: '', secret_access_key: '', bucket_name: '', folder: '', region: 'us-east-1', archive_folder: '', source_path: '' });
        setFtpForm({ protocol: 'sftp', host: '', port: '22', username: '', password: '', folder: '', archive_folder: '', source_path: '' });
        setGcsForm({ bucket_name: '', folder: '', archive_folder: '', service_account_json: '', source_path: '' });
        setSchedFreq('daily'); setSchedTime('09:00'); setSchedDow('1'); setSchedDom('1');
        setSchedCustomCron('0 9 * * *'); setSchedTz(browserTz);
      }
    }
  }, [open, editing]); // Intentionally omitting defaultContactListIds and browserTz to avoid reset on every keystroke

  const buildCfgPayload = () => {
    if (provider === 's3') return { credentials: { access_key_id: s3Form.access_key_id, secret_access_key: s3Form.secret_access_key, region: s3Form.region }, options: { bucket_name: s3Form.bucket_name, folder: s3Form.folder, archive_folder: s3Form.archive_folder || undefined, source_path: s3Form.source_path || undefined } };
    if (provider === 'ftp') return { credentials: { protocol: ftpForm.protocol, host: ftpForm.host, port: ftpForm.port, username: ftpForm.username, password: ftpForm.password }, options: { folder: ftpForm.folder, archive_folder: ftpForm.archive_folder || undefined, source_path: ftpForm.source_path || undefined } };
    return { credentials: { service_account_json: gcsForm.service_account_json }, options: { bucket_name: gcsForm.bucket_name, folder: gcsForm.folder, archive_folder: gcsForm.archive_folder || undefined, source_path: gcsForm.source_path || undefined } };
  };

  const saveCfgMut = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), provider, contact_list_ids: selectedListIds, ...buildCfgPayload() };
      return editing ? updateCloudImportConfig(editing.id, body) : createCloudImportConfig(body);
    },
    onSuccess: (saved: CloudImportConfig) => {
      setSavedCfgId(saved.id);
      setStep(2);
      onSuccess?.();
    },
  });

  const saveSchedMut = useMutation({
    mutationFn: () => {
      const cfgId = savedCfgId || editing?.id;
      if (!cfgId) throw new Error('No config to schedule');
      return updateCloudImportConfigSchedule(cfgId, { enabled: true, cron_expression: cronPreview, timezone: schedTz || 'UTC', contact_list_ids: selectedListIds });
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
      ? s3Form.bucket_name && s3Form.access_key_id && (editing || s3Form.secret_access_key)
      : provider === 'ftp'
      ? ftpForm.host && ftpForm.username && (editing || ftpForm.password)
      : gcsForm.bucket_name && (editing || gcsForm.service_account_json));

  const error = (saveCfgMut.error as any)?.response?.data?.error || (saveSchedMut.error as any)?.response?.data?.error;

  return (
    <Modal
      title={step === 1 ? (editing ? 'Edit Cloud Connection' : 'Add Cloud Connection') : 'Schedule Automatic Imports'}
      open={open}
      onClose={onClose}
      size='lg'
    >
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

          {contactLists && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Target Contact Lists *</label>
              <div className="border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                {contactLists.map((list) => {
                  const checked = selectedListIds.includes(list.id);
                  return (
                    <label key={list.id} className="flex items-center space-x-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        onChange={(e) => {
                          let ids = [...selectedListIds];
                          if (e.target.checked) ids.push(list.id);
                          else ids = ids.filter(i => i !== list.id);
                          setSelectedListIds(ids);
                        }}
                      />
                      <span className="text-sm text-gray-700">{list.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {provider === 's3' && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Bucket Name *' value={s3Form.bucket_name} onChange={(e) => setS3Form((f: any) => ({ ...f, bucket_name: e.target.value }))} placeholder='my-bucket' />
                <Input label='Region' value={s3Form.region} onChange={(e) => setS3Form((f: any) => ({ ...f, region: e.target.value }))} placeholder='us-east-1' />
              </div>
              <Input label='Access Key ID *' value={s3Form.access_key_id} onChange={(e) => setS3Form((f: any) => ({ ...f, access_key_id: e.target.value }))} placeholder='AKIA...' />
              <Input label={editing ? 'Secret Access Key (leave blank to keep)' : 'Secret Access Key *'} type='password' value={s3Form.secret_access_key} onChange={(e) => setS3Form((f: any) => ({ ...f, secret_access_key: e.target.value }))} placeholder='••••••••••••' />
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Reading Folder' value={s3Form.folder} onChange={(e) => setS3Form((f: any) => ({ ...f, folder: e.target.value }))} placeholder='/' />
                <Input label='Archive Folder (Optional)' value={s3Form.archive_folder} onChange={(e) => setS3Form((f: any) => ({ ...f, archive_folder: e.target.value }))} placeholder='/archive' />
              </div>
              <div className='col-span-2'>
                <Input label='Source Path (optional — overrides Reading Folder)' value={s3Form.source_path} onChange={(e) => setS3Form((f: any) => ({ ...f, source_path: e.target.value }))} placeholder='data/2024/contacts.csv' />
              </div>
            </div>
          )}

          {provider === 'ftp' && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Host *' value={ftpForm.host} onChange={(e) => setFtpForm((f: any) => ({ ...f, host: e.target.value }))} placeholder='ftp.example.com' />
                <div>
                  <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>Protocol</label>
                  <select value={ftpForm.protocol} onChange={(e) => setFtpForm((f: any) => ({ ...f, protocol: e.target.value }))} className='w-full border-2 border-[#FFD0B0] rounded-xl px-3.5 py-2.5 text-sm bg-white text-[#1A0F00] focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all'>
                    <option value='sftp'>SFTP</option>
                    <option value='ftp'>FTP</option>
                  </select>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Username *' value={ftpForm.username} onChange={(e) => setFtpForm((f: any) => ({ ...f, username: e.target.value }))} />
                <Input label={editing ? 'Password (leave blank to keep)' : 'Password *'} type='password' value={ftpForm.password} onChange={(e) => setFtpForm((f: any) => ({ ...f, password: e.target.value }))} placeholder='••••••••••••' />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Reading Folder' value={ftpForm.folder} onChange={(e) => setFtpForm((f: any) => ({ ...f, folder: e.target.value }))} placeholder='/' />
                <Input label='Archive Folder (Optional)' value={ftpForm.archive_folder} onChange={(e) => setFtpForm((f: any) => ({ ...f, archive_folder: e.target.value }))} placeholder='/archive' />
              </div>
              <div className='col-span-2'>
                <Input label='Source Path (optional — overrides Reading Folder)' value={ftpForm.source_path} onChange={(e) => setFtpForm((f: any) => ({ ...f, source_path: e.target.value }))} placeholder='/incoming/contacts.csv' />
              </div>
            </div>
          )}

          {provider === 'gcs' && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Bucket Name *' value={gcsForm.bucket_name} onChange={(e) => setGcsForm((f: any) => ({ ...f, bucket_name: e.target.value }))} placeholder='my-gcs-bucket' />
                <Input label='Reading Folder' value={gcsForm.folder} onChange={(e) => setGcsForm((f: any) => ({ ...f, folder: e.target.value }))} placeholder='/' />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <Input label='Archive Folder (Optional)' value={gcsForm.archive_folder} onChange={(e) => setGcsForm((f: any) => ({ ...f, archive_folder: e.target.value }))} placeholder='/archive' />
              </div>
              <div className='col-span-2'>
                <Input label='Source Path (optional — overrides Reading Folder)' value={gcsForm.source_path} onChange={(e) => setGcsForm((f: any) => ({ ...f, source_path: e.target.value }))} placeholder='data/contacts.csv' />
              </div>
              <div>
                <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>{editing ? 'Service Account JSON (leave blank to keep)' : 'Service Account JSON *'}</label>
                <textarea value={gcsForm.service_account_json} onChange={(e) => setGcsForm((f: any) => ({ ...f, service_account_json: e.target.value }))} rows={6} className='w-full border-2 border-[#FFD0B0] rounded-xl px-3.5 py-2.5 text-xs font-mono bg-white text-[#1A0F00] focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all' placeholder='{ "type": "service_account", ... }' />
                <p className='text-xs text-amber-600 mt-1'>Note: GCS support is queued for a future release.</p>
              </div>
            </div>
          )}

          {error && step === 1 && <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>{error}</div>}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button variant='secondary' className='flex-1' onClick={onClose}>Cancel</Button>
            <Button className='flex-1' loading={saveCfgMut.isPending} disabled={!canSave} onClick={() => saveCfgMut.mutate()}>
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
          {!contactLists && (
            <p className='text-xs text-gray-500'>The schedule will import into the contact list you opened this wizard from.</p>
          )}
          {error && step === 2 && <div className='p-3 rounded-lg text-xs bg-red-50 text-red-700'>{error}</div>}
          <div className='flex gap-3 pt-2 border-t border-gray-100'>
            <Button variant='secondary' onClick={() => setStep(1)} disabled={saveSchedMut.isPending}>Back</Button>
            <Button className='flex-1' loading={saveSchedMut.isPending} onClick={() => saveSchedMut.mutate()}>Save Schedule</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
