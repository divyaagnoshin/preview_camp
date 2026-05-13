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

| Role  | Email                 | Password   |
| ----- | --------------------- | ---------- |
| Admin | admin@acme.com        | Password1! |
| Agent | raj.patel@acme.com    | Password1! |
| Agent | carla.mendes@acme.com | Password1! |

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

## FreeSWITCH (browser softphone) setup

The agent workspace uses an in-browser SIP client (JsSIP) that registers
against FreeSWITCH over WSS and dials each contact through it. Mute / Hold
are handled client-side via SIP re-INVITE.

### What the code does

- `GET /v1/telephony/sip-credentials` — backend auto-provisions a SIP
  extension (`agent<8hex>`) and random password per user, stored on
  `users.sip_extension` / `users.sip_password`.
- The browser registers as that extension at `wss://192.168.9.221:7443`
  and sends `INVITE sip:<phone>@192.168.9.221` with header
  `X-Interaction-Id: <uuid>` on every Accept.
- A backend ESL listener subscribes to channel events and writes
  `dialed_at` / `answered_at` / `disconnected_at` / `recording_url`
  back into `contact_interactions` keyed by `fs_uuid`.

### What you must configure on the FreeSWITCH 192.168.9.221 server

1. **Sofia WSS profile** (e.g. `internal`) listening on TCP 7443 with a
   valid TLS certificate — browsers refuse `ws://` for getUserMedia.
2. **Directory entries** — for every agent provisioned by the backend,
   add a user XML file matching the `extension` and `password` shown in
   the `users` table. (Or wire `mod_xml_curl` against
   `/v1/telephony/sip-credentials` for dynamic auth.)
3. **Outbound dialplan** in the context the WSS profile uses, routing
   `^(\+?\d+)$` through your PSTN gateway, e.g.:
   ```xml
   <extension name="outbound_pstn">
     <condition field="destination_number" expression="^(\+?\d+)$">
       <action application="set" value="effective_caller_id_number=${FS_OUTBOUND_CALLER_ID_NUMBER}"/>
       <action application="export" value="sip_h_X-Interaction-Id=${sip_h_X-Interaction-Id}"/>
       <action application="bridge" data="sofia/gateway/<your_gw>/$1"/>
     </condition>
   </extension>
   ```
4. **ESL ACL / password** — the `event_socket.conf.xml` must allow the
   backend's IP and use the password set in `FS_ESL_PASSWORD`.
5. **(Optional) Recording** — add `<action application="record_session"
data="$${recordings_dir}/${uuid}.wav"/>` to capture audio; the path
   flows back to `contact_interactions.recording_url` via `RECORD_STOP`.

### Required env vars (backend/.env)

```
FS_HOST=192.168.9.221
FS_SIP_DOMAIN=192.168.9.221
FS_WSS_URL=wss://192.168.9.221:7443
FS_STUN_URL=stun:stun.l.google.com:19302
FS_ESL_HOST=192.168.9.221
FS_ESL_PORT=8021
FS_ESL_PASSWORD=ClueCon
FS_ESL_ENABLED=true
FS_OUTBOUND_CALLER_ID_NUMBER=+10000000000
FS_OUTBOUND_CALLER_ID_NAME=Preview Campaign
```

If FreeSWITCH is unreachable the backend keeps running — only outbound
calls are unavailable. Set `FS_ESL_ENABLED=false` to silence reconnect
logs in environments without FreeSWITCH.

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
