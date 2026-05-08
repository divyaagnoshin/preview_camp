import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import WorkspacePage from './pages/Workspace';
import CampaignsPage from './pages/Campaigns';
import CampaignDetailPage from './pages/CampaignDetail';
import { JobsPage, JobDetailPage } from './pages/Jobs';
import { ContactListsPage, ContactListDetailPage } from './pages/ContactLists';
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
import AgentsPage from './pages/Agents';
import ReportsPage from './pages/Reports';

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
  if (roles && user && !roles.includes(user.role))
    return <Navigate to='/workspace' replace />;
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
        path='/workspace'
        element={
          <PrivateRoute>
            <Layout>
              <WorkspacePage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/campaigns'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <CampaignsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/campaigns/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <CampaignDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/jobs'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <JobsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/jobs/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <JobDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ContactListsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ContactListDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists/:id/attributes'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ContactListAttributesPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/contact-lists/:id/attributes/new'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ContactListAttributesNewPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/holiday-calendars'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <HolidayCalendarsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/holiday-calendars/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <HolidayCalendarDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/schedule-templates'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ScheduleTemplatesPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/schedule-templates/:id'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ScheduleTemplateDetailPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/dnc'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <DNCPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/agents'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <AgentsPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path='/reports'
        element={
          <PrivateRoute roles={['admin', 'supervisor']}>
            <Layout>
              <ReportsPage />
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
