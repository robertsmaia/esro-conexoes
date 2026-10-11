// Loja: o que liga o site ao painel.
//  - /api/catalogo   → o site mostra as categorias, itens e preços que estão no Catálogo do painel
//  - /api/pedido     → o pedido de orçamento feito no site entra em "Pedidos novos do site" no painel
//  - /api/novidades  → quem pede novidades por e-mail vira um contato em Clientes
//  - /api/v          → contagem de visitas (sem cookies, sem guardar IP)
//  - /painel/api/monitor → números do site, do atendimento e do Instagram para a tela Monitoramento
import crypto from 'node:crypto';
import express from 'express';
import { checkName, checkPhone, checkEmail } from './accounts.js';
import { instagramOverview } from './social.js';
import { templates } from './mail.js';
import { siteBase, str } from './util.js';

const TZ = 'America/Sao_Paulo';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
export const dayOf = (d = new Date()) => dayFmt.format(d);   // AAAA-MM-DD no horário de São Paulo
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const clean = (s, max) => str(s).normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const PAGES = new Set(['/', '/entrar', '/conta', '/privacidade', '/entregas', '/finalizar']);
const pageKey = (p) => PAGES.has(p) ? p : /^\/produto\/[a-z0-9-]{1,80}$/.test(String(p)) ? '/produto' : /^\/pedido\//.test(String(p)) ? '/pedido' : 'outra';
const EVENTS = new Set(['carrinho', 'whatsapp', 'catalogo_pdf', 'finalizar']);
// Outras redes: os números são anotados à mão no painel (essas redes não têm conexão automática aqui).
const REDES = { facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', whatsapp_canal: 'Canal do WhatsApp' };
const BOT = /bot|crawl|spider|slurp|preview|monitor|uptime|curl|wget|python|headless|lighthouse|scan|http/i;

function origemDe(ref, host) {
  let h = ''; try { h = ref ? new URL(ref).hostname.toLowerCase() : ''; } catch { h = ''; }
  if (!h) return 'Direto ou link sem origem';
  if (h === String(host || '').split(':')[0].toLowerCase()) return null;   // navegação dentro do próprio site
  if (/instagram\./.test(h)) return 'Instagram';
  if (/whatsapp\.|^wa\.me$/.test(h)) return 'WhatsApp';
  if (/facebook\.|^fb\./.test(h)) return 'Facebook';
  if (/google\./.test(h)) return 'Google';
  if (/bing\.|duckduckgo\.|yahoo\./.test(h)) return 'Outros buscadores';
  return 'Outros sites';
}
const aparelhoDe = (ua) => /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Celular' : 'Computador';

export function makeStore({ cfg, repo, log = console, clientIp, counter, accounts, shop, mailer, fetchImpl = fetch }) {
  const orders = counter(3600e3), ordersDay = counter(24 * 3600e3), news = counter(3600e3), beacons = counter(60e3);
  const MAX_ORDERS_IP = cfg.store?.ordersPerHour || 8, MAX_ORDERS_DAY = cfg.store?.ordersPerDay || 300;
  const stat = (kind, key, n = 1) => repo.statAdd(dayOf(), kind, key, n).catch(e => log.error('[estatística]', e?.message || e));

  // Catálogo do painel, guardado por 30 s para não consultar o banco a cada visita.
  let cache = { at: 0, data: null };
  async function catalog() {
    if (cache.data && Date.now() - cache.at < (cfg.store?.catalogTtlMs ?? 30e3)) return cache.data;
    const rows = await repo.docList('catalog');
    const categorias = rows.map(({ data: c }) => ({
      n: clean(c.n, 4), titulo: clean(c.t, 80), descricao: clean(c.d, 240), tipo: c.kind === 'fisico' ? 'fisico' : 'digital',
      itens: (Array.isArray(c.items) ? c.items : []).filter(i => i && i.on !== false && clean(i.name, 120))
        .map(i => ({ nome: clean(i.name, 120), min: Math.max(0, Number(i.min) || 0), max: Math.max(0, Number(i.max) || 0) })),
    })).filter(c => c.titulo).sort((a, b) => a.n.localeCompare(b.n));
    cache = { at: Date.now(), data: { categorias } };
    return cache.data;
  }
  const findItem = (cat, name) => { const k = clean(name, 120).toLowerCase(); for (const c of cat.categorias) for (const i of c.itens) if (i.nome.toLowerCase() === k) return { ...i, cat: c.n, tipo: c.tipo }; return null; };

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (req.method === 'GET') return next();
    // Proteção contra chamadas forjadas por outros sites: cabeçalho próprio + origem igual à do site.
    if (req.get('x-esro') !== '1') return res.status(400).json({ erro: 'Requisição inválida.' });
    const origin = req.get('origin'); if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ erro: 'Origem não permitida.' }); } catch { return res.status(403).json({ erro: 'Origem não permitida.' }); } }
    next();
  });

  api.get('/catalogo', async (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json(await catalog()); });

  api.post('/pedido', async (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}, ip = clientIp(req);
    if (b.site) return res.status(400).json({ erro: 'Não foi possível enviar o pedido.' });           // campo-armadilha: só robôs preenchem
    if (orders.count(ip) >= MAX_ORDERS_IP) return res.status(429).set('Retry-After', String(orders.retryAfter(ip))).json({ erro: 'Muitos pedidos em pouco tempo. Aguarde um pouco ou fale com a ESRO pelo WhatsApp.' });
    if (ordersDay.count('todos') >= MAX_ORDERS_DAY) return res.status(503).json({ erro: 'O pedido pelo site está temporariamente indisponível. Fale com a ESRO pelo WhatsApp.' });
    const user = await accounts.current(req);
    let nome, telefone, email = '';
    if (user) { nome = user.name; telefone = user.phone; email = user.email; }
    else {
      const n = checkName(b.nome); if (n.erro) return res.status(422).json(n);
      const t = checkPhone(b.telefone); if (t.erro) return res.status(422).json(t);
      nome = n.value; telefone = t.value;
    }
    const cat = await catalog();
    const list = Array.isArray(b.itens) ? b.itens.slice(0, 21) : [];
    if (!list.length || list.length > 20) return res.status(422).json({ campo: 'itens', erro: list.length ? 'O pedido pode ter no máximo 20 itens.' : 'Escolha pelo menos um item.' });
    const itens = [];
    for (const it of list) {
      const found = findItem(cat, it?.nome) || await shop?.findByName(it?.nome); const qtd = Math.floor(Number(it?.qtd));   // item do catálogo ou produto da vitrine
      if (!found) return res.status(422).json({ campo: 'itens', erro: 'Um dos itens saiu do catálogo. Atualize a página e monte o pedido de novo.' });
      if (!(qtd >= 1 && qtd <= 99)) return res.status(422).json({ campo: 'itens', erro: 'A quantidade de cada item deve ficar entre 1 e 99.' });
      const det = clean(it?.detalhe, 200);   // variação e personalização escolhidas na página do produto
      const same = itens.find(x => x.nome === found.nome && (x.detalhe || '') === det); if (same) same.qtd = Math.min(99, same.qtd + qtd); else itens.push({ nome: found.nome, qtd, min: found.min, max: found.max, cat: found.cat, tipo: found.tipo, ...(det ? { detalhe: det } : {}) });
    }
    orders.add(ip); ordersDay.add('todos');
    const payload = { origem: 'site', itens, cliente: { nome, telefone, email }, clientId: user?.client_id || null, obs: clean(b.obs, 500), pagamento: 'PIX',
      estimativa: { min: itens.reduce((a, i) => a + i.min * i.qtd, 0), max: itens.reduce((a, i) => a + i.max * i.qtd, 0) } };
    let ref = null;
    for (let t = 0; t < 3 && !ref; t++) {
      const r = 'S' + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomInt(36 * 36).toString(36).toUpperCase().padStart(2, '0');
      if (await repo.addSiteOrder(r, { ...payload, numero: r })) ref = r;
    }
    if (!ref) return res.status(500).json({ erro: 'Não foi possível registrar o pedido. Tente de novo.' });
    stat('evento', 'orcamento');
    const base = siteBase(cfg, req); if (mailer?.enabled && mailer.owner && base) { mailer.send({ to: mailer.owner, toName: 'ESRO', ...templates({ publicUrl: base }).orcamentoNovo(ref, payload) }).catch(() => {}); }
    res.status(201).json({ ok: true, referencia: ref, estimativa: payload.estimativa, nome: nome.split(' ')[0] });
  });

  api.post('/novidades', async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {}, ip = clientIp(req);
    if (b.site) return res.status(400).json({ erro: 'Não foi possível concluir.' });
    if (news.count(ip) >= 5) return res.status(429).set('Retry-After', String(news.retryAfter(ip))).json({ erro: 'Muitas tentativas. Aguarde um pouco.' });
    const e = checkEmail(b.email); if (e.erro) return res.status(422).json(e);
    news.add(ip);
    const now = new Date().toISOString(), note = { at: now, text: 'Pediu para receber novidades por e-mail pelo site (Círculo ESRO).' };
    try {
      const found = await repo.clientByEmail(e.value);
      if (found) { if (!found.data.news) { await repo.docMerge('clients', found.id, { news: true, updatedAt: now, notes: [...(Array.isArray(found.data.notes) ? found.data.notes : []), note].slice(-200) }); stat('evento', 'novidades'); } }
      else { stat('evento', 'novidades'); await repo.docSet('clients', 'cli_news_' + crypto.randomBytes(9).toString('hex'), { name: e.value, phone: '', ig: '', email: e.value, city: '', origin: 'site', originNote: 'Círculo ESRO (novidades por e-mail)',
        stage: 'info', interest: 'Novidades por e-mail', follow: false, followAt: '', followWhy: '', notes: [note], at: now, updatedAt: now, lastAt: now, news: true }); }
    } catch (err) { log.error('[novidades]', err?.message || err); return res.status(500).json({ erro: 'Não foi possível concluir agora. Tente de novo.' }); }
    res.json({ ok: true });   // mesma resposta para e-mail novo ou já cadastrado
  });

  // Contagem de visitas. Sem cookies e sem guardar IP: só soma números por dia.
  api.post('/v', (req, res) => {
    res.status(204).end();
    const ip = clientIp(req), ua = String(req.get('user-agent') || ''), b = req.body && typeof req.body === 'object' ? req.body : {};
    if (!ua || BOT.test(ua) || (req.rawBody?.length || 0) > 600 || beacons.add(ip) > 40) return;
    const p = pageKey(b.p);
    if (b.e !== undefined) { if (EVENTS.has(b.e)) stat('evento', b.e); return; }
    stat('pagina', p);
    if (b.n === true) {   // primeira página desta visita
      stat('visita', 'total'); stat('aparelho', aparelhoDe(ua));
      const o = origemDe(typeof b.r === 'string' ? b.r.slice(0, 300) : '', req.get('host')); if (o) stat('origem', o);
    }
  });

  async function monitor(dias, force) {
    const today = dayOf(), days = [...Array(dias)].map((_, i) => dayOf(new Date(Date.now() - (dias - 1 - i) * 864e5)));
    const since = days[0], sinceTs = new Date(Date.now() - dias * 864e5).toISOString();
    const [rows, perDay, resp, counts, so, users, ig] = await Promise.all([
      repo.statsSince(since), repo.messagesPerDay(sinceTs), repo.responseTime(sinceTs), repo.counts(), repo.siteOrderCounts(sinceTs), repo.userCounts(sinceTs),
      instagramOverview(cfg, repo, fetchImpl, { force, day: today })]);
    const serie = await repo.socialSince(since, 'instagram');   // depois da consulta ao Instagram, que grava o retrato de hoje
    const sum = (kind, key) => rows.filter(r => r.kind === kind && (key === undefined || r.key === key)).reduce((a, r) => a + r.n, 0);
    const top = (kind) => { const m = {}; for (const r of rows) if (r.kind === kind) m[r.key] = (m[r.key] || 0) + r.n; return Object.entries(m).map(([chave, n]) => ({ chave, n })).sort((a, b) => b.n - a.n).slice(0, 8); };
    const byDay = (kind) => { const m = {}; for (const r of rows) if (r.kind === kind) m[r.day] = (m[r.day] || 0) + r.n; return m; };
    const v = byDay('visita'), pg = byDay('pagina');
    const msg = {}; for (const r of perDay) { const d = (msg[r.day] ||= { whatsapp: { recebidas: 0, enviadas: 0 }, instagram: { recebidas: 0, enviadas: 0 } }); if (d[r.channel]) d[r.channel][r.direction === 'in' ? 'recebidas' : 'enviadas'] += r.n; }
    const fol = {}; for (const r of serie) if (r.metric === 'seguidores') fol[r.day] = r.value;
    const outras = [];
    for (const [id, nome] of Object.entries(REDES)) { const s = (await repo.socialSince(days[0] < since ? days[0] : since, id)).filter(r => r.metric === 'seguidores'), last = await repo.socialLast(id, 'seguidores');
      outras.push({ id, nome, seguidores: last ? last.value : null, anotadoEm: last ? last.day : null, porDia: s.map(r => ({ dia: r.day, seguidores: r.value })) }); }
    return {
      periodo: { de: since, ate: today, dias },
      site: { visitas: sum('visita'), paginas: sum('pagina'), porDia: days.map(d => ({ dia: d, visitas: v[d] || 0, paginas: pg[d] || 0 })), paginasVistas: top('pagina'), origens: top('origem'), aparelhos: top('aparelho'),
        eventos: { carrinho: sum('evento', 'carrinho'), finalizar: sum('evento', 'finalizar'), compra: sum('evento', 'compra'), orcamento: sum('evento', 'orcamento'), whatsapp: sum('evento', 'whatsapp'), catalogo_pdf: sum('evento', 'catalogo_pdf'), novidades: sum('evento', 'novidades') },
        orcamentos: so, contas: { novas: users.novas, total: users.total } },
      atendimento: { porDia: days.map(d => ({ dia: d, ...(msg[d] || { whatsapp: { recebidas: 0, enviadas: 0 }, instagram: { recebidas: 0, enviadas: 0 } }) })),
        conversas: counts.conversas, naoLidas: counts.nao_lidas, respostaMedianaMin: resp.medianaMin, respostas: resp.n, whatsappLigado: !!cfg.whatsapp.token },
      instagram: { ...ig, seguidoresPorDia: days.filter(d => fol[d] !== undefined).map(d => ({ dia: d, seguidores: fol[d] })) },
      outrasRedes: outras,
    };
  }

  shop?.publicRoutes(api);   // produtos, frete, cupom, compra e acompanhamento do pedido

  return {
    mount(app) { app.use('/api', api); },
    catalog, monitor,
    adminRoutes(panelApi) {
      panelApi.get('/monitor', async (req, res) => { const d = Number(req.query.dias); res.json(await monitor([7, 30, 90].includes(d) ? d : 30, req.query.atualizar === '1')); });
      // Anota os seguidores de hoje de uma rede sem conexão automática (Facebook, TikTok...).
      panelApi.post('/redes', async (req, res) => {
        const rede = str(req.body?.rede), n = Math.floor(Number(req.body?.seguidores));
        if (!Object.hasOwn(REDES, rede) || !(n >= 0 && n <= 1e9)) return res.status(422).json({ erro: 'Escolha a rede e escreva o número de seguidores.' });
        await repo.socialSet(dayOf(), rede, 'seguidores', n); res.json({ ok: true });
      });
    },
    // Retrato diário das redes, mesmo que ninguém abra o painel.
    snapshot: () => instagramOverview(cfg, repo, fetchImpl, { force: true, day: dayOf() }).catch(() => null),
  };
}
