import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupersetDashboards, getSupersetGuestToken, getDashboardFolders, createDashboardFolder, deleteDashboardFolder, assignDashboardFolder } from '../../api/client';
import { embedDashboard } from '@superset-ui/embedded-sdk';
import { FileText, ArrowLeft, Loader2, X, Folder, ChevronDown, ChevronRight, FolderPlus, Trash2, Settings, Search, GripVertical } from 'lucide-react';
import { DndContext, DragEndEvent, DragStartEvent, useDraggable, useDroppable, DragOverlay } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const SUPERSET_SDK_DOMAIN = import.meta.env.VITE_SUPERSET_SDK_DOMAIN || 'http://192.168.9.116:8088';

export default function HistoricalReports() {
  const { data: dashboardData, isLoading: dashboardsLoading } = useQuery({
    queryKey: ['superset-dashboards'],
    queryFn: getSupersetDashboards,
  });

  const queryClient = useQueryClient();
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ['dashboard-folders'],
    queryFn: getDashboardFolders,
  });

  const dashboards = dashboardData?.dashboards || [];
  const folders = foldersData?.folders || [];
  const assignments = foldersData?.assignments || {};

  const [selectedDashboard, setSelectedDashboard] = useState<any | null>(null);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const dashboardContainerRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const createFolderMutation = useMutation({
    mutationFn: createDashboardFolder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-folders'] })
  });

  const deleteFolderMutation = useMutation({
    mutationFn: deleteDashboardFolder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-folders'] })
  });

  const assignFolderMutation = useMutation({
    mutationFn: ({ dbId, fId }: { dbId: string, fId: string }) => assignDashboardFolder(dbId, fId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-folders'] })
  });

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate(newFolderName.trim());
    setNewFolderName('');
    setShowAddFolder(false);
  };

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFolderMutation.mutate(id);
  };

  const handleAssign = (dashboardId: string, folderId: string) => {
    assignFolderMutation.mutate({ dbId: dashboardId, fId: folderId });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id) {
      handleAssign(active.id as string, over.id as string);
    }
    setActiveDragId(null);
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
  };

  const embedSupersetDashboard = async (dashboard: any, container: HTMLElement) => {
    try {
      container.innerHTML = '';
      const { guestToken, uuid } = await getSupersetGuestToken(dashboard.dashboard_id, []);
      
      await embedDashboard({
        id: uuid,
        supersetDomain: SUPERSET_SDK_DOMAIN,
        mountPoint: container,
        fetchGuestToken: () => Promise.resolve(guestToken),
        dashboardUiConfig: {
          hideTitle: false,
          hideChartControls: false,
          hideTab: false,
          filters: { visible: true, expanded: false },
        },
      });

      setTimeout(() => {
        const iframe = container.querySelector('iframe');
        if (iframe) {
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.minHeight = '75vh';
          iframe.style.border = 'none';
          iframe.style.borderRadius = '12px';
        }
      }, 1000);
    } catch (error) {
      console.error('Dashboard embedding failed:', error);
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:300px;background:#f8f9fa;border-radius:12px;border:2px dashed #dee2e6;">
          <div style="text-align:center;color:#6c757d;">
            <div style="font-size:24px;margin-bottom:8px;">⚠️</div>
            <div style="font-weight:600;">Failed to load dashboard</div>
          </div>
        </div>
      `;
    } finally {
      setEmbeddingLoading(false);
    }
  };

  const handleViewDashboard = (dashboard: any) => {
    setSelectedDashboard(dashboard);
    setEmbeddingLoading(true);

    setTimeout(async () => {
      if (dashboardContainerRef.current) {
        await embedSupersetDashboard(dashboard, dashboardContainerRef.current);
      }
    }, 500);
  };

  if (dashboardsLoading || foldersLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Loader2 className="animate-spin" size={32} color="#6366f1" />
      </div>
    );
  }

  if (selectedDashboard) {
    const activeFolderId = assignments[selectedDashboard.dashboard_id] || 'uncategorized';
    const sidebarDashboards = dashboards.filter((db: any) => {
      const fId = assignments[db.dashboard_id] || 'uncategorized';
      return fId === activeFolderId;
    });

    const activeFolderName = activeFolderId === 'uncategorized' 
      ? 'Uncategorized' 
      : folders.find(f => f.id === activeFolderId)?.name || 'Unknown Folder';

    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 150px)', background: '#fff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        {/* Sidebar */}
        <div style={{ width: '280px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelectedDashboard(null)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={() => setSelectedDashboard(null)}
              style={{ width: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
            <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Folder size={12} /> {activeFolderName}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sidebarDashboards.map((db: any) => {
                const isViewing = db.dashboard_id === selectedDashboard.dashboard_id;
                return (
                  <div
                    key={db.dashboard_id}
                    onClick={() => handleViewDashboard(db)}
                    style={{
                      padding: '12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
                      background: isViewing ? '#eef2ff' : '#fff',
                      borderColor: isViewing ? '#6366f1' : '#e2e8f0',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <FileText size={16} color={isViewing ? '#6366f1' : '#94a3b8'} style={{ marginTop: '2px' }} />
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: isViewing ? '#4f46e5' : '#334155' }}>{db.dashboard_name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>ID: {db.dashboard_id}</p>
                        {isViewing && (
                          <span style={{ display: 'inline-block', marginTop: '6px', background: '#6366f1', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>VIEWING</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{selectedDashboard.dashboard_name}</h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Dashboard ID: {selectedDashboard.dashboard_id} • Historical Report</p>
            </div>
            <span style={{ background: selectedDashboard.isAvailable ? '#dcfce7' : '#fef3c7', color: selectedDashboard.isAvailable ? '#166534' : '#92400e', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px' }}>
              {selectedDashboard.isAvailable ? 'AVAILABLE' : 'DRAFT'}
            </span>
          </div>
          
          <div style={{ flex: 1, position: 'relative', background: '#f8fafc', padding: '16px', overflow: 'auto' }}>
            {embeddingLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', zIndex: 10 }}>
                <Loader2 className="animate-spin" size={32} color="#6366f1" />
                <p style={{ marginTop: '12px', fontSize: '13px', fontWeight: 500, color: '#475569' }}>Loading dashboard...</p>
              </div>
            )}
            <div ref={dashboardContainerRef} style={{ width: '100%', height: '100%', minHeight: '75vh', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
          </div>
        </div>
      </div>
    );
  }

  const groupedDashboards: Record<string, any[]> = {};
  folders.forEach(f => {
    groupedDashboards[f.id] = [];
  });
  groupedDashboards['uncategorized'] = [];

  const filteredDashboards = dashboards.filter((db: any) => 
    db.dashboard_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    db.dashboard_id?.toString().includes(searchQuery)
  );

  filteredDashboards.forEach((db: any) => {
    const fId = assignments[db.dashboard_id];
    if (fId && groupedDashboards[fId]) {
      groupedDashboards[fId].push(db);
    } else {
      groupedDashboards['uncategorized'].push(db);
    }
  });

  const displayFolders = [
    ...folders.map(f => ({ ...f, dashboards: groupedDashboards[f.id] })),
    { id: 'uncategorized', name: 'Uncategorized', dashboards: groupedDashboards['uncategorized'] }
  ].filter(f => f.dashboards.length > 0 || f.id !== 'uncategorized');

  const activeDashboard = activeDragId ? dashboards.find((d: any) => d.dashboard_id === activeDragId) : null;

  return (
    <DndContext 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd} 
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-800 m-0">Historical Reports</h2>
          <p className="text-xs text-gray-500 m-0 mt-0.5">Organize and view your historical dashboards</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search dashboards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-64 transition-all"
            />
          </div>
          <button
            onClick={() => setShowAddFolder(!showAddFolder)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          >
            <FolderPlus className="w-4 h-4" />
            New Folder
          </button>
        </div>
      </div>

      {showAddFolder && (
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm flex gap-3 items-center">
          <Folder className="w-5 h-5 text-indigo-400" />
          <input
            autoFocus
            type="text"
            placeholder="Folder Name (e.g. Sales Reports)"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={handleCreateFolder}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Create
          </button>
          <button
            onClick={() => { setShowAddFolder(false); setNewFolderName(''); }}
            className="px-3 py-2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {displayFolders.map((folder) => {
        const isCollapsed = collapsedFolders[folder.id] !== false;
        return (
          <DroppableFolder 
            key={folder.id} 
            folder={folder} 
            isCollapsed={isCollapsed} 
            toggleCollapse={() => setCollapsedFolders(prev => ({ ...prev, [folder.id]: prev[folder.id] !== false ? false : true }))}
            handleDelete={handleDeleteFolder}
          >
            <div className="p-6">
              {folder.dashboards.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">No dashboards in this folder.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {folder.dashboards.map((db: any) => (
                    <DraggableDashboard 
                      key={db.dashboard_id} 
                      db={db} 
                      assignments={assignments} 
                      folders={folders} 
                      handleAssign={handleAssign} 
                      handleViewDashboard={handleViewDashboard} 
                    />
                  ))}
                </div>
              )}
            </div>
          </DroppableFolder>
        );
      })}
      
      {dashboards.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          <p style={{ color: '#64748b', margin: 0, fontWeight: 500 }}>No historical reports available.</p>
        </div>
      )}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeDashboard ? (
          <DraggableDashboard 
            db={activeDashboard} 
            assignments={assignments} 
            folders={folders} 
            handleAssign={handleAssign} 
            handleViewDashboard={handleViewDashboard} 
            isOverlay={true}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DroppableFolder({ folder, isCollapsed, toggleCollapse, handleDelete, children }: any) {
  const { isOver, setNodeRef } = useDroppable({ id: folder.id });
  return (
    <div ref={setNodeRef} className={`bg-white border transition-all rounded-xl shadow-sm overflow-hidden ${isOver ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200'}`}>
      <div 
        className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition"
        onClick={toggleCollapse}
      >
        <div className="flex items-center gap-3">
          <Folder className={`w-5 h-5 ${folder.id === 'uncategorized' ? 'text-gray-400' : 'text-indigo-500'}`} />
          <h2 className="text-lg font-bold text-gray-800 m-0">{folder.name}</h2>
          <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2.5 py-0.5 rounded-full">
            {folder.dashboards.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {folder.id !== 'uncategorized' && (
            <button
              onClick={(e) => handleDelete(folder.id, e)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              title="Delete folder"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button className="text-gray-400 hover:text-gray-600 transition">
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>
      {!isCollapsed && children}
    </div>
  );
}

function DraggableDashboard({ db, assignments, folders, handleAssign, handleViewDashboard, isOverlay }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: db.dashboard_id,
    data: db,
  });

  // If this is the original card being dragged (not the overlay), render a transparent placeholder
  if (isDragging && !isOverlay) {
    return (
      <div ref={setNodeRef} style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '20px', minHeight: '200px', opacity: 0.5 }}>
      </div>
    );
  }

  const style = transform && !isOverlay ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  const overlayStyle = isOverlay ? {
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    cursor: 'grabbing',
    transform: 'scale(1.05)',
  } : {};

  return (
    <div ref={isOverlay ? undefined : setNodeRef} style={{ ...style, ...overlayStyle, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div {...listeners} {...attributes} style={{ cursor: isOverlay ? 'grabbing' : 'grab', padding: '4px', margin: '-4px' }} title="Drag to move">
            <GripVertical size={18} className="text-gray-400 hover:text-indigo-500" />
          </div>
          <div style={{ width: '40px', height: '40px', background: '#eef2ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} color="#6366f1" />
          </div>
        </div>
        <span style={{ background: db.isAvailable ? '#dcfce7' : '#fef3c7', color: db.isAvailable ? '#166534' : '#92400e', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '8px' }}>
          {db.isAvailable ? 'ACTIVE' : 'DRAFT'}
        </span>
      </div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={db.dashboard_name}>
        {db.dashboard_name}
      </h3>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>Dashboard ID: {db.dashboard_id}</span>
        <span>Type: Historical Report</span>
      </div>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Folder size={14} color="#94a3b8" />
        <select
          value={assignments[db.dashboard_id] || 'uncategorized'}
          onChange={(e) => handleAssign(db.dashboard_id, e.target.value)}
          style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#475569', cursor: 'pointer', outline: 'none' }}
        >
          <option value="uncategorized">Uncategorized</option>
          {folders.map((f: any) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => handleViewDashboard(db)}
        style={{ marginTop: 'auto', background: '#1e293b', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#0f172a')}
        onMouseLeave={e => (e.currentTarget.style.background = '#1e293b')}
      >
        View Dashboard
      </button>
    </div>
  );
}
