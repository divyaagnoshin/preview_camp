
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { Card, Button, Table, Badge } from '../components/ui';
import { CloudConfigEditor } from '../components/CloudConfigEditor';
import { Plus, Pencil, Trash2, X, Power, PowerOff, Play } from 'lucide-react';

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return Math.floor(seconds) + ' seconds ago';
}

function parseCronToWords(cron: string): string {
  if (!cron) return '';
  const parts = cron.split(' ');
  if (parts.length < 5) return cron;
  if (cron === '0 2 * * *') return 'Daily at 2:00 AM';
  if (cron === '0 * * * *') return 'Hourly';
  if (cron === '*/15 * * * *') return 'Every 15 minutes';
  if (parts[1] === '*' && parts[0] !== '*') return `Past minute ${parts[0]} every hour`;
  if (parts[2] === '*' && parts[1] !== '*') return `Daily at ${parts[1]}:${parts[0].padStart(2, '0')}`;
  return 'Custom Schedule: ' + cron;
}

export default function TaskScheduler() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [showCfgEditor, setShowCfgEditor] = useState(false);
  const [editingCfg, setEditingCfg] = useState<CloudImportConfig | null>(null);

  // Fetch configs
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['cloud-import-configs'],
    queryFn: () => listCloudImportConfigs().then((r: any) => r.data),
  });

  // Fetch contact lists for multi-select
  const { data: contactListsData } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: getContactLists,
  });
  const contactLists = (contactListsData as any)?.data || [];

  const openCfgEditor = (cfg?: CloudImportConfig) => {
    if (cfg) {
      setEditingCfg({ ...cfg });
    } else {
      setEditingCfg(null);
    }
    setShowCfgEditor(true);
  };

  const toggleScheduleMut = useMutation({
    mutationFn: ({ cfg, enabled }: { cfg: CloudImportConfig; enabled: boolean }) =>
      updateCloudImportConfigSchedule(cfg.id, {
        enabled,
        cron_expression: cfg.cron_expression || undefined,
        timezone: cfg.timezone || undefined,
        contact_list_ids: cfg.contact_list_ids,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });

  const runCfgMut = useMutation({
    mutationFn: (cfgId: string) => runCloudImport([], { config_id: cfgId }),
    onSuccess: (res: any) => {
      if (res.status === 'failed') setCloudStatus(`Error: ${res.failed_rows} rows failed`);
      else if (res.status === 'partial_failure') setCloudStatus(`Partial: ${res.imported_rows} imported, ${res.failed_rows} failed`);
      else setCloudStatus(`✓ Successfully imported ${res.imported_rows} rows`);
    },
    onError: (err: any) => {
      setCloudStatus(`Error: ${err?.response?.data?.error || err.message}`);
    }
  });

  const deleteCfgMut = useMutation({
    mutationFn: (cfgId: string) => deleteCloudImportConfig(cfgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });



  const cols = [
    {
      header: 'Name',
      render: (r: CloudImportConfig) => (
        <div>
          <p className="font-medium text-gray-900">{r.name}</p>
          <p className="text-xs text-gray-500 uppercase">{r.provider}</p>
        </div>
      ),
    },
    {
      header: 'Target Lists',
      render: (r: CloudImportConfig) => {
        const ids = r.contact_list_ids || [];
        return (
          <div className="flex flex-wrap gap-1">
            {ids.length === 0 ? <span className="text-gray-400">None</span> : 
              <Badge color="blue">{ids.length} lists</Badge>
            }
          </div>
        );
      }
    },
    {
      header: 'Schedule',
      render: (r: CloudImportConfig) => (
        <div>
          <div className="flex items-center space-x-2">
            {r.schedule_enabled ? (
              <Badge color="green">Active</Badge>
            ) : (
              <Badge color="gray">Paused</Badge>
            )}
            <span className="text-sm">{r.cron_expression || 'No schedule'}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      render: (r: CloudImportConfig) => {
        if (!r.last_refresh) return <span className="text-gray-400">-</span>;
        return (
          <div>
            <div className="flex items-center space-x-1.5">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  r.last_run_status === 'done'
                    ? 'bg-green-500'
                    : r.last_run_status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                }`}
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
      render: (r: CloudImportConfig) => (
        <div className="flex items-center space-x-2">
          <Button size="sm" variant="secondary" onClick={() => runCfgMut.mutate(r.id)} loading={runCfgMut.isPending && runCfgMut.variables === r.id}>
            <Play className="w-4 h-4 mr-1" /> Run Now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openCfgEditor(r)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { if(confirm('Delete this schedule?')) deleteCfgMut.mutate(r.id); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
          {r.schedule_enabled ? (
            <Button size="sm" variant="secondary" className="text-amber-600 border-amber-200" onClick={() => toggleScheduleMut.mutate({ cfg: r, enabled: false })}>
              <PowerOff className="w-4 h-4" /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="text-green-600 border-green-200" onClick={() => toggleScheduleMut.mutate({ cfg: r, enabled: true })} disabled={!r.cron_expression}>
              <Power className="w-4 h-4" /> Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="page-header-bar">
        <div>
          <h1 className="text-2xl font-bold page-heading" style={{ fontFamily: 'Sora, sans-serif' }}>
            Task Scheduler
          </h1>
          <p className="text-sm text-[#7A5C44] mt-0.5">
            Configure automated cloud imports across multiple contact lists.
          </p>
        </div>
        <Button onClick={() => openCfgEditor()} icon={<Plus className="w-4 h-4" />}>
          New Task
        </Button>
      </div>

      {cloudStatus && (
        <div className={`p-4 rounded-lg flex items-center justify-between ${cloudStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : cloudStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
          <span>{cloudStatus}</span>
          <button onClick={() => setCloudStatus(null)} className="ml-4 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <Card>
        <Table<CloudImportConfig>
          keyFn={(r) => r.id}
          rows={configs}
          cols={cols}
          emptyMessage="No tasks configured. Create one to automatically sync contacts from S3 or FTP."
        />
      </Card>

      {/* Editor Modal */}
      <CloudConfigEditor
        open={showCfgEditor}
        editing={editingCfg}
        contactLists={contactLists}
        onClose={() => setShowCfgEditor(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
        }}
      />
    </div>
  );
}
