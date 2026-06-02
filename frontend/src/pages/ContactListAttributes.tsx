import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  getContactList,
  getContactListAttributes,
  updateContactListAttributes,
} from '../api/client';
import { Card, Button, PageLoader } from '../components/ui';
import {
  ArrowLeft,
  Save,
  Search,
  Plus,
  Minus,
  GripVertical,
  Lock,
  AlertCircle,
} from 'lucide-react';

const REQUIRED_FIELD_KEYS = new Set(['system_contact_id', 'phone_number']);
const isRequired = (r: any) => REQUIRED_FIELD_KEYS.has(r.field_key);
const isOwnedCustom = (r: any) => r?.source === 'custom_list';
const isEditableCustom = (r: any) =>
  r?.source === 'custom_list' || (r?.field_type === 'custom' && r?.source === 'library');

export default function ContactListAttributesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const fromCreate = location.state?.fromCreate === true;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const { data: list } = useQuery({
    queryKey: ['contact-list', id],
    queryFn: () => getContactList(id!),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['contact-list-attributes', id],
    queryFn: () => getContactListAttributes(id!),
  });

  useEffect(() => {
    if (data?.data) {
      const required: string[] = [];
      const rest: string[] = [];
      data.data.forEach((r: any) => {
        if (isRequired(r)) required.push(r.id);
        else if (r.is_selected) rest.push(r.id);
      });
      setSelectedIds([...required, ...rest]);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => updateContactListAttributes(id!, selectedIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-list-attributes', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      navigate(`/contact-lists/${id}`);
      setSavedMsg('✓ Attributes saved');
      setTimeout(() => setSavedMsg(null), 2500);
    },
  });

  const byId = useMemo(() => {
    const m = new Map<string, any>();
    (data?.data || []).forEach((r: any) => m.set(r.id, r));
    return m;
  }, [data]);

  const selectedRows = useMemo(
    () => selectedIds.map((sid) => byId.get(sid)).filter(Boolean),
    [selectedIds, byId],
  );

  const availableRows = useMemo(() => {
    const sel = new Set(selectedIds);
    const all = (data?.data || []).filter((r: any) => !sel.has(r.id));
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (r: any) =>
        r.name.toLowerCase().includes(q) ||
        r.field_key.toLowerCase().includes(q) ||
        r.data_type.toLowerCase().includes(q),
    );
  }, [data, selectedIds, search]);

  const addOne = (row: any) =>
    setSelectedIds((prev) =>
      prev.includes(row.id) ? prev : [...prev, row.id],
    );

  // Only removes non-required, non-custom fields (custom fields are managed via System Configuration)
  const removeOne = (row: any) => {
  if (isRequired(row)) return; // owned customs can't be unassigned (no minus, has delete)
  setSelectedIds((prev) => prev.filter((sid) => sid !== row.id));
};

  const addAll = () =>
    setSelectedIds((prev) => [
      ...prev,
      ...availableRows
        .map((r: any) => r.id)
        .filter((rid: string) => !prev.includes(rid)),
    ]);

  const removeAll = () =>
    setSelectedIds((prev) =>
      prev.filter((sid) => {
        const r = byId.get(sid);
        return isRequired(r || {}) ;
      }),
    );

  const onDragStart = (idx: number) => setDragIdx(idx);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return setDragIdx(null);
    setSelectedIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center gap-3'>
        <button
          onClick={() => navigate(`/contact-lists/${id}`)}
          className='p-1.5 hover:bg-gray-100 rounded-lg'
        >
          <ArrowLeft className='w-4 h-4 text-gray-500' />
        </button>
        <div className='flex-1'>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
  {fromCreate ? 'Set Up Your List Fields' : 'Manage Attributes'}
</h1>
<p className='text-sm text-[#7A5C44]'>
  {fromCreate
    ? 'Choose which fields to include in your new list, then save to continue.'
    : 'Add or remove fields for this contact list.'}
</p>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {list?.name} · {selectedIds.length} of {data?.data?.length || 0} selected
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='secondary'
            icon={<Plus className='w-4 h-4' />}
            onClick={() => navigate(`/contact-lists/${id}/attributes/new`)}
          >
            New Attributes
          </Button>
          <Button
  icon={<Save className='w-4 h-4' />}
  loading={saveMut.isPending}
  onClick={() => saveMut.mutate()}
>
  {fromCreate ? 'Save & Go To List →' : 'Save Changes'}
