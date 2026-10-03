// Acesso ao banco. `q(sql, params)` precisa devolver { rows } (pg.Pool e PGlite fazem isso).
import { readFile } from 'node:fs/promises';

export async function openDb(cfg) {
  const { default: pg } = await import('pg');
  // A conexão com o banco é sempre criptografada (TLS). Com DATABASE_CA_CERT o servidor também confere o certificado do banco.
  const local = /localhost|127\.0\.0\.1/.test(cfg.databaseUrl);
  const ssl = local ? false : cfg.databaseCa ? { ca: cfg.databaseCa, rejectUnauthorized: true } : { rejectUnauthorized: false };
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
    async purgeOlderThan(days) { const r = await q(`DELETE FROM messages WHERE ts < now() - ($1 || ' days')::interval`, [String(Math.floor(days))]); return r.rowCount ?? r.affectedRows ?? 0; },
    // ----- painel: documentos -----
    async docsSince(after) {
      const rows = (await q('SELECT col, id, data, deleted, seq FROM panel_docs WHERE seq > $1 ORDER BY seq', [after])).rows;
      const seq = Number((await q('SELECT COALESCE(max(seq), 0) AS s FROM panel_docs')).rows[0].s);
      return { seq, rows };
    },
    async docSet(col, id, data) {
      const r = await q(`INSERT INTO panel_docs (col, id, data, seq) VALUES ($1, $2, $3::jsonb, nextval('panel_seq'))
                         ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, seq = EXCLUDED.seq, updated_at = now() RETURNING data, seq`, [col, id, JSON.stringify(data)]);
      return { data: r.rows[0].data, seq: Number(r.rows[0].seq) };
    },
    async docMerge(col, id, patch) {   // troca só os campos enviados (nível de cima); cria o documento se não existir
      const r = await q(`INSERT INTO panel_docs (col, id, data, seq) VALUES ($1, $2, $3::jsonb, nextval('panel_seq'))
                         ON CONFLICT (col, id) DO UPDATE SET data = CASE WHEN panel_docs.deleted THEN EXCLUDED.data ELSE panel_docs.data || EXCLUDED.data END,
                           deleted = false, seq = EXCLUDED.seq, updated_at = now() RETURNING data, seq`, [col, id, JSON.stringify(patch)]);
      return { data: r.rows[0].data, seq: Number(r.rows[0].seq) };
    },
    async docDelete(col, id) {         // apaga o conteúdo e deixa só a marca de exclusão, para os outros aparelhos saberem
      const r = await q(`UPDATE panel_docs SET data = '{}'::jsonb, deleted = true, seq = nextval('panel_seq'), updated_at = now() WHERE col = $1 AND id = $2 RETURNING seq`, [col, id]);
      return { seq: r.rows[0] ? Number(r.rows[0].seq) : 0 };
    },
    async docCount(col) { return Number((await q('SELECT count(*) AS n FROM panel_docs WHERE col = $1', [col])).rows[0].n); },
    async docGet(col, id) { const r = (await q('SELECT data FROM panel_docs WHERE col = $1 AND id = $2 AND deleted = false', [col, id])).rows[0]; return r ? r.data : null; },
    async ordersOfClient(clientId) { return (await q(`SELECT id, data FROM panel_docs WHERE col = 'orders' AND deleted = false AND data->>'clientId' = $1`, [clientId])).rows; },
    // ----- contas de clientes do site -----
    async userCreate(u) {
      const r = await q(`INSERT INTO site_users (id, email, name, phone, pass_hash, client_id, consent_at) VALUES ($1,$2,$3,$4,$5,$6, now())
                         ON CONFLICT (email) DO NOTHING RETURNING *`, [u.id, u.email, u.name, u.phone, u.passHash, u.clientId || null]);
      return r.rows[0] || null;
    },
    async userByEmail(email) { return (await q('SELECT * FROM site_users WHERE email = $1', [email])).rows[0] || null; },
    async userById(id) { return (await q('SELECT * FROM site_users WHERE id = $1', [id])).rows[0] || null; },
    async userByClient(clientId) { return (await q('SELECT * FROM site_users WHERE client_id = $1 ORDER BY created_at LIMIT 1', [clientId])).rows[0] || null; },
    async userByReset(hash) { return (await q('SELECT * FROM site_users WHERE reset_hash = $1 AND reset_expires > now()', [hash])).rows[0] || null; },
    async userUpdate(id, { name, phone }) { return (await q('UPDATE site_users SET name = $2, phone = $3, updated_at = now() WHERE id = $1 RETURNING *', [id, name, phone])).rows[0] || null; },
    async userSetPass(id, passHash) {   // nova senha: encerra as sessões antigas e inutiliza qualquer link de nova senha
      return (await q('UPDATE site_users SET pass_hash = $2, session_ver = session_ver + 1, reset_hash = NULL, reset_expires = NULL, updated_at = now() WHERE id = $1 RETURNING *', [id, passHash])).rows[0] || null;
    },
    async userSetReset(id, hash, minutes) { await q(`UPDATE site_users SET reset_hash = $2, reset_expires = now() + ($3 || ' minutes')::interval WHERE id = $1`, [id, hash, String(Math.floor(minutes))]); },
    async userSetClient(id, clientId) { await q('UPDATE site_users SET client_id = $2, updated_at = now() WHERE id = $1', [id, clientId]); },
    async userTouchLogin(id) { await q('UPDATE site_users SET last_login_at = now() WHERE id = $1', [id]); },
    async userDelete(id) { await q('DELETE FROM site_users WHERE id = $1', [id]); },
    // ----- painel: arquivos -----
    async assetPut(a) { await q('INSERT INTO panel_assets (id, name, type, size, data) VALUES ($1, $2, $3, $4, $5)', [a.id, a.name, a.type, a.data.length, a.data]); },
    async assetGet(id) { const r = (await q('SELECT name, type, data FROM panel_assets WHERE id = $1', [id])).rows[0]; return r ? { name: r.name, type: r.type, data: Buffer.from(r.data) } : null; },
    async assetDelete(id) { await q('DELETE FROM panel_assets WHERE id = $1', [id]); },
    async assetList() { return (await q('SELECT id, name, type, size, created_at FROM panel_assets ORDER BY created_at DESC')).rows.map(r => ({ id: r.id, name: r.name, contentType: r.type, sizeBytes: r.size, url: '/_blob/' + r.id })); },
    async assetTotal() { return Number((await q('SELECT COALESCE(sum(size), 0) AS n FROM panel_assets')).rows[0].n); },
    async kvGet(k) { return (await q('SELECT value, updated_at FROM kv WHERE key=$1', [k])).rows[0] || null; },
    async kvSet(k, v) { await q(`INSERT INTO kv (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [k, v]); },
  };
}
