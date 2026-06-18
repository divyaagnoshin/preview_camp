import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRouter from './routes/auth';
import organizationsRouter from './routes/organizations';
import contactListsRouter from './routes/contactLists';
import contactsRouter from './routes/contacts';
import cloudImportRouter from './routes/cloudImport';
import cloudImportConfigsRouter from './routes/cloudImportConfigs';
import fieldLibraryRouter from './routes/fieldLibrary';
import campaignsRouter from './routes/campaigns';
import holidayCalendarsRouter from './routes/holidayCalendars';

import systemConfigRouter from './routes/systemConfig';
// Agent workspace + session-mutation routes moved to backend-queue service.
import {
  dncRouter,
  dncListsRouter,
  dncNumbersRouter,
  scheduleRouter,
  jobsRouter,
  dispositionRouter,
  dispositionGroupsRouter,
  reportsRouter,
  agentsRouter,
  sessionsRouter,
  timezonesRouter,
} from './routes/other';
import { errorHandler } from './middleware/errorHandler';
// import { startScheduler } from './services/scheduler';
//import { startEslListener } from './services/eslListener';
import { seedTimezones } from './db/seedTimezones';
import { seedSuperadmin } from './db/seedSuperadmin';
import { seedFieldLibrary } from './db/seedFieldLibrary';
import { seedSystemDispositions } from './db/seedSystemDispositions';

import usersRouter from './routes/users';

import supervisorTeamsRouter from './routes/supervisorTeamsAndCampaigns';
import campaignMappingRouter from './routes/Campaignmappingroute';
import analyticsRouter from './routes/analytics';
import recordingsRouter from './routes/recordings';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = parseInt(process.env.PORT || '3001');

export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, true), // Allow all origins dynamically
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('agent_logout', (data) => {
    console.log(`[Socket] Agent Logged Out:`, data);
    // Forward this to the React Admin Dashboard
    io.emit('agent_logged_out_alert', data);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Webhooks from C# ──────────────────────────────────────
app.post('/api/notify-mapping', (req, res) => {
  const { agent_userid, added, removed, added_ids, removed_ids } = req.body;
  if (agent_userid) {
    io.emit('campaign_update', {
      event: 'mapped',
      agent_userid: agent_userid,
      added: added || [],
      removed: removed || [],
      added_ids: added_ids || [],
      removed_ids: removed_ids || []
    });
  }
  res.json({ success: true });
});

// ── Routes ────────────────────────────────────────────────
app.use('/v1/auth', authRouter);
app.use('/v1/organizations', organizationsRouter);
app.use('/v1/contact-lists', contactListsRouter);
app.use('/v1/cloud-imports', cloudImportRouter);
app.use('/v1/cloud-import-configs', cloudImportConfigsRouter);
app.use('/v1/contacts', contactsRouter);
app.use('/v1/field-library', fieldLibraryRouter);
app.use('/v1/campaigns', campaignsRouter);
app.use('/v1/holiday-calendars', holidayCalendarsRouter);
app.use('/v1/dnc-groups', dncRouter);
app.use('/v1/dnc-lists', dncListsRouter);
app.use('/v1/dnc-numbers', dncNumbersRouter);
app.use('/v1/schedule-templates', scheduleRouter);
app.use('/v1/jobs', jobsRouter);
app.use('/v1/disposition-codes', dispositionRouter);
app.use('/v1/disposition-groups', dispositionGroupsRouter);
app.use('/v1/reports', reportsRouter);
app.use('/v1/agents', agentsRouter);
app.use('/v1/sessions', sessionsRouter);
app.use('/v1/timezones', timezonesRouter);

app.use('/v1/system-config', systemConfigRouter);

app.use('/v1/users', usersRouter);

app.use('/v1/supervisor-teams', supervisorTeamsRouter);

app.use('/v1/campaign-mapping', campaignMappingRouter);
app.use('/v1/analytics', analyticsRouter);
app.use('/v1/recordings', recordingsRouter);
// /v1/workspace/* and the mutating /v1/sessions/{ready,heartbeat,offline}
// endpoints are served by the backend-queue service (see ../backend-queue).

// ── Health ────────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() }),
);

// ── Error handler (must be last) ──────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  // startScheduler();
  // startEslListener();
  // Fire-and-forget; the seed is idempotent and safe to run on every boot.
  seedTimezones();
  seedSuperadmin();
  seedFieldLibrary();
  seedSystemDispositions();
});

export default app;