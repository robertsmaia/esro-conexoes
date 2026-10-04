// Aplicação HTTP: site da ESRO, painel administrativo, webhooks da Meta e do site, e o endpoint MCP (conector do Claude).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifySignature, parseWhatsApp, parseInstagram, sendWhatsApp, sendInstagram, instagramProfile, markWhatsAppRead, ChannelError } from './channels.js';
import { mountPanel, SITE_DIR, SITE_CSP } from './panel.js';
import { makeAccounts } from './accounts.js';
import { makeStore } from './store.js';
import { makeShop } from './shop.js';
import { makeMailer } from './mail.js';

const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };

// Endereço de quem chamou. No Render o tráfego passa pela Cloudflare, que informa o IP real nestes cabeçalhos.
const clientIp = (req) => String(req.get('cf-connecting-ip') || req.get('true-client-ip') || (req.get('x-forwarded-for') || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido');

// Contador simples em memória (janela fixa). Basta para uma instância única, como no plano gratuito do Render.
function counter(windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }, windowMs).unref();
  const get = (key) => { const now = Date.now(); let v = hits.get(key); if (!v || v.reset <= now) { if (hits.size > 20000) hits.clear(); v = { n: 0, reset: now + windowMs }; hits.set(key, v); } return v; };
  return { add: (key) => ++get(key).n, count: (key) => get(key).n, retryAfter: (key) => Math.max(1, Math.ceil((get(key).reset - Date.now()) / 1000)) };
}

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cache-Control': 'no-store',
};

