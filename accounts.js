// Contas de clientes do site: cadastro, login, "minha conta" e troca de senha.
// As telas ficam em site/entrar.html e site/conta.html e falam com estas rotas em /api/conta.
// A senha nunca é guardada: fica só o resultado do scrypt, com um sal diferente para cada conta.
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { SITE_DIR } from './panel.js';
import { pixPayload, paidOf, dueOf } from './pix.js';
import { templates } from './mail.js';
import { siteBase, str } from './util.js';

const COOKIE = 'esro_cli';
const SESSION_DAYS = 30;
const RESET_MINUTES = 120;
const SCRYPT = { N: 32768, r: 8, p: 1 };          // ~32 MB e ~0,1 s por senha
const STATUS = { novo: 'Recebido', orcamento: 'Orçamento enviado', producao: 'Em produção', arte: 'Aguardando sua aprovação da arte', enviado: 'Enviado', concluido: 'Concluído' };
const WEAK = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'password', 'senha123', 'senha1234', 'qwertyui', 'qwerty123', 'abcd1234', 'abc12345', 'esro1234', '12341234', 'iloveyou']);

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');   // caracteres invisíveis e de controle
const clean = (s, max) => str(s).normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cookieOf = (req) => { for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim(); } return ''; };

// No máximo dois cálculos de senha ao mesmo tempo, para caber na memória do plano gratuito.
function limiter(max) {
  let running = 0; const queue = [];
  const next = () => { if (running < max && queue.length) { running++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => { queue.push(() => fn().then(resolve, reject).finally(() => { running--; next(); })); next(); });
}
const slot = limiter(2);
const scrypt = (pw, salt, o) => slot(() => new Promise((res, rej) => crypto.scrypt(String(pw).normalize('NFKC'), salt, 32, { N: o.N, r: o.r, p: o.p, maxmem: 128 * o.N * o.r * 2 }, (e, k) => e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${Math.log2(SCRYPT.N)}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(await scrypt(pw, salt, SCRYPT))}`;
}
export async function verifyPassword(pw, stored) {
  const m = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([\w-]+)\$([\w-]+)$/.exec(String(stored || ''));
  if (!m || Number(m[1]) > 17) return false;
  const good = Buffer.from(m[5], 'base64url');
  const got = await scrypt(pw, Buffer.from(m[4], 'base64url'), { N: 2 ** Number(m[1]), r: Number(m[2]), p: Number(m[3]) });
  return got.length === good.length && crypto.timingSafeEqual(got, good);
}

// ----- validação dos campos -----
const fail = (campo, erro) => ({ campo, erro });
export function checkName(v) { const s = clean(v, 80); return s.length >= 2 && /\p{L}/u.test(s) ? { value: s } : fail('nome', 'Escreva o seu nome.'); }
export function checkEmail(v) {
  const s = str(v).trim().toLowerCase();
  return s.length <= 120 && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? { value: s } : fail('email', 'Confira o e-mail: ele precisa ter o formato nome@exemplo.com.');
}
export function checkPhone(v) {
  let d = str(v).replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (!(d.length === 10 || d.length === 11) || d[0] === '0') return fail('telefone', 'Escreva o WhatsApp com DDD, por exemplo (11) 99999-0000.');
  const n = d.length - 6;
  return { value: `(${d.slice(0, 2)}) ${d.slice(2, 2 + n)}-${d.slice(2 + n)}` };
}
export function checkPassword(v, email, campo = 'senha') {
  const s = str(v);
  if (s.length < 8) return fail(campo, 'A senha precisa ter pelo menos 8 caracteres.');
  if (s.length > 128) return fail(campo, 'A senha pode ter no máximo 128 caracteres.');
  const low = s.toLowerCase();
  if (WEAK.has(low) || /^(.)\1+$/.test(s) || (email && (low === email || low === email.split('@')[0]))) return fail(campo, 'Essa senha é fácil de adivinhar. Escolha outra.');
  return { value: s };
}

export function makeAccounts({ cfg, repo, log = console, guard, clientIp, counter, mailer }) {
  const sessKey = crypto.createHmac('sha256', cfg.mcpSecret).update('esro-conta-cliente').digest();
  const signups = counter(3600e3), signupsDay = counter(24 * 3600e3), emailFails = counter(15 * 60e3), forgotIp = counter(3600e3), forgotMail = counter(3600e3);
  const MAX_SIGNUPS_IP = cfg.accounts?.signupsPerHour || 5, MAX_SIGNUPS_DAY = cfg.accounts?.signupsPerDay || 300, MAX_EMAIL_FAILS = 10;
  const dummyHash = hashPassword(crypto.randomBytes(12).toString('hex'));   // para gastar o mesmo tempo quando o e-mail não existe

  const sign = (body) => crypto.createHmac('sha256', sessKey).update(body).digest('base64url');
  const tokenFor = (u) => { const body = `${u.id}.${u.session_ver}.${Date.now() + SESSION_DAYS * 864e5}`; return `${body}.${sign(body)}`; };
  const setCookie = (req, res, value, maxAge) => res.append('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`);
  const startSession = (req, res, u) => setCookie(req, res, tokenFor(u), SESSION_DAYS * 86400);
  async function current(req) {
    const t = cookieOf(req), i = t.lastIndexOf('.'); if (i < 0) return null;
    const body = t.slice(0, i), mac = Buffer.from(t.slice(i + 1)), good = Buffer.from(sign(body));
    if (mac.length !== good.length || !crypto.timingSafeEqual(mac, good)) return null;
    const [id, ver, exp] = body.split('.');
    if (!(Number(exp) > Date.now())) return null;
    const u = await repo.userById(id);
    return u && String(u.session_ver) === ver ? u : null;
  }
  const out = (u) => ({ nome: u.name, email: u.email, telefone: u.phone, desde: u.created_at });
  const bad = (res, v, status = 422) => res.status(status).json({ erro: v.erro, campo: v.campo });
  const tooMany = (res, seconds) => res.status(429).set('Retry-After', String(seconds)).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });

  // Ficha em "Clientes" no painel. Nunca se liga sozinha a uma ficha que já existia: o e-mail não é confirmado,
  // então ligar pelo e-mail ou telefone deixaria um estranho ver os pedidos de outra pessoa.
  async function createClientDoc(u) {
    const now = new Date().toISOString();
    await repo.docSet('clients', u.client_id, { name: u.name, phone: u.phone, ig: '', email: u.email, city: '', origin: 'site', originNote: 'Cadastro no site', stage: 'info', interest: '',
      follow: false, followAt: '', followWhy: '', notes: [{ at: now, text: 'Criou conta no site.' }], at: now, updatedAt: now, lastAt: now, siteUser: u.id });
  }
  async function noteOnClient(u, text, patch = {}) {
    if (!u.client_id) return;
    const doc = await repo.docGet('clients', u.client_id); if (!doc) return;
    const now = new Date().toISOString();
    await repo.docMerge('clients', u.client_id, { ...patch, updatedAt: now, notes: [...(Array.isArray(doc.notes) ? doc.notes : []), { at: now, text }].slice(-200) });
  }

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    // Proteção contra chamadas forjadas por outros sites: cabeçalho próprio + origem igual à do site.
    if (req.get('x-esro') !== '1') return res.status(400).json({ erro: 'Requisição inválida.' });
    const origin = req.get('origin'); if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ erro: 'Origem não permitida.' }); } catch { return res.status(403).json({ erro: 'Origem não permitida.' }); } }
    next();
  });

  api.post('/cadastro', async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {}, ip = clientIp(req);
    if (b.site) return res.status(400).json({ erro: 'Não foi possível criar a conta.' });          // campo-armadilha: só robôs preenchem
    if (signups.count(ip) >= MAX_SIGNUPS_IP) return tooMany(res, signups.retryAfter(ip));
    if (signupsDay.count('todos') >= MAX_SIGNUPS_DAY) return res.status(503).json({ erro: 'O cadastro está temporariamente indisponível. Fale com a ESRO pelo WhatsApp.' });
    const nome = checkName(b.nome); if (nome.erro) return bad(res, nome);
    const email = checkEmail(b.email); if (email.erro) return bad(res, email);
    const tel = checkPhone(b.telefone); if (tel.erro) return bad(res, tel);
    const senha = checkPassword(b.senha, email.value); if (senha.erro) return bad(res, senha);
    if (b.aceite !== true) return bad(res, { campo: 'aceite', erro: 'Para criar a conta é preciso aceitar a Política de Privacidade.' });
    signups.add(ip); signupsDay.add('todos');
    const exists = { campo: 'email', erro: 'Já existe uma conta com este e-mail. Use "Entrar".' };
    if (await repo.userByEmail(email.value)) return bad(res, exists, 409);
    const u = await repo.userCreate({ id: 'u_' + crypto.randomBytes(12).toString('hex'), email: email.value, name: nome.value, phone: tel.value,
      passHash: await hashPassword(senha.value), clientId: 'cli_site_' + crypto.randomBytes(9).toString('hex') });
    if (!u) return bad(res, exists, 409);
    try { await createClientDoc(u); } catch (e) { log.error('[conta] ficha do cliente não criada:', e?.message || e); }
    startSession(req, res, u); res.status(201).json({ conta: out(u) });
  });

  api.post('/entrar', async (req, res) => {
    if (guard.locked(req)) return guard.tooMany(req, res);
    const email = str(req.body?.email).trim().toLowerCase().slice(0, 120), senha = str(req.body?.senha);
    if (emailFails.count(email) >= MAX_EMAIL_FAILS) return tooMany(res, emailFails.retryAfter(email));
    const u = email ? await repo.userByEmail(email) : null;
    const ok = senha.length > 0 && senha.length <= 128 && await verifyPassword(senha, u ? u.pass_hash : await dummyHash) && !!u;
    if (!ok) { guard.failed(req); if (email) emailFails.add(email); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    await repo.userTouchLogin(u.id);
    startSession(req, res, u); res.json({ conta: out(u) });
  });

  api.post('/sair', (req, res) => { setCookie(req, res, '', 0); res.status(204).end(); });

  // Usada pelo cabeçalho do site para saber se há alguém conectado (responde 200 nos dois casos).
  api.get('/sessao', async (req, res) => { const u = await current(req); res.json({ conta: u ? out(u) : null }); });

  // "Esqueci minha senha": envia por e-mail um link de uso único. A resposta é a mesma exista ou não a conta, para não revelar quem é cliente.
  api.post('/esqueci', async (req, res) => {
    const ip = clientIp(req);
    if (!mailer?.enabled) return res.status(503).json({ erro: 'O envio de senha por e-mail não está disponível. Peça um link de senha nova à ESRO pelo WhatsApp.' });
    if (forgotIp.add(ip) > 5) return tooMany(res, forgotIp.retryAfter(ip));
    const email = checkEmail(req.body?.email); if (email.erro) return bad(res, email);
    res.json({ ok: true });
    try {
      if (forgotMail.add(email.value) > 3) return;
      const u = await repo.userByEmail(email.value); if (!u) return;
      const token = crypto.randomBytes(32).toString('base64url');
      await repo.userSetReset(u.id, sha256(token), RESET_MINUTES);
      const base = siteBase(cfg, req); if (!base) return log.error('[conta] e-mail de senha nova não enviado: cadastre PUBLIC_URL no Render.');
      await mailer.send({ to: u.email, toName: u.name, ...templates({ publicUrl: base }).senhaNova(u.name, `${base}/entrar#nova-senha=${token}`, RESET_MINUTES) });
    } catch (e) { log.error('[conta] e-mail de senha nova não enviado:', e?.message || e); }
  });

  // Nova senha pelo link de uso único (enviado por e-mail ou gerado pela ESRO no painel).
  api.post('/nova-senha', async (req, res) => {
    if (guard.locked(req)) return guard.tooMany(req, res);
    const token = str(req.body?.token);
    const u = /^[\w-]{40,60}$/.test(token) ? await repo.userByReset(sha256(token)) : null;
    if (!u) { guard.failed(req); return res.status(400).json({ erro: 'Este link não vale mais. Peça um novo link à ESRO pelo WhatsApp.' }); }
    const senha = checkPassword(req.body?.senha, u.email); if (senha.erro) return bad(res, senha);
    const nu = await repo.userSetPass(u.id, await hashPassword(senha.value));
    startSession(req, res, nu); res.json({ conta: out(nu) });
  });

  api.use(async (req, res, next) => { const u = await current(req); if (!u) return res.status(401).json({ erro: 'Entre na sua conta.' }); req.user = u; next(); });

  api.get('/eu', (req, res) => res.json({ conta: out(req.user) }));

  api.patch('/eu', async (req, res) => {
    const nome = checkName(req.body?.nome); if (nome.erro) return bad(res, nome);
    const tel = checkPhone(req.body?.telefone); if (tel.erro) return bad(res, tel);
    const u = await repo.userUpdate(req.user.id, { name: nome.value, phone: tel.value });
    if (u.client_id && (u.name !== req.user.name || u.phone !== req.user.phone)) {
      try { await noteOnClient(u, 'Atualizou os dados pelo site.', { name: u.name, phone: u.phone }); } catch (e) { log.error('[conta] ficha não atualizada:', e?.message || e); }
    }
    res.json({ conta: out(u) });
  });

  api.post('/senha', async (req, res) => {
    if (guard.locked(req)) return guard.tooMany(req, res);
    if (!await verifyPassword(str(req.body?.atual).slice(0, 128), req.user.pass_hash)) { guard.failed(req); return bad(res, { campo: 'atual', erro: 'A senha atual não confere.' }); }
    const nova = checkPassword(req.body?.nova, req.user.email, 'nova'); if (nova.erro) return bad(res, nova);
    const u = await repo.userSetPass(req.user.id, await hashPassword(nova.value));
    startSession(req, res, u); res.json({ ok: true });   // os outros aparelhos saem; este continua
  });

  api.post('/excluir', async (req, res) => {
    if (guard.locked(req)) return guard.tooMany(req, res);
    if (!await verifyPassword(str(req.body?.senha).slice(0, 128), req.user.pass_hash)) { guard.failed(req); return bad(res, { campo: 'senha', erro: 'A senha não confere.' }); }
    try { await noteOnClient(req.user, 'Excluiu a conta do site.', { siteUser: null }); } catch (e) { log.error('[conta] ficha não atualizada:', e?.message || e); }
    await repo.userDelete(req.user.id);
    setCookie(req, res, '', 0); res.status(204).end();
  });

  // Pedidos da ficha ligada à conta (os que a ESRO registrou no painel para este cliente).
  api.get('/pedidos', async (req, res) => {
    const rows = req.user.client_id ? await repo.ordersOfClient(req.user.client_id) : [];
    const settings = rows.length ? (await repo.docGet('settings', 'store')) || {} : {};
    const pedidos = rows.map(({ data: o }) => {
      const falta = dueOf(o), aberto = STATUS[o.status] !== undefined || !o.status;   // pedido cancelado ou de situação desconhecida não gera cobrança
      // PIX "copia e cola" do valor que falta: o cliente paga pelo app do banco e a ESRO confirma o recebimento no painel.
      const pix = falta > 0 && aberto && o.pay !== 'Mercado Pago' ? pixPayload(settings, falta, 'Pedido ' + (o.num ?? ''), 'ESRO' + (o.num ?? '')) : null;
      return { numero: o.num ?? null, data: o.at || null, item: String(o.item || 'Pedido'), quantidade: Number(o.qty) || 1, valor: Number(o.value) || 0, pago: paidOf(o), falta,
        status: STATUS[o.status] ? o.status : 'novo', statusNome: STATUS[o.status] || STATUS.novo, entrega: o.due || null, pagamento: ['Aguardando', 'Sinal pago', 'Pago'].includes(o.payS) ? o.payS : 'Aguardando',
        pix: pix ? { codigo: pix, valor: falta, favorecido: String(settings.pixName || 'ESRO Papelaria').slice(0, 60) } : null,
        acompanhar: /^[\w-]{40,50}$/.test(String(o.pub || '')) ? '/pedido/' + o.pub : null, rastreio: o.track ? String(o.track).slice(0, 60) : null }; })
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    // Orçamentos pedidos pelo site que a ESRO ainda não transformou em pedido.
    const pend = req.user.client_id ? await repo.siteOrdersOfClient(req.user.client_id) : [];
    const solicitados = pend.map(o => { const its = Array.isArray(o.payload?.itens) ? o.payload.itens : [];
      return { numero: String(o.ext_id), data: new Date(o.received_at).toISOString(), item: its.length === 1 ? String(its[0].nome) : `${its.length} itens: ${its.map(i => i.nome).join(', ')}`.slice(0, 160),
        quantidade: its.length === 1 ? Number(its[0].qtd) || 1 : 1, valor: 0, pago: 0, falta: 0, pix: null, acompanhar: null, rastreio: null, status: 'solicitado', statusNome: 'Orçamento solicitado', entrega: null, pagamento: 'Aguardando' }; });
    res.json({ pedidos: [...solicitados, ...pedidos] });
  });

  return {
    current,   // conta conectada nesta requisição (ou null)
    mount(app, siteHeaders) {
      for (const page of ['entrar', 'conta', 'privacidade']) app.get('/' + page, (_req, res) => { siteHeaders(res); res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(SITE_DIR, page + '.html')); });
      app.use('/api/conta', api);
    },
    // Rotas do painel (já passaram pelo login do painel).
    adminRoutes(panelApi) {
      const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
      const find = async (req, res) => { const u = ID.test(req.params.clientId) ? await repo.userByClient(req.params.clientId) : null; if (!u) res.status(404).json({ erro: 'Este cliente não tem conta no site.' }); return u; };
      panelApi.get('/contas/:clientId', async (req, res) => { const u = await find(req, res); if (u) res.json({ conta: { email: u.email, desde: u.created_at, ultimoAcesso: u.last_login_at } }); });
      panelApi.post('/contas/:clientId/link-senha', async (req, res) => {
        const u = await find(req, res); if (!u) return;
        const token = crypto.randomBytes(32).toString('base64url');
        await repo.userSetReset(u.id, sha256(token), RESET_MINUTES);
        res.json({ url: `${siteBase(cfg, req) || 'https://' + (cfg.publicHosts?.[0] || 'www.esro-papelaria.com.br')}/entrar#nova-senha=${token}`, validoPorMinutos: RESET_MINUTES, email: u.email, telefone: u.phone, nome: u.name });
      });
      // Une fichas duplicadas: a conta do site passa a apontar para a ficha que o cliente já tinha.
      panelApi.post('/contas/:clientId/mover', async (req, res) => {
        const u = await find(req, res); if (!u) return;
        const para = str(req.body?.para);
        if (!ID.test(para) || para === u.client_id || !await repo.docGet('clients', para)) return res.status(422).json({ erro: 'Ficha de destino não encontrada.' });
        if (await repo.userByClient(para)) return res.status(409).json({ erro: 'A ficha de destino já tem outra conta do site.' });
        await repo.userSetClient(u.id, para);
        await repo.docMerge('clients', para, { siteUser: u.id, updatedAt: new Date().toISOString() });
        await repo.docMerge('clients', u.client_id, { siteUser: null });
        res.json({ ok: true });
      });
    },
  };
}
