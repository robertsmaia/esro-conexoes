// Acesso ao banco. `q(sql, params)` precisa devolver { rows } (pg.Pool e PGlite fazem isso).
import { readFile } from 'node:fs/promises';

export async function openDb(cfg) {
  const { default: pg } = await import('pg');
  const ssl = /localhost|127\.0\.0\.1/.test(cfg.databaseUrl) ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: cfg.databaseUrl, ssl, max: 5 });
  return { q: (sql, p) => pool.query(sql, p), exec: (sql) => pool.query(sql), close: () => pool.end() };
}

export async function migrate(db) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.exec(sql);
}

export function repo(db) {
  const q = db.q;
  return {
    async upsertContact({ channel, peerId, name, username }) {
      const id = `${channel}:${peerId}`;
      await q(`INSERT INTO contacts (id, channel, peer_id, name, username) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (id) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name),
                                              username = COALESCE(EXCLUDED.username, contacts.username)`,
        [id, channel, peerId, name || null, username || null]);
      return id;
    },
    async getContact(id) { return (await q('SELECT * FROM contacts WHERE id=$1', [id])).rows[0] || null; },
    async addMessage(m) {
      const r = await q(`INSERT INTO messages (id, contact_id, channel, direction, origin, type, text, media_id, status, ts, raw)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [m.id, m.contactId, m.channel, m.direction, m.origin || null, m.type, m.text ?? null, m.mediaId || null, m.status || null, m.ts, m.raw ? JSON.stringify(m.raw) : null]);
      if (!r.rows.length) return false; // duplicado (a Meta reenvia webhooks)
      await q(`UPDATE contacts SET last_text=$2, last_at=GREATEST(COALESCE(last_at,$3),$3),
                 last_in_at = CASE WHEN $4='in' THEN GREATEST(COALESCE(last_in_at,$3),$3) ELSE last_in_at END,
                 unread = unread + CASE WHEN $4='in' THEN 1 ELSE 0 END WHERE id=$1`,
        [m.contactId, m.text ?? `[${m.type}]`, m.ts, m.direction]);
      return true;
    },
    async setStatus(id, status) { await q('UPDATE messages SET status=$2 WHERE id=$1', [id, status]); },
    async listContacts({ channel, limit = 50 } = {}) {
      const p = [Math.min(Math.max(limit, 1), 200)]; let w = '';
      if (channel) { p.push(channel); w = 'WHERE channel=$2'; }
      return (await q(`SELECT * FROM contacts ${w} ORDER BY last_at DESC NULLS LAST LIMIT $1`, p)).rows;
    },
    async listMessages(contactId, limit = 50) {
      const rows = (await q(`SELECT id, direction, origin, type, text, status, ts FROM messages WHERE contact_id=$1 ORDER BY ts DESC LIMIT $2`,
        [contactId, Math.min(Math.max(limit, 1), 300)])).rows;
      return rows.reverse();
    },
    async markRead(contactId) { await q('UPDATE contacts SET unread=0 WHERE id=$1', [contactId]); },
    async lastInboundId(contactId) {
      return (await q(`SELECT id FROM messages WHERE contact_id=$1 AND direction='in' ORDER BY ts DESC LIMIT 1`, [contactId])).rows[0]?.id || null;
    },
    async addSiteOrder(extId, payload) {
      const r = await q(`INSERT INTO site_orders (ext_id, payload) VALUES ($1,$2) ON CONFLICT (ext_id) DO NOTHING RETURNING id`, [extId, JSON.stringify(payload)]);
      return r.rows[0]?.id || null;
    },
    async listSiteOrders(onlyNew) {
      return (await q(`SELECT * FROM site_orders ${onlyNew ? 'WHERE imported=false' : ''} ORDER BY received_at DESC LIMIT 100`)).rows;
    },
    async markSiteOrder(id) { const r = await q('UPDATE site_orders SET imported=true WHERE id=$1 RETURNING id', [id]); return !!r.rows.length; },
    async counts() {
      const r = await q(`SELECT (SELECT count(*) FROM contacts)::int AS conversas, (SELECT COALESCE(sum(unread),0) FROM contacts)::int AS nao_lidas,
                                (SELECT count(*) FROM site_orders WHERE imported=false)::int AS pedidos_site_novos`);
      return r.rows[0];
    },
    async kvGet(k) { return (await q('SELECT value, updated_at FROM kv WHERE key=$1', [k])).rows[0] || null; },
    async kvSet(k, v) { await q(`INSERT INTO kv (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [k, v]); },
  };
}
