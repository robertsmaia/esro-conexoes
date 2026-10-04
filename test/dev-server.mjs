// Servidor de teste: o servidor de verdade com um Postgres em memória (PGlite). Uso: node test/dev-server.mjs [porta]
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadConfig } from '../src/config.js';
import { migrate, repo as makeRepo } from '../src/db.js';
import { createApp } from '../src/app.js';
import { SEED_PRODUCTS } from '../src/shop.js';

const port = Number(process.argv[2] || 8787);
// Com LOJA_SIMPLES=1 o servidor sobe sem Mercado Pago, Melhor Envio e e-mails (como fica antes de cadastrar as chaves no Render).
const full = process.env.LOJA_SIMPLES !== '1';
const cfg = loadConfig({ MCP_SECRET: 'segredo-de-teste-com-mais-de-24-caracteres', PAINEL_SENHA: process.env.PAINEL_SENHA || 'senha-de-teste-123', IG_TOKEN: 'ig', IG_APP_SECRET: 'ig-secret', SITE_WEBHOOK_TOKEN: 'site-token-de-teste',
  ...(full ? { MP_ACCESS_TOKEN: 'TEST-token-de-mentira', ME_TOKEN: 'me-token-de-mentira', ME_SANDBOX: '1', EMAIL_PROVIDER: 'brevo', EMAIL_API_KEY: 'chave-de-mentira', EMAIL_FROM: 'ESRO Papelaria <loja@exemplo.com>', EMAIL_OWNER: 'dona@exemplo.com' } : {}) });
const pg = new PGlite(); const db = { q: (s, p) => pg.query(s, p), exec: (s) => pg.exec(s) };
await migrate(db); const repo = makeRepo(db);
if (await repo.docCount('catalog') === 0) for (const c of JSON.parse(await readFile(new URL('../src/seed-catalog.json', import.meta.url), 'utf8'))) await repo.docSet('catalog', c.id, c.data);
for (const p of SEED_PRODUCTS) await repo.docSet('products', p.id, p.data);
// Loja de exemplo: três produtos de compra direta, um cupom, PIX e entrega configurados
await repo.docSet('settings', 'store', { pixType: 'email', pixKey: 'pix@exemplo.com', pixName: 'ESRO PAPELARIA', pixCity: 'SAO PAULO' });
await repo.docSet('settings', 'loja', { cepOrigem: '03000-000', retirada: { on: true, texto: 'Zona Leste de São Paulo, com hora marcada' }, faixas: [{ nome: 'Entrega ESRO (Grande São Paulo)', de: '01000-000', ate: '09999-999', valor: 12, prazo: 'até 3 dias úteis' }], gratisAcima: 150, prazoProducao: 5, combinar: true });
await repo.docSet('products', 'prd_planner27', { name: 'Planner 2027 Floral', slug: 'planner-2027-floral', cat: 'Organização', desc: 'Planner em brochura com capa floral, divisórias mensais e folhas de planejamento semanal.\nA capa leva o seu nome.', mode: 'compra', price: 80, promo: { price: 72, until: '2099-12-31' },
  imgs: ['/assets/produtos/planner.svg', '/assets/produtos/agenda.svg'], vars: [{ nome: 'Tamanho', ops: [{ n: 'A5', add: 0 }, { n: 'A4', add: 15 }] }, { nome: 'Miolo', ops: [{ n: 'Pautado', add: 0 }, { n: 'Pontilhado', add: 0 }] }], pers: 'Nome para a capa', stock: 4, peso: 450, c: 25, l: 18, a: 3, digital: false, on: true, vitrine: true, ord: 0 });
await repo.docSet('products', 'prd_adesivos', { name: 'Cartela de adesivos', slug: 'cartela-de-adesivos', cat: 'Papelaria', desc: 'Cartela com 30 adesivos para planner e agenda.', mode: 'compra', price: 12.5, imgs: ['/assets/produtos/bloquinho.svg'], vars: [], pers: '', stock: null, peso: 30, c: 20, l: 12, a: 1, digital: false, on: true, vitrine: true, ord: 0.5 });
await repo.docSet('products', 'prd_guia', { name: 'Guia de rotina em PDF', slug: 'guia-de-rotina-em-pdf', cat: 'Educacional', desc: 'Guia digital para organizar a rotina da turma.', mode: 'compra', price: 29.9, imgs: ['/assets/produtos/pdf.svg'], vars: [], pers: '', stock: null, digital: true, on: true, vitrine: true, ord: 0.7 });
await repo.docSet('coupons', 'c1', { code: 'BEMVINDA10', kind: 'pct', value: 10, min: 0, from: '', to: '', max: 0, used: 0, on: true });
const outbox = [];   // e-mails "enviados" durante o teste (consulte em GET /__emails)
const now = new Date().toISOString();
const cid = await repo.upsertContact({ channel: 'instagram', peerId: 'IG1', name: 'Carol Mendes', username: 'prof.carol' });
await repo.addMessage({ id: 'mid.1', contactId: cid, channel: 'instagram', direction: 'in', origin: 'cliente', type: 'text', text: 'Oi! Vocês fazem agenda 2027?', ts: now });
await repo.addSiteOrder('W2001', { numero: 'W2001', cliente: { nome: 'Juliana Prado', telefone: '11987124410' }, itens: [{ nome: 'Planner personalizado', qtd: 1, valor: 78 }], total: 78, pagamento: 'pix', status: 'pago' });
// Instagram de mentira: perfil, publicações e (sem permissão) estatísticas
const IG = { me: { username: 'esro.papelaria', name: 'ESRO Papelaria', followers_count: 1284, follows_count: 310, media_count: 46 },
  media: { data: [['Agenda 2027 com nome na capa ♥ Encomendas abertas!', 'IMAGE', '', 96, 14], ['Como montar a pauta de formação em 10 minutos', 'VIDEO', 'REELS', 212, 31], ['Bloquinhos para o Dia dos Professores', 'CAROUSEL_ALBUM', '', 74, 9], ['Planner personalizado: escolha as divisórias', 'IMAGE', '', 58, 6]]
    .map(([caption, media_type, media_product_type, like_count, comments_count], i) => ({ id: 'm' + i, caption, media_type, media_product_type, like_count, comments_count, permalink: 'https://www.instagram.com/p/exemplo' + i + '/', timestamp: new Date(Date.now() - (i * 3 + 1) * 864e5).toISOString() })) } };