</Button>
        </div>
      </div>

      {savedMsg && (
        <div className='p-3 rounded-lg text-sm bg-green-50 text-green-700'>{savedMsg}</div>
      )}
      {saveMut.isError && (
        <div className='flex items-center gap-2 p-3 rounded-lg bg-red-100 border border-red-300'>
          <AlertCircle className='w-4 h-4 text-red-700 shrink-0' />
          <p className='text-sm font-medium text-red-800'>
            {(saveMut.error as any)?.response?.data?.error || 'Failed to save attributes. Please try again.'}
          </p>
        </div>
      )}

      <p className='text-xs text-gray-500'>
        Select attributes to associate with this contact list. To edit or delete custom attributes, visit{' '}
        <button
          onClick={() => navigate('/system-configuration')}
          className='text-indigo-600 hover:underline font-medium'
        >
          System Configuration → Manage Attributes
        </button>
        .
      </p>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* ── Available Attributes ─────────────────────────── */}
        <Card>
          <div className='flex items-center justify-between px-4 py-3 border-b border-gray-100'>
            <h3 className='font-semibold text-gray-900 text-sm'>Available Attributes</h3>
            <button
              onClick={addAll}
              disabled={availableRows.length === 0}
              className='text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:text-gray-300 disabled:cursor-not-allowed'
            >
              Add All
            </button>
          </div>
          <div className='px-4 py-2 border-b border-gray-100'>
            <div className='relative'>
              <Search className='w-4 h-4 text-gray-400 absolute left-2.5 top-2.5' />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search…'
                className='w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
              />
            </div>
          </div>
          <ul className='max-h-[60vh] overflow-y-auto divide-y divide-gray-50'>
            {availableRows.length === 0 ? (
              <li className='px-4 py-12 text-center text-sm text-gray-400'>
                {search ? 'No fields match your search' : 'All fields selected'}
              </li>
            ) : (
              availableRows.map((r: any) => (
                <li
                  key={r.id}
                  onClick={() => addOne(r)}
                  className='flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50/50 cursor-pointer group'
                >
                  <span>{r.name}</span>
                  <Plus className='w-4 h-4 text-indigo-500 opacity-60 group-hover:opacity-100' />
                </li>
              ))
            )}
          </ul>
        </Card>

        {/* ── Selected Attributes ──────────────────────────── */}
        <Card>
          <div className='flex items-center justify-between px-4 py-3 border-b border-gray-100'>
            <h3 className='font-semibold text-gray-900 text-sm'>Selected Attributes</h3>
            <button
              onClick={removeAll}
              disabled={selectedRows.filter((r: any) => !isRequired(r)).length === 0}
              className='text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:text-gray-300 disabled:cursor-not-allowed'
            >
              Remove All
            </button>
          </div>
          <ul className='max-h-[60vh] overflow-y-auto divide-y divide-gray-50'>
            {selectedRows.length === 0 ? (
              <li className='px-4 py-12 text-center text-sm text-gray-400'>
                No attributes selected yet
              </li>
            ) : (
              selectedRows.map((r: any, idx: number) => {
                const required = isRequired(r);
                const custom = isOwnedCustom(r) || isEditableCustom(r);
                const canRemove = !required ;
                return (
                  <li
                    key={r.id}
                    draggable={!required}
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(idx)}
                    className={`flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 group ${
                      dragIdx === idx ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    } ${required ? '' : 'cursor-move'}`}
                  >
                    <span className='flex items-center gap-2 min-w-0'>
                      {required ? (
                        <Lock className='w-4 h-4 text-amber-500 shrink-0' aria-label='Required' />
                      ) : (
                        <GripVertical className='w-4 h-4 text-gray-300 shrink-0' />
                      )}
                      <span className='truncate'>{r.name}</span>
                      {required && (
                        <span className='text-[10px] uppercase tracking-wide text-amber-600 font-medium'>
                          required
                        </span>
                      )}
                      {custom && (
                        <span className='text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium'>
                          custom
                        </span>
                      )}
                    </span>

                    {/* Only show the minus (unassign) button — no edit/delete here */}
                    <button
                      onClick={() => removeOne(r)}
                      disabled={!canRemove}
                      title={required ? 'Required — cannot be removed' : 'Unassign'}
                      className='text-indigo-500 hover:text-indigo-700 disabled:text-gray-200 disabled:cursor-not-allowed p-1'
                    >
                      <Minus className='w-4 h-4' />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}