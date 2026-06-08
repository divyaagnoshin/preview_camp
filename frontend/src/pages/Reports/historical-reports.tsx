import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupersetDashboards, getSupersetGuestToken } from '../../api/client';
import { embedDashboard } from '@superset-ui/embedded-sdk';
import { FileText, ArrowLeft, Loader2, X } from 'lucide-react';

const SUPERSET_SDK_DOMAIN = import.meta.env.VITE_SUPERSET_SDK_DOMAIN || 'http://192.168.9.116:8088';

export default function HistoricalReports() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['superset-dashboards'],
    queryFn: getSupersetDashboards,
  });

  const dashboards = dashboardData?.dashboards || [];
  const [selectedDashboard, setSelectedDashboard] = useState<any | null>(null);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const dashboardContainerRef = useRef<HTMLDivElement>(null);

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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Loader2 className="animate-spin" size={32} color="#6366f1" />
      </div>
    );
  }

  if (selectedDashboard) {
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
            <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '12px' }}>Available Dashboards</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {dashboards.map((db: any) => {
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

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {dashboards.map((db: any) => (
          <div key={db.dashboard_id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: '#eef2ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={20} color="#6366f1" />
              </div>
              <span style={{ background: db.isAvailable ? '#dcfce7' : '#fef3c7', color: db.isAvailable ? '#166534' : '#92400e', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '8px' }}>
                {db.isAvailable ? 'ACTIVE' : 'DRAFT'}
              </span>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={db.dashboard_name}>
              {db.dashboard_name}
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>Dashboard ID: {db.dashboard_id}</span>
              <span>Type: Historical Report</span>
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
        ))}
        {dashboards.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
            <p style={{ color: '#64748b', margin: 0, fontWeight: 500 }}>No historical reports available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
