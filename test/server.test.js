// Testes de ponta a ponta com um Postgres em memória (PGlite) e a API da Meta simulada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { loadConfig } from '../src/config.js';
import { migrate, repo as makeRepo } from '../src/db.js';
import { createApp } from '../src/app.js';

const SECRET = 'segredo-de-teste-com-mais-de-24-caracteres';
const cfg = loadConfig({ MCP_SECRET: SECRET, WA_TOKEN: 'wa-token', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'app-secret', WA_VERIFY_TOKEN: 'verifica',
  IG_TOKEN: 'ig-token', IG_APP_SECRET: 'ig-secret', IG_VERIFY_TOKEN: 'verifica-ig', SITE_WEBHOOK_TOKEN: 'site-token', PAINEL_SENHA: 'senha-do-painel-123' });
const sent = [];
const fakeFetch = async (url, opts = {}) => {
  sent.push({ url, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
  const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
  if (url.includes('graph.facebook.com') && JSON.parse(opts.body).to === '5511900000000') return json({ error: { code: 131047, message: 'Re-engagement message' } }, 400);
  if (url.includes('graph.facebook.com')) return json({ messages: [{ id: 'wamid.OUT1' }] });
  if (url.includes('graph.instagram.com') && url.includes('/messages')) return json({ recipient_id: 'IGSID1', message_id: 'mid.OUT1' });
  if (url.includes('graph.instagram.com')) return json({ name: 'Carol Mendes', username: 'prof.carol' });
  return json({}, 404);
};

let server, base, pg;
before(async () => {
  pg = new PGlite();
  const db = { q: (s, p) => pg.query(s, p), exec: (s) => pg.exec(s) };
  await migrate(db);
  const app = createApp({ cfg, repo: makeRepo(db), fetchImpl: fakeFetch, log: { error() {} } });
  server = app.listen(0); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pg.close(); });

const sign = (secret, body) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
const post = (path, obj, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof obj === 'string' ? obj : JSON.stringify(obj) });
const wait = () => new Promise(r => setTimeout(r, 80));
let rpcId = 0;
async function mcp(tool, args = {}) {
  const r = await post(`/mcp/${SECRET}`, { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: tool, arguments: args } }, { accept: 'application/json, text/event-stream' });
  const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error));
  const text = j.result.content[0].text; return { isError: !!j.result.isError, data: j.result.isError ? text : JSON.parse(text) };
}

