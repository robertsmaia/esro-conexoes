// Servidor de teste: o servidor de verdade com um Postgres em memória (PGlite). Uso: node test/dev-server.mjs [porta]
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadConfig } from '../src/config.js';
import { migrate, repo as makeRepo } from '../src/db.js';
import { createApp } from '../src/app.js';

const port = Number(process.argv[2] || 8787);
const cfg = loadConfig({ MCP_SECRET: 'segredo-de-teste-com-mais-de-24-caracteres', PAINEL_SENHA: process.env.PAINEL_SENHA || 'senha-de-teste-123', IG_TOKEN: 'ig', IG_APP_SECRET: 'ig-secret', SITE_WEBHOOK_TOKEN: 'site-token-de-teste' });
const pg = new PGlite(); const db = { q: (s, p) => pg.query(s, p), exec: (s) => pg.exec(s) };
await migrate(db); const repo = makeRepo(db);
if (await repo.docCount('catalog') === 0) for (const c of JSON.parse(await readFile(new URL('../src/seed-catalog.json', import.meta.url), 'utf8'))) await repo.docSet('catalog', c.id, c.data);
const now = new Date().toISOString();
const cid = await repo.upsertContact({ channel: 'instagram', peerId: 'IG1', name: 'Carol Mendes', username: 'prof.carol' });
await repo.addMessage({ id: 'mid.1', contactId: cid, channel: 'instagram', direction: 'in', origin: 'cliente', type: 'text', text: 'Oi! Vocês fazem agenda 2027?', ts: now });
await repo.addSiteOrder('W2001', { numero: 'W2001', cliente: { nome: 'Juliana Prado', telefone: '11987124410' }, itens: [{ nome: 'Planner personalizado', qtd: 1, valor: 78 }], total: 78, pagamento: 'pix', status: 'pago' });
const fakeFetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('/messages') ? { message_id: 'mid.out.' + Date.now() } : {}) });
createApp({ cfg, repo, fetchImpl: fakeFetch }).listen(port, '127.0.0.1', () => console.log('pronto em http://127.0.0.1:' + port));
