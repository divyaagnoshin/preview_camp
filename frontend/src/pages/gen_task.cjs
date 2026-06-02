const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'Contactlistdetailpage.tsx');
const destFile = path.join(__dirname, 'TaskScheduler.tsx');

const content = fs.readFileSync(srcFile, 'utf8');
const lines = content.split('\n');

const modalStart = lines.findIndex(l => l.includes('Cloud Import modal ──'));
const modalEnd = lines.findIndex((l, i) => i > modalStart && l.trim() === 'export default Contactlistdetailpage;');

const newContent = `
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCloudImportConfigs,
  createCloudImportConfig,
  updateCloudImportConfig,
  deleteCloudImportConfig,
  updateCloudImportConfigSchedule,
  testCloudImportConnection,
  runCloudImport,
  getContactLists,
  type CloudImportConfig
} from '../api/client';
import { Card, Button, Modal, Input, Table, Badge } from '../components/ui';
import { Plus, Pencil, Trash2, X, Power, PowerOff, Save, Play } from 'lucide-react';
import { formatTimeAgo, parseCronToWords } from '../utils/formatters';

export default function TaskScheduler() {
  const qc = useQueryClient();
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [editingCfg, setEditingCfg] = useState<CloudImportConfig | null>(null);

  // Fetch configs
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['cloud-import-configs'],
    queryFn: () => listCloudImportConfigs().then((r: any) => r.data),
  });

  // Fetch contact lists for multi-select
  const { data: contactListsData = [] } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: () => getContactLists().then((r: any) => r.data),
  });
  const contactLists = Array.isArray(contactListsData) ? contactListsData : (contactListsData as any).data || [];

  const openCfgEditor = (cfg?: CloudImportConfig) => {
    if (cfg) {
      setEditingCfg({ ...cfg });
    } else {
      setEditingCfg({
        name: '',
        provider: 's3',
        credentials: {},
        options: { folder: '/' },
        contact_list_ids: []
      } as any);
    }
  };

  const saveCfgMut = useMutation({
    mutationFn: (body: any) =>
      editingCfg?.id
        ? updateCloudImportConfig(editingCfg.id, body)
        : createCloudImportConfig(body),
    onSuccess: () => {
      setEditingCfg(null);
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });

  const toggleScheduleMut = useMutation({
    mutationFn: ({ cfg, enabled }: { cfg: CloudImportConfig; enabled: boolean }) =>
      updateCloudImportConfigSchedule(cfg.id, {
        enabled,
        cron_expression: cfg.cron_expression,
        timezone: cfg.timezone,
        contact_list_ids: cfg.contact_list_ids,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });

  const runCfgMut = useMutation({
    mutationFn: (cfgId: string) => runCloudImport([], { config_id: cfgId }),
    onSuccess: (res: any) => {
      if (res.status === 'failed') setCloudStatus(\`Error: \${res.failed_rows} rows failed\`);
      else if (res.status === 'partial_failure') setCloudStatus(\`Partial: \${res.imported_rows} imported, \${res.failed_rows} failed\`);
      else setCloudStatus(\`✓ Successfully imported \${res.imported_rows} rows\`);
    },
    onError: (err: any) => {
      setCloudStatus(\`Error: \${err?.response?.data?.error || err.message}\`);
    }
  });

  const deleteCfgMut = useMutation({
    mutationFn: (cfgId: string) => deleteCloudImportConfig(cfgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });

  const testConnMut = useMutation({
    mutationFn: (body: any) => testCloudImportConnection(body),
  });

  const cols = [
    {
      header: 'Name',
      accessor: (r: CloudImportConfig) => (
        <div>
          <p className="font-medium text-gray-900">{r.name}</p>
          <p className="text-xs text-gray-500 uppercase">{r.provider}</p>
        </div>
      ),
    },
    {
      header: 'Target Lists',
      accessor: (r: CloudImportConfig) => {
        const ids = r.contact_list_ids || [];
        return (
          <div className="flex flex-wrap gap-1">
            {ids.length === 0 ? <span className="text-gray-400">None</span> : 
              <Badge variant="blue">{ids.length} lists</Badge>
            }
          </div>
        );
      }
    },
    {
      header: 'Schedule',
      accessor: (r: CloudImportConfig) => (
        <div>
          <div className="flex items-center space-x-2">
            {r.schedule_enabled ? (
              <Badge variant="green">Active</Badge>
            ) : (
              <Badge variant="gray">Paused</Badge>
            )}
            <span className="text-sm">{r.cron_expression || 'No schedule'}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (r: CloudImportConfig) => {
        if (!r.last_refresh) return <span className="text-gray-400">-</span>;
        return (
          <div>
            <div className="flex items-center space-x-1.5">
              <div
                className={\`w-1.5 h-1.5 rounded-full \${
                  r.last_run_status === 'done'
                    ? 'bg-green-500'
                    : r.last_run_status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                }\`}
              />
              <span className="text-sm capitalize text-gray-700">
                {r.last_run_status?.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatTimeAgo(r.last_refresh)}
            </p>
          </div>
        );
      },
    },
    {
      header: 'Actions',
      accessor: (r: CloudImportConfig) => (
        <div className="flex items-center space-x-2">
          <Button size="sm" variant="outline" onClick={() => runCfgMut.mutate(r.id)} loading={runCfgMut.isPending && runCfgMut.variables === r.id}>
            <Play className="w-4 h-4 mr-1" /> Run Now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openCfgEditor(r)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { if(confirm('Delete this schedule?')) deleteCfgMut.mutate(r.id); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
          {r.schedule_enabled ? (
            <Button size="sm" variant="outline" className="text-amber-600 border-amber-200" onClick={() => toggleScheduleMut.mutate({ cfg: r, enabled: false })}>
              <PowerOff className="w-4 h-4" /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="text-green-600 border-green-200" onClick={() => toggleScheduleMut.mutate({ cfg: r, enabled: true })} disabled={!r.cron_expression}>
              <Power className="w-4 h-4" /> Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Task Scheduler</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure automated cloud imports across multiple contact lists.
          </p>
        </div>
        <Button onClick={() => openCfgEditor()} icon={<Plus className="w-4 h-4" />}>
          New Task
        </Button>
      </div>

      {cloudStatus && (
        <div className={\`p-4 rounded-lg flex items-center justify-between \${cloudStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : cloudStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}\`}>
          <span>{cloudStatus}</span>
          <button onClick={() => setCloudStatus(null)} className="ml-4 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <Card>
        <Table
          data={configs}
          columns={cols}
          isLoading={isLoading}
          emptyMessage="No tasks configured. Create one to automatically sync contacts from S3 or FTP."
        />
      </Card>

      {/* Editor Modal */}
      <Modal
        title={editingCfg?.id ? 'Edit Task' : 'New Task'}
        open={!!editingCfg}
        onClose={() => { setEditingCfg(null); testConnMut.reset(); }}
        size="lg"
      >
        {editingCfg && (
          <div className="space-y-4">
            <Input
              label="Name"
              value={editingCfg.name}
              onChange={(e) => setEditingCfg({ ...editingCfg, name: e.target.value })}
              placeholder="e.g. Daily Fidelity Sync"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Contact Lists</label>
              <div className="border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                {contactLists.map((list: any) => {
                  const checked = (editingCfg.contact_list_ids || []).includes(list.id);
                  return (
                    <label key={list.id} className="flex items-center space-x-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        onChange={(e) => {
                          let ids = [...(editingCfg.contact_list_ids || [])];
                          if (e.target.checked) ids.push(list.id);
                          else ids = ids.filter(i => i !== list.id);
                          setEditingCfg({ ...editingCfg, contact_list_ids: ids });
                        }}
                      />
                      <span className="text-sm text-gray-700">{list.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-sm"
                value={editingCfg.provider}
                onChange={(e) => setEditingCfg({
                  ...editingCfg,
                  provider: e.target.value as any,
                  credentials: {},
                  options: { folder: '/' }
                })}
              >
                <option value="s3">Amazon S3</option>
                <option value="ftp">FTP / SFTP</option>
              </select>
            </div>

            {editingCfg.provider === 's3' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Bucket Name" value={editingCfg.options?.bucket_name || ''} onChange={(e) => setEditingCfg({ ...editingCfg, options: { ...editingCfg.options, bucket_name: e.target.value } })} />
                  <Input label="Region" value={editingCfg.credentials?.region || ''} onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, region: e.target.value } })} placeholder="us-east-1" />
                </div>
                <Input label="Access Key ID" value={editingCfg.credentials?.access_key_id || ''} onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, access_key_id: e.target.value } })} />
                <Input label="Secret Access Key" type="password" value={editingCfg.credentials?.secret_access_key || ''} onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, secret_access_key: e.target.value } })} placeholder={editingCfg.id ? '(unchanged)' : ''} />
              </div>
            )}

            {editingCfg.provider === 'ftp' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Host" value={editingCfg.credentials?.host || ''} onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, host: e.target.value } })} placeholder="ftp.example.com" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
                    <select
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-sm"
                      value={editingCfg.credentials?.protocol || 'sftp'}
                      onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, protocol: e.target.value } })}
                    >
                      <option value="sftp">SFTP</option>
                      <option value="ftp">FTP</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Username" value={editingCfg.credentials?.username || ''} onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, username: e.target.value } })} />
                  <Input label="Password" type="password" value={editingCfg.credentials?.password || ''} onChange={(e) => setEditingCfg({ ...editingCfg, credentials: { ...editingCfg.credentials, password: e.target.value } })} placeholder={editingCfg.id ? '(unchanged)' : ''} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Reading Folder" value={editingCfg.options?.folder || ''} onChange={(e) => setEditingCfg({ ...editingCfg, options: { ...editingCfg.options, folder: e.target.value } })} placeholder="/" />
              <Input label="Archive Folder (Optional)" value={editingCfg.options?.archive_folder || ''} onChange={(e) => setEditingCfg({ ...editingCfg, options: { ...editingCfg.options, archive_folder: e.target.value } })} placeholder="/archive" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Cron Expression" value={editingCfg.cron_expression || ''} onChange={(e) => setEditingCfg({ ...editingCfg, cron_expression: e.target.value })} placeholder="0 2 * * *" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 outline-none text-sm"
                  value={editingCfg.timezone || 'UTC'}
                  onChange={(e) => setEditingCfg({ ...editingCfg, timezone: e.target.value })}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
            </div>

            {testConnMut.isError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 flex flex-col">
                <span className="font-medium">Connection Failed</span>
                <span className="mt-1 opacity-90">{(testConnMut.error as any)?.response?.data?.error || testConnMut.error?.message}</span>
              </div>
            )}
            {testConnMut.isSuccess && (
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-100">
                Connection successful! Found {testConnMut.data?.files?.length} files.
              </div>
            )}

            <div className="flex space-x-3 pt-4 border-t border-gray-100">
              <Button
                variant="outline"
                className="flex-1"
                loading={testConnMut.isPending}
                onClick={() => testConnMut.mutate(editingCfg)}
              >
                Test Connection
              </Button>
              <Button
                className="flex-1"
                icon={<Save className="w-4 h-4" />}
                loading={saveCfgMut.isPending}
                onClick={() => saveCfgMut.mutate(editingCfg)}
                disabled={!editingCfg.name || !editingCfg.provider || (editingCfg.contact_list_ids || []).length === 0}
              >
                Save Task
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
`;

fs.writeFileSync(destFile, newContent);
console.log('Done generating TaskScheduler.tsx');
