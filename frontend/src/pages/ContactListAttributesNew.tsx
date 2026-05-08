import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { getContactList, createContactListCustomFields } from '../api/client';
import { Card, Button, PageLoader } from '../components/ui';
import { Plus, Trash2 } from 'lucide-react';

const DATA_TYPES = [
  'STRING',
  'INTEGER',
  'FLOAT',
  'LONG',
  'PHONE',
  'EMAIL',
  'TIMESTAMP',
  'BOOLEAN',
];

interface DraftRow {
  name: string;
  data_type: string;
  is_private: boolean;
  is_read_only_agent: boolean;
  is_masked_agent: boolean;
  is_masked_reports: boolean;
}

const blankRow = (): DraftRow => ({
  name: '',
  data_type: 'STRING',
  is_private: false,
  is_read_only_agent: false,
  is_masked_agent: false,
  is_masked_reports: false,
});

const toFieldKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export default function ContactListAttributesNewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rows, setRows] = useState<DraftRow[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ['contact-list', id],
    queryFn: () => getContactList(id!),
  });

  const updateRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);

  const handleSave = async () => {
    setError(null);
    const cleaned = rows.filter((r) => r.name.trim());
    if (cleaned.length === 0) {
      setError('Add at least one attribute with a name');
      return;
    }
    const keys = cleaned.map((r) => toFieldKey(r.name));
    if (new Set(keys).size !== keys.length) {
      setError('Attribute names must be unique');
      return;
    }
    setSaving(true);
    try {
      // Custom fields are scoped to this contact list — they're stored in
      // contact_list_custom_fields, NOT in org_field_library.
      await createContactListCustomFields(
        id!,
        cleaned.map((r) => ({
          name: r.name.trim(),
          data_type: r.data_type,
          is_private: r.is_private,
          is_read_only_agent: r.is_read_only_agent,
          is_masked_agent: r.is_masked_agent,
          is_masked_reports: r.is_masked_reports,
        })),
      );
      qc.invalidateQueries({ queryKey: ['contact-list-attributes', id] });
      navigate(`/contact-lists/${id}/attributes`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create attributes');
    } finally {
      setSaving(false);
    }
  };

  if (!list) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-base'>
            <button
              onClick={() => navigate(`/contact-lists/${id}/attributes`)}
              className='text-indigo-600 hover:underline font-semibold'
            >
              Contact Attributes
            </button>
            <span className='text-gray-400 mx-2'>/</span>
            <span className='font-semibold text-gray-900'>New Attributes</span>
          </h1>
          <p className='text-xs text-gray-500 mt-1'>
            This page allows you to add multiple new Attributes. Please provide
            Attribute names and their data types.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='secondary'
            onClick={() => navigate(`/contact-lists/${id}/attributes`)}
          >
            Cancel
          </Button>
          <Button loading={saving} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div className='p-3 rounded-lg text-sm bg-red-50 text-red-700'>
          {error}
        </div>
      )}

      <div className='space-y-3'>
        {rows.map((r, i) => (
          <RowEditor
            key={i}
            index={i}
            row={r}
            onChange={(p) => updateRow(i, p)}
            onRemove={() => removeRow(i)}
            canRemove={rows.length > 1}
          />
        ))}
      </div>

      <Button
        variant='secondary'
        icon={<Plus className='w-4 h-4' />}
        onClick={addRow}
      >
        Add Attribute
      </Button>
    </div>
  );
}

function RowEditor({
  index,
  row,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  row: DraftRow;
  onChange: (p: Partial<DraftRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  return (
    <Card className='p-0 overflow-hidden'>
      {/* ── Header strip ─────────────────────────────────── */}
      <div className='flex items-center justify-between px-5 py-2.5 border-b border-gray-100 bg-gray-50'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>
          Attribute #{index + 1}
        </span>
        <button
          disabled={!canRemove}
          onClick={onRemove}
          title={
            canRemove
              ? 'Remove attribute'
              : 'At least one attribute is required'
          }
          className='p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed'
        >
          <Trash2 className='w-4 h-4' />
        </button>
      </div>

      {/* ── Form body ────────────────────────────────────── */}
      <div className='p-5 space-y-4'>
        {/* Top row: Name (wider) + Data Type (narrower) */}
        <div className='grid grid-cols-1 md:grid-cols-12 gap-4'>
          <div className='md:col-span-8'>
            <label className='block text-xs font-medium text-gray-600 mb-1.5'>
              Attribute Name <span className='text-red-500'>*</span>
            </label>
            <input
              className={inputCls}
              placeholder='e.g. Customer Score'
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
            {row.name.trim() && (
              <p className='text-[11px] text-gray-400 mt-1 font-mono'>
                field_key: {toFieldKey(row.name)}
              </p>
            )}
          </div>
          <div className='md:col-span-4'>
            <label className='block text-xs font-medium text-gray-600 mb-1.5'>
              Data Type
            </label>
            <select
              className={inputCls}
              value={row.data_type}
              onChange={(e) => onChange({ data_type: e.target.value })}
            >
              {DATA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom row: Permissions group */}
        <div>
          <label className='block text-xs font-medium text-gray-600 mb-2'>
            Permissions
          </label>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
            <CheckCell
              label='Private'
              hint='Hidden from agents'
              checked={row.is_private}
              onChange={(v) => onChange({ is_private: v })}
            />
            <CheckCell
              label='Read Only for Agents'
              hint='Agents cannot edit'
              checked={row.is_read_only_agent}
              onChange={(v) => onChange({ is_read_only_agent: v })}
            />
            <CheckCell
              label='Masked for Agents'
              hint='Value obfuscated'
              checked={row.is_masked_agent}
              onChange={(v) => onChange({ is_masked_agent: v })}
            />
            <CheckCell
              label='Masked for Users'
              hint='Hidden in reports'
              checked={row.is_masked_reports}
              onChange={(v) => onChange({ is_masked_reports: v })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function CheckCell({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
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
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className='min-w-0'>
        <span className='block text-xs font-medium text-gray-800 leading-tight'>
          {label}
        </span>
        {hint && (
          <span className='block text-[10px] text-gray-400 mt-0.5'>{hint}</span>
        )}
      </span>
    </label>
  );
}