test('verificação do webhook', async () => {
  const ok = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=42`);
  assert.equal(await ok.text(), '42');
  const bad = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
  assert.equal(bad.status, 403);
});

test('WhatsApp: recebe mensagem assinada, ignora assinatura inválida e registra eco do app', async () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    contacts: [{ wa_id: '5511974203381', profile: { name: 'Patrícia' } }],
    messages: [{ from: '5511974203381', id: 'wamid.IN1', timestamp: String(Math.floor(Date.now() / 1000) - 20), type: 'text', text: { body: 'Oi! Quanto custa a pauta?' } }] } }] }] });
  assert.equal((await post('/webhooks/whatsapp', body, { 'x-hub-signature-256': 'sha256=abc' })).status, 401);
  assert.equal((await post('/webhooks/whatsapp', body, { 'x-hub-signature-256': sign('app-secret', body) })).status, 200);
  // reenvio da Meta não duplica
  await post('/webhooks/whatsapp', body, { 'x-hub-signature-256': sign('app-secret', body) });
  const echo = JSON.stringify({ entry: [{ changes: [{ field: 'smb_message_echoes', value: { message_echoes: [{ from: '5511992481676', to: '5511974203381', id: 'wamid.ECHO1', timestamp: String(Math.floor(Date.now() / 1000) - 10), type: 'text', text: { body: 'Respondi pelo celular' } }] } }] }] });
  await post('/webhooks/whatsapp', echo, { 'x-hub-signature-256': sign('app-secret', echo) });
  await wait();
  const { data } = await mcp('listar_conversas');
  const c = data.conversas.find(x => x.id === 'whatsapp:5511974203381');
  assert.equal(c.nome, 'Patrícia'); assert.equal(c.nao_lidas, 1); assert.equal(c.pode_responder, true);
  const conv = await mcp('ler_conversa', { conversa_id: c.id });
  assert.deepEqual(conv.data.mensagens.map(m => [m.direcao, m.origem]), [['in', 'cliente'], ['out', 'app']]);
});

test('WhatsApp: envia pelo painel e trata janela de 24 h', async () => {
  const r = await mcp('enviar_mensagem', { conversa_id: 'whatsapp:5511974203381', texto: 'A pauta fica entre R$ 25 e R$ 45 💛' });
  assert.equal(r.isError, false); assert.equal(r.data.id, 'wamid.OUT1');
  const call = sent.find(s => s.url.includes('/123/messages'));
  assert.equal(call.body.to, '5511974203381'); assert.equal(call.headers.Authorization, 'Bearer wa-token');
  const conv = await mcp('ler_conversa', { conversa_id: 'whatsapp:5511974203381' });
  assert.equal(conv.data.conversa.nao_lidas, 0); assert.equal(conv.data.mensagens.at(-1).origem, 'painel');
  // cliente fora da janela
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '5511900000000', id: 'wamid.OLD', timestamp: '1700000000', type: 'image', image: { id: 'm1', caption: 'referência' } }] } }] }] });
  await post('/webhooks/whatsapp', body, { 'x-hub-signature-256': sign('app-secret', body) }); await wait();
  const old = await mcp('ler_conversa', { conversa_id: 'whatsapp:5511900000000' });
  assert.equal(old.data.mensagens[0].texto, '[imagem] referência'); assert.equal(old.data.conversa.pode_responder, false);
  const e = await mcp('enviar_mensagem', { conversa_id: 'whatsapp:5511900000000', texto: 'Oi' });
  assert.equal(e.isError, true); assert.match(e.data, /24 h/);
});

test('Instagram: recebe DM, busca @ do cliente e responde', async () => {
  const body = JSON.stringify({ object: 'instagram', entry: [{ id: '1789', time: Date.now(), messaging: [{ sender: { id: 'IGSID1' }, recipient: { id: '1789' }, timestamp: Date.now(), message: { mid: 'mid.IN1', text: 'Amei a agenda!' } }] }] });
  assert.equal((await post('/webhooks/instagram', body, { 'x-hub-signature-256': sign('ig-secret', body) })).status, 200); await wait();
  const { data } = await mcp('listar_conversas', { canal: 'instagram' });
  assert.equal(data.conversas[0].contato, '@prof.carol');
  const r = await mcp('enviar_mensagem', { conversa_id: 'instagram:IGSID1', texto: 'Obrigada, Carol!' });
  assert.equal(r.data.id, 'mid.OUT1');
  assert.deepEqual(sent.find(s => s.url.includes('graph.instagram.com') && s.url.includes('/messages')).body, { recipient: { id: 'IGSID1' }, message: { text: 'Obrigada, Carol!' } });
});

test('Pedidos do site: exige token, evita duplicado e marca importado', async () => {
  assert.equal((await post('/webhooks/site', { numero: 'W1050' })).status, 401);
  const r = await post('/webhooks/site', { numero: 'W1050', cliente: 'Juliana', itens: [{ nome: 'Planner personalizado', qtd: 1, valor: 78 }], total: 78 }, { 'x-esro-token': 'site-token' });
  assert.equal(r.status, 201);
  assert.equal((await post('/webhooks/site', { numero: 'W1050' }, { 'x-esro-token': 'site-token' })).status, 200);
  const l = await mcp('listar_pedidos_site');
  assert.equal(l.data.pedidos.length, 1); assert.equal(l.data.pedidos[0].dados.cliente, 'Juliana');
  await mcp('marcar_pedido_importado', { pedido_id: l.data.pedidos[0].id });
  assert.equal((await mcp('listar_pedidos_site')).data.pedidos.length, 0);
});

test('MCP: segredo errado não expõe nada e ferramentas estão listadas', async () => {
  assert.equal((await post('/mcp/errado', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { accept: 'application/json, text/event-stream' })).status, 404);
  const r = await post(`/mcp/${SECRET}`, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { accept: 'application/json, text/event-stream' });
  const names = (await r.json()).result.tools.map(t => t.name).sort();
  assert.deepEqual(names, ['enviar_mensagem', 'ler_conversa', 'listar_conversas', 'listar_pedidos_site', 'marcar_como_lida', 'marcar_pedido_importado', 'status_conexoes']);
  const st = await mcp('status_conexoes');
  assert.equal(st.data.whatsapp.configurado, true); assert.equal(st.data.pedidos_site_novos, 0);
});

/* ---------- Segurança ---------- */
test('Segurança: cabeçalhos, 404 genérico e JSON inválido sem detalhes', async () => {
  const r = await fetch(base + '/healthz');
  assert.match(r.headers.get('strict-transport-security'), /max-age=31536000/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/); assert.equal(r.headers.get('x-powered-by'), null);
  const nf = await fetch(base + '/qualquer/coisa'); assert.equal(nf.status, 404); assert.deepEqual(await nf.json(), { erro: 'não encontrado' });
  const bad = await post('/webhooks/site', '{invalido', { 'x-esro-token': 'site-token' }); assert.equal(bad.status, 400); assert.deepEqual(await bad.json(), { erro: 'JSON inválido.' });
  const http = await fetch(base + '/', { headers: { 'x-forwarded-proto': 'http' }, redirect: 'manual' }); assert.equal(http.status, 308); assert.match(http.headers.get('location'), /^https:\/\//);
  assert.equal((await post('/webhooks/site', { numero: 'X1' }, { 'x-esro-token': 'site-token', 'x-forwarded-proto': 'http' })).status, 400);
});

test('Segurança: webhook sem assinatura é recusado e o conteúdo bruto não é guardado', async () => {
  const body = JSON.stringify({ entry: [{ messaging: [{ sender: { id: 'FALSO' }, recipient: { id: '1789' }, timestamp: Date.now(), message: { mid: 'mid.FALSO', text: 'mensagem forjada' } }] }] });
  assert.equal((await post('/webhooks/instagram', body)).status, 401);
  assert.equal((await post('/webhooks/instagram', body, { 'x-hub-signature-256': sign('chave-errada', body) })).status, 401);
  // sem a chave secreta configurada, nada é aceito (antes aceitava)
  const cfg2 = loadConfig({ MCP_SECRET: SECRET, IG_TOKEN: 'ig-token', WA_TOKEN: 'wa', WA_PHONE_NUMBER_ID: '1' });
  const app2 = createApp({ cfg: cfg2, repo: makeRepo({ q: (s, p) => pg.query(s, p) }), fetchImpl: fakeFetch, log: { error() {}, warn() {} } });
  const s2 = app2.listen(0); await new Promise(r => s2.once('listening', r)); const b2 = `http://127.0.0.1:${s2.address().port}`;
  const p2 = (path, h = {}) => fetch(b2 + path, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body });
  assert.equal((await p2('/webhooks/instagram')).status, 401); assert.equal((await p2('/webhooks/instagram', { 'x-hub-signature-256': sign('', body) })).status, 401);
  assert.equal((await p2('/webhooks/whatsapp')).status, 401);
  s2.close(); await wait();
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM contacts WHERE peer_id='FALSO'`)).rows[0].n, 0);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM messages WHERE raw IS NOT NULL')).rows[0].n, 0);
});

test('Segurança: tabelas fechadas para a API pública do banco (RLS)', async () => {
  const r = await pg.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('contacts','messages','site_orders','kv','panel_docs','panel_assets') ORDER BY relname`);
  assert.deepEqual(r.rows.map(x => [x.relname, x.relrowsecurity]), [['contacts', true], ['kv', true], ['messages', true], ['panel_assets', true], ['panel_docs', true], ['site_orders', true]]);
});

