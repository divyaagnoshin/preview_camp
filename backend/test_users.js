const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Admin@123@192.168.9.30:5432/preview_campaign' });
pool.query("INSERT INTO users (email, username, role, is_active, sip_extension, sip_password, reporting_to, org_id, password_hash) VALUES ('testxyz@test.com', 'testxyz', 'agent', true, '9999', 'pass', 'admin', 'd601d51a-7db0-4df2-8bd7-1011506b12d3', '')")
.then(() => console.log('success'))
.catch(console.error)
.finally(() => process.exit(0));
