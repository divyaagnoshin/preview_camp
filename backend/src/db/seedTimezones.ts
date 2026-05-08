import pool from './pool';

// Modern IANA aliases that some ICU builds (notably the one bundled with
// Node on Windows) still report under their pre-rename names. We always
// merge these in so the picker offers the current canonical spellings.
const MODERN_ALIASES = [
  'Asia/Kolkata', // legacy: Asia/Calcutta
  'Asia/Ho_Chi_Minh', // legacy: Asia/Saigon
  'Asia/Yangon', // legacy: Asia/Rangoon
  'Asia/Kathmandu', // legacy: Asia/Katmandu
  'Europe/Kyiv', // legacy: Europe/Kiev
  'America/Nuuk', // legacy: America/Godthab
  'America/Argentina/Buenos_Aires',
  'Africa/Asmara', // legacy: Africa/Asmera
];

// Populates the `timezones` catalog from the Node ICU timezone list plus the
// modern-alias list above. Runs on every backend boot; the INSERT is
// ON CONFLICT DO NOTHING so re-runs are cheap and safe.
export async function seedTimezones(): Promise<void> {
  try {
    // Intl.supportedValuesOf is available on Node 18+. Fall back to a minimal
    // hardcoded list if the runtime doesn't expose it (e.g. very old ICU build).
    const intlAny = Intl as any;
    const fromIntl: string[] =
      typeof intlAny.supportedValuesOf === 'function'
        ? intlAny.supportedValuesOf('timeZone')
        : ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata'];

    const zones = Array.from(new Set([...fromIntl, ...MODERN_ALIASES])).sort();
    if (!zones.length) return;

    // Single INSERT with a VALUES list — fastest for a few hundred rows.
    const placeholders = zones.map((_, i) => `($${i + 1})`).join(',');
    const result = await pool.query(
      `INSERT INTO timezones (name) VALUES ${placeholders}
       ON CONFLICT (name) DO NOTHING`,
      zones,
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`✓ Seeded ${result.rowCount} new timezones`);
    }
  } catch (err) {
    console.error('Timezone seed failed:', err);
  }
}