test('Segurança: bloqueio após tentativas com segredo errado e limite de requisições', async () => {
  const cfg3 = loadConfig({ MCP_SECRET: SECRET, SITE_WEBHOOK_TOKEN: 'site-token', AUTH_FAILURES_LIMIT: '5', RATE_LIMIT_PER_MINUTE: '40' });
  const warns = []; const app3 = createApp({ cfg: cfg3, repo: makeRepo({ q: (s, p) => pg.query(s, p) }), fetchImpl: fakeFetch, log: { error() {}, warn: (m) => warns.push(m) } });
  const s3 = app3.listen(0); await new Promise(r => s3.once('listening', r)); const b3 = `http://127.0.0.1:${s3.address().port}`;
  const call = (path, ip, h = {}) => fetch(b3 + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'cf-connecting-ip': ip, ...h }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  for (let i = 0; i < 5; i++) assert.equal((await call('/mcp/chute-' + i, '203.0.113.9')).status, 404);
  const blocked = await call('/mcp/' + SECRET, '203.0.113.9'); assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await call('/webhooks/site', '203.0.113.9', { 'x-esro-token': 'site-token' })).status, 429);
  assert.equal(warns.length, 1); assert.match(warns[0], /bloqueado/);
  assert.equal((await call('/mcp/' + SECRET, '198.51.100.7')).status, 200);   // outro endereço segue funcionando
  let last = 0; for (let i = 0; i < 45; i++) last = (await fetch(b3 + '/', { headers: { 'cf-connecting-ip': '192.0.2.50' } })).status;
  assert.equal(last, 429);
  s3.close();
});

/* ---------- Site e painel próprio ---------- */
const H = { 'x-esro': '1', 'content-type': 'application/json' };
const api = (method, path, body, cookie, extra = {}) => fetch(base + '/painel/api' + path, { method, headers: { ...H, ...(cookie ? { cookie } : {}), ...extra }, body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)) });
async function login() { const r = await api('POST', '/login', { senha: 'senha-do-painel-123' }); assert.equal(r.status, 204); const c = r.headers.get('set-cookie'); assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); return c.split(';')[0]; }

