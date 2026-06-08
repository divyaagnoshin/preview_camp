import axios from 'axios';
(async () => {
  try {
    const tokenRes = await axios.post('http://192.168.9.116:8088/api/v1/security/login', { username: 'admin', password: 'admin', provider: 'db', refresh: true });
    const token = tokenRes.data.access_token;
    const meRes = await axios.get('http://192.168.9.116:8088/api/v1/me/', { headers: { Authorization: `Bearer ${token}` } });
    console.log('Roles:', meRes.data.result.roles);
    
    const res = await axios.get(`http://192.168.9.116:8088/api/v1/dashboard/`, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`Total fetched: ${res.data.count}`);
    console.log(JSON.stringify(res.data.result.map((d: any) => ({ title: d.dashboard_title, published: d.published })), null, 2));
  } catch (e: any) { console.error(e.message); }
})();
