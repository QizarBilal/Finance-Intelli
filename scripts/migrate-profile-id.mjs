import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('/home/runner/workspace/node_modules/.pnpm/node_modules/pg/lib/index.js');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS profile_id INTEGER');
  await client.query('ALTER TABLE budgets      ADD COLUMN IF NOT EXISTS profile_id INTEGER');
  await client.query('ALTER TABLE goals        ADD COLUMN IF NOT EXISTS profile_id INTEGER');
  await client.query('ALTER TABLE reminders    ADD COLUMN IF NOT EXISTS profile_id INTEGER');
  await client.query('ALTER TABLE categories   ADD COLUMN IF NOT EXISTS profile_id INTEGER');
  console.log('columns added');

  const { rows } = await client.query("SELECT id FROM profile WHERE username = 'qizarbilal' LIMIT 1");
  if (!rows.length) { console.error('qizarbilal not found'); process.exit(1); }
  const uid = rows[0].id;
  console.log('qizarbilal id =', uid);

  const r = await Promise.all([
    client.query('UPDATE transactions SET profile_id=$1 WHERE profile_id IS NULL', [uid]),
    client.query('UPDATE budgets      SET profile_id=$1 WHERE profile_id IS NULL', [uid]),
    client.query('UPDATE goals        SET profile_id=$1 WHERE profile_id IS NULL', [uid]),
    client.query('UPDATE reminders    SET profile_id=$1 WHERE profile_id IS NULL', [uid]),
    client.query('UPDATE categories   SET profile_id=$1 WHERE profile_id IS NULL', [uid]),
  ]);
  console.log('rows backfilled:', r.map(x => x.rowCount).join(', '));
  await client.query('ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key');
  console.log('migration complete');
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
