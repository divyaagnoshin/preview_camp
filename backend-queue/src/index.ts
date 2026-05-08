import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import workspaceRouter from './routes/workspace';
import { errorHandler } from './middleware/errorHandler';
import { startRecoveryLoop } from './services/recovery';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3002');

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes — agent workspace + session-mutation only ──────
// Mounted at /v1 to preserve URL paths used by clients of the monolith.
// Endpoints exposed by this service:
//   PATCH /v1/sessions/ready
//   POST  /v1/sessions/heartbeat
//   PATCH /v1/sessions/offline
//   GET   /v1/workspace/next-contact
//   POST  /v1/workspace/reject
//   POST  /v1/workspace/disposition
app.use('/v1', workspaceRouter);

// ── Health ────────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok', service: 'backend-queue', ts: new Date().toISOString() }),
);

// ── Error handler (must be last) ──────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`backend-queue running on http://localhost:${PORT}`);
  startRecoveryLoop();
});

export default app;