const payments = {};   // pagamentos de mentira do Mercado Pago (crie em POST /__pagar)
const fakeFetch = async (url, opts = {}) => { const u = String(url); const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
  if (u.includes('viacep.com.br/ws/99999999')) return json({ erro: true });
  if (u.includes('viacep.com.br/ws/')) return json({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' });
  if (u.includes('melhorenvio.com.br')) return json([{ id: 1, name: 'PAC', price: '23.40', delivery_time: 6, company: { name: 'Correios' } }, { id: 2, name: 'SEDEX', price: '41.10', delivery_time: 2, company: { name: 'Correios' } }]);
  if (u.includes('api.mercadopago.com/checkout/preferences')) { const b = JSON.parse(opts.body); return json({ id: 'pref', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=' + encodeURIComponent(b.external_reference) + '&valor=' + b.items[0].unit_price + '&volta=' + encodeURIComponent(b.back_urls.success) }, 201); }
  if (u.includes('api.mercadopago.com/v1/payments/')) { const p = payments[u.split('/').pop()]; return p ? json(p) : json({}, 404); }
  if (u.includes('api.brevo.com')) { outbox.push(JSON.parse(opts.body)); return json({ messageId: 'x' }, 201); }
  if (u.includes('/me/insights')) return json({ error: { code: 10 } }, 403);
  if (u.includes('/me/media')) return json(IG.media);
  if (u.includes('/me?')) return json(IG.me);
  return json(u.includes('/messages') ? { message_id: 'mid.out.' + Date.now() } : {}); };
cfg.store = { catalogTtlMs: 0 };
// Histórico de exemplo para a tela Monitoramento (30 dias de visitas, seguidores e mensagens)
const dayStr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
for (let i = 29; i >= 1; i--) { const d = dayStr(new Date(Date.now() - i * 864e5)), v = 6 + ((i * 7) % 11) + (i < 8 ? 9 : 0);
  await repo.statAdd(d, 'visita', 'total', v); await repo.statAdd(d, 'pagina', '/', Math.round(v * 1.6)); await repo.statAdd(d, 'pagina', '/entrar', Math.round(v * .2)); await repo.statAdd(d, 'pagina', '/conta', Math.round(v * .15));
  await repo.statAdd(d, 'origem', 'Instagram', Math.round(v * .55)); await repo.statAdd(d, 'origem', 'Direto ou link sem origem', Math.round(v * .25)); await repo.statAdd(d, 'origem', 'WhatsApp', Math.round(v * .12)); await repo.statAdd(d, 'origem', 'Google', Math.round(v * .08));
  await repo.statAdd(d, 'aparelho', 'Celular', Math.round(v * .8)); await repo.statAdd(d, 'aparelho', 'Computador', Math.round(v * .2));
  await repo.statAdd(d, 'evento', 'carrinho', Math.round(v * .3)); await repo.statAdd(d, 'evento', 'whatsapp', Math.round(v * .18)); await repo.statAdd(d, 'evento', 'catalogo_pdf', Math.round(v * .1)); if (i % 4 === 0) await repo.statAdd(d, 'evento', 'orcamento', 1);
  await repo.socialSet(d, 'instagram', 'seguidores', 1284 - i * 4 + (i % 3));
  const ts = new Date(Date.now() - i * 864e5).toISOString(), ts2 = new Date(Date.now() - i * 864e5 + 18 * 60e3).toISOString();
  if (i % 2) { await repo.addMessage({ id: 'h.in.' + i, contactId: cid, channel: 'instagram', direction: 'in', origin: 'cliente', type: 'text', text: 'Oi!', ts }); await repo.addMessage({ id: 'h.out.' + i, contactId: cid, channel: 'instagram', direction: 'out', origin: 'painel', type: 'text', text: 'Olá!', ts: ts2 }); } }
const app = createApp({ cfg, repo, fetchImpl: fakeFetch });
// Só no servidor de teste: ver os e-mails enviados e simular um pagamento aprovado no Mercado Pago.
const http = await import('node:http');
const srv = http.createServer((req, res) => {
  if (req.url === '/__emails') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(outbox)); }
  if (req.url.startsWith('/__pagar?')) { const q = new URL(req.url, 'http://x').searchParams; payments[q.get('id')] = { id: Number(q.get('id')), status: 'approved', external_reference: q.get('pedido'), transaction_amount: Number(q.get('valor')) }; return res.end('ok'); }
  app(req, res);
});
srv.listen(port, '127.0.0.1', () => console.log('pronto em http://127.0.0.1:' + port));
