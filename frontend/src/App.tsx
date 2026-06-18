import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import CampaignsPage from './pages/Campaigns';
import CampaignDetailPage from './pages/CampaignDetail';
import { JobsPage, JobDetailPage } from './pages/Jobs';
import ContactListsPage from './pages/ContactLists';
import ContactListDetailPage from './pages/Contactlistdetailpage';
import ContactListAttributesPage from './pages/ContactListAttributes';
import ContactListAttributesNewPage from './pages/ContactListAttributesNew';
import {
  HolidayCalendarsPage,
  HolidayCalendarDetailPage,
} from './pages/HolidayCalendars';
import {
  ScheduleTemplatesPage,
  ScheduleTemplateDetailPage,
} from './pages/ScheduleTemplates';
import DNCPage from './pages/DNC';
import DispositionsPage from './pages/Dispositions';
import AgentsPage from './pages/Agents';
import UsersPage from './pages/Users';
import CampaignMappingPage from './pages/CampaignMapping';
import SupervisorTeamsPage from './pages/SupervisorTeams';
import ReportsPage from './pages/Reports';
import ReportSettingsPage from './pages/Reports/report-settings';
import SystemConfigurationPage from './pages/SystemConfiguration';
import OrganizationsPage from './pages/Organizations';
import OrganizationDetailPage from './pages/OrganizationDetail';
import TaskScheduler from './pages/TaskScheduler';
import RecordingsPage from './pages/Recordings';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function PrivateRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to='/login' replace />;
  if (roles && user && !roles.includes(user.role)) {
    const fallback =
      user.role === 'superadmin' ? '/organizations'
        : '/dashboard';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path='/login' element={<LoginPage />} />
      <Route
        path='/'
        element={
          <PrivateRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/dashboard'
        element={
          <PrivateRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/campaigns'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <CampaignsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/campaigns/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <CampaignDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/jobs'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <JobsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/jobs/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <JobDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ContactListsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/task-scheduler'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <TaskScheduler />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ContactListDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists/:id/attributes'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ContactListAttributesPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists/:id/attributes/new'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ContactListAttributesNewPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/holiday-calendars'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <HolidayCalendarsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/holiday-calendars/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <HolidayCalendarDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/schedule-templates'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ScheduleTemplatesPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/schedule-templates/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ScheduleTemplateDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/dnc'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <DNCPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/dispositions'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <DispositionsPage />
            </Layout>
          </PrivateRoute>
        }
      />

      {/* ── Existing agents page (Admin child) ── */}
      <Route
        path='/agents'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <AgentsPage />
            </Layout>
          </PrivateRoute>
        }
      />

      {/* ── New Users sub-pages (under the Users accordion) ── */}
      <Route
        path='/users'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <UsersPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/campaign-mapping'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <CampaignMappingPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/supervisor-teams'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <SupervisorTeamsPage />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path='/reports'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/active-campaigns'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/staffed-agents'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/disposition-report'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/interaction-report'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/agent-login-report'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/historical-reports'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports/settings'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <ReportSettingsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/system-configuration'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <SystemConfigurationPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/organizations'
        element={
          <PrivateRoute roles={['superadmin']}>
            <Layout>
              <OrganizationsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/organizations/:id'
        element={
          <PrivateRoute roles={['superadmin']}>
            <Layout>
              <OrganizationDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/recordings'
        element={
          <PrivateRoute roles={['admin', 'supervisor', 'superadmin']}>
            <Layout>
              <RecordingsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route path='*' element={<Navigate to='/dashboard' replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}