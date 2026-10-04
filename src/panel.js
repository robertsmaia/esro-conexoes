// Painel administrativo servido pelo próprio servidor: login por senha, banco de documentos, arquivos e ferramentas.
// O navegador fala com estas rotas pelo arquivo painel/runtime.js, que imita as funções que o painel usava no claude.ai.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from './accounts.js';
import { str } from './util.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PANEL_DIR = path.join(ROOT, 'painel');
export const SITE_DIR = path.join(ROOT, 'site');

const COLS = new Set(['orders', 'leads', 'clients', 'catalog', 'products', 'coupons', 'stock', 'cash', 'accounts', 'settings', 'audit']);
// Níveis de acesso do painel. O dono (senha principal, PAINEL_SENHA) é sempre administrador.
export const ROLES = {
  admin: { nome: 'Administrador', descricao: 'Acesso a tudo, inclusive configurações, loja e usuários.', read: '*', write: '*', tools: true, files: true, monitor: true, contas: true, loja: true, users: true },
  atendimento: { nome: 'Atendimento', descricao: 'Pedidos, clientes, conversas e arquivos. Não vê o caixa nem altera configurações.', read: ['orders', 'leads', 'clients', 'catalog', 'products', 'coupons', 'stock', 'settings'], write: ['orders', 'leads', 'clients', 'audit'], tools: true, files: true, monitor: true, contas: true },
  producao: { nome: 'Produção', descricao: 'Pedidos, arquivos de arte e estoque. Não vê o caixa nem as conversas.', read: ['orders', 'clients', 'catalog', 'products', 'stock', 'settings'], write: ['orders', 'stock', 'audit'], files: true },
  financeiro: { nome: 'Financeiro', descricao: 'Pedidos, caixa, contas e relatórios. Não altera produtos nem configurações.', read: ['orders', 'clients', 'catalog', 'products', 'coupons', 'cash', 'accounts', 'settings'], write: ['orders', 'cash', 'accounts', 'audit'], monitor: true },
};
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const cleanName = (s) => str(s).normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const WEAK = new Set(['1234567890', '0123456789', 'senha12345', 'esro123456', 'qwertyuiop', 'password123']);
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const MAX_DOC = 256 * 1024, MAX_ASSET = 8 * 1024 * 1024, MAX_STORAGE = 300 * 1024 * 1024;
const ASSET_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'text/csv', 'text/plain', 'text/markdown', 'application/json']);
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);
const COOKIE = 'esro_sess';

export const PANEL_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export const SITE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res(k)));
const cookieOf = (req) => { for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim(); } return ''; };

