import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFieldLibrary,
  createFieldLibrary,
  updateFieldLibrary,
  deleteFieldLibrary,
} from '../api/client';
import {
  Card,
  Table,
  Button,
  Modal,
  Input,
  PageLoader,
  EmptyState,
  Badge,
  SearchInput,
  FilterDropdown,
  FilterPill,
  ClearFiltersButton,
} from '../components/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const DATA_TYPES = [
  'STRING',
  'LONG',
  'INTEGER',
  'FLOAT',
  'PHONE',
  'EMAIL',
  'TIMESTAMP',
  'BOOLEAN',
];
const FIELD_TYPES = ['predefined', 'custom'];

const emptyForm = {
  name: '',
  field_key: '',
  field_type: 'custom',
  data_type: 'STRING',
  is_private: false,
  is_read_only_agent: false,
  is_masked_agent: false,
  is_masked_reports: false,
  display_order: 99,
};

export default function FieldLibraryPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState('');
  const [filterFieldType, setFilterFieldType] = useState('');
  const [filterDataType, setFilterDataType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['field-library'],
    queryFn: getFieldLibrary,
  });

  const reset = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const createMut = useMutation({
    mutationFn: () => createFieldLibrary(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-library'] });
      reset();
    },
  });
  const updateMut = useMutation({
    mutationFn: () => updateFieldLibrary(editingId!, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-library'] });
      reset();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFieldLibrary(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-library'] });
      setDeletingRow(null);
    },
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      field_key: r.field_key,
      field_type: r.field_type,
      data_type: r.data_type,
      is_private: r.is_private,
      is_read_only_agent: r.is_read_only_agent,
      is_masked_agent: r.is_masked_agent,
      is_masked_reports: r.is_masked_reports,
      display_order: r.display_order,
    });
    setShowForm(true);
  };

  const yn = (v: boolean) => (v ? 'Yes' : 'No');

  const rows: any[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.name || ''} ${r.field_key || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterFieldType && r.field_type !== filterFieldType) return false;
      if (filterDataType && r.data_type !== filterDataType) return false;
      return true;
    });
  }, [rows, search, filterFieldType, filterDataType]);

  if (isLoading) return <PageLoader />;

  const hasActiveFilters = !!(search || filterFieldType || filterDataType);
  const clearAll = () => { setSearch(''); setFilterFieldType(''); setFilterDataType(''); };

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-[#1A0F00]' style={{ fontFamily: "Sora, sans-serif" }}>Field Library</h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>
            {hasActiveFilters
              ? `${filtered.length} of ${rows.length} field(s)`
              : 'Default columns available for CSV upload — predefined fields are shared globally; custom fields are scoped to your org.'}
          </p>
        </div>
        <Button
          icon={<Plus className='w-4 h-4' />}
          onClick={() => {
            setForm({ ...emptyForm });
            setShowForm(true);
          }}
        >
          Add Field
        </Button>
      </div>

      {rows.length > 0 && (
        <div className='space-y-3'>
          <div className='flex items-center gap-3 flex-wrap'>
            <SearchInput value={search} onChange={setSearch} placeholder='Search fields…' />
            <div className='flex items-center gap-2 flex-wrap'>
              <FilterDropdown
                label='Type'
                value={filterFieldType}
                onChange={setFilterFieldType}
                color='indigo'
                options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
              />
              <FilterDropdown
                label='Data Type'
                value={filterDataType}
                onChange={setFilterDataType}
                color='amber'
                options={DATA_TYPES.map((t) => ({ value: t, label: t }))}
              />
              {hasActiveFilters && <ClearFiltersButton onClick={clearAll} />}
            </div>
          </div>
          {hasActiveFilters && (
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-xs text-gray-400 font-medium'>Active filters:</span>
              {search && <FilterPill label={`Search: "${search}"`} onRemove={() => setSearch('')} />}
              {filterFieldType && <FilterPill label={`Type: ${filterFieldType}`} onRemove={() => setFilterFieldType('')} />}
              {filterDataType && <FilterPill label={`Data: ${filterDataType}`} onRemove={() => setFilterDataType('')} />}
            </div>
          )}
        </div>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title='No fields'
            description='Add a custom field to extend your CSV column dictionary.'
          />
        ) : hasActiveFilters && filtered.length === 0 ? (
          <EmptyState title='No matches' description='Try adjusting or clearing the filters above.' />
        ) : (
          <Table
            cols={[
              {
                header: 'Name',
                render: (r: any) => (
                  <span className='font-medium text-indigo-600'>{r.name}</span>
                ),
              },
              {
                header: 'Type',
                render: (r: any) => (
                  <span className='capitalize text-gray-600'>
                    {r.field_type}
                  </span>
                ),
              },
              {
                header: 'Data Type',
                render: (r: any) => <Badge color='gray'>{r.data_type}</Badge>,
              },
              { header: 'Private', render: (r: any) => yn(r.is_private) },
              {
                header: 'Read Only for Agent',
                render: (r: any) => yn(r.is_read_only_agent),
              },
              {
                header: 'Masked for Agent',
                render: (r: any) => yn(r.is_masked_agent),
              },
              {
                header: 'Masked for Reports',
                render: (r: any) => yn(r.is_masked_reports),
              },
              {
                header: 'Allowed Orgs',
                render: (r: any) =>
                  r.org_id === null ? (
                    <Badge color='blue'>Allowed To All</Badge>
                  ) : (
                    <span className='text-gray-600'>This Org</span>
                  ),
              },
              {
                header: 'Actions',
                render: (r: any) => (
                  <div className='flex items-center gap-2'>
                    <button
                      onClick={() => openEdit(r)}
                      disabled={r.org_id === null}
                      title={
                        r.org_id === null
                          ? 'Global predefined fields are immutable'
                          : 'Edit field'
                      }
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition disabled:opacity-40 disabled:cursor-not-allowed'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingRow(r)}
                      disabled={r.org_id === null}
                      title={
                        r.org_id === null
                          ? 'Global predefined fields cannot be deleted'
                          : 'Delete field'
                      }
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-40 disabled:cursor-not-allowed'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered}
            keyFn={(r: any) => r.id}
          />
        )}
      </Card>

      <FieldFormModal
        open={showForm}
        onClose={reset}
        editingId={editingId}
        form={form}
        setForm={setForm}
        loading={editingId ? updateMut.isPending : createMut.isPending}
        onSubmit={() => (editingId ? updateMut.mutate() : createMut.mutate())}
        error={(editingId ? updateMut.error : createMut.error) as any}
      />

      <Modal
        title='Delete Field'
        open={!!deletingRow}
        onClose={() => setDeletingRow(null)}
      >
        <div className='space-y-4'>
          <p className='text-sm text-gray-600'>
            Delete{' '}
            <span className='font-medium text-gray-900'>
              {deletingRow?.name}
            </span>
            ? This cannot be undone.
          </p>
          <div className='flex gap-3'>
            <Button
              variant='secondary'
              className='flex-1'
              onClick={() => setDeletingRow(null)}
            >
              Cancel
            </Button>
            <Button
              variant='danger'
              className='flex-1'
              loading={deleteMut.isPending}
              onClick={() => deleteMut.mutate(deletingRow.id)}
            >
              Delete
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

// ── Form modal ────────────────────────────────────────────
function FieldFormModal({
  open,
  onClose,
  editingId,
  form,
  setForm,
  loading,
  onSubmit,
  error,
}: {
  open: boolean;
  onClose: () => void;
  editingId: string | null;
  form: any;
  setForm: (f: any) => void;
  loading: boolean;
  onSubmit: () => void;
  error?: any;
}) {
  const upd = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  return (
    <Modal
      title={editingId ? 'Edit Field' : 'Add Field'}
      open={open}
      onClose={onClose}
      size='lg'
    >
      <div className='space-y-3'>
        <div className='grid grid-cols-2 gap-3'>
          <Input
            label='Name *'
            value={form.name}
            onChange={(e) => upd({ name: e.target.value })}
            placeholder='e.g. Loan Number'
          />
          <Input
            label='Field Key *'
            value={form.field_key}
            onChange={(e) => upd({ field_key: e.target.value })}
            placeholder='e.g. loan_number'
          />
        </div>
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>
              Type
            </label>
            <select
              value={form.field_type}
              onChange={(e) => upd({ field_type: e.target.value })}
              className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white'
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>
              Data Type *
            </label>
            <select
              value={form.data_type}
              onChange={(e) => upd({ data_type: e.target.value })}
              className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white'
            >
              {DATA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input
          label='Display Order'
          type='number'
          value={String(form.display_order)}
          onChange={(e) =>
            upd({ display_order: parseInt(e.target.value || '99') })
          }
        />
        <div className='grid grid-cols-2 gap-2 pt-1'>
          {[
            ['is_private', 'Private'],
            ['is_read_only_agent', 'Read Only for Agent'],
            ['is_masked_agent', 'Masked for Agent'],
            ['is_masked_reports', 'Masked for Reports'],
          ].map(([key, label]) => (
            <label
              key={key}
              className='flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700'
            >
              <input
                type='checkbox'
                checked={!!form[key]}
                onChange={(e) => upd({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <div className='flex gap-3 pt-2'>
          <Button variant='secondary' className='flex-1' onClick={onClose}>
            Cancel
          </Button>
          <Button
            className='flex-1'
            loading={loading}
            disabled={!form.name || !form.field_key || !form.data_type}
            onClick={onSubmit}
          >
            {editingId ? 'Save Changes' : 'Create'}
          </Button>
        </div>
        {error && (
          <p className='text-xs text-red-500'>
            {error?.response?.data?.error || 'Operation failed'}
          </p>
        )}
      </div>
    </Modal>
  );
}
