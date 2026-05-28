import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getContactList,
  getContactListAttributes,
  updateContactListAttributes,
  deleteContactListCustomField,
  updateContactListCustomField,
} from '../api/client';
import { Card, Button, PageLoader } from '../components/ui';
import {
  ArrowLeft,
  Save,
  Search,
  Plus,
  Minus,
  Trash2,
  Pencil,
  GripVertical,
  Lock,
  X,
  AlertCircle,
} from 'lucide-react';

const CUSTOM_DATA_TYPES = [
  'STRING',
  'INTEGER',
  'FLOAT',
  'LONG',
  'PHONE',
  'EMAIL',
  'TIMESTAMP',
  'BOOLEAN',
] as const;

// Field keys that must always be attached to every contact list and
// cannot be unchecked by the user. `phone_number` is the dialing target;
// `system_contact_id` is the upload-side primary key.
const REQUIRED_FIELD_KEYS = new Set(['system_contact_id', 'phone_number']);
const isRequired = (r: any) => REQUIRED_FIELD_KEYS.has(r.field_key);
const isCustomList = (r: any) => r?.source === 'custom_list';

export default function ContactListAttributesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Ordered list of selected field IDs (drives the right pane order).
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

  // Seed selection from server response (preserve server order; required first).
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
      setTimeout(() => {setSavedMsg(null);
     
      },
       2500);
    },
  });

  // Deleting a list-scoped custom field permanently removes its definition.
  const [deleteCustomTarget, setDeleteCustomTarget] = useState<any | null>(null);
  const deleteCustomMut = useMutation({
    mutationFn: (fid: string) => deleteContactListCustomField(id!, fid),
    onSuccess: (_data, fid) => {
      setSelectedIds((prev) => prev.filter((sid) => sid !== fid));
      qc.invalidateQueries({ queryKey: ['contact-list-attributes', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      setDeleteCustomTarget(null);
    },
  });

  // Edit modal state for list-scoped custom fields. field_key stays read-only
  // because it's the JSONB key used by stored contact values.
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    data_type: string;
    is_private: boolean;
    is_read_only_agent: boolean;
    is_masked_agent: boolean;
    is_masked_reports: boolean;
    is_editable_agent: boolean;
  } | null>(null);

  const openEdit = (row: any) => {
    setEditing(row);
    setEditForm({
      name: row.name || '',
      data_type: String(row.data_type || 'STRING').toUpperCase(),
      is_private: !!row.is_private,
      is_read_only_agent: !!row.is_read_only_agent,
      is_masked_agent: !!row.is_masked_agent,
      is_masked_reports: !!row.is_masked_reports,
      is_editable_agent: !!row.is_editable_agent,
    });
  };
  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const updateCustomMut = useMutation({
    mutationFn: () => updateContactListCustomField(id!, editing!.id, editForm!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-list-attributes', id] });
      qc.invalidateQueries({ queryKey: ['contact-list', id] });
      setSavedMsg('✓ Custom field updated');
      setTimeout(() => setSavedMsg(null), 2500);
      closeEdit();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || '';
      if (msg) {
        setSavedMsg(`⚠ ${msg}`);
        setTimeout(() => setSavedMsg(null), 4000);
      }
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
  const removeOne = (row: any) => {
    if (isRequired(row) || isCustomList(row)) return;
    setSelectedIds((prev) => prev.filter((sid) => sid !== row.id));
  };
  const deleteCustom = (row: any) => {
    if (!isCustomList(row)) return;
    setDeleteCustomTarget(row);
  };
  // Available pane only shows library rows (custom rows belong to the list).
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
        return isRequired(r || {}) || isCustomList(r);
      }),
    );

  // Drag-and-drop reorder for the selected pane.
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
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: "Sora, sans-serif" }}>Manage Attributes</h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {list?.name} · {selectedIds.length} of {data?.data?.length || 0}{' '}
            selected
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
            Save
          </Button>
        </div>
      </div>

      {savedMsg && (
        <div className='p-3 rounded-lg text-sm bg-green-50 text-green-700'>
          {savedMsg}
        </div>
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
        This page allows you to associate Attributes with selected Contact List.
      </p>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* ── Available Attributes ─────────────────────────── */}
        <Card>
          <div className='flex items-center justify-between px-4 py-3 border-b border-gray-100'>
            <h3 className='font-semibold text-gray-900 text-sm'>
              Available Attributes
            </h3>
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
            <h3 className='font-semibold text-gray-900 text-sm'>
              Selected Attributes
            </h3>
            <button
              onClick={removeAll}
              disabled={
                selectedRows.filter((r: any) => !isRequired(r)).length === 0
              }
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
                const custom = isCustomList(r);
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
                        <Lock
                          className='w-4 h-4 text-amber-500 shrink-0'
                          aria-label='Required'
                        />
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
                    {custom ? (
                      <span className='flex items-center gap-2'>
                        <button
                          onClick={() => openEdit(r)}
                          title='Edit custom field'
                          className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                        >
                          <Pencil className='w-3 h-3' />
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCustom(r)}
                          disabled={deleteCustomMut.isPending}
                          title='Delete custom field'
                          className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-40'
                        >
                          <Trash2 className='w-3 h-3' />
                          Delete
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => removeOne(r)}
                        disabled={required}
                        title={
                          required ? 'Required — cannot be removed' : 'Remove'
                        }
                        className='text-indigo-500 hover:text-indigo-700 disabled:text-gray-200 disabled:cursor-not-allowed p-1'
                      >
                        <Minus className='w-4 h-4' />
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </div>

      {editing && editForm && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
          onClick={closeEdit}
        >
          <div
            className='bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center justify-between px-5 py-3 border-b border-gray-100'>
              <div>
                <h3 className='font-semibold text-gray-900'>
                  Edit Custom Attribute
                </h3>
                <p className='text-xs text-gray-400 mt-0.5'>
                  field_key:{' '}
                  <code className='text-gray-600'>{editing.field_key}</code>{' '}
                  (locked)
                </p>
              </div>
              <button
                onClick={closeEdit}
                className='p-1 text-gray-400 hover:text-gray-600'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            <div className='p-5 space-y-4'>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>
                  Attribute Name *
                </label>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
                />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>
                  Data Type
                </label>
                <select
                  value={editForm.data_type}
                  onChange={(e) =>
                    setEditForm({ ...editForm, data_type: e.target.value })
                  }
                  className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
                >
                  {CUSTOM_DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
  <div className='text-xs font-medium text-gray-600 mb-2'>
    Permissions
  </div>
  <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
    {(
      [
        ['is_private', 'Private', 'Hidden from agents'],
        ['is_masked_reports', 'Masked for Users', 'Hidden in reports'],
        ['is_editable_agent', 'Agent Can Edit', 'Allow agents to modify this field'],
      ] as const
    ).map(([key, label, hint]) => {
      const checked = (editForm as any)[key] as boolean;
      return (
        <label
          key={key}
          className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
            checked
              ? 'border-indigo-200 bg-indigo-50/60'
              : 'border-gray-200 hover:bg-gray-50'
          }`}
        >
          <input
            type='checkbox'
            className='w-4 h-4 accent-indigo-600 mt-0.5 shrink-0'
            checked={checked}
            onChange={(e) =>
              setEditForm({ ...editForm, [key]: e.target.checked } as any)
            }
          />
          <span className='min-w-0'>
            <span className='block text-xs font-medium text-gray-800 leading-tight'>
              {label}
            </span>
            <span className='block text-[10px] text-gray-400 mt-0.5'>
              {hint}
            </span>
          </span>
        </label>
      );
    })}
  </div>
</div>

              {updateCustomMut.isError && (
                <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <AlertCircle className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
                  <p className='text-xs text-red-700 leading-relaxed'>
                    {(updateCustomMut.error as any)?.response?.data?.error || 'Could not save changes. Please try again.'}
                  </p>
                </div>
              )}
            </div>

            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={closeEdit}>
                Cancel
              </Button>
              <Button
                icon={<Save className='w-4 h-4' />}
                loading={updateCustomMut.isPending}
                onClick={() => updateCustomMut.mutate()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteCustomTarget && (
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete Custom Field</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button
                onClick={() => { setDeleteCustomTarget(null); deleteCustomMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100'>
                <AlertCircle className='w-5 h-5 text-red-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-red-800'>
                    Delete "{deleteCustomTarget.name}"?
                  </p>
                  <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                    This removes the column from this list permanently along with all stored values.
                  </p>
                </div>
              </div>
              {deleteCustomMut.isError && (
                <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700'>
                  Could not delete this custom field. Please try again.
                </div>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button
                variant='secondary'
                onClick={() => { setDeleteCustomTarget(null); deleteCustomMut.reset(); }}
              >
                Cancel
              </Button>
              <Button
                loading={deleteCustomMut.isPending}
                onClick={() => deleteCustomMut.mutate(deleteCustomTarget.id)}
                className='!bg-red-600 hover:!bg-red-700 !text-white'
              >
                Delete Field
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
