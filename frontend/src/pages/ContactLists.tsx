// ContactListsPage.tsx

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getContactLists,
  createContactList,
  deleteContactList,
  deleteAllContacts,
  updateContactList,
} from '../api/client';
import { Card, PagedTable, Button, Modal, Input, PageLoader, EmptyState, ModalOverlay } from '../components/ui';
import { Plus, Trash2, AlertCircle, X, Pencil, Eye, MoreVertical, XCircle } from 'lucide-react';

// ── Dropdown component ────────────────────────────────────────────────────────

function ActionsDropdown({
  row,
  onEdit,
  onDeleteContacts,
  onDeleteList,
  onView,
}: {
  row: any;
  onEdit: () => void;
  onDeleteContacts: () => void;
  onDeleteList: () => void;
  onView: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div
      className='flex items-center justify-end gap-2'
      onClick={(e) => e.stopPropagation()}
    >
      {/* View button — always visible */}
      <button
        onClick={onView}
        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-semibold transition'
      >
        <Eye className='w-3.5 h-3.5' />
        View
      </button>

      {/* Three-dot menu */}
      <div ref={ref} className='relative'>
        <button
          onClick={() => setOpen((v) => !v)}
          className='inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg border border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300 text-gray-500 hover:text-gray-700 transition'
          aria-label='More actions'
        >
          <MoreVertical className='w-4 h-4' />
        </button>

        {open && (
          <div className='absolute right-0 top-[calc(100%+6px)] z-50 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden'>
            {/* Edit name */}
            <button
              onClick={() => { onEdit(); setOpen(false); }}
              className='w-full flex items-center gap-2.5 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50 transition text-left'
            >
              <Pencil className='w-3.5 h-3.5 text-violet-500' />
              Edit name
            </button>

            <div className='my-1 border-t border-gray-100' />

            {/* Delete contacts */}
            <button
              onClick={() => { onDeleteContacts(); setOpen(false); }}
              disabled={(row.contact_count ?? 0) === 0}
              className='w-full flex items-center gap-2.5 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 transition text-left disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <Trash2 className='w-3.5 h-3.5 text-amber-500' />
              Delete all contacts
            </button>

            {/* Delete list */}
            <button
              onClick={() => { onDeleteList(); setOpen(false); }}
              className='w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-700 hover:bg-red-50 transition text-left'
            >
              <XCircle className='w-3.5 h-3.5 text-red-500' />
              Delete list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactListsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [deleteListTarget, setDeleteListTarget] = useState<any | null>(null);
  const [deleteContactsTarget, setDeleteContactsTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editName, setEditName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: getContactLists,
  });

  const createMut = useMutation({
    mutationFn: () => createContactList({ name }),
    onSuccess: (newList: any) => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setShowCreate(false);
      setName('');
      navigate(`/contact-lists/${newList.id}/attributes`, {
        state: { fromCreate: true }
      });
    },
  });

  const deleteListMut = useMutation({
    mutationFn: (lid: string) => deleteContactList(lid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setDeleteListTarget(null);
    },
  });

  const deleteAllContactsMut = useMutation({
    mutationFn: (lid: string) => deleteAllContacts(lid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setDeleteContactsTarget(null);
    },
  });

  const editMut = useMutation({
    mutationFn: () => updateContactList(editTarget!.id, { name: editName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] });
      setEditTarget(null);
      setEditName('');
    },
  });

  const lists: any[] = data?.data || [];

  if (isLoading) return <PageLoader />;

  return (
    <div className='p-6 space-y-5'>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className='page-header-bar'>
        <div>
          <h1 className='text-2xl font-bold page-heading' style={{ fontFamily: 'Sora, sans-serif' }}>
            Contact Lists
          </h1>
          <p className='text-sm text-[#7A5C44] mt-0.5'>{lists.length} lists total</p>
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
          New List
        </Button>
      </div>

      {/* ── PagedTable ─────────────────────────────────────────────────────────── */}
      <Card>
        {lists.length === 0 ? (
          <EmptyState
            title='No contact lists yet'
            description='Create a contact list to start managing contacts.'
            action={
              <Button icon={<Plus className='w-4 h-4' />} onClick={() => setShowCreate(true)}>
                Create List
              </Button>
            }
          />
        ) : (
          <PagedTable
            cols={[
              {
                header: 'Name',
                render: (r: any, idx?: number) => {
                  const colors = [
                    { bg: 'linear-gradient(135deg,#FFF4EE,#FFE6D2)', dot: '#E8470A', border: '#FFD3B5' },
                    { bg: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', dot: '#3B82F6', border: '#BFDBFE' },
                    { bg: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', dot: '#8B5CF6', border: '#DDD6FE' },
                    { bg: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)', dot: '#10B981', border: '#A7F3D0' },
                  ];
                  const c = colors[(idx || 0) % colors.length];
                  return (
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs'
                        style={{ background: c.bg, color: c.dot, border: `1px solid ${c.border}` }}>
                        {r.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className='font-semibold text-[#0F1117]'>{r.name}</span>
                    </div>
                  );
                },
              },
              {
                header: 'Contacts',
                render: (r: any) => (
                  <span className='count-pill'>{r.contact_count ?? 0}</span>
                ),
              },
              {
                header: 'Fields',
                render: (r: any) => <span className='text-gray-700'>{r.field_count ?? 0}</span>,
              },
              {
                header: 'Actions',
                width: '160px',
                render: (r: any) => (
                  <ActionsDropdown
                    row={r}
                    onView={() => navigate(`/contact-lists/${r.id}`)}
                    onEdit={() => { setEditTarget(r); setEditName(r.name); }}
                    onDeleteContacts={() => setDeleteContactsTarget(r)}
                    onDeleteList={() => setDeleteListTarget(r)}
                  />
                ),
              },
            ]}
            rows={lists}
            keyFn={(r: any) => r.id}
            onRowClick={(r: any) => navigate(`/contact-lists/${r.id}`)}
          />
        )}
      </Card>

      {/* ── Create list modal ──────────────────────────────────────────────── */}
      <Modal
        title='Create Contact List'
        open={showCreate}
        onClose={() => { setShowCreate(false); setName(''); }}
        size='sm'
      >
        <div className='space-y-4'>
          <Input
            label='List Name *'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. Q2 Prospects'
          />
          {createMut.isError && (
            <p className='text-xs text-red-500'>
              {(createMut.error as any)?.response?.data?.error || 'Create failed'}
            </p>
          )}
          <div className='flex gap-3'>
            <Button variant='secondary' className='flex-1' onClick={() => { setShowCreate(false); setName(''); }}>
              Cancel
            </Button>
            <Button
              className='flex-1'
              disabled={!name.trim()}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit / rename list modal ───────────────────────────────────────── */}
      <ModalOverlay open={!!editTarget}>
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Edit Contact List</h3>
                <p className='text-xs text-gray-500 mt-0.5'>Rename "{editTarget?.name}"</p>
              </div>
              <button
                onClick={() => { setEditTarget(null); setEditName(''); editMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div>
                <label className='block text-xs font-medium text-gray-600 mb-1'>List Name *</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder='e.g. Q2 Prospects'
                  className='w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500'
                />
              </div>
              {editMut.isError && (
                <p className='text-xs text-red-600'>
                  {(editMut.error as any)?.response?.data?.error || 'Update failed'}
                </p>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={() => { setEditTarget(null); setEditName(''); editMut.reset(); }}>
                Cancel
              </Button>
              <Button
                loading={editMut.isPending}
                disabled={!editName.trim() || editName === editTarget?.name}
                onClick={() => editMut.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </ModalOverlay>

      {/* ── Delete all contacts confirm modal ─────────────────────────────── */}
      <ModalOverlay open={!!deleteContactsTarget}>
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete All Contacts</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button
                onClick={() => { setDeleteContactsTarget(null); deleteAllContactsMut.reset(); }}
                className='p-1 text-gray-400 hover:text-gray-600'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-5 space-y-4'>
              <div className='flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100'>
                <AlertCircle className='w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='text-sm font-semibold text-amber-800'>
                    Delete all {deleteContactsTarget?.contact_count ?? ''} contacts from "{deleteContactsTarget?.name}"?
                  </p>
                  <p className='text-xs text-amber-700 mt-1 leading-relaxed'>
                    All contacts in this list will be permanently removed. The list itself will remain intact.
                  </p>
                </div>
              </div>
              {deleteAllContactsMut.isError && (
                <p className='text-xs text-red-600'>Delete failed. Please try again.</p>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={() => { setDeleteContactsTarget(null); deleteAllContactsMut.reset(); }}>
                Cancel
              </Button>
              <Button
                loading={deleteAllContactsMut.isPending}
                onClick={() => deleteAllContactsMut.mutate(deleteContactsTarget?.id)}
                className='!bg-amber-600 hover:!bg-amber-700 !text-white'
              >
                Delete All Contacts
              </Button>
            </div>
          </div>
        </div>
      </ModalOverlay>

      {/* ── Delete list confirm modal ──────────────────────────────────────── */}
      <ModalOverlay open={!!deleteListTarget}>
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='flex items-start justify-between px-5 py-4 border-b border-gray-100'>
              <div>
                <h3 className='text-base font-semibold text-gray-900'>Delete Contact List</h3>
                <p className='text-xs text-gray-500 mt-0.5'>This action cannot be undone.</p>
              </div>
              <button
                onClick={() => { setDeleteListTarget(null); deleteListMut.reset(); }}
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
                    Delete "{deleteListTarget?.name}"?
                  </p>
                  <p className='text-xs text-red-600 mt-1 leading-relaxed'>
                    This will permanently delete the list and all {deleteListTarget?.contact_count ?? ''} contacts inside it.
                  </p>
                </div>
              </div>
              {deleteListMut.isError && (
                <p className='text-xs text-red-600'>
                  {(deleteListMut.error as any)?.response?.data?.error || 'Delete failed'}
                </p>
              )}
            </div>
            <div className='flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50'>
              <Button variant='secondary' onClick={() => { setDeleteListTarget(null); deleteListMut.reset(); }}>
                Cancel
              </Button>
              <Button
                loading={deleteListMut.isPending}
                onClick={() => deleteListMut.mutate(deleteListTarget?.id)}
                className='!bg-red-600 hover:!bg-red-700 !text-white'
              >
                Delete List
              </Button>
            </div>
          </div>
        </div>
      </ModalOverlay>
    </div>
  );
}