import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listOrganizations, createOrganization, updateOrganization, deleteOrganization, Organization } from '../api/client';
import { Button, Card, CardHeader, EmptyState, Input, Modal, PageLoader, SearchInput, PagedTable, Textarea } from '../components/ui';
import { Building2, Pencil, Plus, Trash2, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setOrgContext, orgContext, clearOrgContext } = useAuth();
  useEffect(() => { if (orgContext) clearOrgContext(); }, []);

  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['organizations'], queryFn: listOrganizations });
  const orgs: Organization[] = data?.data || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) =>
      o.name?.toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q),
    );
  }, [orgs, search]);

  return (
    <div className='p-6 md:p-8 w-full space-y-6 animate-fade-up'>
      {/* Header */}
      <div className='flex items-center justify-between flex-wrap gap-4'>
        <div>
          <h1 className='text-3xl font-bold text-[#1A0F00] leading-[1.5] pt-1' style={{ fontFamily: 'Arial, sans-serif' }}>Organizations</h1>
         
        </div>
        <Button icon={<Plus className='w-4 h-4' />} onClick={() => setCreateOrgOpen(true)}>
          New organization
        </Button>
      </div>

      {/* Summary bar */}
      <div className='grid grid-cols-3 gap-4 anim-d1'>
        {[
          { label: 'Total Organizations', value: orgs.length, color: 'from-[#F4521E] to-[#F5A623]' },
          { label: 'Total Admins', value: orgs.reduce((s: number, o: Organization) => s + (o.admin_count || 0), 0), color: 'from-[#A855F7] to-[#7C3AED]' },
          { label: 'Total Users', value: orgs.reduce((s: number, o: Organization) => s + (o.user_count || 0), 0), color: 'from-[#3B82F6] to-[#1D4ED8]' },
        ].map(({ label, value, color }) => (
          <div key={label} className='bg-white rounded-2xl border border-[#FFE0C8] p-5 shadow-[0_2px_16px_rgba(244,82,30,0.06)]'>
            <div className={`text-2xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`} style={{ fontFamily: 'Sora, sans-serif' }}>{value}</div>
            <div className='text-xs text-[#7A5C44] mt-1 font-medium'>{label}</div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className='flex items-center gap-3 flex-wrap anim-d1'>
        <SearchInput value={search} onChange={setSearch} placeholder='Search organizations…' />
      </div>

      {/* PagedTable card */}
      <Card className='anim-d2'>
        <CardHeader
          title='All organizations'
          subtitle={search ? `${filtered.length} of ${orgs.length} match` : `${orgs.length} total`}
        />
        {isLoading ? (
          <PageLoader />
        ) : orgs.length === 0 ? (
          <EmptyState title='No organizations yet' description='Create the first tenant organization to get started.'
            action={<Button icon={<Plus className='w-3.5 h-3.5' />} onClick={() => setCreateOrgOpen(true)}>New organization</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState title='No matches' description={`No organizations match "${search}".`} />
        ) : (
          <PagedTable
            cols={[
              {
                header: 'Name',
                render: (r: Organization) => (
                  <button type='button' onClick={() => navigate(`/organizations/${r.id}`)}
                    className='flex items-center gap-2.5 text-left group'>
                    <div className='w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0'
                      style={{ background: 'linear-gradient(135deg, #FFF0E8, #FFE0C8)' }}>
                      <Building2 className='w-4 h-4 text-[#F4521E]' />
                    </div>
                    <span className='font-semibold text-[#1A0F00] group-hover:text-[#F4521E] transition-colors'>{r.name}</span>
                    <ChevronRight className='w-3.5 h-3.5 text-[#C4A080] opacity-0 group-hover:opacity-100 transition-opacity' />
                  </button>
                ),
              },
              {
                header: 'Description',
                render: (r: Organization) => r.description
                  ? <span className='text-[#5C4030] text-sm'>{r.description}</span>
                  : <span className='text-[#C4A080]'>—</span>,
              },
              { header: 'Admins', render: (r: Organization) => <span className='font-semibold text-[#1A0F00]'>{r.admin_count ?? 0}</span>, width: '80px' },
              { header: 'Users', render: (r: Organization) => <span className='font-semibold text-[#1A0F00]'>{r.user_count ?? 0}</span>, width: '80px' },
              { header: 'Created', render: (r: Organization) => <span className='text-[#7A5C44] text-xs'>{new Date(r.created_at).toLocaleDateString()}</span>, width: '110px' },
              {
                header: 'Actions', width: '160px',
                render: (r: Organization) => (
                  <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditOrg(r)}
                      title='Edit organization'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteOrg(r)}
                      title='Delete organization'
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition'
                    >
                      <Trash2 className='w-3 h-3' />
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered}
            keyFn={(r: Organization) => r.id}
            onRowClick={(r: Organization) => navigate(`/organizations/${r.id}`)}
            emptyMessage='No organizations'
          />
        )}
      </Card>

      <CreateOrgModal open={createOrgOpen} onClose={() => setCreateOrgOpen(false)} onCreated={() => { setCreateOrgOpen(false); qc.invalidateQueries({ queryKey: ['organizations'] }); }} />
      {editOrg && <EditOrgModal org={editOrg} onClose={() => setEditOrg(null)} onSaved={() => { setEditOrg(null); qc.invalidateQueries({ queryKey: ['organizations'] }); }} />}
      {deleteOrg && <DeleteOrgModal org={deleteOrg} onClose={() => setDeleteOrg(null)} onDeleted={() => { setDeleteOrg(null); qc.invalidateQueries({ queryKey: ['organizations'] }); }} />}
    </div>
  );
}

function EditOrgModal({ org, onClose, onSaved }: { org: Organization; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || '');
  const [error, setError] = useState('');
  const m = useMutation({ mutationFn: (body: any) => updateOrganization(org.id, body), onSuccess: () => onSaved(), onError: (e: any) => setError(e?.response?.data?.error || 'Failed to update') });
  return (
    <Modal title={`Edit ${org.name}`} open={true} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ name, description: description || null }); }} className='space-y-4'>
        <Input label='Name' value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Textarea label='Description' value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2 pt-2'><Button type='button' variant='secondary' onClick={onClose}>Cancel</Button><Button type='submit' loading={m.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function DeleteOrgModal({ org, onClose, onDeleted }: { org: Organization; onClose: () => void; onDeleted: () => void }) {
  const [error, setError] = useState('');
  const m = useMutation({ mutationFn: () => deleteOrganization(org.id), onSuccess: () => onDeleted(), onError: (e: any) => setError(e?.response?.data?.error || 'Failed to delete') });
  return (
    <Modal title={`Delete ${org.name}?`} open={true} onClose={onClose}>
      <div className='space-y-4'>
        <p className='text-sm text-[#5C4030]'>This permanently removes the organization. The action will fail if it still has users or campaigns.</p>
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2'><Button variant='secondary' onClick={onClose}>Cancel</Button><Button variant='danger' loading={m.isPending} onClick={() => m.mutate()}>Delete</Button></div>
      </div>
    </Modal>
  );
}

function CreateOrgModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const m = useMutation({ mutationFn: createOrganization, onSuccess: () => { setName(''); setDescription(''); setError(''); onCreated(); }, onError: (e: any) => setError(e?.response?.data?.error || 'Failed to create') });
  return (
    <Modal title='New organization' open={open} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ name, description: description || undefined }); }} className='space-y-4'>
        <Input label='Name' value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Textarea label='Description (optional)' value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        {error && <p className='text-xs text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2 pt-2'><Button type='button' variant='secondary' onClick={onClose}>Cancel</Button><Button type='submit' loading={m.isPending}>Create</Button></div>
      </form>
    </Modal>
  );
}
