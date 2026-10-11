// Loja com compra direta: produtos com foto e variações, frete por CEP, cupons, pagamento (PIX ou Mercado Pago),
// página de acompanhamento do pedido, e-mails automáticos e lista de produtos para Instagram/Google.
//  - /api/produtos, /api/produtos/:slug, /img/:id   → vitrine e fotos
//  - /api/loja, /api/frete, /api/cupom, /api/compra → finalização da compra
//  - /api/pedido-loja/:token e /pedido/:token       → acompanhamento (link secreto enviado ao cliente)
//  - /webhooks/mercadopago                          → confirmação automática do pagamento
//  - /feed/produtos.xml e /sitemap.xml              → canais de venda e buscadores
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkName, checkPhone, checkEmail } from './accounts.js';
import { pixPayload, paidOf, dueOf } from './pix.js';
import { templates } from './mail.js';
import { SITE_DIR } from './panel.js';
import { siteBase, str } from './util.js';

const TZ = 'America/Sao_Paulo';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const today = () => dayFmt.format(new Date());
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const clean = (s, max) => str(s).normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (s, max) => str(s).normalize('NFC').replace(/\r/g, '').replace(new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g'), ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const digits = (s) => str(s).replace(/\D/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => 'R$ ' + r2(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const TOKEN = /^[\w-]{40,50}$/;
const STATUS = { novo: 'Recebido', orcamento: 'Orçamento enviado', producao: 'Em produção', arte: 'Aguardando sua aprovação da arte', enviado: 'Enviado', concluido: 'Concluído' };
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const httpsUrl = (u) => { const t = String(u || '').trim(); return /^https:\/\/[^\s<>"']{4,400}$/.test(t) ? t : ''; };

// Vitrine inicial: os oito produtos ilustrados do site, em modo "orçamento" (o preço final é combinado).
export const SEED_PRODUCTS = [
  ['planner', 'Planner personalizado', 'Organização', 45, 90, 'Planner em brochura com o seu nome na capa, divisórias e folhas para planejar a semana e o mês.'],
  ['agenda', 'Agenda personalizada', 'Personalizado', 45, 85, 'Agenda do ano com capa personalizada, elástico e fita marcadora.'],
  ['caderno', 'Caderno em brochura', 'Papelaria', 25, 55, 'Caderno em brochura com capa personalizada e acabamento artesanal.'],
  ['bloquinho', 'Bloquinho em brochura', 'Papelaria', 15, 30, 'Bloquinho de anotações com capa personalizada, ótimo para presentear.'],
  ['caderneta', 'Capa de caderneta de vacinação', 'Personalizado', 15, 35, 'Capa personalizada com o nome da criança para proteger a caderneta de vacinação.'],
  ['pdf', 'Material de estudo em PDF', 'Educacional', 30, 80, 'Material de estudo organizado em PDF, feito sob medida para o tema que você precisa.'],
  ['slides', 'Slides de formação', 'Educacional', 35, 90, 'Apresentação pronta para a sua formação continuada, com tópicos e visual cuidado.'],
  ['convites', 'Convites e cartazes', 'Arte digital', 20, 50, 'Arte digital personalizada para convites, cartazes e comunicados.'],
].map(([img, name, cat, min, max, desc], i) => ({ id: 'prd_' + img, data: { name, slug: slugify(name), cat, desc, mode: 'orcamento', price: 0, min, max, imgs: ['/assets/produtos/' + img + '.svg'], vars: [], pers: '', stock: null,
  peso: 300, c: 25, l: 18, a: 3, digital: ['pdf', 'slides', 'convites'].includes(img), on: true, vitrine: true, ord: i + 1 } }));

function imgUrl(v) {
  const s = String(v || '');
  const m = /^asset:([a-f0-9]{24})$/.exec(s); if (m) return { url: '/img/' + m[1], asset: m[1] };
  return /^\/assets\/[\w\-/]+\.(svg|png|jpe?g|webp)$/.test(s) && !s.includes('..') ? { url: s, asset: null } : null;
}

export function makeShop({ cfg, repo, log = console, clientIp, counter, accounts, mailer, fetchImpl = fetch }) {
  const buys = counter(3600e3), tries = counter(3600e3), buysDay = counter(24 * 3600e3), quotes = counter(60e3), coupons = counter(3600e3), lookups = counter(60e3), hooks = counter(60e3);
  const MAX_BUYS_IP = cfg.store?.ordersPerHour || 8, MAX_BUYS_DAY = cfg.store?.ordersPerDay || 300;
  const ttl = () => cfg.store?.catalogTtlMs ?? 30e3;
  const stat = (key) => repo.statAdd(today(), 'evento', key, 1).catch(() => {});
  const baseUrl = (req) => siteBase(cfg, req);   // vazio quando a requisição chega por um endereço desconhecido e não há PUBLIC_URL
  const firstName = (n) => { const f = String(n || '').split(' ')[0]; return /^[\p{L}'-]{2,30}$/u.test(f) ? f : ''; };
  const mail = (to, toName, t) => { if (mailer?.enabled && to && t) mailer.send({ to, toName, ...t }).catch(() => {}); };

  /* ---------- Produtos (vêm do painel, coleção "products") ---------- */
  let cache = { at: 0, list: [], assets: new Set(), loja: {} };
  async function load(force) {
    if (!force && cache.at && Date.now() - cache.at < ttl()) return cache;
    const [rows, loja, cats] = await Promise.all([repo.docList('products'), repo.docGet('settings', 'loja'), repo.docList('catalog')]);
    // Produto sob orçamento com o mesmo nome de um item do Catálogo segue o Catálogo: mesma faixa de preço e mesmo liga/desliga.
    const inCatalog = new Map(); for (const c of cats) for (const i of (Array.isArray(c.data?.items) ? c.data.items : [])) if (i && clean(i.name, 120)) inCatalog.set(clean(i.name, 120).toLowerCase(), i);
    const day = today(), slugs = new Set(), assets = new Set(), list = [];
    const sorted = rows.map(r => ({ id: r.id, d: r.data || {} })).sort((a, b) => num(a.d.ord, 999) - num(b.d.ord, 999) || String(a.d.name).localeCompare(String(b.d.name), 'pt-BR'));
    for (const { id, d } of sorted) {
      const name = clean(d.name, 120); if (!name || d.on === false) continue;
      const price = r2(d.price), mode = d.mode === 'compra' && price > 0 ? 'compra' : 'orcamento';
      const twin = mode === 'orcamento' ? inCatalog.get(name.toLowerCase()) : null; if (twin && twin.on === false) continue;
      const promoOn = mode === 'compra' && d.promo && r2(d.promo.price) > 0 && r2(d.promo.price) < price && (!d.promo.until || String(d.promo.until) >= day);
      const imgs = (Array.isArray(d.imgs) ? d.imgs : []).map(imgUrl).filter(Boolean).slice(0, 6);
      for (const i of imgs) if (i.asset) assets.add(i.asset);
      let slug = slugify(d.slug || name); for (let n = 2; slugs.has(slug); n++) slug = slugify(d.slug || name).slice(0, 66) + '-' + n; slugs.add(slug);
      list.push({ id, slug, name, cat: clean(d.cat, 40), desc: cleanText(d.desc, 1200), mode, price, unit: promoOn ? r2(d.promo.price) : price, promoOn: !!promoOn,
        min: mode === 'compra' ? 0 : Math.max(0, r2(twin ? twin.min : d.min)), max: mode === 'compra' ? 0 : Math.max(0, r2(twin ? twin.max : d.max)), imgs: imgs.map(i => i.url),
        vars: (Array.isArray(d.vars) ? d.vars : []).slice(0, 4).map(v => ({ nome: clean(v?.nome, 40), ops: (Array.isArray(v?.ops) ? v.ops : []).slice(0, 20).map(o => ({ n: clean(o?.n, 40), add: Math.max(0, r2(o?.add)) })).filter(o => o.n) })).filter(v => v.nome && v.ops.length),
        pers: clean(d.pers, 60), stock: typeof d.stock === 'number' && Number.isFinite(d.stock) ? Math.max(0, Math.floor(d.stock)) : null,
        peso: Math.min(30000, Math.max(1, num(d.peso, 300))), c: Math.min(100, Math.max(1, num(d.c, 25))), l: Math.min(100, Math.max(1, num(d.l, 18))), a: Math.min(100, Math.max(1, num(d.a, 3))),
        digital: !!d.digital, vitrine: d.vitrine !== false });
    }
    cache = { at: Date.now(), list, assets, loja: loja && typeof loja === 'object' ? loja : {} };
    return cache;
  }
  const pub = (p) => ({ id: p.id, slug: p.slug, nome: p.name, categoria: p.cat, descricao: p.desc, modo: p.mode, preco: p.unit, precoDe: p.promoOn ? p.price : null, min: p.min, max: p.max, imagens: p.imgs,
    variacoes: p.vars.map(v => ({ nome: v.nome, opcoes: v.ops.map(o => ({ nome: o.n, acrescimo: o.add })) })), personalizacao: p.pers,
    disponivel: p.stock === null || p.stock > 0, restam: p.stock !== null && p.stock > 0 && p.stock <= 5 ? p.stock : null, digital: p.digital, vitrine: p.vitrine });
  // Usado pelo pedido de orçamento: um produto da vitrine também pode entrar no orçamento.
  async function findByName(name) {
    const k = clean(name, 120).toLowerCase(), p = (await load()).list.find(x => x.name.toLowerCase() === k);
    return p ? { nome: p.name, min: p.mode === 'compra' ? p.unit : p.min, max: p.mode === 'compra' ? p.unit : p.max, cat: '', tipo: p.digital ? 'digital' : 'fisico' } : null;
  }

  /* ---------- Itens do carrinho: confere tudo de novo no servidor (preço, variação, estoque) ---------- */
  function checkItems(list, raw) {
    const arr = Array.isArray(raw) ? raw.slice(0, 21) : [];
    if (!arr.length) return { erro: 'Escolha pelo menos um produto.', campo: 'itens' };
    if (arr.length > 20) return { erro: 'A compra pode ter no máximo 20 itens.', campo: 'itens' };
    const itens = [], qtyBy = {};
    for (const it of arr) {
      const p = list.find(x => x.id === String(it?.id || ''));
      if (!p) return { erro: 'Um dos produtos saiu da loja. Volte à loja e monte o pedido de novo.', campo: 'itens' };
      if (p.mode !== 'compra') return { erro: `"${p.name}" é vendido sob orçamento. Peça o orçamento pelo site ou pelo WhatsApp.`, campo: 'itens' };
      const qtd = Math.floor(Number(it?.qtd)); if (!(qtd >= 1 && qtd <= 99)) return { erro: 'A quantidade de cada produto deve ficar entre 1 e 99.', campo: 'itens' };
      const chosen = it?.vars && typeof it.vars === 'object' && !Array.isArray(it.vars) ? it.vars : {}, vars = []; let unit = p.unit;
      for (const v of p.vars) { const o = v.ops.find(x => x.n === String(chosen[v.nome] ?? '')); if (!o) return { erro: `Escolha "${v.nome}" em "${p.name}".`, campo: 'itens' }; vars.push([v.nome, o.n]); unit = r2(unit + o.add); }
      const pers = p.pers ? clean(it?.pers, 120) : '';
      if (p.pers && !pers) return { erro: `Preencha "${p.pers}" em "${p.name}".`, campo: 'itens' };
      qtyBy[p.id] = (qtyBy[p.id] || 0) + qtd;
      if (p.stock !== null && qtyBy[p.id] > p.stock) return { erro: p.stock > 0 ? `Só restam ${p.stock} unidade(s) de "${p.name}".` : `"${p.name}" está esgotado no momento.`, campo: 'itens', status: 409 };
      itens.push({ id: p.id, nome: p.name, qtd, unit, vars, pers, digital: p.digital, peso: p.peso, c: p.c, l: p.l, a: p.a, controla: p.stock !== null });
    }
    return { itens, subtotal: r2(itens.reduce((a, i) => a + i.unit * i.qtd, 0)), digital: itens.every(i => i.digital) };
  }

  /* ---------- Frete ---------- */
  async function address(cep) {   // endereço pelo CEP (ViaCEP); se o serviço não responder, o cliente digita
    try {
      const r = await fetchImpl(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000) });
      const d = r.ok ? await r.json() : null; if (!d || d.erro) return d && d.erro ? { naoEncontrado: true } : null;
      return { rua: clean(d.logradouro, 120), bairro: clean(d.bairro, 80), cidade: clean(d.localidade, 80), uf: UFS.has(String(d.uf).toUpperCase()) ? String(d.uf).toUpperCase() : '' };
    } catch { return null; }
  }
  async function melhorEnvio(cep, itens, loja) {
    const me = cfg.melhorenvio || {}, from = digits(loja.cepOrigem);
    if (!me.token || from.length !== 8) return [];
    try {
      const r = await fetchImpl(`https://${me.sandbox ? 'sandbox.' : ''}melhorenvio.com.br/api/v2/me/shipment/calculate`, { method: 'POST', signal: AbortSignal.timeout(9000),
        headers: { authorization: 'Bearer ' + me.token, accept: 'application/json', 'content-type': 'application/json', 'user-agent': `ESRO Papelaria (${me.email || mailer?.owner || cfg.publicUrl || 'loja'})` },
        body: JSON.stringify({ from: { postal_code: from }, to: { postal_code: cep }, products: itens.filter(i => !i.digital).map(i => ({ id: i.id, width: i.l, height: i.a, length: i.c, weight: i.peso / 1000, insurance_value: i.unit, quantity: i.qtd })) }) });
      if (!r.ok) { log.error(`[frete] Melhor Envio respondeu HTTP ${r.status}`); return []; }
      const list = await r.json(), extra = Math.max(0, Math.floor(num(loja.prazoProducao)));
      return (Array.isArray(list) ? list : []).filter(s => s && !s.error && Number(s.custom_price ?? s.price) > 0)
        .map(s => { const d = Math.floor(num(s.custom_delivery_time ?? s.delivery_time)); return { id: 'me:' + String(s.id).slice(0, 12), nome: clean(`${s.company?.name || ''} ${s.name || ''}`, 60) || 'Transportadora', valor: r2(s.custom_price ?? s.price), prazo: d > 0 ? `${d + extra} dia(s) úteis` : '' }; })
        .sort((a, b) => a.valor - b.valor).slice(0, 4);
    } catch (e) { log.error('[frete] Melhor Envio sem resposta:', e?.message || e); return []; }
  }
  async function shipping(cep, checked, loja) {
    if (checked.digital) return [{ id: 'digital', nome: 'Entrega digital (por e-mail ou WhatsApp)', valor: 0, prazo: '' }];
    const out = [];
    if (loja.retirada?.on) out.push({ id: 'retirada', nome: 'Retirar com a ESRO', valor: 0, prazo: clean(loja.retirada.texto, 120) });
    if (cep) {
      const n = Number(cep), paid = [];
      (Array.isArray(loja.faixas) ? loja.faixas : []).slice(0, 40).forEach((f, i) => { const de = Number(digits(f?.de)), ate = Number(digits(f?.ate)); if (digits(f?.de).length === 8 && digits(f?.ate).length === 8 && n >= de && n <= ate && clean(f.nome, 60)) paid.push({ id: 'faixa:' + i, nome: clean(f.nome, 60), valor: Math.max(0, r2(f.valor)), prazo: clean(f.prazo, 60) }); });
      paid.push(...await melhorEnvio(cep, checked.itens, loja));
      const free = num(loja.gratisAcima) > 0 && checked.subtotal >= num(loja.gratisAcima);   // frete grátis: vale para a opção mais barata
      if (free && paid.length) { const cheap = paid.reduce((a, b) => (b.valor < a.valor ? b : a)); if (cheap.valor > 0) { cheap.valor = 0; cheap.gratis = true; } }
      out.push(...paid);
      if (!paid.length && loja.combinar !== false) out.push({ id: 'combinar', nome: 'Entrega a combinar com a ESRO', valor: 0, prazo: 'A ESRO informa o valor e o prazo pelo WhatsApp', combinar: true });
    }
    return out;
  }

  /* ---------- Cupons ---------- */
  async function coupon(code, subtotal, frete) {
    const k = clean(code, 30).toUpperCase().replace(/\s/g, ''); if (!k) return null;
    const row = (await repo.docList('coupons')).find(r => String(r.data?.code || '').toUpperCase().replace(/\s/g, '') === k), c = row?.data, day = today();
    if (!c || c.on === false) return { erro: 'Cupom não encontrado.' };
    if ((c.from && String(c.from) > day) || (c.to && String(c.to) < day)) return { erro: 'Este cupom não está valendo hoje.' };
    if (Math.floor(num(c.max)) > 0 && Math.floor(num(c.used)) >= Math.floor(num(c.max))) return { erro: 'Este cupom já atingiu o limite de usos.' };
    if (num(c.min) > 0 && subtotal < num(c.min)) return { erro: `Este cupom vale para compras a partir de ${money(c.min)}.` };
    const kind = ['pct', 'valor', 'frete'].includes(c.kind) ? c.kind : 'pct';
    const desconto = kind === 'pct' ? r2(subtotal * Math.min(100, Math.max(0, num(c.value))) / 100) : kind === 'valor' ? Math.min(subtotal, Math.max(0, r2(c.value))) : 0;
    return { id: row.id, codigo: k, tipo: kind, desconto, freteGratis: kind === 'frete', descricao: kind === 'pct' ? `${num(c.value)}% de desconto` : kind === 'valor' ? `${money(c.value)} de desconto` : 'Frete grátis',
      total: Math.max(0, r2(subtotal - desconto + (kind === 'frete' ? 0 : frete))) };
  }

  /* ---------- Pagamento online (Mercado Pago, opcional) ---------- */
  const mp = cfg.mercadopago || {};
  async function mpPreference(req, orderId, o, amount, email) {
    if (!mp.token || !(amount > 0)) return null;
    const base = baseUrl(req); if (!base) { log.error('[pagamento] endereço do site desconhecido: cadastre PUBLIC_URL no Render.'); return null; }
    const back = `${base}/pedido/${o.pub}`, https = base.startsWith('https://');
    try {
      const r = await fetchImpl('https://api.mercadopago.com/checkout/preferences', { method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { authorization: 'Bearer ' + mp.token, 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ id: String(o.num), title: `Pedido ESRO nº ${o.num}`, quantity: 1, unit_price: amount, currency_id: 'BRL' }], ...(email ? { payer: { email } } : {}),
          external_reference: orderId, back_urls: { success: back, pending: back, failure: back }, ...(https ? { auto_return: 'approved', notification_url: `${base}/webhooks/mercadopago` } : {}), statement_descriptor: 'ESRO PAPELARIA' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { log.error(`[pagamento] Mercado Pago recusou a criação do pagamento (HTTP ${r.status})`); return null; }
      return /^https:\/\/([\w-]+\.)*mercadopago\.com(\.br)?\//.test(String(d.init_point || '')) ? d.init_point : null;
    } catch (e) { log.error('[pagamento] Mercado Pago sem resposta:', e?.message || e); return null; }
  }
  // Confere o pagamento direto no Mercado Pago (nunca confia no aviso recebido) e registra no pedido.
  const applying = new Map();
  function applyPayment(payId, onlyOrder, base) {
    const id = String(payId || ''); if (!mp.token || !/^\d{5,20}$/.test(id)) return Promise.resolve(null);
    const key = id + '|' + (onlyOrder || '');
    if (applying.has(key)) return applying.get(key);
    const job = (async () => {
      const r = await fetchImpl(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { authorization: 'Bearer ' + mp.token }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return null;
      const p = await r.json(), oid = String(p.external_reference || '');
      if (!ID.test(oid) || (onlyOrder && oid !== onlyOrder)) return null;
      const o = await repo.docGet('orders', oid); if (!o || !o.pub) return null;
      // Pedido antigo sem a lista de pagamentos: começa pelo que já constava como pago (sinal), para não perder esse valor.
      const ext = 'mp:' + id, now = new Date().toISOString(), pays = Array.isArray(o.pays) ? o.pays : paidOf(o) > 0 ? [{ at: o.at || now, value: paidOf(o) }] : [];
      if (p.status === 'approved') {
        const fresh = await repo.docGet('orders', oid); if (Array.isArray(fresh?.pays) && fresh.pays.some(x => x.ext === ext)) return fresh;   // outro aviso do mesmo pagamento chegou primeiro
        const next = [...pays, { at: p.date_approved && !Number.isNaN(Date.parse(p.date_approved)) ? new Date(p.date_approved).toISOString() : now, value: r2(p.transaction_amount), ext }];
        const paid = r2(next.reduce((a, x) => a + (Number(x.value) || 0), 0)), payS = paid >= (Number(o.value) || 0) - 0.004 ? 'Pago' : 'Sinal pago';
        const patch = { pays: next, payS, pay: 'Mercado Pago', ...(payS === 'Sinal pago' ? { sinal: paid } : {}) };
        const sendMail = payS === 'Pago' && !o.mailed?.pago; if (sendMail) patch.mailed = { ...(o.mailed || {}), pago: now };
        const saved = (await repo.docMerge('orders', oid, patch)).data;
        if (sendMail && (cfg.publicUrl || base)) mail(await emailOf(saved), firstName(saved.client), templates({ publicUrl: cfg.publicUrl || base }).pagamentoConfirmado(saved));
        return saved;
      }
      if (['refunded', 'charged_back'].includes(p.status) && pays.some(x => x.ext === ext) && !String(o.note || '').includes(ext)) {
        return (await repo.docMerge('orders', oid, { note: `${o.note ? o.note + '\n' : ''}Atenção: o Mercado Pago informou ${p.status === 'refunded' ? 'devolução' : 'contestação'} do pagamento (${ext}). Confira no Mercado Pago e ajuste o pagamento deste pedido.` })).data;
      }
      return o;
    })().catch(e => { log.error('[pagamento] falha ao conferir pagamento:', e?.message || e); return null; }).finally(() => applying.delete(key));
    applying.set(key, job); return job;
  }
  async function emailOf(o) {
    if (o.loja?.email) return o.loja.email;
    const c = o.clientId ? await repo.docGet('clients', o.clientId).catch(() => null) : null;
    const e = checkEmail(c?.email); return e.value || '';
  }

  /* ---------- O que o cliente vê do pedido ---------- */
  function orderOut(o, settings) {
    const falta = dueOf(o), aberto = STATUS[o.status] !== undefined || !o.status, l = o.loja;
    const pix = falta > 0 && aberto && o.pay !== 'Mercado Pago' ? pixPayload(settings, falta, 'Pedido ' + (o.num ?? ''), 'ESRO' + (o.num ?? '')) : null;
    return { numero: o.num ?? null, data: o.at || null, status: STATUS[o.status] ? o.status : 'novo', statusNome: STATUS[o.status] || STATUS.novo, cliente: String(o.client || '').split(' ')[0],
      itens: l ? l.itens.map(i => ({ nome: i.nome, qtd: i.qtd, unit: i.unit, vars: i.vars || [], pers: i.pers || '' })) : [{ nome: String(o.item || 'Pedido'), qtd: Number(o.qty) || 1, unit: null, vars: [], pers: '' }],
      subtotal: l ? l.subtotal : null, desconto: l ? l.desconto : 0, cupom: l?.cupom || '', frete: l ? { nome: l.frete.nome, valor: l.frete.valor, prazo: l.frete.prazo || '', combinar: !!l.frete.combinar } : null,
      total: Number(o.value) || 0, pago: paidOf(o), falta, pagamento: ['Aguardando', 'Sinal pago', 'Pago'].includes(o.payS) ? o.payS : 'Aguardando', forma: String(o.pay || ''),
      pix: pix ? { codigo: pix, valor: falta, favorecido: String(settings.pixName || 'ESRO Papelaria').slice(0, 60) } : null, pagarOnline: !!mp.token && falta > 0 && aberto && o.pay === 'Mercado Pago',
      cidade: l?.endereco?.cidade ? `${l.endereco.cidade}/${l.endereco.uf}` : '', entrega: o.due || null,
      rastreio: o.track ? { codigo: clean(o.track, 60), url: httpsUrl(o.trackUrl) } : null, nota: o.nf || httpsUrl(o.nfUrl) ? { numero: clean(o.nf, 40), url: httpsUrl(o.nfUrl) } : null };
  }

  /* ---------- Rotas públicas (/api/...) ---------- */
  function publicRoutes(api) {
    const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
    const bad = (res, v) => res.status(v.status || 422).json({ erro: v.erro, campo: v.campo });

    api.get('/produtos', async (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json({ produtos: (await load()).list.map(pub) }); });
    api.get('/produtos/:slug', async (req, res) => {
      const p = (await load()).list.find(x => x.slug === req.params.slug);
      if (!p) return res.status(404).json({ erro: 'Produto não encontrado.' });
      res.set('Cache-Control', 'public, max-age=60'); res.json({ produto: pub(p) });
    });
    api.get('/loja', async (_req, res) => {
      const { loja } = await load(), settings = (await repo.docGet('settings', 'store')) || {};
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ pagamentos: { pix: !!String(settings.pixKey || '').trim(), online: !!mp.token }, emailSenha: !!mailer?.enabled, retirada: !!loja.retirada?.on, gratisAcima: num(loja.gratisAcima) > 0 ? num(loja.gratisAcima) : null,
        prazoProducao: Math.max(0, Math.floor(num(loja.prazoProducao))) || null, aviso: clean(loja.aviso, 200) });
    });

    api.post('/frete', async (req, res) => {
      const b = body(req), ip = clientIp(req);
      if (quotes.add(ip) > 20) return res.status(429).set('Retry-After', String(quotes.retryAfter(ip))).json({ erro: 'Muitas consultas em pouco tempo. Aguarde um minuto.' });
      const { list, loja } = await load(), chk = checkItems(list, b.itens); if (chk.erro) return bad(res, chk);
      const cep = digits(b.cep);
      if (!chk.digital && cep.length !== 8) return res.json({ digital: false, endereco: null, opcoes: await shipping('', chk, loja), subtotal: chk.subtotal });
      const end = chk.digital ? null : await address(cep);
      if (end?.naoEncontrado) return bad(res, { campo: 'cep', erro: 'CEP não encontrado. Confira os números.' });
      res.json({ digital: chk.digital, endereco: end, opcoes: await shipping(chk.digital ? '' : cep, chk, loja), subtotal: chk.subtotal });
    });

    api.post('/cupom', async (req, res) => {
      const b = body(req), ip = clientIp(req);
      if (coupons.add(ip) > 20) return res.status(429).set('Retry-After', String(coupons.retryAfter(ip))).json({ erro: 'Muitas tentativas de cupom. Aguarde um pouco.' });
      const { list } = await load(), chk = checkItems(list, b.itens); if (chk.erro) return bad(res, chk);
      const c = await coupon(b.codigo, chk.subtotal, Math.max(0, r2(b.frete)));
      if (!c) return bad(res, { campo: 'cupom', erro: 'Digite o código do cupom.' });
      if (c.erro) return bad(res, { campo: 'cupom', erro: c.erro });
      res.json({ codigo: c.codigo, descricao: c.descricao, desconto: c.desconto, freteGratis: c.freteGratis });
    });

    api.post('/compra', async (req, res) => {
      const b = body(req), ip = clientIp(req);
      if (b.site) return res.status(400).json({ erro: 'Não foi possível concluir a compra.' });                       // campo-armadilha: só robôs preenchem
      // Dois limites por endereço: compras concluídas e tentativas (para ninguém ficar testando cupons ou forçando cálculos de frete por aqui).
      if (buys.count(ip) >= MAX_BUYS_IP || tries.add(ip) > MAX_BUYS_IP * 5) return res.status(429).set('Retry-After', String(buys.retryAfter(ip))).json({ erro: 'Muitas tentativas em pouco tempo. Aguarde um pouco ou fale com a ESRO pelo WhatsApp.' });
      if (buysDay.count('todos') >= MAX_BUYS_DAY) return res.status(503).json({ erro: 'A compra pelo site está temporariamente indisponível. Fale com a ESRO pelo WhatsApp.' });
      const user = await accounts.current(req);
      let nome, telefone, email = '';
      if (user) { nome = user.name; telefone = user.phone; email = user.email; }
      else {
        const n = checkName(b.nome); if (n.erro) return bad(res, n);
        const t = checkPhone(b.telefone); if (t.erro) return bad(res, t);
        nome = n.value; telefone = t.value;
        if (str(b.email).trim()) { const e = checkEmail(b.email); if (e.erro) return bad(res, e); email = e.value; }
      }
      const { list, loja } = await load(true), chk = checkItems(list, b.itens); if (chk.erro) return bad(res, chk);
      // Entrega: o servidor calcula as opções de novo; o valor nunca vem do navegador.
      const cep = digits(b.cep), entrega = str(b.entrega);
      if (!chk.digital && entrega !== 'retirada' && cep.length !== 8) return bad(res, { campo: 'cep', erro: 'Digite o CEP com 8 números.' });
      const opcoes = await shipping(chk.digital ? '' : cep.length === 8 ? cep : '', chk, loja), frete = opcoes.find(o => o.id === entrega);
      if (!frete) return bad(res, { campo: 'entrega', erro: 'Escolha a forma de entrega. Se as opções mudaram, calcule o frete de novo.' });
      let endereco = null;
      if (!['digital', 'retirada'].includes(frete.id)) {
        endereco = { cep: cep.slice(0, 5) + '-' + cep.slice(5), rua: clean(b.rua, 120), numero: clean(b.numero, 20), complemento: clean(b.complemento, 80), bairro: clean(b.bairro, 80), cidade: clean(b.cidade, 80), uf: str(b.uf).toUpperCase().slice(0, 2) };
        for (const [campo, label] of [['rua', 'a rua'], ['numero', 'o número'], ['bairro', 'o bairro'], ['cidade', 'a cidade']]) if (!endereco[campo]) return bad(res, { campo, erro: `Preencha ${label} do endereço de entrega.` });
        if (!UFS.has(endereco.uf)) return bad(res, { campo: 'uf', erro: 'Escolha o estado.' });
      }
      const settings = (await repo.docGet('settings', 'store')) || {}, temPix = !!String(settings.pixKey || '').trim();
      const forma = b.pagamento === 'online' && mp.token ? 'online' : temPix ? 'pix' : mp.token ? 'online' : 'combinar';
      if (b.aceite !== true) return bad(res, { campo: 'aceite', erro: 'Para comprar é preciso aceitar a Política de Privacidade.' });
      let cup = null;
      if (clean(b.cupom, 30)) { cup = await coupon(b.cupom, chk.subtotal, frete.valor); if (!cup || cup.erro) return bad(res, { campo: 'cupom', erro: cup?.erro || 'Cupom não encontrado.' }); }
      const freteValor = cup?.freteGratis ? 0 : frete.valor, desconto = cup ? cup.desconto : 0, total = Math.max(0, r2(chk.subtotal - desconto + freteValor));
      const obs = cleanText(b.obs, 500);

      // Reserva o estoque e o cupom; se qualquer coisa falhar no caminho, devolve tudo o que já tinha reservado.
      const taken = []; let cupomUsado = false;
      const undo = async () => { for (const [id, q] of taken) await repo.productGive(id, q).catch(() => {}); if (cupomUsado) await repo.couponRelease(cup.id).catch(() => {}); cache.at = 0; };
      try {
        const need = {}; for (const i of chk.itens) if (i.controla) need[i.id] = (need[i.id] || 0) + i.qtd;
        for (const [id, q] of Object.entries(need)) {
          if (await repo.productTake(id, q)) taken.push([id, q]);
          else { await undo(); return res.status(409).json({ campo: 'itens', erro: `"${chk.itens.find(i => i.id === id).nome}" acabou de esgotar ou não tem mais essa quantidade. Atualize o carrinho.` }); }
        }
        if (cup) { cupomUsado = await repo.couponUse(cup.id); if (!cupomUsado) { await undo(); return res.status(409).json({ campo: 'cupom', erro: 'Este cupom acabou de atingir o limite de usos.' }); } }
        cache.at = 0;

        // Ficha do cliente: a da conta; sem conta, usa a ficha do mesmo e-mail ou telefone só se ela não for de outra conta do site.
        const now = new Date(), nowIso = now.toISOString();
        let clientId = user?.client_id || null;
        if (!clientId) {
          const found = (email && await repo.clientByEmail(email)) || await repo.clientByPhone(digits(telefone));
          if (found && !found.data.siteUser) clientId = found.id;
        }
        const numero = await repo.nextOrderNum(), id = 'pl_' + crypto.randomBytes(12).toString('hex'), pubToken = crypto.randomBytes(32).toString('base64url');
        const itens = chk.itens.map(i => ({ id: i.id, nome: i.nome, qtd: i.qtd, unit: i.unit, vars: i.vars, pers: i.pers }));
        const resumo = itens.length === 1 ? itens[0].nome : `${itens.length} produtos: ${itens.map(i => i.nome).join(', ')}`.slice(0, 160);
        const detalhes = itens.map(i => `${i.qtd} × ${i.nome}${i.vars.length ? ' (' + i.vars.map(v => v[0] + ': ' + v[1]).join(', ') + ')' : ''}${i.pers ? ' — personalização: ' + i.pers : ''}`).join('\n');
        const nota = `Compra pelo site: pedido #${numero} (${money(total)}).`, novaFicha = !clientId;
        if (novaFicha) clientId = 'cli_loja_' + crypto.randomBytes(9).toString('hex');
        const order = { num: numero, at: nowIso, month: nowIso.slice(0, 7), ch: 'site', status: 'novo', client: nome, contact: telefone, ref: '', city: endereco ? `${endereco.cidade}/${endereco.uf}` : '', item: resumo, catN: '',
          kind: chk.digital ? 'digital' : 'fisico', value: total, pay: forma === 'online' ? 'Mercado Pago' : 'PIX', payS: total > 0 ? 'Aguardando' : 'Pago', sinal: 0, qty: itens.reduce((a, i) => a + i.qtd, 0), due: '',
          note: detalhes + (obs ? '\n\nObservações do cliente: ' + obs : ''), files: [], leadId: '', pays: [], clientId, origem: 'loja', pub: pubToken,
          loja: { itens, subtotal: chk.subtotal, desconto, cupom: cup ? cup.codigo : '', frete: { id: frete.id, nome: frete.nome, valor: freteValor, prazo: frete.prazo || '', combinar: !!frete.combinar }, endereco, email, total,
            ...(taken.length ? { estoque: 'reservado', reserva: taken.map(t => [...t]) } : {}) } };
        await repo.docSet('orders', id, order);   // a partir daqui o pedido existe: o que vier depois não desfaz a reserva
        taken.length = 0; cupomUsado = false; buys.add(ip); buysDay.add('todos'); stat('compra');
        try {
          if (novaFicha) await repo.docSet('clients', clientId, { name: nome, phone: telefone, ig: '', email, city: order.city, origin: 'site', originNote: 'Compra pelo site', stage: 'comprou', interest: '',
            follow: false, followAt: '', followWhy: '', notes: [{ at: nowIso, text: nota }], at: nowIso, updatedAt: nowIso, lastAt: nowIso });
          else { const c = await repo.docGet('clients', clientId); if (c) await repo.docMerge('clients', clientId, { stage: 'comprou', updatedAt: nowIso, lastAt: nowIso, notes: [...(Array.isArray(c.notes) ? c.notes : []), { at: nowIso, text: nota }].slice(-200) }); }
        } catch (e) { log.error('[compra] ficha do cliente não atualizada:', e?.message || e); }
        const base = baseUrl(req), pix = total > 0 && forma === 'pix' ? pixPayload(settings, total, 'Pedido ' + numero, 'ESRO' + numero) : null;
        const pagamentoUrl = forma === 'online' ? await mpPreference(req, id, order, total, email) : null;
        if (base) { const tpl = templates({ publicUrl: base });
          // O e-mail do visitante não é confirmado: a mensagem leva só o que a loja escreveu e os itens, sem textos livres digitados na compra.
          mail(email, firstName(nome), tpl.pedidoRecebido({ ...order, client: firstName(nome), loja: { ...order.loja, itens: itens.map(i => ({ ...i, pers: '' })) } }, !!pix));
          mail(mailer?.owner, 'ESRO', tpl.pedidoNovo(order)); }
        res.status(201).json({ ok: true, numero, total, acompanhar: '/pedido/' + pubToken, pagamentoUrl,
          pix: pix ? { codigo: pix, valor: total, favorecido: String(settings.pixName || 'ESRO Papelaria').slice(0, 60) } : null });
      } catch (e) {
        await undo(); log.error('[compra] falha ao registrar o pedido:', e?.message || e);
        if (!res.headersSent) res.status(500).json({ erro: 'Não foi possível registrar a compra. Tente de novo ou fale com a ESRO pelo WhatsApp.' });
      }
    });

    // Acompanhamento pelo link secreto do pedido.
    const byToken = async (req, res) => {
      const ip = clientIp(req), t = str(req.params.token);
      if (lookups.add(ip) > 40) { res.status(429).json({ erro: 'Muitas consultas. Aguarde um minuto.' }); return null; }
      const row = TOKEN.test(t) ? await repo.orderByPub(t) : null;
      if (!row) { res.status(404).json({ erro: 'Pedido não encontrado. Confira o link que você recebeu.' }); return null; }
      return row;
    };
    api.get('/pedido-loja/:token', async (req, res) => {
      let row = await byToken(req, res); if (!row) return;
      // Voltando do Mercado Pago: confere o pagamento na hora, sem depender do aviso automático.
      const pay = str(req.query.pagamento);
      if (pay && dueOf(row.data) > 0) { const o = await applyPayment(pay, row.id, baseUrl(req)); if (o) row = { id: row.id, data: o }; }
      res.set('Cache-Control', 'no-store'); res.json({ pedido: orderOut(row.data, (await repo.docGet('settings', 'store')) || {}) });
    });
    api.post('/pedido-loja/:token/pagar', async (req, res) => {
      const row = await byToken(req, res); if (!row) return;
      const falta = dueOf(row.data), aberto = STATUS[row.data.status] !== undefined || !row.data.status;
      if (!mp.token || !(falta > 0) || !aberto) return res.status(409).json({ erro: 'Este pedido não tem pagamento online em aberto.' });
      const url = await mpPreference(req, row.id, row.data, falta, row.data.loja?.email || '');
      if (!url) return res.status(502).json({ erro: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' });
      res.json({ pagamentoUrl: url });
    });
  }

  /* ---------- Páginas, fotos, lista de produtos e aviso do Mercado Pago ---------- */
  function mount(app, siteHeaders) {
    const page = (file) => (_req, res) => { siteHeaders(res); res.set({ 'Cache-Control': 'no-cache' }); res.sendFile(path.join(SITE_DIR, file)); };
    app.get(/^\/(produto|pedido|finalizar)\.html$/, (_req, res) => res.status(404).json({ erro: 'não encontrado' }));   // os modelos das páginas não são servidos crus
    app.get('/finalizar', page('finalizar.html'));
    app.get('/entregas', (_req, res) => { siteHeaders(res); res.sendFile(path.join(SITE_DIR, 'entregas.html')); });
    app.get('/pedido/:token', (req, res) => { siteHeaders(res); res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }); res.sendFile(path.join(SITE_DIR, 'pedido.html')); });

    let tpl = null;
    app.get('/produto/:slug', async (req, res) => {
      tpl ??= fs.readFileSync(path.join(SITE_DIR, 'produto.html'), 'utf8');
      const p = (await load()).list.find(x => x.slug === req.params.slug), base = baseUrl(req);
      const title = p ? `${p.name} | ESRO Papelaria` : 'Produto não encontrado | ESRO Papelaria', desc = p ? (p.desc || `${p.name} na ESRO Papelaria.`).replace(/\s+/g, ' ').slice(0, 180) : 'Este produto não está mais disponível.';
      const img = p?.imgs[0] ? base + p.imgs[0] : base + '/assets/esro-contato.jpg';
      const priceTxt = !p ? '' : p.mode === 'compra' ? money(p.unit) : p.min || p.max ? (p.min === p.max ? money(p.min) : `${money(p.min)} a ${money(p.max)}`) : 'Sob consulta';
      const ld = p ? JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: desc, image: p.imgs.map(i => base + i), brand: { '@type': 'Brand', name: 'ESRO Papelaria' }, category: p.cat || undefined,
        ...(p.mode === 'compra' ? { offers: { '@type': 'Offer', url: `${base}/produto/${p.slug}`, priceCurrency: 'BRL', price: p.unit.toFixed(2), availability: 'https://schema.org/' + (p.stock === null || p.stock > 0 ? 'InStock' : 'OutOfStock') } } : {}) }).replace(/</g, '\\u003c') : '{}';
      const html = tpl.replace(/%%(\w+)%%/g, (_m, k) => ({ TITLE: esc(title), DESC: esc(desc), URL: esc(`${base}/produto/${p ? p.slug : ''}`), IMAGE: esc(img), NAME: esc(p ? p.name : 'Produto não encontrado'), CAT: esc(p?.cat || ''),
        PRICE: esc(priceTxt), TEXT: esc(p ? p.desc : 'Este produto não está mais disponível. Veja os outros produtos da ESRO.').replace(/\n/g, '<br>'), JSONLD: ld, ROBOTS: p ? 'index, follow' : 'noindex' }[k] ?? ''));
      siteHeaders(res); res.set('Cache-Control', 'no-cache'); res.status(p ? 200 : 404).type('html').send(html);
    });

    // Fotos de produtos enviadas pelo painel. Só aparecem as que estão em um produto ativo, e só imagens comuns.
    app.get('/img/:id', async (req, res) => {
      const id = String(req.params.id);
      const a = /^[a-f0-9]{24}$/.test(id) && (await load()).assets.has(id) ? await repo.assetGet(id) : null;
      if (!a || !RASTER.has(a.type)) return res.status(404).json({ erro: 'não encontrado' });
      res.set({ 'Content-Type': a.type, 'Content-Length': String(a.data.length), 'Cache-Control': 'public, max-age=604800', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin' });
      res.end(a.data);
    });

    // Lista de produtos para o Instagram/Facebook (Gerenciador de Comércio) e o Google Merchant Center.
    app.get('/feed/produtos.xml', async (req, res) => {
      const { list, assets } = await load(), base = baseUrl(req), types = {};
      for (const id of assets) types[id] = await repo.assetType(id);
      const raster = (u) => { const m = /^\/img\/([a-f0-9]{24})$/.exec(u); return m ? RASTER.has(types[m[1]]) : /\.(png|jpe?g|webp)$/.test(u); };
      const items = list.filter(p => p.mode === 'compra').map(p => ({ p, imgs: p.imgs.filter(raster) })).filter(x => x.imgs.length).map(({ p, imgs }) => `<item><g:id>${esc(p.id)}</g:id><title>${esc(p.name)}</title><description>${esc(p.desc || p.name)}</description><link>${esc(`${base}/produto/${p.slug}`)}</link>` +
        `<g:image_link>${esc(base + imgs[0])}</g:image_link>${imgs.slice(1, 6).map(i => `<g:additional_image_link>${esc(base + i)}</g:additional_image_link>`).join('')}<g:availability>${p.stock === null || p.stock > 0 ? 'in stock' : 'out of stock'}</g:availability>` +
        `<g:price>${p.price.toFixed(2)} BRL</g:price>${p.promoOn ? `<g:sale_price>${p.unit.toFixed(2)} BRL</g:sale_price>` : ''}<g:condition>new</g:condition><g:brand>ESRO Papelaria</g:brand>${p.cat ? `<g:product_type>${esc(p.cat)}</g:product_type>` : ''}<g:identifier_exists>no</g:identifier_exists></item>`);
      res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Content-Security-Policy': "default-src 'none'" });
      res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>ESRO Papelaria</title><link>${esc(base)}/</link><description>Produtos da ESRO Papelaria</description>${items.join('')}</channel></rss>`);
    });

    app.get('/sitemap.xml', async (req, res) => {
      const base = baseUrl(req), urls = ['/', '/entregas', '/privacidade', ...(await load()).list.map(p => '/produto/' + p.slug)];
      res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'" });
      res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${esc(base + u)}</loc></url>`).join('')}</urlset>`);
    });

    // Aviso do Mercado Pago. Com MP_WEBHOOK_SECRET a assinatura é conferida; em qualquer caso o pagamento é consultado direto no Mercado Pago.
    app.post('/webhooks/mercadopago', (req, res) => {
      if (!mp.token) return res.sendStatus(404);
      if (hooks.add(clientIp(req)) > 120) return res.sendStatus(429);
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const dataId = str(req.query['data.id']) || str(b.data?.id), type = str(req.query.type) || str(b.type) || str(req.query.topic);
      if (mp.secret) {
        const sig = String(req.get('x-signature') || ''), ts = /(?:^|,)\s*ts=([^,\s]+)/.exec(sig)?.[1], v1 = /(?:^|,)\s*v1=([a-f0-9]{64})/.exec(sig)?.[1], rid = req.get('x-request-id');
        const manifest = `${dataId ? `id:${dataId.toLowerCase()};` : ''}${rid ? `request-id:${rid};` : ''}${ts ? `ts:${ts};` : ''}`;
        const good = crypto.createHmac('sha256', mp.secret).update(manifest).digest('hex');
        if (!v1 || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(good))) return res.sendStatus(401);
      }
      res.sendStatus(200);   // o Mercado Pago exige resposta rápida; a conferência continua em seguida
      if (type === 'payment' && dataId) applyPayment(dataId, null, baseUrl(req));
    });
  }

  /* ---------- Painel ---------- */
  // Chamado quando um pedido muda no painel: avisa o cliente por e-mail quando o pagamento é confirmado e quando o pedido é enviado.
  async function orderChanged(id, prev, next, req) {
    if (!mailer?.enabled || !prev || !next || next.status === undefined) return;
    const { loja } = await load();
    const pago = next.payS === 'Pago' && prev.payS !== 'Pago' && !next.mailed?.pago && loja.emailPago !== false;
    const enviado = next.status === 'enviado' && prev.status !== 'enviado' && !next.mailed?.enviado && loja.emailEnviado !== false;
    if (!pago && !enviado) return;
    const to = await emailOf(next); if (!to) return;
    const now = new Date().toISOString(), patch = { mailed: { ...(next.mailed || {}), ...(pago ? { pago: now } : {}), ...(enviado ? { enviado: now } : {}) } };
    if (!next.pub) patch.pub = crypto.randomBytes(32).toString('base64url');   // pedido registrado no painel ganha o link de acompanhamento
    const base = baseUrl(req); if (!base) return log.warn?.('[e-mail] aviso não enviado: cadastre PUBLIC_URL no Render.');
    const o = (await repo.docMerge('orders', id, patch)).data, tpl = templates({ publicUrl: base });
    if (pago) mail(to, firstName(o.client), tpl.pagamentoConfirmado(o));
    if (enviado) mail(to, firstName(o.client), tpl.pedidoEnviado(o));
  }
  // Devolve ao estoque o que estava reservado por um pedido do site (excluído no painel ou sem pagamento há muito tempo).
  async function giveBack(id, o, motivo) {
    const l = o?.loja; if (!l || l.estoque !== 'reservado' || !Array.isArray(l.reserva)) return false;
    for (const r of l.reserva) if (Array.isArray(r) && ID.test(String(r[0])) && Number(r[1]) > 0) await repo.productGive(String(r[0]), Math.floor(Number(r[1])));
    cache.at = 0;
    if (motivo) await repo.docMerge('orders', id, { loja: { ...l, estoque: 'devolvido' }, note: `${o.note ? o.note + '\n\n' : ''}${motivo}` });
    return true;
  }
  // Chamado de hora em hora: compra do site sem nenhum pagamento depois do prazo (48 h, ou o que estiver nas configurações da loja) libera o estoque.
  async function releaseStale() {
    const { loja } = await load(), hours = Math.min(720, Math.max(1, Math.floor(num(loja.reservaHoras, 48)))); let n = 0;
    for (const row of await repo.staleShopOrders(hours)) if (await giveBack(row.id, row.data, `Aviso automático: sem pagamento há mais de ${hours} horas, o estoque reservado para este pedido voltou para a loja. Se o cliente pagar, confira se ainda há o produto.`)) n++;
    return n;
  }
  const orderDeleted = (id, prev) => (prev && dueOf(prev) > 0 && paidOf(prev) === 0 ? giveBack(id, prev, '') : Promise.resolve(false));

  function adminRoutes(panelApi) {
    panelApi.get('/loja/status', async (req, res) => {
      const base = baseUrl(req);
      res.json({ endereco: base, publicUrl: !!cfg.publicUrl, email: { ligado: !!mailer?.enabled, provedor: mailer?.provider || '', remetente: mailer?.from || '', avisos: mailer?.owner || '' },
        mercadopago: { ligado: !!mp.token, assinatura: !!mp.secret, aviso: `${base}/webhooks/mercadopago` }, melhorenvio: { ligado: !!cfg.melhorenvio?.token, teste: !!cfg.melhorenvio?.sandbox },
        feed: `${base}/feed/produtos.xml`, sitemap: `${base}/sitemap.xml` });
    });
    panelApi.post('/loja/email-teste', async (req, res) => {
      if (!mailer?.enabled) return res.status(422).json({ erro: 'O envio de e-mails ainda não está ligado. Cadastre EMAIL_PROVIDER, EMAIL_API_KEY e EMAIL_FROM no Render.' });
      const r = await mailer.send({ to: mailer.owner, toName: 'ESRO', ...templates({ publicUrl: baseUrl(req) }).teste() });
      if (!r.ok) return res.status(422).json({ erro: `O serviço de e-mail recusou o envio (${r.motivo}). Confira a chave e o remetente.` });
      res.json({ ok: true, para: mailer.owner });
    });
    panelApi.post('/loja/atualizar', (_req, res) => { cache.at = 0; res.json({ ok: true }); });   // o site passa a mostrar as mudanças na hora
  }

  return { load, findByName, publicRoutes, mount, adminRoutes, orderChanged, orderDeleted, releaseStale, applyPayment, invalidate: () => { cache.at = 0; } };
}
