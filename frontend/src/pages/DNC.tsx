import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDncGroups, getCampaigns, api } from '../api/client';
import {
  Card,
  Table,
  Button,
  Modal,
  Input,
  PageLoader,
  EmptyState,
} from '../components/ui';
import {
  Plus,
  ShieldOff,
  Upload,
  FileText,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

// Strip header row + take first column. Returns deduped, trimmed phone strings.
function parseDncCsv(text: string): string[] {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const firstCell = lines[0].split(',')[0].trim().replace(/^"|"$/g, '');
  const isHeader = !/^\+?\d[\d\s\-().]{4,}$/.test(firstCell);
  const rows = isHeader ? lines.slice(1) : lines;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const cell = row.split(',')[0].trim().replace(/^"|"$/g, '');
    if (cell && !seen.has(cell)) {
      seen.add(cell);
      out.push(cell);
    }
  }
  return out;
}

export default function DNCPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showAddNumbers, setShowAddNumbers] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [groupSource, setGroupSource] = useState('import');
  const [isCampaignSpecific, setIsCampaignSpecific] = useState(false);
  const [groupCampaignIds, setGroupCampaignIds] = useState<string[]>([]);
  const [numbersText, setNumbersText] = useState('');

  // Edit/delete state
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editSource, setEditSource] = useState('import');
  const [editIsCampaignSpecific, setEditIsCampaignSpecific] = useState(false);
  const [editCampaignIds, setEditCampaignIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // CSV-import state for the "Add Numbers" modal when source === 'import'.
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvNumbers, setCsvNumbers] = useState<string[]>([]);
  const [csvError, setCsvError] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const resetAddModal = () => {
    setShowAddNumbers(null);
    setNumbersText('');
    setCsvFile(null);
    setCsvNumbers([]);
    setCsvError('');
    setUploadStatus('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dnc-groups'],
    queryFn: getDncGroups,
  });

  // Loaded when the create or edit modal is opened so the campaign multi-select
  // is ready when the user toggles the campaign-specific option.
  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', { for: 'dnc-picker' }],
    queryFn: () => getCampaigns(),
    enabled: showCreate || !!editTarget,
  });

  const openEdit = (g: any) => {
    setEditTarget(g);
    setEditName(g.name || '');
    // The Source dropdown only offers import/manual for new groups, but the
    // dnc_groups table can hold legacy values (federal_registry, etc). Coerce
    // unknown values to 'manual' for the select so the picker stays valid.
    const knownSources = ['import', 'manual'];
    setEditSource(knownSources.includes(g.source) ? g.source : 'manual');
    // The campaign-specific toggle reflects an actual junction binding
    // (campaign_ids), not the `source` value.
    const linked: string[] = Array.isArray(g.campaign_ids)
      ? g.campaign_ids
      : [];
    setEditIsCampaignSpecific(
      linked.length > 0 || g.source === 'campaign_specific',
    );
    setEditCampaignIds(linked);
  };

  const resetEditModal = () => {
    setEditTarget(null);
    setEditName('');
    setEditSource('import');
    setEditIsCampaignSpecific(false);
    setEditCampaignIds([]);
  };

  const resetCreateModal = () => {
    setShowCreate(false);
    setGroupName('');
    setGroupSource('import');
    setIsCampaignSpecific(false);
    setGroupCampaignIds([]);
  };

  const createMut = useMutation({
    mutationFn: () =>
      api
        .post('/dnc-groups', {
          name: groupName,
          source: groupSource,
          ...(isCampaignSpecific ? { campaign_ids: groupCampaignIds } : {}),
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      resetCreateModal();
    },
  });

  const editMut = useMutation({
    mutationFn: () =>
      api
        .patch(`/dnc-groups/${editTarget.id}`, {
          name: editName,
          source: editSource,
          campaign_ids: editIsCampaignSpecific ? editCampaignIds : [],
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      resetEditModal();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/dnc-groups/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      setDeleteTarget(null);
    },
  });

  const addNumsMut = useMutation({
    mutationFn: () => {
      // CSV-import path uses the parsed list; manual path uses the textarea.
      const usesCsv =
        showAddNumbers?.source === 'import' ||
        showAddNumbers?.source === 'campaign_specific';
      const phones =
        usesCsv && csvNumbers.length
          ? csvNumbers
          : numbersText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
      const numbers = phones.map((phone) => ({
        phone_number: phone,
        added_reason: 'import',
      }));
      return api
        .post(`/dnc-groups/${showAddNumbers.id}/numbers`, { numbers })
        .then((r) => r.data);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['dnc-groups'] });
      const hasDupes = (result.duplicates ?? 0) > 0;
      const hasFailed = (result.failed ?? 0) > 0;
      // ✗ when nothing landed and there were duplicates/failures (validation
      // error). ⚠ when partial success. ✓ for clean inserts.
      const prefix =
        result.added === 0 && (hasDupes || hasFailed)
          ? '✗'
          : hasDupes || hasFailed
            ? '⚠'
            : '✓';
      const ccsPart =
        typeof result.ccs_updated === 'number' && result.ccs_updated > 0
          ? `, ${result.ccs_updated} contact(s) marked DNC in linked campaigns`
          : '';
      const dupeList: string[] = Array.isArray(result.duplicate_phones)
        ? result.duplicate_phones
        : [];
      const dupeDetail = dupeList.length
        ? ` — already in this group: ${dupeList.slice(0, 5).join(', ')}${dupeList.length > 5 ? `, +${dupeList.length - 5} more` : ''}`
        : '';
      setUploadStatus(
        `${prefix} Added ${result.added}, Duplicates ${result.duplicates}, Failed ${result.failed}${ccsPart}${dupeDetail}`,
      );
      // Auto-close only on a clean success; leave the message visible when
      // there are duplicates or failures so the user can act on them.
      if (!hasDupes && !hasFailed) {
        setTimeout(() => resetAddModal(), 1500);
      }
    },
    onError: (err: any) => {
      setUploadStatus(`Error: ${err.response?.data?.error || 'Add failed'}`);
    },
  });

  const handleCsvPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    setUploadStatus('');
    try {
      const text = await file.text();
      const nums = parseDncCsv(text);
      if (!nums.length) {
        setCsvError('No phone numbers detected in this CSV.');
        setCsvFile(null);
        setCsvNumbers([]);
        return;
      }
      if (nums.length > 1000) {
        setCsvError(
          `Found ${nums.length} numbers — max 1000 per upload. Split the file and try again.`,
        );
        setCsvFile(null);
        setCsvNumbers([]);
        return;
      }
      setCsvFile(file);
      setCsvNumbers(nums);
    } catch {
      setCsvError('Could not read file.');
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-bold text-gray-900'>DNC Management</h1>
          <p className='text-sm text-gray-400 mt-0.5'>
            Do Not Call suppression lists
          </p>
        </div>
        <Button
          icon={<Plus className='w-4 h-4' />}
          onClick={() => setShowCreate(true)}
        >
          New DNC Group
        </Button>
      </div>

      <Card>
        {data?.data?.length === 0 ? (
          <EmptyState
            title='No DNC groups'
            description='Create a suppression list to block specific phone numbers.'
            action={
              <Button
                icon={<Plus className='w-4 h-4' />}
                onClick={() => setShowCreate(true)}
              >
                Create DNC Group
              </Button>
            }
          />
        ) : (
          <Table
            cols={[
              {
                header: 'Name',
                render: (r: any) => (
                  <div className='flex items-center gap-2'>
                    <ShieldOff className='w-4 h-4 text-red-500' />
                    <span className='font-medium text-gray-900'>{r.name}</span>
                  </div>
                ),
              },
              { header: 'Source', key: 'source' },
              {
                header: 'Campaigns',
                render: (r: any) => {
                  const names: string[] = Array.isArray(r.campaign_names)
                    ? r.campaign_names
                    : [];
                  if (!names.length)
                    return <span className='text-gray-300'>—</span>;
                  return (
                    <div
                      className='flex flex-wrap gap-1 max-w-xs'
                      title={names.join(', ')}
                    >
                      {names.slice(0, 2).map((n) => (
                        <span
                          key={n}
                          className='px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium truncate max-w-[140px]'
                        >
                          {n}
                        </span>
                      ))}
                      {names.length > 2 && (
                        <span className='px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium'>
                          +{names.length - 2}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                header: 'Numbers',
                render: (r: any) => (
                  <span className='font-medium text-red-600'>
                    {r.number_count?.toLocaleString()}
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
                  <div className='flex items-center gap-1'>
                    <Button
                      size='sm'
                      variant='secondary'
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAddNumbers(r);
                      }}
                    >
                      Add Numbers
                    </Button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                      title='Edit group'
                      className='p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition'
                    >
                      <Pencil className='w-4 h-4' />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(r);
                      }}
                      title='Delete group'
                      className='p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition'
                    >
                      <Trash2 className='w-4 h-4' />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={data?.data || []}
            keyFn={(r: any) => r.id}
          />
        )}
      </Card>

      {/* Create DNC group */}
      <Modal
        title='Create DNC Group'
        open={showCreate}
        onClose={resetCreateModal}
      >
        <div className='space-y-4'>
          <Input
            label='Group Name *'
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder='e.g. Federal DNC Registry'
          />
          <div>
            <label className='block text-xs text-gray-500 mb-1'>Source</label>
            <select
              value={groupSource}
              onChange={(e) => setGroupSource(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'
            >
              <option value='import'>Import</option>
              <option value='manual'>Manual</option>
            </select>
          </div>

          {/* Independent campaign-specific toggle, separate from the source dropdown */}
          <div className='border border-gray-200 rounded-lg p-3 space-y-3'>
            <label className='flex items-start gap-2 cursor-pointer'>
              <input
                type='checkbox'
                checked={isCampaignSpecific}
                onChange={(e) => {
                  setIsCampaignSpecific(e.target.checked);
                  if (!e.target.checked) setGroupCampaignIds([]);
                }}
                className='mt-0.5 rounded border-gray-300'
              />
              <div>
                <p className='text-sm font-medium text-gray-800'>
                  Campaign-specific
                </p>
                <p className='text-xs text-gray-500'>
                  Limit this DNC group to one or more specific campaigns.
                </p>
              </div>
            </label>

            {isCampaignSpecific && (
              <div>
                <label className='block text-xs text-gray-500 mb-1'>
                  Campaigns * (select one or more)
                </label>
                <div className='max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white'>
                  {(campaignsData?.data || []).length === 0 ? (
                    <div className='px-3 py-4 text-xs text-gray-400'>
                      No campaigns available.
                    </div>
                  ) : (
                    (campaignsData?.data || []).map((c: any) => {
                      const checked = groupCampaignIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className='flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer'
                        >
                          <input
                            type='checkbox'
                            checked={checked}
                            onChange={(e) =>
                              setGroupCampaignIds((prev) =>
                                e.target.checked
                                  ? [...prev, c.id]
                                  : prev.filter((id) => id !== c.id),
                              )
                            }
                            className='rounded border-gray-300'
                          />
                          <span className='text-gray-800 truncate'>
                            {c.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className='text-xs text-gray-400 mt-1'>
                  {groupCampaignIds.length} selected
                </p>
              </div>
            )}
          </div>

          <p className='text-xs text-gray-400'>
            You can upload a CSV of phone numbers from this group's{' '}
            <span className='font-medium text-gray-600'>Add Numbers</span>{' '}
            action after creating it.
          </p>

          <div className='flex gap-3'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={resetCreateModal}
            >
              Cancel
            </Button>
            <Button
              className='flex-1'
              loading={createMut.isPending}
              disabled={
                !groupName.trim() ||
                (isCampaignSpecific && groupCampaignIds.length === 0)
              }
              onClick={() => createMut.mutate()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add numbers modal — CSV upload for `import` source, paste for the rest */}
      <Modal
        title={`Add Numbers to ${showAddNumbers?.name || ''}`}
        open={!!showAddNumbers}
        onClose={resetAddModal}
      >
        <div className='space-y-4'>
          {showAddNumbers?.source === 'import' ||
          showAddNumbers?.source === 'campaign_specific' ? (
            <>
              <div>
                <label className='block text-xs text-gray-500 mb-1'>
                  Upload CSV
                </label>
                {csvFile ? (
                  <div className='flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50'>
                    <FileText className='w-5 h-5 text-indigo-500 shrink-0' />
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-gray-900 truncate'>
                        {csvFile.name}
                      </p>
                      <p className='text-xs text-gray-500'>
                        {csvNumbers.length} phone number
                        {csvNumbers.length === 1 ? '' : 's'} detected
                      </p>
                    </div>
                    <button
                      type='button'
                      onClick={() => {
                        setCsvFile(null);
                        setCsvNumbers([]);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                      title='Remove file'
                      className='p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                    >
                      <X className='w-4 h-4' />
                    </button>
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => fileRef.current?.click()}
                    className='w-full flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:border-indigo-300 hover:bg-indigo-50/30 transition'
                  >
                    <Upload className='w-6 h-6 text-gray-400' />
                    <span className='text-sm font-medium text-gray-700'>
                      Click to choose a CSV file
                    </span>
                    <span className='text-xs text-gray-400'>
                      First column should contain phone numbers (E.164 format).
                      Header row is auto-detected.
                    </span>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type='file'
                  accept='.csv,text/csv'
                  className='hidden'
                  onChange={handleCsvPick}
                />
                {csvNumbers.length > 0 && (
                  <div className='mt-2 max-h-32 overflow-y-auto rounded-md border border-gray-100 bg-white text-xs font-mono text-gray-600 p-2 space-y-0.5'>
                    {csvNumbers.slice(0, 10).map((n) => (
                      <div key={n}>{n}</div>
                    ))}
                    {csvNumbers.length > 10 && (
                      <div className='text-gray-400'>
                        … and {csvNumbers.length - 10} more
                      </div>
                    )}
                  </div>
                )}
                <p className='text-xs text-gray-400 mt-1'>
                  Max 1000 numbers per upload
                </p>
                {csvError && (
                  <p className='text-xs text-red-500 mt-1'>{csvError}</p>
                )}
              </div>
            </>
          ) : (
            <div>
              <label className='block text-xs text-gray-500 mb-1'>
                Phone Numbers (one per line, E.164 format)
              </label>
              <textarea
                value={numbersText}
                onChange={(e) => setNumbersText(e.target.value)}
                rows={8}
                placeholder={'+12125550101\n+13105550182\n+14155550233'}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono resize-none'
              />
              <p className='text-xs text-gray-400 mt-1'>
                Max 1000 numbers per submission
              </p>
            </div>
          )}

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

          <div className='flex gap-3'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={resetAddModal}
            >
              Cancel
            </Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={addNumsMut.isPending}
              disabled={
                showAddNumbers?.source === 'import' ||
                showAddNumbers?.source === 'campaign_specific'
                  ? csvNumbers.length === 0
                  : !numbersText.trim()
              }
              onClick={() => addNumsMut.mutate()}
            >
              Add to DNC
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit DNC group */}
      <Modal
        title='Edit DNC Group'
        open={!!editTarget}
        onClose={resetEditModal}
      >
        <div className='space-y-4'>
          <Input
            label='Group Name *'
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div>
            <label className='block text-xs text-gray-500 mb-1'>Source</label>
            <select
              value={editSource}
              onChange={(e) => setEditSource(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'
            >
              <option value='import'>Import</option>
              <option value='manual'>Manual</option>
            </select>
          </div>
          <div className='border border-gray-200 rounded-lg p-3 space-y-3'>
            <label className='flex items-start gap-2 cursor-pointer'>
              <input
                type='checkbox'
                checked={editIsCampaignSpecific}
                onChange={(e) => {
                  setEditIsCampaignSpecific(e.target.checked);
                  if (!e.target.checked) setEditCampaignIds([]);
                }}
                className='mt-0.5 rounded border-gray-300'
              />
              <div>
                <p className='text-sm font-medium text-gray-800'>
                  Campaign-specific
                </p>
                <p className='text-xs text-gray-500'>
                  Limit this DNC group to one or more specific campaigns.
                </p>
              </div>
            </label>
            {editIsCampaignSpecific && (
              <div>
                <label className='block text-xs text-gray-500 mb-1'>
                  Campaigns * (select one or more)
                </label>
                <div className='max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white'>
                  {(campaignsData?.data || []).length === 0 ? (
                    <div className='px-3 py-4 text-xs text-gray-400'>
                      No campaigns available.
                    </div>
                  ) : (
                    (campaignsData?.data || []).map((c: any) => {
                      const checked = editCampaignIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className='flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer'
                        >
                          <input
                            type='checkbox'
                            checked={checked}
                            onChange={(e) =>
                              setEditCampaignIds((prev) =>
                                e.target.checked
                                  ? [...prev, c.id]
                                  : prev.filter((id) => id !== c.id),
                              )
                            }
                            className='rounded border-gray-300'
                          />
                          <span className='text-gray-800 truncate'>
                            {c.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className='text-xs text-gray-400 mt-1'>
                  {editCampaignIds.length} selected
                </p>
              </div>
            )}
          </div>
          {editMut.isError && (
            <p className='text-xs text-red-500'>
              {(editMut.error as any)?.response?.data?.error || 'Update failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={resetEditModal}
            >
              Cancel
            </Button>
            <Button
              className='flex-1'
              loading={editMut.isPending}
              disabled={
                !editName.trim() ||
                (editIsCampaignSpecific && editCampaignIds.length === 0)
              }
              onClick={() => editMut.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        title='Delete DNC group?'
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        size='sm'
      >
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            This will permanently delete{' '}
            <span className='font-medium text-gray-900'>
              {deleteTarget?.name}
            </span>{' '}
            and all of its phone numbers. Any campaigns currently bound to it
            will be unbound. This action cannot be undone.
          </p>
          {deleteMut.isError && (
            <p className='text-xs text-red-500'>
              {(deleteMut.error as any)?.response?.data?.error ||
                'Delete failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
