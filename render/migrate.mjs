import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(74522101)');
    await client.query('CREATE TABLE IF NOT EXISTS render_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied timestamptz DEFAULT now())');
    for (const name of (await readdir(new URL('./migrations/', import.meta.url))).filter(x => x.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL('./migrations/'+name, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (await client.query('SELECT checksum FROM render_migrations WHERE name=$1', [name])).rows[0];
      if (existing) { if (existing.checksum !== checksum) throw new Error('Applied migration changed: '+name); continue; }
      await client.query('BEGIN');
      try { await client.query(sql); await client.query('INSERT INTO render_migrations(name,checksum) VALUES($1,$2)', [name,checksum]); await client.query('COMMIT'); }
      catch (e) { await client.query('ROLLBACK'); throw e; }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(74522101)'); client.release(); }
}
