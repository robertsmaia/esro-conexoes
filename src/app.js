// Aplicação HTTP: webhooks da Meta e do site + endpoint MCP usado pelo painel ESRO.
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifySignature, parseWhatsApp, parseInstagram, sendWhatsApp, sendInstagram, instagramProfile, markWhatsAppRead, ChannelError } from './channels.js';

const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };

export function createApp({ cfg, repo, fetchImpl = fetch, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  app.get('/', (_req, res) => res.json({ ok: true, servico: 'ESRO conexões', whatsapp: !!cfg.whatsapp.token, instagram: !!cfg.instagram.token }));

  // Verificação do webhook (Meta chama com hub.challenge ao salvar a URL no painel de desenvolvedor)
  const verify = (token) => (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && token && req.query['hub.verify_token'] === token) return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
    res.sendStatus(403);
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
      if (await repo.addMessage({ ...m, contactId })) n++;
    }
    return n;
  }

  app.post('/webhooks/whatsapp', async (req, res) => {
    if (!verifySignature(cfg.whatsapp.mode === 'meta' ? cfg.whatsapp.appSecret : '', req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
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
    if (!cfg.site.token || !safeEq(req.get('x-esro-token'), cfg.site.token)) return res.sendStatus(401);
    const b = req.body || {};
    if (typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ erro: 'Envie um objeto JSON com o pedido.' });
    const extId = String(b.id ?? b.numero ?? b.order_id ?? b.pedido ?? crypto.randomUUID());
    const id = await repo.addSiteOrder(extId, b);
    res.status(id ? 201 : 200).json({ ok: true, id, duplicado: !id });
  });

  // MCP (conector do Claude). O segredo vai no caminho, pois conectores sem OAuth não enviam cabeçalhos próprios.
  const mcpAuth = (req, res, next) => {
    const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (cfg.mcpSecret && (safeEq(req.params.secret, cfg.mcpSecret) || safeEq(bearer, cfg.mcpSecret))) return next();
    res.status(404).json({ erro: 'não encontrado' });
  };
  app.post('/mcp/:secret', mcpAuth, async (req, res) => {
    const server = buildMcp({ cfg, repo, fetchImpl });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (e) { log.error('[mcp]', e); if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null }); }
  });
  app.all('/mcp/:secret', mcpAuth, (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST.' }, id: null }));

  return app;
}

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });

function contactOut(c) {
  const within24h = c.last_in_at ? (Date.now() - new Date(c.last_in_at).getTime()) < 24 * 3600e3 : false;
  return { id: c.id, canal: c.channel, nome: c.name || null, usuario: c.username || null, contato: c.channel === 'whatsapp' ? c.peer_id : (c.username ? '@' + c.username : null),
    ultima_mensagem: c.last_text, ultima_em: c.last_at, nao_lidas: c.unread, pode_responder: within24h };
}

export function buildMcp({ cfg, repo, fetchImpl = fetch }) {
  const s = new McpServer({ name: 'esro-conexoes', version: '1.0.0' });
  const RO = { readOnlyHint: true };

  s.registerTool('status_conexoes', { title: 'Status das conexões', description: 'Mostra quais canais estão configurados e contagens de conversas, não lidas e pedidos novos do site.', inputSchema: {}, annotations: RO },
    async () => ok({ whatsapp: { configurado: !!cfg.whatsapp.token, modo: cfg.whatsapp.mode }, instagram: { configurado: !!(cfg.instagram.token || await repo.kvGet('ig_token')) }, site: { configurado: !!cfg.site.token }, ...(await repo.counts()) }));

  s.registerTool('listar_conversas', { title: 'Listar conversas', description: 'Lista as conversas do WhatsApp e do Instagram Direct, mais recentes primeiro.',
    inputSchema: { canal: z.enum(['whatsapp', 'instagram']).optional().describe('Filtra por canal'), limite: z.number().int().min(1).max(200).optional() }, annotations: RO },
    async ({ canal, limite }) => ok({ conversas: (await repo.listContacts({ channel: canal, limit: limite || 50 })).map(contactOut) }));

  s.registerTool('ler_conversa', { title: 'Ler conversa', description: 'Mostra as mensagens de uma conversa (id vindo de listar_conversas).',
    inputSchema: { conversa_id: z.string().min(3), limite: z.number().int().min(1).max(300).optional() }, annotations: RO },
    async ({ conversa_id, limite }) => {
      const c = await repo.getContact(conversa_id); if (!c) return fail('Conversa não encontrada.');
      const msgs = await repo.listMessages(conversa_id, limite || 60);
      return ok({ conversa: contactOut(c), mensagens: msgs.map(m => ({ id: m.id, direcao: m.direction, origem: m.origin, tipo: m.type, texto: m.text, status: m.status, em: m.ts })) });
    });

  s.registerTool('enviar_mensagem', { title: 'Enviar mensagem', description: 'Envia uma mensagem de texto na conversa, pelo WhatsApp ou pelo Instagram Direct. Só funciona até 24 h depois da última mensagem do cliente.',
    inputSchema: { conversa_id: z.string().min(3), texto: z.string().min(1).max(4096) }, annotations: { readOnlyHint: false, destructiveHint: false } },
    async ({ conversa_id, texto }) => {
      const c = await repo.getContact(conversa_id); if (!c) return fail('Conversa não encontrada.');
      try {
        const id = c.channel === 'whatsapp' ? await sendWhatsApp(cfg, c.peer_id, texto, fetchImpl) : await sendInstagram(cfg, repo, c.peer_id, texto, fetchImpl);
        const ts = new Date().toISOString();
        await repo.addMessage({ id, contactId: c.id, channel: c.channel, direction: 'out', origin: 'painel', type: 'text', text: texto, status: 'sent', ts });
        await repo.markRead(c.id);
        return ok({ enviada: true, id, em: ts });
      } catch (e) { return fail(e instanceof ChannelError ? e.message : 'Falha ao enviar a mensagem. Tente de novo em instantes.'); }
    });

  s.registerTool('marcar_como_lida', { title: 'Marcar como lida', description: 'Zera o contador de não lidas da conversa e envia a confirmação de leitura no WhatsApp.',
    inputSchema: { conversa_id: z.string().min(3) }, annotations: { readOnlyHint: false, destructiveHint: false } },
    async ({ conversa_id }) => {
      const c = await repo.getContact(conversa_id); if (!c) return fail('Conversa não encontrada.');
      await repo.markRead(c.id);
      if (c.channel === 'whatsapp') await markWhatsAppRead(cfg, await repo.lastInboundId(c.id), fetchImpl);
      return ok({ ok: true });
    });

  s.registerTool('listar_pedidos_site', { title: 'Listar pedidos do site', description: 'Lista os pedidos recebidos do site pelo webhook.',
    inputSchema: { apenas_novos: z.boolean().optional().describe('Só os que ainda não foram importados para o painel') }, annotations: RO },
    async ({ apenas_novos }) => ok({ pedidos: (await repo.listSiteOrders(apenas_novos !== false)).map(o => ({ id: o.id, referencia: o.ext_id, recebido_em: o.received_at, importado: o.imported, dados: o.payload })) }));

  s.registerTool('marcar_pedido_importado', { title: 'Marcar pedido do site como importado', description: 'Marca um pedido do site como já registrado no painel.',
    inputSchema: { pedido_id: z.number().int() }, annotations: { readOnlyHint: false, destructiveHint: false } },
    async ({ pedido_id }) => (await repo.markSiteOrder(pedido_id)) ? ok({ ok: true }) : fail('Pedido não encontrado.'));

  return s;
}
