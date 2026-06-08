const parser = require('cron-parser');
try {
  const it = parser.parse('12 12 * * *', { tz: 'Asia/Calcutta' });
  console.log("Success:", it.next().toDate());
} catch (e) {
  console.log("Error:", e.message);
}
