// Preserve the shared workflow's prepared-statement/atomic-batch contract on Postgres.
export function createDatabase(pool) {
  function sqlFor(sql, changes) {
    let index = 0;
    // All SQL comes from our source, never from users. Ignore ? inside quoted strings.
    return sql.replace(/'(?:''|[^'])*'|\?|changes\(\)/g, token =>
      token === '?' ? `$${++index}` : token === 'changes()' ? String(changes ?? 0) : token);
  }
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return (await pool.query(sqlFor(this.sql), this.args)).rows[0] ?? null; }
    async all() { return { results: (await pool.query(sqlFor(this.sql), this.args)).rows }; }
    async run() { const r = await pool.query(sqlFor(this.sql), this.args); return { meta: { changes: r.rowCount } }; }
  }
  return {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let changes = 0;
        const results = [];
        for (const s of statements) {
          const r = await client.query(sqlFor(s.sql, changes), s.args);
          changes = r.rowCount;
          results.push({ meta: { changes } });
        }
        await client.query('COMMIT');
        return results;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  };
}