test('Site: página pública na raiz, com política de segurança e sem scripts embutidos', async () => {
  const r = await fetch(base + '/'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/);
  const html = await r.text(); assert.match(html, /ESRO/); assert.ok(!/<script>/.test(html)); assert.match(html, /href="\/painel"/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self';/);
  assert.equal((await fetch(base + '/site.js')).status, 200); assert.equal((await fetch(base + '/assets/esro-contato.jpg')).headers.get('content-type'), 'image/jpeg');
  // Vitrine: cada produto tem a sua ilustração, servida como imagem e sem nada executável dentro
  const pics = [...html.matchAll(/<img src="(assets\/produtos\/[\w-]+\.svg)" alt="([^"]+)"/g)]; assert.equal(pics.length, 8); assert.equal(new Set(pics.map(m => m[1])).size, 8);
  for (const [, src] of pics) { const im = await fetch(base + '/' + src); assert.equal(im.status, 200); assert.match(im.headers.get('content-type'), /image\/svg\+xml/);
    const svg = await im.text(); assert.ok(!/<script|<foreignObject|\son\w+=|href=/i.test(svg)); assert.ok(svg.length < 60000); }
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/painel/);
  assert.equal((await fetch(base + '/../src/config.js')).status, 404); assert.equal((await fetch(base + '/.env')).status, 404);
});

