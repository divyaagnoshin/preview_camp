import axios from 'axios';

export const api = axios.create({
  baseURL: '/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

// ── Campaigns ─────────────────────────────────────────────
export const getCampaigns = (params?: any) =>
  api.get('/campaigns', { params }).then((r) => r.data);
export const getCampaign = (id: string) =>
  api.get(`/campaigns/${id}`).then((r) => r.data);
export const createCampaign = (data: any) =>
  api.post('/campaigns', data).then((r) => r.data);
export const updateCampaign = (id: string, data: any) =>
  api.patch(`/campaigns/${id}`, data).then((r) => r.data);
export const deleteCampaign = (id: string) =>
  api.delete(`/campaigns/${id}`).then((r) => r.data);
export const runCampaign = (id: string) =>
  api.post(`/campaigns/${id}/run`).then((r) => r.data);
export const stopCampaign = (id: string) =>
  api.post(`/campaigns/${id}/stop`).then((r) => r.data);

// ── Jobs ──────────────────────────────────────────────────
export const getJobs = (params?: any) =>
  api.get('/jobs', { params }).then((r) => r.data);
export const getJob = (id: string) =>
  api.get(`/jobs/${id}`).then((r) => r.data);
export const getJobStats = (id: string) =>
  api.get(`/jobs/${id}/stats`).then((r) => r.data);
export const getJobContacts = (id: string, params?: any) =>
  api.get(`/jobs/${id}/contacts`, { params }).then((r) => r.data);
export const updateCCS = (jobId: string, ccsId: string, data: any) =>
  api.patch(`/jobs/${jobId}/contacts/${ccsId}`, data).then((r) => r.data);

// ── Contact Lists ─────────────────────────────────────────
export const getContactLists = () =>
  api.get('/contact-lists').then((r) => r.data);
export const getContactList = (id: string) =>
  api.get(`/contact-lists/${id}`).then((r) => r.data);
export const createContactList = (data: any) =>
  api.post('/contact-lists', data).then((r) => r.data);
export const updateContactList = (id: string, data: any) =>
  api.patch(`/contact-lists/${id}`, data).then((r) => r.data);
export const deleteContactList = (id: string) =>
  api.delete(`/contact-lists/${id}`).then((r) => r.data);
export const getContactListAttributes = (id: string) =>
  api.get(`/contact-lists/${id}/attributes`).then((r) => r.data);
export const updateContactListAttributes = (id: string, ids: string[]) =>
  api.put(`/contact-lists/${id}/attributes`, { ids }).then((r) => r.data);
export const createContactListCustomFields = (id: string, fields: any[]) =>
  api
    .post(`/contact-lists/${id}/custom-fields`, { fields })
    .then((r) => r.data);
export const updateContactListCustomField = (
  id: string,
  fid: string,
  patch: any,
) =>
  api
    .patch(`/contact-lists/${id}/custom-fields/${fid}`, patch)
    .then((r) => r.data);
export const deleteContactListCustomField = (id: string, fid: string) =>
  api.delete(`/contact-lists/${id}/custom-fields/${fid}`).then((r) => r.data);
export const downloadContactListCsvTemplate = (id: string, name: string) =>
  api
    .get(`/contact-lists/${id}/csv-template`, { responseType: 'blob' })
    .then((r) => {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9_-]+/gi, '_')}_template.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

// ── Contacts ──────────────────────────────────────────────
export const addContact = (data: any) =>
  api.post('/contacts', data).then((r) => r.data);
export const cloudImportContacts = (
  contactListId: string,
  body:
    | {
        provider: 's3' | 'ftp' | 'gcs';
        credentials: Record<string, any>;
        options: Record<string, any>;
      }
    | { config_id: string },
) =>
  api
    .post(`/contact-lists/${contactListId}/cloud-import`, body)
    .then((r) => r.data);

// ── Cloud Import Configs (saved S3/FTP/GCS profiles) ──────
export type CloudProvider = 's3' | 'ftp' | 'gcs';
export interface CloudImportConfig {
  id: string;
  name: string;
  provider: CloudProvider;
  credentials: Record<string, any>;
  options: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  schedule_enabled?: boolean;
  cron_expression?: string | null;
  timezone?: string | null;
  contact_list_id?: string | null;
  next_refresh?: string | null;
  last_refresh?: string | null;
  last_run_status?: string | null;
  last_run_error?: string | null;
}
export const listCloudImportConfigs = (): Promise<{
  data: CloudImportConfig[];
}> => api.get('/cloud-import-configs').then((r) => r.data);
export const createCloudImportConfig = (body: {
  name: string;
  provider: CloudProvider;
  credentials: Record<string, any>;
  options: Record<string, any>;
}) => api.post('/cloud-import-configs', body).then((r) => r.data);
export const updateCloudImportConfig = (
  id: string,
  body: {
    name: string;
    provider: CloudProvider;
    credentials: Record<string, any>;
    options: Record<string, any>;
  },
) => api.put(`/cloud-import-configs/${id}`, body).then((r) => r.data);
export const deleteCloudImportConfig = (id: string) =>
  api.delete(`/cloud-import-configs/${id}`).then((r) => r.data);
export const updateCloudImportConfigSchedule = (
  id: string,
  body: {
    enabled: boolean;
    cron_expression?: string;
    timezone?: string;
    contact_list_id?: string;
  },
): Promise<CloudImportConfig> =>
  api.put(`/cloud-import-configs/${id}/schedule`, body).then((r) => r.data);
export const uploadCSV = (formData: FormData) =>
  api
    .post('/contacts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);

// ── Field Library ─────────────────────────────────────────
export const getFieldLibrary = () =>
  api.get('/field-library').then((r) => r.data);
export const createFieldLibrary = (data: any) =>
  api.post('/field-library', data).then((r) => r.data);
export const updateFieldLibrary = (id: string, data: any) =>
  api.patch(`/field-library/${id}`, data).then((r) => r.data);
export const deleteFieldLibrary = (id: string) =>
  api.delete(`/field-library/${id}`).then((r) => r.data);

// ── DNC ───────────────────────────────────────────────────
export const getDncGroups = () => api.get('/dnc-groups').then((r) => r.data);

// ── Holiday Calendars ─────────────────────────────────────
export interface HolidayCalendar {
  id: string;
  name: string;
  country_code: string | null;
  created_at: string;
  holiday_count?: number;
  campaign_usage_count?: number;
}
export interface HolidayDate {
  id: string;
  calendar_id: string;
  holiday_date: string;
  holiday_name: string | null;
  is_full_day_block: boolean;
  block_start: string | null;
  block_end: string | null;
}
export const listHolidayCalendars = (): Promise<{ data: HolidayCalendar[] }> =>
  api.get('/holiday-calendars').then((r) => r.data);
export const getHolidayCalendar = (id: string): Promise<HolidayCalendar> =>
  api.get(`/holiday-calendars/${id}`).then((r) => r.data);
export const createHolidayCalendar = (body: {
  name: string;
  country_code?: string | null;
}): Promise<HolidayCalendar> =>
  api.post('/holiday-calendars', body).then((r) => r.data);
export const updateHolidayCalendar = (
  id: string,
  body: { name?: string; country_code?: string | null },
): Promise<HolidayCalendar> =>
  api.patch(`/holiday-calendars/${id}`, body).then((r) => r.data);
export const deleteHolidayCalendar = (id: string): Promise<void> =>
  api.delete(`/holiday-calendars/${id}`).then((r) => r.data);
export const listHolidayDates = (
  id: string,
  year?: number,
): Promise<{ data: HolidayDate[] }> =>
  api
    .get(`/holiday-calendars/${id}/dates`, { params: year ? { year } : {} })
    .then((r) => r.data);
export const createHolidayDate = (
  id: string,
  body: {
    holiday_date: string;
    holiday_name?: string;
    is_full_day_block: boolean;
    block_start?: string;
    block_end?: string;
  },
): Promise<HolidayDate> =>
  api.post(`/holiday-calendars/${id}/dates`, body).then((r) => r.data);
export const updateHolidayDate = (
  id: string,
  dateId: string,
  body: Partial<{
    holiday_date: string;
    holiday_name: string;
    is_full_day_block: boolean;
    block_start: string;
    block_end: string;
  }>,
): Promise<HolidayDate> =>
  api
    .patch(`/holiday-calendars/${id}/dates/${dateId}`, body)
    .then((r) => r.data);
export const deleteHolidayDate = (id: string, dateId: string): Promise<void> =>
  api.delete(`/holiday-calendars/${id}/dates/${dateId}`).then((r) => r.data);

// ── Schedule Templates ────────────────────────────────────
export interface ScheduleWindow {
  id: string;
  schedule_template_id: string;
  day_of_week: number; // 0=Sun … 6=Sat
  start_time: string; // "HH:MM:SS"
  end_time: string;
}
export interface ScheduleTemplate {
  id: string;
  org_id: string;
  name: string;
  timezone: string;
  created_by: string | null;
  created_at: string;
  windows?: ScheduleWindow[];
  campaigns_using?: number;
}
export const listScheduleTemplates = (): Promise<{
  data: ScheduleTemplate[];
}> => api.get('/schedule-templates').then((r) => r.data);
export const getScheduleTemplate = (id: string): Promise<ScheduleTemplate> =>
  api.get(`/schedule-templates/${id}`).then((r) => r.data);
export const createScheduleTemplate = (body: {
  name: string;
  timezone?: string;
}): Promise<ScheduleTemplate> =>
  api.post('/schedule-templates', body).then((r) => r.data);
export const updateScheduleTemplate = (
  id: string,
  body: { name?: string; timezone?: string },
): Promise<ScheduleTemplate> =>
  api.patch(`/schedule-templates/${id}`, body).then((r) => r.data);
export const deleteScheduleTemplate = (id: string): Promise<void> =>
  api.delete(`/schedule-templates/${id}`).then((r) => r.data);
export const createScheduleWindow = (
  id: string,
  body: { day_of_week: number; start_time: string; end_time: string },
): Promise<ScheduleWindow> =>
  api.post(`/schedule-templates/${id}/windows`, body).then((r) => r.data);
export const updateScheduleWindow = (
  id: string,
  winId: string,
  body: Partial<{ day_of_week: number; start_time: string; end_time: string }>,
): Promise<ScheduleWindow> =>
  api
    .patch(`/schedule-templates/${id}/windows/${winId}`, body)
    .then((r) => r.data);
export const deleteScheduleWindow = (
  id: string,
  winId: string,
): Promise<void> =>
  api.delete(`/schedule-templates/${id}/windows/${winId}`).then((r) => r.data);

// ── Timezones (catalog used by schedule template picker) ─
export const listTimezones = (): Promise<{ data: string[] }> =>
  api.get('/timezones').then((r) => r.data);

// ── Disposition codes ─────────────────────────────────────
export const getDispositionCodes = (params?: any) =>
  api.get('/disposition-codes', { params }).then((r) => r.data);

// ── Agent workspace ───────────────────────────────────────
export const goReady = (jobIds: string[]) =>
  api
    .patch('/sessions/ready', { selected_job_ids: jobIds })
    .then((r) => r.data);
export const getNextContact = () =>
  api
    .get('/workspace/next-contact')
    .then((r) => r.data)
    .catch((e) => {
      if (e.response?.status === 204) return null;
      throw e;
    });
export const rejectContact = (interactionId: string, reason: string) =>
  api
    .post('/workspace/reject', {
      interaction_id: interactionId,
      rejection_reason: reason,
    })
    .then((r) => r.data);
export const saveDisposition = (data: any) =>
  api.post('/workspace/disposition', data).then((r) => r.data);
export const sendHeartbeat = () =>
  api.post('/sessions/heartbeat', {}).then((r) => r.data);
export const goOffline = () =>
  api.patch('/sessions/offline', {}).then((r) => r.data);

// ── Reports ───────────────────────────────────────────────
export const getCampaignReport = (id: string, params?: any) =>
  api.get(`/reports/campaign/${id}`, { params }).then((r) => r.data);
export const getAgentReport = (id: string, params?: any) =>
  api.get(`/reports/agent/${id}`, { params }).then((r) => r.data);
export const getInteractions = (params?: any) =>
  api.get('/reports/interactions', { params }).then((r) => r.data);
