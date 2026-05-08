# Preview Campaign System

Full-stack outbound preview campaign calling system.  
**Stack:** Node.js + Express + PostgreSQL + Vite + React + TypeScript

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally

### 1. Clone & install
```bash
npm install
```

### 2. Database setup
```bash
# Create the database
createdb preview_campaign

# Copy and edit env
cp backend/.env.example backend/.env
# Edit DB_PASSWORD and JWT_SECRET in backend/.env

# Run migrations (creates all tables)
npm run db:migrate

# Seed sample data
npm run db:seed
```

### 3. Run (both backend + frontend)
```bash
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173

---

## Demo credentials (after seed)
| Role       | Email                     | Password    |
|------------|---------------------------|-------------|
| Admin      | admin@acme.com            | Password1!  |
| Agent      | raj.patel@acme.com        | Password1!  |
| Agent      | carla.mendes@acme.com     | Password1!  |

---

## Project structure

```
preview-campaign/
├── backend/
│   ├── migrations/
│   │   └── 001_schema.sql        ← All v19 tables
│   └── src/
│       ├── index.ts              ← Express app entry
│       ├── db/
│       │   ├── pool.ts           ← Postgres connection + withTransaction
│       │   ├── migrate.ts        ← Migration runner
│       │   └── seed.ts           ← Sample data
│       ├── middleware/
│       │   ├── auth.ts           ← JWT verify + requireRole
│       │   └── errorHandler.ts   ← Global error handler
│       ├── routes/
│       │   ├── auth.ts           ← POST /auth/login, GET /auth/me
│       │   ├── contactLists.ts   ← M1: contact lists + field definitions
│       │   ├── contacts.ts       ← M1: single, batch, CSV upload
│       │   ├── campaigns.ts      ← M2: create, run, stop campaigns
│       │   ├── workspace.ts      ← M6: ready, next-contact, reject, disposition, heartbeat
│       │   └── other.ts          ← M3 DNC, M4 Schedule, M5 Jobs, M7 Dispositions, M8 Reports
│       └── services/
│           └── scheduler.ts      ← Heartbeat stale check + crash recovery
└── frontend/
    └── src/
        ├── api/client.ts         ← All API calls
        ├── hooks/useAuth.tsx     ← Auth context
        ├── pages/
        │   ├── Login.tsx         ← Login page
        │   └── Workspace.tsx     ← Agent workspace (core UI)
        └── App.tsx               ← Router + providers
```

---

## API base URL
All endpoints: `http://localhost:3001/v1/`

Key endpoints:
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | Get JWT token |
| GET | /campaigns | List campaigns |
| POST | /campaigns | Create campaign |
| POST | /campaigns/:id/run | Activate — auto-creates job |
| POST | /campaigns/:id/stop | Stop campaign |
| GET | /jobs | List jobs |
| GET | /jobs/:id/stats | Live job stats |
| PATCH | /sessions/ready | Agent goes ready |
| GET | /workspace/next-contact | Fetch next contact (atomic) |
| POST | /workspace/reject | Reject contact |
| POST | /workspace/disposition | Save disposition |
| POST | /sessions/heartbeat | Keep session alive |

---

## Design version
Based on v19 schema — see `preview_campaign_v19_final.xlsx` for complete data model.

Key design decisions reflected in code:
- `campaign_contact_status` (CCS) is the queue — no separate queue table
- `contact_interactions` = merged contact_attempts + contact_assignments + call_dispositions
- 1 INSERT at offer, 1 UPDATE at disposition
- `status = with_agent` from offer to close — no intermediate status changes
- Finite campaigns auto-close when all CCS rows are terminal
- Agent priority via `assigned_agent_id` on contacts + CCS
- Priority column carried from upload into CCS fetch ORDER BY