export function mountPanel(app, { cfg, repo, tools, log, guard, accounts, store, shop }) {
  const password = cfg.panel?.password || '';
  const enabled = password.length >= 10;
  const salt = crypto.createHash('sha256').update('esro-painel|' + cfg.mcpSecret).digest();
  const pwKey = enabled ? crypto.scryptSync(password, salt, 32) : null;
  // A chave das sessões depende da senha e do MCP_SECRET: trocar qualquer um dos dois encerra todas as sessões.
  const sessKey = enabled ? crypto.createHmac('sha256', cfg.mcpSecret).update(Buffer.concat([Buffer.from('sessao'), pwKey])).digest() : null;
  const days = cfg.panel?.sessionDays || 30;
  const OWNER = { id: 'dono', login: 'dono', name: 'Dono', role: 'admin', owner: true };
  const dummyHash = hashPassword(crypto.randomBytes(12).toString('hex'));   // para gastar o mesmo tempo quando o usuário não existe

  const sign = (body) => crypto.createHmac('sha256', sessKey).update(body).digest('base64url');
  const newToken = (uid, ver) => { const body = `${Date.now() + days * 864e5}.${crypto.randomBytes(12).toString('base64url')}.${uid}.${ver}`; return `${body}.${sign(body)}`; };
  // Usuários guardados por 10 s, para não consultar o banco a cada clique.
  const seen = new Map();
  const userById = async (id) => { const c = seen.get(id); if (c && Date.now() - c.at < 10e3) return c.u; const u = await repo.puById(id); seen.set(id, { u, at: Date.now() }); return u; };
  async function who(req) {
    const t = cookieOf(req), i = t.lastIndexOf('.'); if (!enabled || i < 0) return null;
    const body = t.slice(0, i), mac = Buffer.from(t.slice(i + 1)), good = Buffer.from(sign(body));
    if (mac.length !== good.length || !crypto.timingSafeEqual(mac, good)) return null;
    const [exp, , uid, ver] = body.split('.');
    if (!(Number(exp) > Date.now())) return null;
    if (uid === undefined || uid === 'dono') return OWNER;   // sessões abertas antes dos usuários do painel são do dono
    const u = await userById(uid);
    return u && u.active && String(u.session_ver) === ver && Object.hasOwn(ROLES, u.role) ? { id: u.id, login: u.login, name: u.name, role: u.role, owner: false } : null;
  }
  const setCookie = (req, res, value, maxAge) => res.append('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${req.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`);
  const perm = (u) => ROLES[u.role];
  const allows = (list, col) => list === '*' || list.includes(col);
  const can = (flag) => (req, res, next) => perm(req.user)[flag] ? next() : res.status(403).json({ erro: 'O seu nível de acesso não permite esta ação.' });

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
    const typed = str(req.body?.senha), login = str(req.body?.usuario).trim().toLowerCase().slice(0, 40);
    const wrong = async () => { guard.failed(req); await new Promise(r => setTimeout(r, 400)); res.status(401).json({ erro: login ? 'Usuário ou senha incorretos.' : 'Senha incorreta.' }); };
    if (!typed || typed.length > 200) return wrong();
    if (!login || login === 'dono') {
      if (!crypto.timingSafeEqual(await scrypt(typed, salt), pwKey)) return wrong();
      setCookie(req, res, newToken('dono', 0), days * 86400); return res.status(204).end();
    }
    const u = LOGIN_RE.test(login) ? await repo.puByLogin(login) : null;
    const ok = await verifyPassword(typed.slice(0, 128), u ? u.pass_hash : await dummyHash) && !!u && u.active && Object.hasOwn(ROLES, u.role);
    if (!ok) return wrong();
    await repo.puTouch(u.id);
    setCookie(req, res, newToken(u.id, u.session_ver), days * 86400); res.status(204).end();
  });
  api.post('/logout', (req, res) => { setCookie(req, res, '', 0); res.status(204).end(); });

  api.use(async (req, res, next) => { const u = await who(req); if (!u) return res.status(401).json({ erro: 'Entre com a senha do painel.' }); req.user = u; next(); });
  api.get('/me', (req, res) => { const u = req.user, p = perm(u);
    res.json({ ok: true, usuario: { id: u.id, usuario: u.login, nome: u.name, nivel: u.role, nivelNome: p.nome, dono: u.owner },
      pode: { ler: p.read, alterar: p.write, mensagens: !!p.tools, arquivos: !!p.files, monitor: !!p.monitor, contas: !!p.contas, loja: !!p.loja, usuarios: !!p.users } }); });

  // Usuários do painel (só administradores)
  const uOut = (u) => ({ id: u.id, usuario: u.login, nome: u.name, nivel: u.role, nivelNome: Object.hasOwn(ROLES, u.role) ? ROLES[u.role].nome : u.role, ativo: u.active, criadoEm: u.created_at, ultimoAcesso: u.last_login_at });
  const pwCheck = (v, login) => { const s = str(v);
    if (s.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.'; if (s.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
    if (WEAK.has(s.toLowerCase()) || /^(.)\1+$/.test(s) || s.toLowerCase() === login) return 'Essa senha é fácil de adivinhar. Escolha outra.'; return ''; };
  api.get('/usuarios', can('users'), async (_req, res) => res.json({ usuarios: (await repo.puList()).map(uOut), niveis: Object.entries(ROLES).map(([id, r]) => ({ id, nome: r.nome, descricao: r.descricao })) }));
  api.post('/usuarios', can('users'), async (req, res) => {
    const b = req.body || {}, login = str(b.usuario).trim().toLowerCase(), name = cleanName(b.nome), role = str(b.nivel);
    if (!LOGIN_RE.test(login) || login === 'dono') return res.status(422).json({ campo: 'usuario', erro: 'O usuário precisa ter de 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado (ex.: ana.atendimento).' });
    if (name.length < 2) return res.status(422).json({ campo: 'nome', erro: 'Escreva o nome da pessoa.' });
    if (!Object.hasOwn(ROLES, role)) return res.status(422).json({ campo: 'nivel', erro: 'Escolha o nível de acesso.' });
    const bad = pwCheck(b.senha, login); if (bad) return res.status(422).json({ campo: 'senha', erro: bad });
    if ((await repo.puList()).length >= 20) return res.status(422).json({ erro: 'O painel aceita até 20 usuários.' });
    const id = 'pu_' + crypto.randomBytes(9).toString('hex');
    if (!await repo.puCreate({ id, login, name, role, passHash: await hashPassword(str(b.senha)) })) return res.status(409).json({ campo: 'usuario', erro: 'Já existe um usuário com este nome de acesso.' });
    res.status(201).json({ usuario: uOut(await repo.puById(id)) });
  });
  const target = async (req, res) => { const u = /^pu_[a-f0-9]{18}$/.test(req.params.id) ? await repo.puById(req.params.id) : null; if (!u) res.status(404).json({ erro: 'Usuário não encontrado.' }); return u; };
  api.patch('/usuarios/:id', can('users'), async (req, res) => {
    const u = await target(req, res); if (!u) return; const b = req.body || {};
    const name = b.nome === undefined ? u.name : cleanName(b.nome), role = b.nivel === undefined ? u.role : str(b.nivel), active = b.ativo === undefined ? u.active : b.ativo === true;
    if (name.length < 2) return res.status(422).json({ campo: 'nome', erro: 'Escreva o nome da pessoa.' });
    if (!Object.hasOwn(ROLES, role)) return res.status(422).json({ campo: 'nivel', erro: 'Escolha o nível de acesso.' });
    if (u.id === req.user.id && (role !== u.role || !active)) return res.status(422).json({ erro: 'Você não pode mudar o seu próprio nível nem desativar o seu próprio acesso.' });
    const nu = await repo.puUpdate(u.id, { name, role, active }); seen.delete(u.id);
    res.json({ usuario: uOut({ ...u, ...nu }) });
  });
  api.post('/usuarios/:id/senha', can('users'), async (req, res) => {
    const u = await target(req, res); if (!u) return;
    const bad = pwCheck(req.body?.senha, u.login); if (bad) return res.status(422).json({ campo: 'senha', erro: bad });
    await repo.puSetPass(u.id, await hashPassword(str(req.body?.senha))); seen.delete(u.id);   // encerra as sessões abertas dessa pessoa
    res.json({ ok: true });
  });
  api.delete('/usuarios/:id', can('users'), async (req, res) => {
    const u = await target(req, res); if (!u) return;
    if (u.id === req.user.id) return res.status(422).json({ erro: 'Você não pode excluir o seu próprio acesso.' });
    await repo.puDelete(u.id); seen.delete(u.id); res.status(204).end();
  });
  // Cada pessoa troca a própria senha (a senha principal do dono é trocada no Render, em PAINEL_SENHA).
  api.post('/minha-senha', async (req, res) => {
    if (req.user.owner) return res.status(422).json({ erro: 'A senha principal é trocada no Render, na variável PAINEL_SENHA.' });
    if (guard.locked(req)) return guard.tooMany(req, res);
    const u = await repo.puById(req.user.id);
    if (!u || !await verifyPassword(str(req.body?.atual).slice(0, 128), u.pass_hash)) { guard.failed(req); return res.status(422).json({ campo: 'atual', erro: 'A senha atual não confere.' }); }
    const bad = pwCheck(req.body?.nova, u.login); if (bad) return res.status(422).json({ campo: 'nova', erro: bad });
    const nu = await repo.puSetPass(u.id, await hashPassword(str(req.body?.nova))); seen.delete(u.id);
    setCookie(req, res, newToken(nu.id, nu.session_ver), days * 86400); res.json({ ok: true });   // os outros aparelhos saem; este continua
  });

  // Banco de documentos (cada nível só recebe e só altera as coleções que pode)
  api.get('/sync', async (req, res) => {
    const after = Math.max(0, Math.floor(Number(req.query.after) || 0)), read = perm(req.user).read;
    const { seq, rows } = await repo.docsSince(after);
    res.json({ seq, docs: rows.filter(r => allows(read, r.col)).map(r => ({ col: r.col, id: r.id, del: r.deleted || undefined, data: r.deleted ? undefined : r.data })) });
  });
  const docParams = (req, res) => {
    const { col, id } = req.params; const body = req.body;
    if (!COLS.has(col) || !ID_RE.test(id)) { res.status(400).json({ erro: 'Coleção ou código inválido.' }); return null; }
    // O registro de atividades só recebe linhas novas: quem não é administrador não altera nem apaga o histórico.
    if (!allows(perm(req.user).write, col) || (col === 'audit' && req.method !== 'PUT' && req.user.role !== 'admin')) { res.status(403).json({ erro: 'O seu nível de acesso não permite alterar isto.' }); return null; }
    if (req.method !== 'DELETE') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) { res.status(400).json({ erro: 'Envie um objeto.' }); return null; }
      if ((req.rawBody?.length || 0) > MAX_DOC) { res.status(413).json({ erro: 'Registro grande demais.' }); return null; }
    }
    return { col, id, body };
  };
  // Depois de gravar: o site passa a mostrar na hora o que mudou na loja, e o cliente é avisado por e-mail quando o pedido é pago ou enviado.
  const after = (req, p, prev, data) => {
    if (p.col === 'products' || p.col === 'coupons' || p.col === 'settings' || p.col === 'catalog') shop?.invalidate();
    if (p.col === 'orders' && data) shop?.orderChanged(p.id, prev, data, req).catch(e => log.error('[painel] aviso do pedido não enviado:', e?.message || e));
  };
  const before = (p) => p.col === 'orders' ? repo.docGet('orders', p.id) : null;
  api.put('/db/:col/:id', async (req, res) => { const p = docParams(req, res); if (!p) return;
    if (p.col === 'audit') {   // linha nova do registro: nunca substitui uma que já existe, e leva o usuário e a hora do servidor
      if (req.user.role !== 'admin' && await repo.docGet('audit', p.id)) return res.status(403).json({ erro: 'O registro de atividades não pode ser alterado.' });
      p.body = { ...p.body, uid: req.user.login, at: new Date().toISOString() };
    }
    const prev = await before(p), r = await repo.docSet(p.col, p.id, p.body); after(req, p, prev, r.data); res.json(r); });
  api.patch('/db/:col/:id', async (req, res) => { const p = docParams(req, res); if (!p) return; const prev = await before(p), r = await repo.docMerge(p.col, p.id, p.body); after(req, p, prev, r.data); res.json(r); });
  api.delete('/db/:col/:id', async (req, res) => { const p = docParams(req, res); if (!p) return; const prev = await before(p), r = await repo.docDelete(p.col, p.id); after(req, p, null, null);
    if (p.col === 'orders' && prev) shop?.orderDeleted(p.id, prev).catch(e => log.error('[painel] estoque do pedido excluído não devolvido:', e?.message || e));   // compra do site excluída sem pagamento: o estoque reservado volta
    res.json(r); });

  // Arquivos (artes e briefings)
  api.post('/assets', can('files'), express.raw({ type: () => true, limit: MAX_ASSET }), async (req, res) => {
    const type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ASSET_TYPES.has(type)) return res.status(415).json({ erro: 'Formato não aceito.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ erro: 'Arquivo vazio.' });
    if (await repo.assetTotal() + req.body.length > MAX_STORAGE) return res.status(507).json({ erro: 'Armazenamento de arquivos cheio.' });
    const id = crypto.randomBytes(12).toString('hex');
    await repo.assetPut({ id, name: String(req.query.name || 'arquivo').slice(0, 200), type, data: req.body });
    res.status(201).json({ id, url: '/_blob/' + id, contentType: type, sizeBytes: req.body.length });
  });
  api.get('/assets', can('files'), async (_req, res) => { const assets = await repo.assetList(); res.json({ assets, usage: { bytes: assets.reduce((a, x) => a + x.sizeBytes, 0), limit: MAX_STORAGE } }); });
  api.delete('/assets/:id', can('files'), async (req, res) => { await repo.assetDelete(String(req.params.id)); res.status(204).end(); });

  // Ferramentas de mensagens e pedidos do site (as mesmas do conector)
  api.post('/tool/:name', can('tools'), async (req, res) => {
    const t = Object.hasOwn(tools, req.params.name) ? tools[req.params.name] : null; if (!t) return res.status(404).json({ erro: 'Ferramenta desconhecida.' });
    const parsed = z.object(t.input).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ erro: 'Dados inválidos para esta ação.' });
    try { res.json(await t.run(parsed.data)); }
    catch (e) { if (e?.toolMessage) return res.status(422).json({ erro: e.toolMessage }); log.error('[painel] ferramenta', req.params.name, e?.message || e); res.status(500).json({ erro: 'Erro interno.' }); }
  });
  api.use('/contas', can('contas')); accounts?.adminRoutes(api);                      // contas de clientes do site: link de nova senha e união de fichas
  api.use(['/monitor', '/redes'], can('monitor')); store?.adminRoutes(api);           // números do site, do atendimento e das redes para a tela Monitoramento
  api.use('/loja', can('loja')); shop?.adminRoutes(api);                              // situação das integrações da loja e e-mail de teste
  app.use('/painel/api', api);

  // Arquivos enviados: só com login, e nunca executados como página.
  app.get('/_blob/:id', async (req, res) => {
    const viewer = await who(req); if (!viewer) return res.status(401).json({ erro: 'Entre com a senha do painel.' });
    if (!perm(viewer).files) return res.status(403).json({ erro: 'O seu nível de acesso não permite abrir arquivos.' });
    const a = /^[a-f0-9]{24}$/.test(req.params.id) ? await repo.assetGet(req.params.id) : null;
    if (!a) return res.status(404).json({ erro: 'não encontrado' });
    const safeName = String(a.name || 'arquivo').replace(/[^\w.\- ]/g, '_');
    res.set({ 'Content-Type': a.type, 'Content-Length': String(a.data.length), 'Content-Disposition': `${INLINE_TYPES.has(a.type) ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex, nofollow' });
    res.end(a.data);
  });

  return { enabled };
}
