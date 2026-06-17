
import React, { useState, useEffect, useMemo } from 'react';
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
  getCloudImportHistory,
  type CloudImportConfig,
  type CloudImportRunHistory
} from '../api/client';
import { Card, Button, Table, Badge, Modal, SearchInput, FilterPill, ClearFiltersButton, EmptyState } from '../components/ui';
import { CloudConfigEditor } from '../components/CloudConfigEditor';
import { Plus, Pencil, Trash2, X, Power, PowerOff, Play, BarChart2 } from 'lucide-react';

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
  const [showCfgEditor, setShowCfgEditor] = useState(false);
  const [editingCfg, setEditingCfg] = useState<CloudImportConfig | null>(null);
  const [statsCfg, setStatsCfg] = useState<CloudImportConfig | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
      else if (res.status === 'partial_failure') setCloudStatus(`Partial: ${res.imported_rows} imported, ${res.updated_rows} updated, ${res.failed_rows} failed`);
      else setCloudStatus(`✓ Successfully imported ${res.imported_rows} rows`);
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
    onError: (err: any) => {
      setCloudStatus(`Error: ${err?.response?.data?.error || err.message}`);
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    }
  });

  const deleteCfgMut = useMutation({
    mutationFn: (cfgId: string) => deleteCloudImportConfig(cfgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-import-configs'] });
    },
  });

  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter((c: CloudImportConfig) => 
      c.name?.toLowerCase().includes(q) || c.provider?.toLowerCase().includes(q)
    );
  }, [configs, search]);

  const hasActiveFilters = !!search;
  const clearAll = () => setSearch('');

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
        const names = ids.map((id) => contactLists.find((cl: any) => cl.id === id)?.name).filter(Boolean);
        return (
          <div className="flex flex-col items-start gap-1">
            {names.length === 0 ? <span className="text-gray-400">None</span> : 
              names.map((n, i) => (
                <Badge key={i} color="blue">{n}</Badge>
              ))
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
            <span className="text-sm">{r.cron_expression ? parseCronToWords(r.cron_expression) : 'No schedule'}</span>
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
                  r.last_run_status === 'done' || r.last_run_status === 'ok'
                    ? 'bg-green-500'
                    : r.last_run_status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                }`}
              />
              <span className="text-sm capitalize text-gray-700 font-medium">
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
      header: 'Next Run',
      render: (r: CloudImportConfig) => (
        <div>
          {r.next_refresh ? (
            <p className="text-sm text-gray-700">
              {new Date(r.next_refresh).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
              })}
            </p>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      render: (r: CloudImportConfig) => (
        <div className="flex items-center space-x-2">
          <Button size="sm" variant="secondary" onClick={() => runCfgMut.mutate(r.id)} loading={runCfgMut.isPending && runCfgMut.variables === r.id} disabled={!r.schedule_enabled}>
            <Play className="w-4 h-4 mr-1" /> Run Now
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setStatsCfg(r)}>
            <BarChart2 className="w-4 h-4 mr-1" /> Statistics
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
            {hasActiveFilters ? `${filteredConfigs.length} of ${configs.length} tasks` : 'Configure automated cloud imports across multiple contact lists.'}
          </p>
        </div>
        <Button onClick={() => openCfgEditor()} icon={<Plus className="w-4 h-4" />}>
          New Task
        </Button>
      </div>

      <div className='space-y-3'>
        <div className='filter-bar'>
          <SearchInput value={search} onChange={setSearch} placeholder='Search tasks by name or provider…' />
          <div className='flex items-center gap-2 flex-wrap'>
            {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
          </div>
        </div>
        {hasActiveFilters && (
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
            {search && <FilterPill label={`Search: "${search}"`} onRemove={() => setSearch('')} />}
          </div>
        )}
      </div>

      {cloudStatus && (
        <div className={`p-4 rounded-lg flex items-center justify-between ${cloudStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : cloudStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
          <span>{cloudStatus}</span>
          <button onClick={() => setCloudStatus(null)} className="ml-4 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <Card>
        {hasActiveFilters && filteredConfigs.length === 0 ? (
          <EmptyState title='No tasks match your search' description='Try adjusting or clearing the filters above.' />
        ) : (
          <Table<CloudImportConfig>
            keyFn={(r) => r.id}
            rows={filteredConfigs}
            cols={cols}
            emptyMessage="No tasks configured. Create one to automatically sync contacts from S3 or FTP."
          />
        )}
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

      {/* Stats Modal */}
      {statsCfg && (
        <StatsModal cfg={statsCfg} onClose={() => setStatsCfg(null)} />
      )}
    </div>
  );
}

function StatsModal({ cfg, onClose }: { cfg: CloudImportConfig, onClose: () => void }) {
  const { data: response, isLoading } = useQuery({
    queryKey: ['cloud-import-history', cfg.id],
    queryFn: () => getCloudImportHistory(cfg.id),
  });
  const history = response?.data || [];

  return (
    <Modal open={true} onClose={onClose} title={`Task Statistics: ${cfg.name}`} size="lg">
      <div className="p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Run History</h3>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 bg-gray-50 rounded border border-dashed border-gray-200">
            No runs recorded yet.
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {history.map((run) => (
              <div key={run.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Badge color={run.status === 'done' || run.status === 'ok' ? 'green' : run.status === 'failed' ? 'red' : 'yellow'}>
                      {run.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(run.run_at).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{formatTimeAgo(run.run_at)}</span>
                </div>
                <div className="flex items-center space-x-4 text-sm mt-1">
                  <div className="flex items-center text-green-700">
                    <span className="font-semibold mr-1.5">{run.imported_rows}</span> created
                  </div>
                  <div className="flex items-center text-blue-700">
                    <span className="font-semibold mr-1.5">{run.updated_rows || 0}</span> updated
                  </div>
                  <div className="flex items-center text-red-700">
                    <span className="font-semibold mr-1.5">{run.failed_rows}</span> failed
                  </div>
                </div>
                {run.error_log && (
                  <div className="mt-2 bg-red-50 text-red-700 text-xs p-2 rounded border border-red-100 max-h-40 overflow-y-auto">
                    {(() => {
                      try {
                        const parsed = JSON.parse(run.error_log);
                        if (Array.isArray(parsed)) {
                          return (
                            <ul className="list-disc pl-4 space-y-1">
                              {parsed.map((err: any, i: number) => (
                                <li key={i}>
                                  <span className="font-semibold">Row {err.row}:</span> {err.error}
                                </li>
                              ))}
                            </ul>
                          );
                        }
                      } catch (e) {}
                      return <span className="break-words font-mono">{run.error_log}</span>;
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-6">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
