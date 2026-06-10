import { Router } from 'express';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const router = Router();

// Environment variables
const SUPERSET_URL = process.env.SUPERSET_URL || 'http://192.168.9.116:8088';
const SUPERSET_USERNAME = process.env.SUPERSET_USERNAME || 'admin';
const SUPERSET_PASSWORD = process.env.SUPERSET_PASSWORD || 'admin';
const SUPERSET_PROVIDER = process.env.SUPERSET_PROVIDER || 'db';

function createSupersetClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ withCredentials: true }));
  (client.defaults as any).jar = jar;
  return client;
}

async function getSupersetAccessToken() {
  const response = await axios.post(
    `${SUPERSET_URL}/api/v1/security/login`,
    {
      username: SUPERSET_USERNAME,
      password: SUPERSET_PASSWORD,
      provider: SUPERSET_PROVIDER,
      refresh: true,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
  );
  return response.data.access_token;
}

// 1. Fetch dashboards
router.get('/dashboards', async (req, res) => {
  try {
    const token = await getSupersetAccessToken();
    const response = await axios.get(
      `${SUPERSET_URL}/api/v1/dashboard/?q=(page_size:100)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    // Get only published ones, and fetch dataset IDs for each
    // In your superset router, add at the top:
    const published = response.data.result.filter((d: any) => d.published);



    const dashboards = await Promise.all(
      published.map(async (d: any) => {
        let dataset_ids: number[] = [];
        try {
          const datasetsResp = await axios.get(
            `${SUPERSET_URL}/api/v1/dashboard/${d.id}/datasets`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          dataset_ids = datasetsResp.data.result.map((ds: any) => ds.id);
        } catch (err) {
          console.error(`Failed to fetch datasets for dashboard ${d.id}`);
        }

        return {
          dashboard_id: d.id,
          dashboard_name: d.dashboard_title,
          dashboard_type: 'historical reports',
          isAvailable: d.published,
          uuid: d.uuid,
          dataset_ids,
          report_configurations: [] // Default for now
        };
      })
    );

    res.json({ success: true, dashboards });
  } catch (error: any) {
    console.error('Error fetching superset dashboards:', error?.message);
    res.status(500).json({ success: false, message: error?.message });
  }
});

// 2. Generate Guest Token
router.post('/guest-token', async (req, res) => {
  try {
    const { dashboardId, rls } = req.body;
    const accessToken = await getSupersetAccessToken();

    // Resolve Embedded UUID
    let dashboardUuid: string;
    try {
      const uuidResp = await axios.get(
        `${SUPERSET_URL}/api/v1/dashboard/${dashboardId}/embedded`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      dashboardUuid = uuidResp.data.result.uuid;
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Auto-enable embedded if not already
        const enableResp = await axios.post(
          `${SUPERSET_URL}/api/v1/dashboard/${dashboardId}/embedded`,
          { allowed_domains: ['*'] },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        dashboardUuid = enableResp.data.result.uuid;
      } else {
        throw err;
      }
    }

    // Perform Handshake
    const client = createSupersetClient();
    const csrfResp = await client.get(
      `${SUPERSET_URL}/api/v1/security/csrf_token/`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: SUPERSET_URL,
        },
      },
    );

    const csrfToken = csrfResp.data.result || csrfResp.data.csrf_token || csrfResp.data.value;

    const guestTokenResp = await client.post(
      `${SUPERSET_URL}/api/v1/security/guest_token/`,
      {
        resources: [{ type: 'dashboard', id: dashboardUuid }],
        rls: rls || [],
        user: { username: 'admin', first_name: 'Embed', last_name: 'User' }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: SUPERSET_URL,
        },
      },
    );

    res.json({ success: true, guestToken: guestTokenResp.data.token, uuid: dashboardUuid });
  } catch (error: any) {
    console.error('Error generating guest token:', error?.response?.data || error?.message);
    res.status(500).json({ success: false, message: error?.message });
  }
});

export default router;