export function createApp({ cfg, repo, fetchImpl = fetch, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  const perMinute = counter(60e3), failures = counter(15 * 60e3);
  const maxPerMinute = cfg.rateLimit?.perMinute || 600, maxFailures = cfg.rateLimit?.authFailures || 10;
  const tooMany = (res, key, c) => res.status(429).set('Retry-After', String(c.retryAfter(key))).json({ erro: 'Muitas tentativas. Aguarde e tente de novo.' });
  // Registra uma tentativa com credencial errada; depois do limite, o endereço fica bloqueado por 15 minutos nas rotas protegidas.
  const authFailed = (req) => { const n = failures.add(clientIp(req)); if (n === maxFailures) log.warn?.(`[segurança] ${clientIp(req)} bloqueado por 15 min após ${n} tentativas com credencial errada`); };
  const locked = (req) => failures.count(clientIp(req)) >= maxFailures;
  const guard = { locked, failed: authFailed, tooMany: (req, res) => tooMany(res, clientIp(req), failures) };

  app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    // O Render já redireciona HTTP para HTTPS; isto garante que nada sensível seja aceito sem criptografia.
    if (req.get('x-forwarded-proto') === 'http') return req.method === 'GET' ? res.redirect(308, `https://${req.get('host')}${req.originalUrl}`) : res.status(400).json({ erro: 'Use HTTPS.' });
    const ip = clientIp(req);
    if (perMinute.add(ip) > maxPerMinute) return tooMany(res, ip, perMinute);
    next();
  });
  const BAD_KEYS = new Set(['toString', 'valueOf', '__proto__', 'constructor', 'prototype']);   // chaves que quebrariam a conversão para texto ou mexeriam no protótipo dos objetos
  const json = express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; }, reviver: (k, v) => (BAD_KEYS.has(k) ? undefined : v) });
  app.use((req, res, next) => req.path === '/painel/api/assets' ? next() : json(req, res, next));   // o envio de arquivos lê o corpo bruto

  const status = () => ({ ok: true, servico: 'ESRO conexões', whatsapp: !!cfg.whatsapp.token, instagram: !!cfg.instagram.token });   // não revela quais integrações de loja estão ligadas
  app.get('/healthz', (_req, res) => res.json(status()));

  // Site público (pasta site/). Sem a pasta, a raiz responde só com o status do servidor.
  const hasSite = fs.existsSync(path.join(SITE_DIR, 'index.html'));
  const siteHeaders = (res) => res.set({ 'Content-Security-Policy': SITE_CSP, 'Cache-Control': 'public, max-age=600', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  app.get('/', (_req, res) => { if (!hasSite) return res.json(status()); siteHeaders(res); res.sendFile(path.join(SITE_DIR, 'index.html')); });
  // Contas de clientes do site: telas /entrar e /conta e as rotas em /api/conta.
  const mailer = makeMailer(cfg, fetchImpl, log);   // e-mails automáticos (só envia se EMAIL_PROVIDER, EMAIL_API_KEY e EMAIL_FROM estiverem cadastrados)
  const accounts = makeAccounts({ cfg, repo, log, guard, clientIp, counter, mailer });
  if (hasSite) accounts.mount(app, siteHeaders);
  // Compra direta: produtos, frete, cupons, pagamento, acompanhamento do pedido e lista de produtos para outros canais.
  const direct = makeShop({ cfg, repo, log, clientIp, counter, accounts, mailer, fetchImpl });
  if (hasSite) direct.mount(app, siteHeaders);
  // Loja: catálogo público, pedido de orçamento, novidades e contagem de visitas (/api/...), mais os números do Monitoramento.
  const shop = makeStore({ cfg, repo, log, clientIp, counter, accounts, shop: direct, mailer, fetchImpl });
  if (hasSite) shop.mount(app);
  if (hasSite) app.use(express.static(SITE_DIR, { index: false, redirect: false, setHeaders: siteHeaders }));

  // Verificação do webhook (Meta chama com hub.challenge ao salvar a URL no painel de desenvolvedor)
  const verify = (token) => (req, res) => {
    if (locked(req)) return tooMany(res, clientIp(req), failures);
    if (req.query['hub.mode'] === 'subscribe' && safeEq(req.query['hub.verify_token'], token)) return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? '').replace(/[^\w.-]/g, '').slice(0, 200));
    authFailed(req); res.sendStatus(403);
  };
  app.get('/webhooks/whatsapp', verify(cfg.whatsapp.verifyToken));
  app.get('/webhooks/instagram', verify(cfg.instagram.verifyToken));

  async function store(msgs, enrich) {
    let n = 0;
    for (const m of msgs) {
      if (!m.peerId || !m.id) continue;
      let extra = {};
      if (enrich) { const c = await repo.getContact(`${m.channel}:${m.peerId}`); if (!c || (!c.username && !c.name)) extra = await enrich(m.peerId); }
      const contactId = await repo.upsertContact({ channel: m.channel, peerId: m.peerId, name: m.name || extra.name, username: extra.username });
      if (await repo.addMessage({ ...m, raw: cfg.storeRaw ? m.raw : null, contactId })) n++;
    }
    return n;
  }

  app.post('/webhooks/whatsapp', async (req, res) => {
    // Meta: assinatura obrigatória. 360dialog não assina; nesse modo vale o token da URL (?token=), se configurado.
    const authentic = cfg.whatsapp.mode === 'meta' ? verifySignature(cfg.whatsapp.appSecret, req.rawBody, req.get('x-hub-signature-256'))
      : (!cfg.whatsapp.webhookToken || safeEq(req.query.token, cfg.whatsapp.webhookToken));
    if (!authentic) return res.sendStatus(401);
    res.sendStatus(200); // a Meta exige resposta rápida; o processamento continua em seguida
    try {
      const { messages, statuses } = parseWhatsApp(req.body);
      await store(messages);
      for (const s of statuses) await repo.setStatus(s.id, s.status);
    } catch (e) { log.error('[whatsapp] falha ao processar webhook:', e); }
  });

  app.post('/webhooks/instagram', async (req, res) => {
    if (!verifySignature(cfg.instagram.appSecret, req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
    res.sendStatus(200);
    try { await store(parseInstagram(req.body).messages, (id) => instagramProfile(cfg, repo, id, fetchImpl)); }
    catch (e) { log.error('[instagram] falha ao processar webhook:', e); }
  });

  // Pedidos do site: o checkout envia um POST com o cabeçalho x-esro-token
  app.post('/webhooks/site', async (req, res) => {
    if (locked(req)) return tooMany(res, clientIp(req), failures);
    if (!cfg.site.token || !safeEq(req.get('x-esro-token'), cfg.site.token)) { authFailed(req); return res.sendStatus(401); }
    const b = req.body || {};
    if (typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ erro: 'Envie um objeto JSON com o pedido.' });
    const extId = String(b.id ?? b.numero ?? b.order_id ?? b.pedido ?? crypto.randomUUID()).slice(0, 200);
    const id = await repo.addSiteOrder(extId, b);
    res.status(id ? 201 : 200).json({ ok: true, id, duplicado: !id });
  });

  const tools = makeTools({ cfg, repo, fetchImpl });

  // MCP (conector do Claude). O segredo vai no caminho, pois conectores sem OAuth não enviam cabeçalhos próprios.
  const mcpAuth = (req, res, next) => {
    const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (locked(req)) return tooMany(res, clientIp(req), failures);
    if (cfg.mcpSecret && (safeEq(req.params.secret, cfg.mcpSecret) || safeEq(bearer, cfg.mcpSecret))) return next();
    authFailed(req); res.status(404).json({ erro: 'não encontrado' });
  };
  app.post('/mcp/:secret', mcpAuth, async (req, res) => {
    const server = buildMcp(tools);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (e) { log.error('[mcp]', e); if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null }); }
  });
  app.all('/mcp/:secret', mcpAuth, (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST.' }, id: null }));

  // Painel administrativo (login próprio) em /painel
  mountPanel(app, { cfg, repo, tools, log, guard, accounts, store: shop, shop: direct });
  app.locals.store = shop; app.locals.shop = direct;

  // Qualquer outro caminho: resposta curta, sem detalhes internos.
  app.use((_req, res) => res.status(404).json({ erro: 'não encontrado' }));
  // Erros (JSON inválido, corpo grande demais, falhas inesperadas): nunca devolve a pilha de erro para quem chamou.
  app.use((err, _req, res, _next) => {
    const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' || err?.status === 400 ? 400 : 500;
    if (status === 500) log.error('[erro]', err?.message || err);
    if (!res.headersSent) res.status(status).json({ erro: status === 413 ? 'Conteúdo grande demais.' : status === 400 ? 'JSON inválido.' : 'Erro interno.' });
  });

  return app;
}

/* ---------- Ferramentas (usadas pelo conector MCP e pelo painel) ---------- */
class ToolFail extends Error { constructor(m) { super(m); this.toolMessage = m; } }

function contactOut(c) {
  const within24h = c.last_in_at ? (Date.now() - new Date(c.last_in_at).getTime()) < 24 * 3600e3 : false;
  return { id: c.id, canal: c.channel, nome: c.name || null, usuario: c.username || null, contato: c.channel === 'whatsapp' ? c.peer_id : (c.username ? '@' + c.username : null),
    ultima_mensagem: c.last_text, ultima_em: c.last_at, nao_lidas: c.unread, pode_responder: within24h };
}

export function makeTools({ cfg, repo, fetchImpl = fetch }) {
  const RO = { readOnlyHint: true }, RW = { readOnlyHint: false, destructiveHint: false };
  const contact = async (id) => { const c = await repo.getContact(id); if (!c) throw new ToolFail('Conversa não encontrada.'); return c; };
  return {
    status_conexoes: { title: 'Status das conexões', description: 'Mostra quais canais estão configurados e contagens de conversas, não lidas e pedidos novos do site.', input: {}, annotations: RO,
      run: async () => ({ whatsapp: { configurado: !!cfg.whatsapp.token, modo: cfg.whatsapp.mode }, instagram: { configurado: !!(cfg.instagram.token || await repo.kvGet('ig_token')) }, site: { configurado: !!cfg.site.token }, ...(await repo.counts()) }) },
    listar_conversas: { title: 'Listar conversas', description: 'Lista as conversas do WhatsApp e do Instagram Direct, mais recentes primeiro.',
      input: { canal: z.enum(['whatsapp', 'instagram']).optional().describe('Filtra por canal'), limite: z.number().int().min(1).max(200).optional() }, annotations: RO,
      run: async ({ canal, limite }) => ({ conversas: (await repo.listContacts({ channel: canal, limit: limite || 50 })).map(contactOut) }) },
    ler_conversa: { title: 'Ler conversa', description: 'Mostra as mensagens de uma conversa (id vindo de listar_conversas).',
      input: { conversa_id: z.string().min(3), limite: z.number().int().min(1).max(300).optional() }, annotations: RO,
      run: async ({ conversa_id, limite }) => { const c = await contact(conversa_id); const msgs = await repo.listMessages(conversa_id, limite || 60);
        return { conversa: contactOut(c), mensagens: msgs.map(m => ({ id: m.id, direcao: m.direction, origem: m.origin, tipo: m.type, texto: m.text, status: m.status, em: m.ts })) }; } },
    enviar_mensagem: { title: 'Enviar mensagem', description: 'Envia uma mensagem de texto na conversa, pelo WhatsApp ou pelo Instagram Direct. Só funciona até 24 h depois da última mensagem do cliente.',
      input: { conversa_id: z.string().min(3), texto: z.string().min(1).max(4096) }, annotations: RW,
      run: async ({ conversa_id, texto }) => { const c = await contact(conversa_id);
        try {
          const id = c.channel === 'whatsapp' ? await sendWhatsApp(cfg, c.peer_id, texto, fetchImpl) : await sendInstagram(cfg, repo, c.peer_id, texto, fetchImpl);
          const ts = new Date().toISOString();
          await repo.addMessage({ id, contactId: c.id, channel: c.channel, direction: 'out', origin: 'painel', type: 'text', text: texto, status: 'sent', ts });
          await repo.markRead(c.id);
          return { enviada: true, id, em: ts };
        } catch (e) { throw new ToolFail(e instanceof ChannelError ? e.message : 'Falha ao enviar a mensagem. Tente de novo em instantes.'); } } },
    marcar_como_lida: { title: 'Marcar como lida', description: 'Zera o contador de não lidas da conversa e envia a confirmação de leitura no WhatsApp.',
      input: { conversa_id: z.string().min(3) }, annotations: RW,
      run: async ({ conversa_id }) => { const c = await contact(conversa_id); await repo.markRead(c.id);
        if (c.channel === 'whatsapp') await markWhatsAppRead(cfg, await repo.lastInboundId(c.id), fetchImpl); return { ok: true }; } },
    listar_pedidos_site: { title: 'Listar pedidos do site', description: 'Lista os pedidos recebidos do site pelo webhook.',
      input: { apenas_novos: z.boolean().optional().describe('Só os que ainda não foram importados para o painel') }, annotations: RO,
      run: async ({ apenas_novos }) => ({ pedidos: (await repo.listSiteOrders(apenas_novos !== false)).map(o => ({ id: o.id, referencia: o.ext_id, recebido_em: o.received_at, importado: o.imported, dados: o.payload })) }) },
    marcar_pedido_importado: { title: 'Marcar pedido do site como importado', description: 'Marca um pedido do site como já registrado no painel.',
      input: { pedido_id: z.number().int() }, annotations: RW,
      run: async ({ pedido_id }) => { if (!await repo.markSiteOrder(pedido_id)) throw new ToolFail('Pedido não encontrado.'); return { ok: true }; } },
  };
}

export function buildMcp(tools) {
  const s = new McpServer({ name: 'esro-conexoes', version: '1.4.0' });
  for (const [name, t] of Object.entries(tools)) {
    s.registerTool(name, { title: t.title, description: t.description, inputSchema: t.input, annotations: t.annotations }, async (args) => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await t.run(args || {})) }] }; }
      catch (e) { if (e?.toolMessage) return { isError: true, content: [{ type: 'text', text: e.toolMessage }] }; throw e; }
    });
  }
  return s;
}
