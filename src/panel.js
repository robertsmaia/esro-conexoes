// Painel administrativo servido pelo próprio servidor: login por senha, banco de documentos, arquivos e ferramentas.
// O navegador fala com estas rotas pelo arquivo painel/runtime.js, que imita as funções que o painel usava no claude.ai.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PANEL_DIR = path.join(ROOT, 'painel');
export const SITE_DIR = path.join(ROOT, 'site');

const COLS = new Set(['orders', 'leads', 'clients', 'catalog', 'stock', 'cash', 'accounts', 'settings', 'audit']);
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const MAX_DOC = 256 * 1024, MAX_ASSET = 8 * 1024 * 1024, MAX_STORAGE = 300 * 1024 * 1024;
const ASSET_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'text/csv', 'text/plain', 'text/markdown', 'application/json']);
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);
const COOKIE = 'esro_sess';

export const PANEL_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export const SITE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res(k)));
const cookieOf = (req) => { for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim(); } return ''; };

export function mountPanel(app, { cfg, repo, tools, log, guard, accounts }) {
  const password = cfg.panel?.password || '';
  const enabled = password.length >= 10;
  const salt = crypto.createHash('sha256').update('esro-painel|' + cfg.mcpSecret).digest();
  const pwKey = enabled ? crypto.scryptSync(password, salt, 32) : null;
  // A chave das sessões depende da senha e do MCP_SECRET: trocar qualquer um dos dois encerra todas as sessões.
  const sessKey = enabled ? crypto.createHmac('sha256', cfg.mcpSecret).update(Buffer.concat([Buffer.from('sessao'), pwKey])).digest() : null;
  const days = cfg.panel?.sessionDays || 30;

  const sign = (body) => crypto.createHmac('sha256', sessKey).update(body).digest('base64url');
  const newToken = () => { const body = `${Date.now() + days * 864e5}.${crypto.randomBytes(12).toString('base64url')}`; return `${body}.${sign(body)}`; };
  const validToken = (t) => {
    const i = String(t || '').lastIndexOf('.'); if (!enabled || i < 0) return false;
    const body = t.slice(0, i), mac = Buffer.from(t.slice(i + 1)), good = Buffer.from(sign(body));
    return mac.length === good.length && crypto.timingSafeEqual(mac, good) && Number(body.split('.')[0]) > Date.now();
  };
  const setCookie = (req, res, value, maxAge) => res.append('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${req.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`);
  const authed = (req) => validToken(cookieOf(req));

  // Páginas e arquivos do painel (não contêm dados; os dados só saem pela API, depois do login)
  const pageHeaders = (res) => res.set({ 'Content-Security-Policy': PANEL_CSP, 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow' });
  app.get(['/painel', '/painel/'], (_req, res) => { pageHeaders(res); res.sendFile(path.join(PANEL_DIR, 'index.html')); });
  app.use('/painel', express.static(PANEL_DIR, { index: false, redirect: false, setHeaders: pageHeaders }));

  // ---------- API ----------
  const api = express.Router();
  api.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (!enabled) return res.status(503).json({ erro: 'Painel desativado: defina a variável PAINEL_SENHA (mínimo de 10 caracteres) no Render e faça um novo deploy.' });
    // Proteção contra chamadas forjadas por outros sites: cabeçalho próprio + origem igual à do painel.
    if (req.get('x-esro') !== '1') return res.status(400).json({ erro: 'Requisição inválida.' });
    const origin = req.get('origin'); if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ erro: 'Origem não permitida.' }); } catch { return res.status(403).json({ erro: 'Origem não permitida.' }); } }
    next();
  });

  api.post('/login', async (req, res) => {
    if (guard.locked(req)) return guard.tooMany(req, res);
    const typed = String(req.body?.senha ?? '');
    const ok = typed.length > 0 && typed.length <= 200 && crypto.timingSafeEqual(await scrypt(typed, salt), pwKey);
    if (!ok) { guard.failed(req); await new Promise(r => setTimeout(r, 400)); return res.status(401).json({ erro: 'Senha incorreta.' }); }
    setCookie(req, res, newToken(), days * 86400); res.status(204).end();
  });
  api.post('/logout', (req, res) => { setCookie(req, res, '', 0); res.status(204).end(); });

  api.use((req, res, next) => authed(req) ? next() : res.status(401).json({ erro: 'Entre com a senha do painel.' }));
  api.get('/me', (_req, res) => res.json({ ok: true }));

  // Banco de documentos
  api.get('/sync', async (req, res) => {
    const after = Math.max(0, Math.floor(Number(req.query.after) || 0));
    const { seq, rows } = await repo.docsSince(after);
    res.json({ seq, docs: rows.map(r => ({ col: r.col, id: r.id, del: r.deleted || undefined, data: r.deleted ? undefined : r.data })) });
  });
  const docParams = (req, res) => {
    const { col, id } = req.params; const body = req.body;
    if (!COLS.has(col) || !ID_RE.test(id)) { res.status(400).json({ erro: 'Coleção ou código inválido.' }); return null; }
    if (req.method !== 'DELETE') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) { res.status(400).json({ erro: 'Envie um objeto.' }); return null; }
      if ((req.rawBody?.length || 0) > MAX_DOC) { res.status(413).json({ erro: 'Registro grande demais.' }); return null; }
    }
    return { col, id, body };
  };
  api.put('/db/:col/:id', async (req, res) => { const p = docParams(req, res); if (!p) return; res.json(await repo.docSet(p.col, p.id, p.body)); });
  api.patch('/db/:col/:id', async (req, res) => { const p = docParams(req, res); if (!p) return; res.json(await repo.docMerge(p.col, p.id, p.body)); });
  api.delete('/db/:col/:id', async (req, res) => { const p = docParams(req, res); if (!p) return; res.json(await repo.docDelete(p.col, p.id)); });

  // Arquivos (artes e briefings)
  api.post('/assets', express.raw({ type: () => true, limit: MAX_ASSET }), async (req, res) => {
    const type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ASSET_TYPES.has(type)) return res.status(415).json({ erro: 'Formato não aceito.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ erro: 'Arquivo vazio.' });
    if (await repo.assetTotal() + req.body.length > MAX_STORAGE) return res.status(507).json({ erro: 'Armazenamento de arquivos cheio.' });
    const id = crypto.randomBytes(12).toString('hex');
    await repo.assetPut({ id, name: String(req.query.name || 'arquivo').slice(0, 200), type, data: req.body });
    res.status(201).json({ id, url: '/_blob/' + id, contentType: type, sizeBytes: req.body.length });
  });
  api.get('/assets', async (_req, res) => { const assets = await repo.assetList(); res.json({ assets, usage: { bytes: assets.reduce((a, x) => a + x.sizeBytes, 0), limit: MAX_STORAGE } }); });
  api.delete('/assets/:id', async (req, res) => { await repo.assetDelete(String(req.params.id)); res.status(204).end(); });

  // Ferramentas de mensagens e pedidos do site (as mesmas do conector)
  api.post('/tool/:name', async (req, res) => {
    const t = tools[req.params.name]; if (!t) return res.status(404).json({ erro: 'Ferramenta desconhecida.' });
    const parsed = z.object(t.input).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ erro: 'Dados inválidos para esta ação.' });
    try { res.json(await t.run(parsed.data)); }
    catch (e) { if (e?.toolMessage) return res.status(422).json({ erro: e.toolMessage }); log.error('[painel] ferramenta', req.params.name, e?.message || e); res.status(500).json({ erro: 'Erro interno.' }); }
  });
  accounts?.adminRoutes(api);   // contas de clientes do site: link de nova senha e união de fichas
  app.use('/painel/api', api);

  // Arquivos enviados: só com login, e nunca executados como página.
  app.get('/_blob/:id', async (req, res) => {
    if (!authed(req)) return res.status(401).json({ erro: 'Entre com a senha do painel.' });
    const a = /^[a-f0-9]{24}$/.test(req.params.id) ? await repo.assetGet(req.params.id) : null;
    if (!a) return res.status(404).json({ erro: 'não encontrado' });
    const safeName = String(a.name || 'arquivo').replace(/[^\w.\- ]/g, '_');
    res.set({ 'Content-Type': a.type, 'Content-Length': String(a.data.length), 'Content-Disposition': `${INLINE_TYPES.has(a.type) ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex, nofollow' });
    res.end(a.data);
  });

  return { enabled };
}