test('Painel: página abre sem dados; API exige login, cabeçalho próprio e mesma origem', async () => {
  const page = await fetch(base + '/painel'); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /script-src 'self';/); assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const html = await page.text(); assert.ok(!/<script>/.test(html)); assert.match(html, /\/painel\/runtime\.js/);
  assert.equal((await fetch(base + '/painel/app.js')).status, 200);
  assert.equal((await api('GET', '/sync')).status, 401); assert.equal((await api('GET', '/me')).status, 401);
  assert.equal((await api('PUT', '/db/orders/x1', { a: 1 })).status, 401); assert.equal((await fetch(base + '/_blob/' + 'a'.repeat(24))).status, 401);
  assert.equal((await api('POST', '/login', { senha: 'errada' })).status, 401);
  const cookie = await login();
  assert.equal((await api('GET', '/me', undefined, cookie)).status, 200);
  assert.equal((await fetch(base + '/painel/api/me', { headers: { cookie } })).status, 400);                              // sem o cabeçalho próprio
  assert.equal((await api('GET', '/me', undefined, cookie, { origin: 'https://site-malicioso.example' })).status, 403);     // outra origem
  assert.equal((await api('GET', '/me', undefined, cookie.slice(0, -3) + 'abc')).status, 401);                             // sessão adulterada
  assert.equal((await api('GET', '/me', undefined, 'esro_sess=' + (Date.now() - 1000) + '.x.y')).status, 401);
  const out = await api('POST', '/logout', {}, cookie); assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('Painel: gravar, alterar, excluir e sincronizar documentos', async () => {
  const cookie = await login();
  const s0 = await (await api('GET', '/sync?after=0', undefined, cookie)).json();
  assert.equal((await api('PUT', '/db/orders/p1', { num: 1001, client: 'Ana', value: 40, notes: [{ t: 'a' }] }, cookie)).status, 200);
  const merged = await (await api('PATCH', '/db/orders/p1', { value: 55, status: 'novo' }, cookie)).json();
  assert.deepEqual(merged.data, { num: 1001, client: 'Ana', value: 55, status: 'novo', notes: [{ t: 'a' }] });
  await api('PUT', '/db/settings/store', { pixKey: 'chave' }, cookie); await api('PATCH', '/db/clients/novo', { name: 'Criado pelo update' }, cookie);
  const s1 = await (await api('GET', '/sync?after=' + s0.seq, undefined, cookie)).json();
  assert.deepEqual(s1.docs.map(d => [d.col, d.id]).sort(), [['clients', 'novo'], ['orders', 'p1'], ['settings', 'store']]); assert.ok(s1.seq > s0.seq);
  await api('DELETE', '/db/orders/p1', undefined, cookie);
  const s2 = await (await api('GET', '/sync?after=' + s1.seq, undefined, cookie)).json();
  assert.deepEqual(s2.docs, [{ col: 'orders', id: 'p1', del: true }]);
  assert.equal((await pg.query(`SELECT data::text AS d FROM panel_docs WHERE col='orders' AND id='p1'`)).rows[0].d, '{}');   // o conteúdo some de verdade
  assert.equal((await api('PUT', '/db/segredos/x', { a: 1 }, cookie)).status, 400); assert.equal((await api('PUT', '/db/orders/..%2Fx', { a: 1 }, cookie)).status, 400);
  assert.equal((await api('PUT', '/db/orders/p2', [1, 2], cookie)).status, 400);
  assert.equal((await api('PUT', '/db/orders/p3', { big: 'x'.repeat(300 * 1024) }, cookie)).status, 413);
});

test('Painel: arquivos só com login, tipo conferido e nunca executáveis', async () => {
  const cookie = await login(); const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const up = await api('POST', '/assets?name=capa%20floral.png', png, cookie, { 'content-type': 'image/png' }); assert.equal(up.status, 201);
  const a = await up.json(); assert.match(a.id, /^[a-f0-9]{24}$/); assert.equal(a.url, '/_blob/' + a.id); assert.equal(a.sizeBytes, png.length);
  assert.equal((await fetch(base + a.url)).status, 401);
  const got = await fetch(base + a.url, { headers: { cookie } }); assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('content-security-policy'), /sandbox/); assert.match(got.headers.get('content-disposition'), /^inline/); assert.deepEqual(Buffer.from(await got.arrayBuffer()), png);
  assert.equal((await api('POST', '/assets?name=x.html', Buffer.from('<script>alert(1)</script>'), cookie, { 'content-type': 'text/html' })).status, 415);
  const js = await (await api('POST', '/assets?name=dados.json', Buffer.from('{"a":1}'), cookie, { 'content-type': 'application/json' })).json();
  assert.match((await fetch(base + js.url, { headers: { cookie } })).headers.get('content-disposition'), /^attachment/);
  const svg = await (await api('POST', '/assets?name=a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), cookie, { 'content-type': 'image/svg+xml' })).json();
  assert.match((await fetch(base + svg.url, { headers: { cookie } })).headers.get('content-disposition'), /^attachment/);
  assert.equal((await (await api('GET', '/assets', undefined, cookie)).json()).assets.length, 3);
  assert.equal((await api('DELETE', '/assets/' + a.id, undefined, cookie)).status, 204); assert.equal((await fetch(base + a.url, { headers: { cookie } })).status, 404);
});

test('Painel: ferramentas de mensagens pelo próprio servidor', async () => {
  const cookie = await login();
  const st = await (await api('POST', '/tool/status_conexoes', {}, cookie)).json(); assert.equal(st.whatsapp.configurado, true);
  const l = await (await api('POST', '/tool/listar_conversas', { limite: 10 }, cookie)).json(); assert.ok(l.conversas.length >= 2);
  const bad = await api('POST', '/tool/ler_conversa', { conversa_id: 'whatsapp:000' }, cookie); assert.equal(bad.status, 422); assert.deepEqual(await bad.json(), { erro: 'Conversa não encontrada.' });
  assert.equal((await api('POST', '/tool/listar_conversas', { limite: 'muitos' }, cookie)).status, 422); assert.equal((await api('POST', '/tool/apagar_tudo', {}, cookie)).status, 404);
  assert.equal((await api('POST', '/tool/status_conexoes', {})).status, 401);
});

test('Painel: sem PAINEL_SENHA fica desativado; senha errada repetida bloqueia o endereço', async () => {
  const mk = async (env) => { const a = createApp({ cfg: loadConfig({ MCP_SECRET: SECRET, AUTH_FAILURES_LIMIT: '4', ...env }), repo: makeRepo({ q: (s, p) => pg.query(s, p) }), fetchImpl: fakeFetch, log: { error() {}, warn() {} } }); const s = a.listen(0); await new Promise(r => s.once('listening', r)); return [s, `http://127.0.0.1:${s.address().port}`]; };
  const [s1, b1] = await mk({}); const [s2, b2] = await mk({ PAINEL_SENHA: 'curta' }); const [s3, b3] = await mk({ PAINEL_SENHA: 'uma-senha-bem-grande' });
  for (const b of [b1, b2]) { const r = await fetch(b + '/painel/api/login', { method: 'POST', headers: H, body: JSON.stringify({ senha: 'curta' }) }); assert.equal(r.status, 503); assert.match((await r.json()).erro, /PAINEL_SENHA/); }
  const tryLogin = (senha) => fetch(b3 + '/painel/api/login', { method: 'POST', headers: { ...H, 'cf-connecting-ip': '203.0.113.77' }, body: JSON.stringify({ senha }) });
  for (let i = 0; i < 4; i++) assert.equal((await tryLogin('chute' + i)).status, 401);
  assert.equal((await tryLogin('uma-senha-bem-grande')).status, 429);
  s1.close(); s2.close(); s3.close();
});

/* ---------- Contas de clientes do site ---------- */
const CH = { 'content-type': 'application/json', 'x-esro': '1' };
const conta = (method, path, body, cookie, extra = {}) => fetch(base + '/api/conta' + path, { method, headers: { ...CH, ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
const cookieFrom = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const novo = (over = {}) => ({ nome: 'Marina Souza', email: 'marina@exemplo.com', telefone: '11 98765-4321', senha: 'caderno-azul-27', aceite: true, ...over });

test('Conta: páginas públicas abrem sem scripts embutidos e o cadastro confere cada campo', async () => {
  for (const p of ['/entrar', '/conta', '/privacidade']) {
    const r = await fetch(base + p); assert.equal(r.status, 200, p); assert.match(r.headers.get('content-security-policy'), /script-src 'self';/);
    const html = await r.text(); assert.ok(!/<script>/.test(html) && !/ on\w+="/.test(html), p + ' sem script embutido');
  }
  assert.equal((await fetch(base + '/conta.js')).status, 200); assert.equal((await fetch(base + '/conta.css')).status, 200);
  const ip = { 'cf-connecting-ip': '198.51.100.10' };
  assert.equal((await fetch(base + '/api/conta/cadastro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(novo()) })).status, 400);   // sem o cabeçalho próprio
  assert.equal((await conta('POST', '/cadastro', novo(), null, { origin: 'https://site-malicioso.example' })).status, 403);
  for (const [over, campo] of [[{ nome: ' ' }, 'nome'], [{ email: 'marina@' }, 'email'], [{ telefone: '1234' }, 'telefone'], [{ senha: 'curta' }, 'senha'], [{ senha: '12345678' }, 'senha'], [{ senha: 'marina@exemplo.com' }, 'senha'], [{ aceite: false }, 'aceite']]) {
    const r = await conta('POST', '/cadastro', novo(over), null, ip); assert.equal(r.status, 422, campo); assert.equal((await r.json()).campo, campo);
  }
  assert.equal((await conta('POST', '/cadastro', novo({ site: 'http://spam' }), null, ip)).status, 400);                     // campo-armadilha preenchido
  assert.equal((await conta('GET', '/eu')).status, 401);
  assert.deepEqual(await (await conta('GET', '/sessao')).json(), { conta: null });
});

test('Conta: cadastro cria login e ficha no painel; a senha fica só embaralhada', async () => {
  const ip = { 'cf-connecting-ip': '198.51.100.11' };
  const r = await conta('POST', '/cadastro', novo({ email: '  Marina@Exemplo.com ' }), null, ip); assert.equal(r.status, 201);
  const sc = r.headers.get('set-cookie'); assert.match(sc, /^esro_cli=/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  assert.deepEqual((await r.json()).conta.telefone, '(11) 98765-4321');
  const cookie = cookieFrom(r);
  const me = await (await conta('GET', '/eu', null, cookie)).json(); assert.equal(me.conta.email, 'marina@exemplo.com'); assert.equal(me.conta.nome, 'Marina Souza');
  assert.equal(Object.keys(me.conta).sort().join(), 'desde,email,nome,telefone');
  const row = (await pg.query(`SELECT * FROM site_users WHERE email = 'marina@exemplo.com'`)).rows[0];
  assert.match(row.pass_hash, /^scrypt\$15\$8\$1\$/); assert.ok(!JSON.stringify(row).includes('caderno-azul-27'));
  const ficha = (await pg.query(`SELECT data FROM panel_docs WHERE col = 'clients' AND id = $1`, [row.client_id])).rows[0].data;
  assert.equal(ficha.origin, 'site'); assert.equal(ficha.siteUser, row.id); assert.equal(ficha.phone, '(11) 98765-4321'); assert.equal(ficha.stage, 'info');
  const dup = await conta('POST', '/cadastro', novo({ senha: 'outra-senha-99' }), null, ip); assert.equal(dup.status, 409); assert.equal((await dup.json()).campo, 'email');
  assert.equal((await conta('GET', '/eu', null, cookie.slice(0, -4) + 'abcd')).status, 401);                                // sessão adulterada
});

test('Conta: entrar, sair, mensagem igual para e-mail inexistente e senha errada', async () => {
  const ip = { 'cf-connecting-ip': '198.51.100.12' };
  const a = await conta('POST', '/entrar', { email: 'marina@exemplo.com', senha: 'errada-errada' }, null, ip);
  const b = await conta('POST', '/entrar', { email: 'ninguem@exemplo.com', senha: 'errada-errada' }, null, ip);
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.deepEqual(await a.json(), await b.json());
  const ok = await conta('POST', '/entrar', { email: 'MARINA@exemplo.com', senha: 'caderno-azul-27' }, null, ip); assert.equal(ok.status, 200);
  const cookie = cookieFrom(ok);
  assert.equal((await (await conta('GET', '/sessao', null, cookie)).json()).conta.nome, 'Marina Souza');
  const out = await conta('POST', '/sair', {}, cookie); assert.equal(out.status, 204); assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('Conta: o cliente só vê os próprios pedidos; dados alterados vão para a ficha', async () => {
  const ip = { 'cf-connecting-ip': '198.51.100.13' };
  const cookie = cookieFrom(await conta('POST', '/entrar', { email: 'marina@exemplo.com', senha: 'caderno-azul-27' }, null, ip));
  const row = (await pg.query(`SELECT * FROM site_users WHERE email = 'marina@exemplo.com'`)).rows[0];
  const adm = await login();
  await api('PUT', '/db/orders/pm1', { num: 2001, at: '2026-10-01T12:00:00.000Z', client: 'Marina Souza', clientId: row.client_id, item: 'Planner personalizado', qty: 2, value: 150, status: 'producao', payS: 'Sinal pago', due: '2026-10-20', note: 'anotação interna' }, adm);
  await api('PUT', '/db/orders/pm2', { num: 2002, at: '2026-10-02T12:00:00.000Z', client: 'Outra Pessoa', clientId: 'cli_outra', item: 'Agenda', value: 60, status: 'novo' }, adm);
  await api('PUT', '/db/orders/pm3', { num: 2003, at: '2026-10-03T12:00:00.000Z', client: 'Marina Souza', contact: '(11) 98765-4321', item: 'Sem vínculo', value: 10, status: 'novo' }, adm);   // mesmo telefone, sem vínculo: não aparece
  const { pedidos } = await (await conta('GET', '/pedidos', null, cookie)).json();
  assert.equal(pedidos.length, 1);
  assert.deepEqual(pedidos[0], { numero: 2001, data: '2026-10-01T12:00:00.000Z', item: 'Planner personalizado', quantidade: 2, valor: 150, status: 'producao', statusNome: 'Em produção', entrega: '2026-10-20', pagamento: 'Sinal pago' });
  assert.equal((await conta('GET', '/pedidos')).status, 401);
  const bad = await conta('PATCH', '/eu', { nome: 'Marina S. Lima', telefone: '99' }, cookie); assert.equal(bad.status, 422);
  const up = await conta('PATCH', '/eu', { nome: 'Marina S. Lima', telefone: '(21) 3333-4444' }, cookie); assert.equal((await up.json()).conta.telefone, '(21) 3333-4444');
  const ficha = (await pg.query(`SELECT data FROM panel_docs WHERE col = 'clients' AND id = $1`, [row.client_id])).rows[0].data;
  assert.equal(ficha.name, 'Marina S. Lima'); assert.equal(ficha.phone, '(21) 3333-4444'); assert.equal(ficha.siteUser, row.id); assert.match(ficha.notes.at(-1).text, /Atualizou/);
});

test('Conta: trocar a senha encerra as outras sessões; link de senha nova é do painel, de uso único', async () => {
  const ip = { 'cf-connecting-ip': '198.51.100.14' };
  const enter = async (senha) => conta('POST', '/entrar', { email: 'marina@exemplo.com', senha }, null, ip);
  const c1 = cookieFrom(await enter('caderno-azul-27')), c2 = cookieFrom(await enter('caderno-azul-27'));
  assert.equal((await conta('POST', '/senha', { atual: 'errada-errada', nova: 'lapis-verde-88' }, c1, ip)).status, 422);
  assert.equal((await conta('POST', '/senha', { atual: 'caderno-azul-27', nova: 'curta' }, c1, ip)).status, 422);
  const ch = await conta('POST', '/senha', { atual: 'caderno-azul-27', nova: 'lapis-verde-88' }, c1, ip); assert.equal(ch.status, 200);
  assert.equal((await conta('GET', '/eu', null, c2)).status, 401); assert.equal((await conta('GET', '/eu', null, c1)).status, 401);
  assert.equal((await conta('GET', '/eu', null, cookieFrom(ch))).status, 200);
  assert.equal((await enter('caderno-azul-27')).status, 401); assert.equal((await enter('lapis-verde-88')).status, 200);

  const row = (await pg.query(`SELECT * FROM site_users WHERE email = 'marina@exemplo.com'`)).rows[0];
  assert.equal((await api('POST', `/contas/${row.client_id}/link-senha`, {})).status, 401);                                 // só com login do painel
  const adm = await login();
  assert.equal((await api('POST', '/contas/cli_inexistente/link-senha', {}, adm)).status, 404);
  const link = await (await api('POST', `/contas/${row.client_id}/link-senha`, {}, adm)).json();
  const token = /\/entrar#nova-senha=([\w-]{40,60})$/.exec(link.url)[1];
  const stored = (await pg.query(`SELECT reset_hash FROM site_users WHERE id = $1`, [row.id])).rows[0].reset_hash;
  assert.ok(stored && stored !== token && !stored.includes(token));                                                         // o banco guarda só o sha256 do código
  assert.equal((await conta('POST', '/nova-senha', { token: 'x'.repeat(43), senha: 'tesoura-rosa-55' }, null, ip)).status, 400);
  assert.equal((await conta('POST', '/nova-senha', { token, senha: 'curta' }, null, ip)).status, 422);
  const rs = await conta('POST', '/nova-senha', { token, senha: 'tesoura-rosa-55' }, null, ip); assert.equal(rs.status, 200); assert.match(rs.headers.get('set-cookie'), /^esro_cli=/);
  assert.equal((await conta('POST', '/nova-senha', { token, senha: 'tesoura-rosa-56' }, null, ip)).status, 400);            // não funciona duas vezes
  assert.equal((await enter('lapis-verde-88')).status, 401); assert.equal((await enter('tesoura-rosa-55')).status, 200);
});

test('Conta: unir com ficha antiga pelo painel e excluir a conta', async () => {
  const ip = { 'cf-connecting-ip': '198.51.100.15' };
  const adm = await login();
  await api('PUT', '/db/clients/cli_antiga', { name: 'Marina (ficha antiga)', phone: '(21) 3333-4444', notes: [] }, adm);
  await api('PUT', '/db/orders/pa1', { num: 1500, at: '2026-08-10T12:00:00.000Z', client: 'Marina', clientId: 'cli_antiga', item: 'Caderno em brochura', value: 40, status: 'concluido', payS: 'Pago' }, adm);
  const row = (await pg.query(`SELECT * FROM site_users WHERE email = 'marina@exemplo.com'`)).rows[0];
  assert.equal((await api('POST', `/contas/${row.client_id}/mover`, { para: 'cli_nao_existe' }, adm)).status, 422);
  assert.equal((await api('POST', `/contas/${row.client_id}/mover`, { para: 'cli_antiga' }, adm)).status, 200);
  const cookie = cookieFrom(await conta('POST', '/entrar', { email: 'marina@exemplo.com', senha: 'tesoura-rosa-55' }, null, ip));
  const { pedidos } = await (await conta('GET', '/pedidos', null, cookie)).json();
  assert.deepEqual(pedidos.map(p => p.numero), [1500]);
  const antiga = (await pg.query(`SELECT data FROM panel_docs WHERE col = 'clients' AND id = 'cli_antiga'`)).rows[0].data; assert.equal(antiga.siteUser, row.id);

  assert.equal((await conta('POST', '/excluir', { senha: 'errada-errada' }, cookie, ip)).status, 422);
  const del = await conta('POST', '/excluir', { senha: 'tesoura-rosa-55' }, cookie, ip); assert.equal(del.status, 204);
  assert.equal((await conta('GET', '/eu', null, cookie)).status, 401);
  assert.equal((await conta('POST', '/entrar', { email: 'marina@exemplo.com', senha: 'tesoura-rosa-55' }, null, ip)).status, 401);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM site_users`)).rows[0].n, 0);
  const depois = (await pg.query(`SELECT data FROM panel_docs WHERE col = 'clients' AND id = 'cli_antiga'`)).rows[0].data;
  assert.equal(depois.siteUser, null); assert.match(depois.notes.at(-1).text, /Excluiu a conta/);
});

test('Conta: tentativas demais bloqueiam o endereço e o cadastro tem limite por hora', async () => {
  const a = createApp({ cfg: loadConfig({ MCP_SECRET: SECRET, AUTH_FAILURES_LIMIT: '4' }), repo: makeRepo({ q: (s, p) => pg.query(s, p) }), fetchImpl: fakeFetch, log: { error() {}, warn() {} } });
  const s = a.listen(0); await new Promise(r => s.once('listening', r)); const b = `http://127.0.0.1:${s.address().port}`;
  const call = (path, body, ip) => fetch(b + '/api/conta' + path, { method: 'POST', headers: { ...CH, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
  for (let i = 0; i < 4; i++) assert.equal((await call('/entrar', { email: 'alguem@exemplo.com', senha: 'chute-numero-' + i }, '203.0.113.90')).status, 401);
  assert.equal((await call('/entrar', { email: 'alguem@exemplo.com', senha: 'qualquer-coisa' }, '203.0.113.90')).status, 429);
  for (let i = 0; i < 5; i++) assert.equal((await call('/cadastro', novo({ email: `cliente${i}@exemplo.com` }), '203.0.113.91')).status, 201);
  const lim = await call('/cadastro', novo({ email: 'cliente9@exemplo.com' }), '203.0.113.91'); assert.equal(lim.status, 429); assert.ok(Number(lim.headers.get('retry-after')) > 0);
  await pg.query(`DELETE FROM site_users WHERE email LIKE 'cliente%@exemplo.com'`);
  s.close();
});
