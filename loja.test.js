// Testes da loja (compra direta), dos e-mails automáticos e dos usuários do painel.
// Tudo com um Postgres em memória (PGlite) e os serviços de fora (ViaCEP, Melhor Envio, Mercado Pago, Brevo) simulados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { loadConfig } from '../src/config.js';
import { migrate, repo as makeRepo } from '../src/db.js';
import { createApp } from '../src/app.js';
import { SEED_PRODUCTS } from '../src/shop.js';
import { crc16 } from '../src/pix.js';

const SECRET = 'segredo-de-teste-com-mais-de-24-caracteres', SENHA = 'senha-do-painel-123', MP_SECRET = 'segredo-do-aviso-mp';
const sent = [], payments = {};
const fakeFetch = async (url, opts = {}) => {
  const u = String(url), body = opts.body ? JSON.parse(opts.body) : null; sent.push({ url: u, body, headers: opts.headers || {} });
  const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
  if (u.includes('viacep.com.br/ws/99999999')) return json({ erro: true });
  if (u.includes('viacep.com.br/ws/')) return json({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' });
  if (u.includes('melhorenvio.com.br')) return json([{ id: 1, name: 'PAC', price: '23.40', delivery_time: 6, company: { name: 'Correios' } }, { id: 2, name: 'SEDEX', price: '41.10', delivery_time: 2, company: { name: 'Correios' } }, { id: 3, name: '.Package', error: 'Transportadora não atende este trecho' }]);
  if (u.includes('api.mercadopago.com/checkout/preferences')) return json({ id: 'pref1', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref1' }, 201);
  if (u.includes('api.mercadopago.com/v1/payments/')) { const p = payments[u.split('/').pop()]; return p ? json(p) : json({ message: 'not found' }, 404); }
  if (u.includes('api.brevo.com')) return json({ messageId: '<1@brevo>' }, 201);
  return json({}, 404);
};
const mk = async (env, store = {}) => {
  const pg = new PGlite(), db = { q: (s, p) => pg.query(s, p), exec: (s) => pg.exec(s) }; await migrate(db);
  const repo = makeRepo(db), cfg = loadConfig({ MCP_SECRET: SECRET, PAINEL_SENHA: SENHA, ...env }); cfg.store = { catalogTtlMs: 0, ordersPerHour: 100, ...store };
  for (const p of SEED_PRODUCTS) await repo.docSet('products', p.id, p.data);
  const app = createApp({ cfg, repo, fetchImpl: fakeFetch, log: { error() {}, warn() {} } }), server = app.listen(0); await new Promise(r => server.once('listening', r));
  return { pg, repo, server, app, base: `http://127.0.0.1:${server.address().port}` };
};
let A, B, base;   // A: todas as integrações ligadas; B: nenhuma
before(async () => {
  A = await mk({ MP_ACCESS_TOKEN: 'TEST-mp-token', MP_WEBHOOK_SECRET: MP_SECRET, ME_TOKEN: 'me-token', ME_SANDBOX: '1', EMAIL_PROVIDER: 'brevo', EMAIL_API_KEY: 'brevo-key', EMAIL_FROM: 'ESRO Papelaria <loja@exemplo.com>', EMAIL_OWNER: 'dona@exemplo.com' });
  B = await mk({}); base = A.base;
});
after(async () => { for (const x of [A, B]) { x.server.close(); await x.pg.close(); } });

const H = { 'content-type': 'application/json', 'x-esro': '1' };
const cookieFrom = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const call = (b, prefix) => (method, path, body, cookie, extra = {}) => fetch(b + prefix + path, { method, headers: { ...H, ...(cookie ? { cookie } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
const painel = (m, p, b, c, e) => call(base, '/painel/api')(m, p, b, c, e), site = (m, p, b, c, e) => call(base, '/api')(m, p, b, c, e);
const login = async (usuario, senha = SENHA, b = base) => { const r = await call(b, '/painel/api')('POST', '/login', usuario ? { usuario, senha } : { senha }); assert.equal(r.status, 204, 'login ' + (usuario || 'dono')); return cookieFrom(r); };
const wait = (ms = 80) => new Promise(r => setTimeout(r, ms));
const mails = (to) => sent.filter(s => s.url.includes('brevo') && (!to || s.body.to[0].email === to));
const PLANNER = { name: 'Planner 2027 Floral', cat: 'Organização', desc: 'Planner com capa floral.\nDivisórias mensais <b>e</b> adesivos.', mode: 'compra', price: 80, promo: { price: 72, until: '2099-12-31' }, imgs: ['/assets/produtos/planner.svg'],
  vars: [{ nome: 'Tamanho', ops: [{ n: 'A5', add: 0 }, { n: 'A4', add: 15 }] }, { nome: 'Miolo', ops: [{ n: 'Pautado', add: 0 }, { n: 'Pontilhado', add: 0 }] }], pers: 'Nome para a capa', stock: 5, peso: 450, c: 25, l: 18, a: 3, digital: false, on: true, vitrine: true, ord: 0 };
const ADESIVOS = { name: 'Cartela de adesivos', cat: 'Papelaria', desc: 'Cartela com 30 adesivos.', mode: 'compra', price: 12.5, imgs: [], vars: [], pers: '', stock: null, peso: 30, c: 20, l: 12, a: 1, digital: false, on: true, vitrine: true, ord: 1 };
const EBOOK = { name: 'Guia de rotina em PDF', cat: 'Educacional', desc: 'Guia digital.', mode: 'compra', price: 29.9, imgs: [], vars: [], pers: '', stock: null, digital: true, on: true, vitrine: false, ord: 2 };
const LOJA = { cepOrigem: '03000-000', retirada: { on: true, texto: 'Zona Leste de São Paulo, com hora marcada' }, faixas: [{ nome: 'Entrega ESRO (Grande São Paulo)', de: '01000-000', ate: '09999-999', valor: 12, prazo: 'até 3 dias úteis' }], gratisAcima: 150, prazoProducao: 5 };
const item = (over = {}) => ({ id: 'prd_planner27', qtd: 1, vars: { Tamanho: 'A5', Miolo: 'Pautado' }, pers: 'Helena', ...over });
const compra = (over = {}) => ({ itens: [item()], nome: 'Beatriz Lima', telefone: '(11) 97777-1234', email: 'bia@exemplo.com', cep: '01310-100', rua: 'Avenida Paulista', numero: '1000', complemento: 'ap 12', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP',
  entrega: 'faixa:0', pagamento: 'pix', aceite: true, ...over });
let dono;

test('Produtos: a vitrine vem do painel, com preço fixo, promoção, variações e estoque', async () => {
  const seed = (await (await site('GET', '/produtos')).json()).produtos;
  assert.equal(seed.length, 8); assert.ok(seed.every(p => p.modo === 'orcamento' && p.imagens.length === 1)); assert.deepEqual([seed[0].nome, seed[0].min, seed[0].max], ['Planner personalizado', 45, 90]);
  dono = await login();
  await painel('PUT', '/db/settings/store', { pixType: 'email', pixKey: 'pix@exemplo.com', pixName: 'ESRO Papelaria', pixCity: 'Sao Paulo' }, dono);
  await painel('PUT', '/db/settings/loja', LOJA, dono);
  for (const [id, d] of [['prd_planner27', PLANNER], ['prd_adesivos', ADESIVOS], ['prd_ebook', EBOOK], ['prd_desligado', { ...ADESIVOS, name: 'Produto desligado', on: false }], ['prd_semPreco', { ...ADESIVOS, name: 'Sem preço', price: 0 }]]) assert.equal((await painel('PUT', '/db/products/' + id, d, dono)).status, 200);
  const list = (await (await site('GET', '/produtos')).json()).produtos, p = list[0];
  assert.equal(list.length, 12); assert.ok(!list.some(x => x.nome === 'Produto desligado')); assert.equal(list.find(x => x.nome === 'Sem preço').modo, 'orcamento');   // sem preço fixo não dá para comprar direto
  assert.deepEqual([p.id, p.slug, p.modo, p.preco, p.precoDe, p.personalizacao, p.disponivel, p.restam], ['prd_planner27', 'planner-2027-floral', 'compra', 72, 80, 'Nome para a capa', true, 5]);
  assert.deepEqual(p.variacoes[0], { nome: 'Tamanho', opcoes: [{ nome: 'A5', acrescimo: 0 }, { nome: 'A4', acrescimo: 15 }] });
  assert.equal(JSON.stringify(list).includes('stock'), false);
  // Promoção vencida volta ao preço cheio
  await painel('PATCH', '/db/products/prd_adesivos', { promo: { price: 9, until: '2020-01-01' } }, dono);
  const ad = (await (await site('GET', '/produtos/cartela-de-adesivos')).json()).produto; assert.deepEqual([ad.preco, ad.precoDe], [12.5, null]);
  assert.equal((await site('GET', '/produtos/nao-existe')).status, 404);
});

test('Produtos: página própria para buscadores, sem deixar o texto do painel virar código', async () => {
  await painel('PATCH', '/db/products/prd_adesivos', { desc: 'Cartela </script><script>alert(1)</script> "com" 30 adesivos.' }, dono);
  const r = await fetch(base + '/produto/cartela-de-adesivos'), html = await r.text();
  assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /script-src 'self';/);
  assert.match(html, /<title>Cartela de adesivos \| ESRO Papelaria<\/title>/); assert.ok(!html.includes('<script>alert(1)')); assert.ok(html.includes('\\u003c/script>') && html.includes('&lt;script&gt;'));
  assert.ok(!/%%\w+%%/.test(html)); assert.match(html, /"@type":"Product"/); assert.match(html, /"price":"12.50"/);
  const nf = await fetch(base + '/produto/nao-existe'); assert.equal(nf.status, 404); assert.match(await nf.text(), /noindex/);
  assert.equal((await fetch(base + '/produto.html')).status, 404);
  await painel('PATCH', '/db/products/prd_adesivos', { desc: ADESIVOS.desc }, dono);
});

test('Produtos: fotos enviadas pelo painel só ficam públicas quando estão em um produto ativo', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), up = (name, type, data) => fetch(base + '/painel/api/assets?name=' + name, { method: 'POST', headers: { 'x-esro': '1', 'content-type': type, cookie: dono }, body: data }).then(r => r.json());
  const foto = await up('adesivos.png', 'image/png', png), solta = await up('arte-de-cliente.png', 'image/png', png), svg = await up('x.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
  await painel('PATCH', '/db/products/prd_adesivos', { imgs: ['asset:' + foto.id, 'asset:' + svg.id, 'https://outro-site.example/x.png', '/assets/../src/config.js'] }, dono);
  const p = (await (await site('GET', '/produtos/cartela-de-adesivos')).json()).produto; assert.deepEqual(p.imagens, ['/img/' + foto.id, '/img/' + svg.id]);
  const img = await fetch(base + '/img/' + foto.id); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.match(img.headers.get('cache-control'), /public/);
  assert.equal((await fetch(base + '/img/' + solta.id)).status, 404);   // arte de cliente nunca fica pública
  assert.equal((await fetch(base + '/img/' + svg.id)).status, 404);     // só imagens comuns
  // Lista de produtos para Instagram/Google: só compra direta com foto comum
  const feed = await fetch(base + '/feed/produtos.xml'), xml = await feed.text(); assert.match(feed.headers.get('content-type'), /xml/);
  assert.equal((xml.match(/<item>/g) || []).length, 1); assert.ok(xml.includes(`<g:image_link>${base}/img/${foto.id}</g:image_link>`)); assert.ok(xml.includes('<g:price>12.50 BRL</g:price>') && xml.includes(`<link>${base}/produto/cartela-de-adesivos</link>`));
  const sm = await (await fetch(base + '/sitemap.xml')).text(); assert.ok(sm.includes(`<loc>${base}/produto/planner-2027-floral</loc>`) && !sm.includes('produto-desligado'));
});

test('Frete: retirada, tabela por CEP, transportadora, frete grátis e entrega digital', async () => {
  const q = async (body) => { const r = await site('POST', '/frete', body); return [r.status, await r.json()]; };
  let [st, f] = await q({ cep: '01310-100', itens: [item()] });
  assert.equal(st, 200); assert.deepEqual(f.endereco, { rua: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' }); assert.equal(f.subtotal, 72);
  assert.deepEqual(f.opcoes.map(o => [o.id, o.valor]), [['retirada', 0], ['faixa:0', 12], ['me:1', 23.4], ['me:2', 41.1]]); assert.equal(f.opcoes[2].nome, 'Correios PAC'); assert.equal(f.opcoes[2].prazo, '11 dia(s) úteis');   // 6 do transporte + 5 de produção
  const me = sent.findLast(s => s.url.includes('melhorenvio')); assert.match(me.url, /^https:\/\/sandbox\.melhorenvio\.com\.br\/api\/v2\/me\/shipment\/calculate$/); assert.equal(me.headers.authorization, 'Bearer me-token');
  assert.deepEqual(me.body, { from: { postal_code: '03000000' }, to: { postal_code: '01310100' }, products: [{ id: 'prd_planner27', width: 18, height: 3, length: 25, weight: 0.45, insurance_value: 72, quantity: 1 }] });
  // Acima de R$ 150 a opção mais barata sai de graça
  [st, f] = await q({ cep: '01310100', itens: [item({ qtd: 2, vars: { Tamanho: 'A4', Miolo: 'Pautado' } })] }); assert.equal(f.subtotal, 174); assert.deepEqual(f.opcoes.find(o => o.id === 'faixa:0'), { id: 'faixa:0', nome: 'Entrega ESRO (Grande São Paulo)', valor: 0, prazo: 'até 3 dias úteis', gratis: true });
  // Produto digital não tem frete nem pede endereço; sem CEP só aparece a retirada
  [st, f] = await q({ itens: [{ id: 'prd_ebook', qtd: 1 }] }); assert.deepEqual([f.digital, f.opcoes.map(o => o.id)], [true, ['digital']]);
  [st, f] = await q({ itens: [item()] }); assert.deepEqual(f.opcoes.map(o => o.id), ['retirada']);
  [st, f] = await q({ cep: '99999-999', itens: [item()] }); assert.equal(st, 422); assert.equal(f.campo, 'cep');
  [st, f] = await q({ cep: '01310-100', itens: [item({ vars: { Tamanho: 'A3' } })] }); assert.equal(st, 422); assert.match(f.erro, /Escolha "Tamanho"/);
  // Sem transportadora nem tabela para o CEP: "a combinar"
  const [, g] = await (async () => { const r = await call(B.base, '/api')('POST', '/frete', { cep: '69000-000', itens: [{ id: 'prd_x', qtd: 1 }] }); return [r.status, await r.json()]; })(); assert.match(g.erro, /saiu da loja/);
  const dB = await login(null, SENHA, B.base); await call(B.base, '/painel/api')('PUT', '/db/products/prd_x', ADESIVOS, dB);
  const fb = await (await call(B.base, '/api')('POST', '/frete', { cep: '69000-000', itens: [{ id: 'prd_x', qtd: 1 }] })).json(); assert.deepEqual(fb.opcoes.map(o => [o.id, o.combinar]), [['combinar', true]]);
});

test('Cupons: porcentagem, valor fixo, frete grátis, validade, mínimo e limite de usos', async () => {
  for (const [id, c] of Object.entries({ c1: { code: 'bemvinda10', kind: 'pct', value: 10, on: true }, c2: { code: 'MENOS20', kind: 'valor', value: 20, min: 100, on: true }, c3: { code: 'FRETEGRATIS', kind: 'frete', on: true },
    c4: { code: 'VENCIDO', kind: 'pct', value: 50, to: '2020-01-01', on: true }, c5: { code: 'UMAVEZ', kind: 'pct', value: 5, max: 1, on: true }, c6: { code: 'DESLIGADO', kind: 'pct', value: 90, on: false } })) await painel('PUT', '/db/coupons/' + id, c, dono);
  const q = async (codigo, itens = [item()], frete = 12) => { const r = await site('POST', '/cupom', { codigo, itens, frete }); return [r.status, await r.json()]; };
  assert.deepEqual(await q(' BemVinda10 '), [200, { codigo: 'BEMVINDA10', descricao: '10% de desconto', desconto: 7.2, freteGratis: false }]);
  assert.match((await q('MENOS20'))[1].erro, /a partir de R\$ 100,00/); assert.equal((await q('MENOS20', [item({ qtd: 2 })]))[1].desconto, 20);
  assert.deepEqual((await q('FRETEGRATIS'))[1], { codigo: 'FRETEGRATIS', descricao: 'Frete grátis', desconto: 0, freteGratis: true });
  for (const c of ['VENCIDO', 'DESLIGADO', 'NAOEXISTE']) assert.equal((await q(c))[0], 422);
  assert.match((await q('VENCIDO'))[1].erro, /não está valendo/); assert.match((await q('NAOEXISTE'))[1].erro, /não encontrado/);
});

test('Compra: o servidor confere itens, endereço, entrega e aceite antes de registrar', async () => {
  const t = async (over, campo, re) => { const r = await site('POST', '/compra', compra(over)), j = await r.json(); assert.equal(r.status, 422, JSON.stringify(j)); assert.equal(j.campo, campo); if (re) assert.match(j.erro, re); };
  await t({ nome: 'B' }, 'nome'); await t({ telefone: '123' }, 'telefone'); await t({ email: 'bia@' }, 'email');
  await t({ itens: [] }, 'itens'); await t({ itens: [item({ pers: ' ' })] }, 'itens', /Nome para a capa/); await t({ itens: [item({ vars: { Tamanho: 'A5' } })] }, 'itens', /Miolo/);
  await t({ itens: [{ id: 'prd_planner', qtd: 1 }] }, 'itens', /sob orçamento/); await t({ itens: [item({ qtd: 0 })] }, 'itens');
  await t({ cep: '0131' }, 'cep'); await t({ numero: '' }, 'numero'); await t({ uf: 'XX' }, 'uf'); await t({ entrega: 'me:99' }, 'entrega'); await t({ entrega: 'faixa:0', cep: '69000-000' }, 'entrega');
  await t({ aceite: false }, 'aceite', /Política de Privacidade/); await t({ cupom: 'VENCIDO' }, 'cupom');
  const s = await site('POST', '/compra', compra({ itens: [item({ qtd: 6 })] })); assert.equal(s.status, 409); assert.match((await s.json()).erro, /Só restam 5/);
  assert.equal((await site('POST', '/compra', compra({ site: 'http://spam' }))).status, 400);
  assert.equal((await fetch(base + '/api/compra', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(compra()) })).status, 400);   // sem o cabeçalho próprio
  assert.equal((await site('POST', '/compra', compra(), null, { origin: 'https://outro.example' })).status, 403);
  assert.equal((await (await painel('GET', '/sync?after=0', undefined, dono)).json()).docs.filter(d => d.col === 'orders').length, 0);
});

let pedido;   // a primeira compra, usada nos testes seguintes
test('Compra com PIX: preço calculado no servidor, pedido no painel, estoque baixado e e-mails enviados', async () => {
  sent.length = 0;
  const r = await site('POST', '/compra', compra({ itens: [item({ qtd: 2, vars: { Tamanho: 'A4', Miolo: 'Pontilhado' }, unit: 1, preco: 1 }), { id: 'prd_adesivos', qtd: 3 }], cupom: 'bemvinda10', obs: 'Entregar à tarde', total: 1, frete: 0 }));
  const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j));
  // 2 × (72 + 15) + 3 × 12,50 = 211,50; cupom de 10% = 21,15; frete da tabela sai grátis acima de R$ 150
  assert.equal(j.total, 190.35); assert.match(j.acompanhar, /^\/pedido\/[\w-]{43}$/); assert.equal(j.pagamentoUrl, null);
  assert.match(j.pix.codigo, /^000201/); assert.equal(crc16(j.pix.codigo.slice(0, -4)), j.pix.codigo.slice(-4)); assert.ok(j.pix.codigo.includes('5406190.35'));
  const docs = (await (await painel('GET', '/sync?after=0', undefined, dono)).json()).docs, o = docs.find(d => d.col === 'orders'); pedido = { id: o.id, ...o.data, token: j.acompanhar.split('/').pop() };
  assert.match(o.id, /^pl_[a-f0-9]{24}$/); assert.equal(o.data.num, j.numero); assert.equal(o.data.num, 1001);
  assert.deepEqual([o.data.ch, o.data.status, o.data.payS, o.data.pay, o.data.value, o.data.qty, o.data.kind, o.data.client, o.data.contact, o.data.city, o.data.origem], ['site', 'novo', 'Aguardando', 'PIX', 190.35, 5, 'fisico', 'Beatriz Lima', '(11) 97777-1234', 'São Paulo/SP', 'loja']);
  assert.deepEqual(o.data.loja.itens, [{ id: 'prd_planner27', nome: 'Planner 2027 Floral', qtd: 2, unit: 87, vars: [['Tamanho', 'A4'], ['Miolo', 'Pontilhado']], pers: 'Helena' }, { id: 'prd_adesivos', nome: 'Cartela de adesivos', qtd: 3, unit: 12.5, vars: [], pers: '' }]);
  assert.deepEqual([o.data.loja.subtotal, o.data.loja.desconto, o.data.loja.cupom, o.data.loja.frete.valor, o.data.loja.frete.nome, o.data.loja.total], [211.5, 21.15, 'BEMVINDA10', 0, 'Entrega ESRO (Grande São Paulo)', 190.35]);
  assert.deepEqual(o.data.loja.endereco, { cep: '01310-100', rua: 'Avenida Paulista', numero: '1000', complemento: 'ap 12', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' });
  assert.match(o.data.note, /2 × Planner 2027 Floral \(Tamanho: A4, Miolo: Pontilhado\) — personalização: Helena/); assert.match(o.data.note, /Entregar à tarde/);
  assert.equal(docs.find(d => d.col === 'products' && d.id === 'prd_planner27').data.stock, 3); assert.equal(docs.find(d => d.col === 'coupons' && d.id === 'c1').data.used, 1);
  const cli = docs.find(d => d.col === 'clients' && d.id === o.data.clientId); assert.deepEqual([cli.data.name, cli.data.email, cli.data.stage, cli.data.origin], ['Beatriz Lima', 'bia@exemplo.com', 'comprou', 'site']);
  await wait();
  const m = mails(); assert.equal(m.length, 2); assert.deepEqual(m.map(x => x.body.to[0].email).sort(), ['bia@exemplo.com', 'dona@exemplo.com']);
  const mc = mails('bia@exemplo.com')[0]; assert.equal(mc.headers['api-key'], 'brevo-key'); assert.deepEqual(mc.body.sender, { name: 'ESRO Papelaria', email: 'loja@exemplo.com' }); assert.equal(mc.body.subject, 'Recebemos o seu pedido nº 1001');
  assert.ok(mc.body.htmlContent.includes(`${base}/pedido/${pedido.token}`) && mc.body.htmlContent.includes('R$ 190,35') && mc.body.htmlContent.includes('Tamanho: A4'));
  // O e-mail do visitante não é confirmado: o texto livre da personalização vai só para a loja
  assert.ok(!mc.body.htmlContent.includes('Helena') && mails('dona@exemplo.com')[0].body.htmlContent.includes('Personalização: Helena')); assert.deepEqual(mc.body.replyTo, { email: 'dona@exemplo.com' });
  assert.equal((await (await site('GET', '/produtos/planner-2027-floral')).json()).produto.restam, 3);
});

test('Acompanhamento: o link secreto mostra o pedido, o PIX, o rastreio e a nota; sem o link, nada', async () => {
  const page = await fetch(base + '/pedido/' + pedido.token); assert.equal(page.status, 200); assert.match(page.headers.get('x-robots-tag'), /noindex/); assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  const p = (await (await site('GET', '/pedido-loja/' + pedido.token)).json()).pedido;
  assert.deepEqual([p.numero, p.statusNome, p.cliente, p.total, p.pago, p.falta, p.pagamento, p.cidade, p.pix.valor, p.pagarOnline, p.rastreio, p.nota], [1001, 'Recebido', 'Beatriz', 190.35, 0, 190.35, 'Aguardando', 'São Paulo/SP', 190.35, false, null, null]);
  assert.equal(p.itens.length, 2); assert.ok(!JSON.stringify(p).includes('Paulista') && !JSON.stringify(p).includes('97777') && !JSON.stringify(p).includes('bia@'));   // nada de endereço, telefone ou e-mail
  await painel('PATCH', '/db/orders/' + pedido.id, { status: 'enviado', track: 'AA123456789BR', trackUrl: 'https://rastreamento.correios.com.br/app/index.php', nf: '000.123', nfUrl: 'javascript:alert(1)', payS: 'Pago', pays: [{ at: new Date().toISOString(), value: 190.35 }] }, dono);
  const q = (await (await site('GET', '/pedido-loja/' + pedido.token)).json()).pedido;
  assert.deepEqual([q.statusNome, q.pagamento, q.falta, q.pix, q.rastreio.codigo, q.rastreio.url, q.nota.numero, q.nota.url], ['Enviado', 'Pago', 0, null, 'AA123456789BR', 'https://rastreamento.correios.com.br/app/index.php', '000.123', '']);
  assert.equal((await site('GET', '/pedido-loja/' + 'x'.repeat(43))).status, 404); assert.equal((await site('GET', '/pedido-loja/curto')).status, 404); assert.equal((await site('GET', '/pedido-loja/' + pedido.id)).status, 404);
});

test('E-mails: pagamento confirmado e pedido enviado avisam o cliente uma única vez', async () => {
  await wait(120);
  const m = mails('bia@exemplo.com').map(x => x.body.subject); assert.deepEqual(m.slice(1).sort(), ['Pagamento confirmado: pedido nº 1001', 'Seu pedido nº 1001 foi enviado']);
  assert.ok(mails('bia@exemplo.com').find(x => /enviado/.test(x.body.subject)).body.htmlContent.includes('AA123456789BR'));
  const n = mails().length;
  await painel('PATCH', '/db/orders/' + pedido.id, { status: 'producao' }, dono); await painel('PATCH', '/db/orders/' + pedido.id, { status: 'enviado' }, dono); await wait(120);
  assert.equal(mails().length, n);   // voltar e marcar de novo não manda outro e-mail
  // Pedido registrado à mão no painel, de cliente com e-mail na ficha: ganha link de acompanhamento e também é avisado
  await painel('PUT', '/db/clients/cm1', { name: 'Lívia Prado', email: 'livia@exemplo.com', phone: '(11) 95555-0000' }, dono);
  await painel('PUT', '/db/orders/pm1', { num: 1500, at: new Date().toISOString(), ch: 'whatsapp', status: 'producao', client: 'Lívia Prado', item: 'Agenda personalizada', value: 70, qty: 1, payS: 'Pago', pays: [{ value: 70 }], clientId: 'cm1' }, dono);
  await painel('PATCH', '/db/orders/pm1', { status: 'enviado' }, dono); await wait(120);
  const ml = mails('livia@exemplo.com'); assert.equal(ml.length, 1); const tok = /\/pedido\/([\w-]{43})/.exec(ml[0].body.htmlContent)[1];
  const pm = (await (await site('GET', '/pedido-loja/' + tok)).json()).pedido; assert.deepEqual([pm.numero, pm.statusNome, pm.itens[0].nome, pm.falta], [1500, 'Enviado', 'Agenda personalizada', 0]);
  // Loja sem e-mail configurado segue funcionando, sem enviar nada
  const before = sent.length, dB = await login(null, SENHA, B.base);
  const r = await call(B.base, '/api')('POST', '/compra', compra({ itens: [{ id: 'prd_x', qtd: 1 }], entrega: 'combinar', cep: '69000-000' })); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j));
  assert.deepEqual([j.pix, j.pagamentoUrl, j.total], [null, null, 12.5]); await wait(); assert.equal(sent.slice(before).filter(s => /brevo|mercadopago/.test(s.url)).length, 0);
  const st = await (await call(B.base, '/painel/api')('GET', '/loja/status', undefined, dB)).json(); assert.deepEqual([st.email.ligado, st.mercadopago.ligado, st.melhorenvio.ligado], [false, false, false]);
  assert.equal((await call(B.base, '/painel/api')('POST', '/loja/email-teste', {}, dB)).status, 422);
  const sa = await (await painel('GET', '/loja/status', undefined, dono)).json(); assert.deepEqual([sa.email.ligado, sa.email.provedor, sa.mercadopago.ligado, sa.mercadopago.assinatura, sa.melhorenvio.teste, sa.feed], [true, 'brevo', true, true, true, base + '/feed/produtos.xml']);
  assert.ok(!JSON.stringify(sa).includes('brevo-key') && !JSON.stringify(sa).includes('TEST-mp-token'));   // as chaves nunca voltam para o navegador
  assert.equal((await painel('POST', '/loja/email-teste', {}, dono)).status, 200);
});

test('Estoque e cupom: a última unidade não é vendida duas vezes e nada fica reservado se a compra falhar', async () => {
  await painel('PATCH', '/db/products/prd_planner27', { stock: 1 }, dono);
  const rs = await Promise.all([1, 2, 3].map(() => site('POST', '/compra', compra({ entrega: 'retirada' }))));
  assert.deepEqual(rs.map(r => r.status).sort(), [201, 409, 409]);
  const stock = async () => (await A.repo.docGet('products', 'prd_planner27')).stock; assert.equal(await stock(), 0);
  assert.equal((await (await site('GET', '/produtos/planner-2027-floral')).json()).produto.disponivel, false);
  // Cupom de uso único: a segunda compra é recusada e o estoque reservado volta
  await painel('PATCH', '/db/products/prd_planner27', { stock: 4 }, dono);
  assert.equal((await site('POST', '/compra', compra({ entrega: 'retirada', cupom: 'UMAVEZ' }))).status, 201); assert.equal(await stock(), 3);
  const again = await site('POST', '/compra', compra({ entrega: 'retirada', cupom: 'UMAVEZ' })); assert.equal(again.status, 422); assert.equal(await stock(), 3);
  await A.repo.docMerge('coupons', 'c5', { used: 0 });
  const two = await Promise.all([1, 2].map(() => site('POST', '/compra', compra({ entrega: 'retirada', cupom: 'UMAVEZ' })))); const st2 = two.map(r => r.status).sort(); assert.equal(st2[0], 201); assert.ok([409, 422].includes(st2[1]));   // a segunda é recusada na conferência ou na reserva do cupom
  assert.equal(await stock(), 2);
  assert.equal((await A.repo.docGet('coupons', 'c5')).used, 1);
});

test('Compra com a conta aberta: usa os dados da conta e aparece em "Minha conta"; visitante não entra em ficha de quem tem conta', async () => {
  const cad = await site('POST', '/conta/cadastro', { nome: 'Helena Rocha', email: 'helena@exemplo.com', telefone: '11 96666-0000', senha: 'caderno-azul-27', aceite: true }), ck = cookieFrom(cad); assert.equal(cad.status, 201);
  const r = await site('POST', '/compra', compra({ nome: 'Outro Nome', telefone: '', email: '', itens: [{ id: 'prd_ebook', qtd: 1 }], entrega: 'digital', cep: '' }, ), ck), j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j));
  const o = (await A.repo.orderByPub(j.acompanhar.split('/').pop())).data; assert.deepEqual([o.client, o.contact, o.loja.email, o.kind, o.loja.endereco, o.loja.frete.id], ['Helena Rocha', '(11) 96666-0000', 'helena@exemplo.com', 'digital', null, 'digital']);
  const mine = (await (await site('GET', '/conta/pedidos', undefined, ck)).json()).pedidos; assert.equal(mine.length, 1); assert.deepEqual([mine[0].numero, mine[0].valor, mine[0].pix.valor], [o.num, 29.9, 29.9]);
  // Visitante que digita o e-mail de quem tem conta: o pedido não vai parar na conta dessa pessoa
  const v = await site('POST', '/compra', compra({ email: 'helena@exemplo.com', telefone: '(11) 96666-0000', itens: [{ id: 'prd_ebook', qtd: 1 }], entrega: 'digital', cep: '' })); assert.equal(v.status, 201);
  assert.equal((await (await site('GET', '/conta/pedidos', undefined, ck)).json()).pedidos.length, 1);
  // Visitante que já tinha ficha (mesmo e-mail), sem conta: o pedido entra na ficha que já existia
  const b = await site('POST', '/compra', compra({ itens: [{ id: 'prd_ebook', qtd: 1 }], entrega: 'digital', cep: '' })), ob = (await A.repo.orderByPub((await b.json()).acompanhar.split('/').pop())).data; assert.equal(ob.clientId, pedido.clientId);
});

test('Pagamento online: Mercado Pago cria a cobrança e o pagamento é confirmado sozinho, sem confiar no aviso', async () => {
  sent.length = 0;
  const r = await site('POST', '/compra', compra({ email: 'theo@exemplo.com', nome: 'Theo Dias', telefone: '(11) 94444-1111', itens: [{ id: 'prd_adesivos', qtd: 2 }], entrega: 'me:1', pagamento: 'online' })), j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j));
  assert.deepEqual([j.total, j.pix, j.pagamentoUrl], [48.4, null, 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref1']);   // 25,00 + 23,40 de frete
  const token = j.acompanhar.split('/').pop(), row = await A.repo.orderByPub(token), pref = sent.find(s => s.url.includes('checkout/preferences'));
  assert.equal(pref.headers.authorization, 'Bearer TEST-mp-token'); assert.equal(pref.body.external_reference, row.id); assert.deepEqual(pref.body.items, [{ id: String(j.numero), title: `Pedido ESRO nº ${j.numero}`, quantity: 1, unit_price: 48.4, currency_id: 'BRL' }]);
  assert.deepEqual(pref.body.back_urls, { success: `${base}/pedido/${token}`, pending: `${base}/pedido/${token}`, failure: `${base}/pedido/${token}` }); assert.deepEqual(pref.body.payer, { email: 'theo@exemplo.com' });
  assert.deepEqual([row.data.pay, row.data.payS], ['Mercado Pago', 'Aguardando']);
  const hook = (id, { secret = MP_SECRET, rid = 'req-1', ts = '1700000000' } = {}) => { const v1 = crypto.createHmac('sha256', secret).update(`id:${id};request-id:${rid};ts:${ts};`).digest('hex');
    return fetch(`${base}/webhooks/mercadopago?data.id=${id}&type=payment`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': rid, 'x-signature': `ts=${ts},v1=${v1}` }, body: JSON.stringify({ action: 'payment.updated', type: 'payment', data: { id } }) }); };
  payments['777001'] = { id: 777001, status: 'approved', external_reference: row.id, transaction_amount: 48.4, date_approved: '2026-10-03T15:00:00.000-03:00' };
  assert.equal((await hook('777001', { secret: 'chave-errada' })).status, 401); assert.equal((await fetch(`${base}/webhooks/mercadopago?data.id=777001&type=payment`, { method: 'POST' })).status, 401);
  assert.equal((await A.repo.docGet('orders', row.id)).payS, 'Aguardando');
  // Aviso verdadeiro, mas de um pagamento ainda pendente: nada muda
  payments['777000'] = { id: 777000, status: 'pending', external_reference: row.id, transaction_amount: 48.4 }; assert.equal((await hook('777000')).status, 200); await wait(); assert.equal((await A.repo.docGet('orders', row.id)).payS, 'Aguardando');
  assert.equal((await hook('777001')).status, 200); assert.equal((await hook('777001')).status, 200); await wait(150);   // o Mercado Pago repete os avisos
  const o = await A.repo.docGet('orders', row.id); assert.deepEqual([o.payS, o.pays.length, o.pays[0].value, o.pays[0].ext, o.pays[0].at], ['Pago', 1, 48.4, 'mp:777001', '2026-10-03T18:00:00.000Z']);
  assert.deepEqual(mails('theo@exemplo.com').map(x => x.body.subject), [`Recebemos o seu pedido nº ${j.numero}`, `Pagamento confirmado: pedido nº ${j.numero}`]);
  const p = (await (await site('GET', '/pedido-loja/' + token)).json()).pedido; assert.deepEqual([p.pagamento, p.falta, p.pagarOnline, p.pix], ['Pago', 0, false, null]);
  // Aviso de um pagamento que não é deste site é ignorado
  payments['777002'] = { id: 777002, status: 'approved', external_reference: 'outro-sistema', transaction_amount: 10 }; assert.equal((await hook('777002')).status, 200);
  // Contestação depois de pago vira um alerta na observação do pedido
  payments['777001'].status = 'charged_back'; await hook('777001'); await wait(); assert.match((await A.repo.docGet('orders', row.id)).note, /contestação do pagamento \(mp:777001\)/);
});

test('Pagamento online: ao voltar do Mercado Pago o pedido confere o pagamento na hora, e só o que é dele', async () => {
  const r = await site('POST', '/compra', compra({ itens: [{ id: 'prd_ebook', qtd: 1 }], entrega: 'digital', cep: '', pagamento: 'online' })), j = await r.json(), token = j.acompanhar.split('/').pop(), row = await A.repo.orderByPub(token);
  let p = (await (await site('GET', '/pedido-loja/' + token)).json()).pedido; assert.deepEqual([p.pagarOnline, p.pix, p.falta], [true, null, 29.9]);
  const again = await site('POST', `/pedido-loja/${token}/pagar`, {}); assert.equal(again.status, 200); assert.match((await again.json()).pagamentoUrl, /^https:\/\/www\.mercadopago\.com\.br\//);
  payments['888001'] = { id: 888001, status: 'approved', external_reference: 'pl_' + 'a'.repeat(24), transaction_amount: 29.9 };   // pagamento de outro pedido
  p = (await (await site('GET', `/pedido-loja/${token}?pagamento=888001`)).json()).pedido; assert.equal(p.pagamento, 'Aguardando');
  payments['888002'] = { id: 888002, status: 'approved', external_reference: row.id, transaction_amount: 10 };   // pagou só uma parte
  p = (await (await site('GET', `/pedido-loja/${token}?pagamento=888002`)).json()).pedido; assert.deepEqual([p.pagamento, p.pago, p.falta], ['Sinal pago', 10, 19.9]);
  payments['888003'] = { id: 888003, status: 'approved', external_reference: row.id, transaction_amount: 19.9 };
  p = (await (await site('GET', `/pedido-loja/${token}?pagamento=888003`)).json()).pedido; assert.deepEqual([p.pagamento, p.pago, p.falta, p.pagarOnline], ['Pago', 29.9, 0, false]);
  assert.equal((await site('POST', `/pedido-loja/${token}/pagar`, {})).status, 409);
  assert.equal((await fetch(B.base + '/webhooks/mercadopago', { method: 'POST' })).status, 404);   // sem Mercado Pago ligado, o endereço nem existe
});

test('Senha por e-mail: link de uso único; a resposta não revela se o e-mail tem conta', async () => {
  sent.length = 0;
  const a = await site('POST', '/conta/esqueci', { email: 'helena@exemplo.com' }), b = await site('POST', '/conta/esqueci', { email: 'ninguem@exemplo.com' });
  assert.deepEqual([a.status, await a.json(), b.status, await b.json()], [200, { ok: true }, 200, { ok: true }]); await wait(150);
  const m = mails(); assert.equal(m.length, 1); assert.equal(m[0].body.to[0].email, 'helena@exemplo.com');
  const link = new RegExp(base.replace(/[/.]/g, '\\$&') + '/entrar#nova-senha=([\\w-]{43})').exec(m[0].body.htmlContent); assert.ok(link);
  const nova = await site('POST', '/conta/nova-senha', { token: link[1], senha: 'lapis-verde-88' }); assert.equal(nova.status, 200);
  assert.equal((await site('POST', '/conta/nova-senha', { token: link[1], senha: 'outra-senha-99' })).status, 400);
  assert.equal((await site('POST', '/conta/entrar', { email: 'helena@exemplo.com', senha: 'lapis-verde-88' })).status, 200);
  assert.equal((await site('POST', '/conta/esqueci', { email: 'x' })).status, 422);
  for (let i = 0; i < 4; i++) await site('POST', '/conta/esqueci', { email: 'helena@exemplo.com' }, null, { 'cf-connecting-ip': '198.51.100.' + i }); await wait(150);
  assert.equal(mails().length, 3);   // no máximo 3 e-mails de senha por hora para o mesmo endereço
  assert.deepEqual([(await (await site('GET', '/loja')).json()).emailSenha, (await (await call(B.base, '/api')('GET', '/loja')).json()).emailSenha], [true, false]);
  const off = await call(B.base, '/api')('POST', '/conta/esqueci', { email: 'helena@exemplo.com' }); assert.equal(off.status, 503); assert.match((await off.json()).erro, /WhatsApp/);
});

test('Orçamento: produto da vitrine entra no pedido de orçamento com a variação escolhida, e a loja é avisada por e-mail', async () => {
  sent.length = 0;
  const r = await site('POST', '/pedido', { nome: 'Prof. Ana', telefone: '11 93333-2222', itens: [{ nome: 'Planner personalizado', qtd: 2, detalhe: 'Capa: Floral · Nome: Ana' }, { nome: 'Slides de formação', qtd: 1 }, { nome: 'Cartela de adesivos', qtd: 1 }] }), j = await r.json();
  assert.equal(r.status, 201, JSON.stringify(j)); assert.deepEqual(j.estimativa, { min: 137.5, max: 282.5 });
  const so = (await A.repo.listSiteOrders(true))[0].payload; assert.deepEqual(so.itens[0], { nome: 'Planner personalizado', qtd: 2, min: 45, max: 90, cat: '', tipo: 'fisico', detalhe: 'Capa: Floral · Nome: Ana' });
  await wait(); const m = mails('dona@exemplo.com'); assert.equal(m.length, 1); assert.match(m[0].body.subject, /Novo pedido de orçamento pelo site: S/);
});

test('Usuários do painel: cada nível vê e altera só o que pode; desativar encerra a sessão', async () => {
  const U = (m, p, b, c = dono) => painel(m, p, b, c);
  const me = await (await U('GET', '/me')).json(); assert.deepEqual([me.usuario.dono, me.usuario.nivel, me.pode.ler, me.pode.usuarios], [true, 'admin', '*', true]);
  const bad = async (body, campo) => { const r = await U('POST', '/usuarios', body); assert.equal(r.status, 422); assert.equal((await r.json()).campo, campo); };
  await bad({ usuario: 'An', nome: 'Ana', nivel: 'producao', senha: 'uma-senha-boa-1' }, 'usuario'); await bad({ usuario: 'dono', nome: 'Ana', nivel: 'producao', senha: 'uma-senha-boa-1' }, 'usuario');
  await bad({ usuario: 'ana', nome: 'Ana', nivel: 'chefe', senha: 'uma-senha-boa-1' }, 'nivel'); await bad({ usuario: 'ana', nome: 'Ana', nivel: 'producao', senha: 'curta' }, 'senha'); await bad({ usuario: 'ana', nome: 'Ana', nivel: 'producao', senha: '1234567890' }, 'senha');
  const mkUser = async (usuario, nivel) => { const r = await U('POST', '/usuarios', { usuario, nome: 'Pessoa ' + usuario, nivel, senha: 'senha-de-' + usuario + '-1' }); assert.equal(r.status, 201); return (await r.json()).usuario; };
  const prod = await mkUser('lia.producao', 'producao'), fin = await mkUser('caio.financeiro', 'financeiro'), atd = await mkUser('nina', 'atendimento');
  assert.equal((await U('POST', '/usuarios', { usuario: 'NINA', nome: 'Outra', nivel: 'admin', senha: 'uma-senha-boa-1' })).status, 409);
  const hash = (await A.pg.query(`SELECT pass_hash FROM panel_users WHERE login = 'nina'`)).rows[0].pass_hash; assert.match(hash, /^scrypt\$15\$8\$1\$/); assert.ok(!hash.includes('senha-de-nina'));
  const list = await (await U('GET', '/usuarios')).json(); assert.equal(list.usuarios.length, 3); assert.equal(list.niveis.length, 4); assert.ok(!JSON.stringify(list).includes('scrypt'));
  assert.equal((await painel('POST', '/login', { usuario: 'nina', senha: 'errada-errada' })).status, 401); assert.equal((await painel('POST', '/login', { usuario: 'ninguem', senha: 'senha-de-nina-1' })).status, 401);
  const cp = await login('lia.producao', 'senha-de-lia.producao-1'), cf = await login('caio.financeiro', 'senha-de-caio.financeiro-1'), ca = await login('Nina', 'senha-de-nina-1');
  await U('PUT', '/db/cash/l1', { desc: 'Papel', value: 30 }); await U('PUT', '/db/leads/a1', { name: 'Atendimento' });
  const cols = async (c) => [...new Set((await (await painel('GET', '/sync?after=0', undefined, c)).json()).docs.map(d => d.col))].sort();
  assert.deepEqual(await cols(cp), ['catalog', 'clients', 'orders', 'products', 'settings'].filter(c => c !== 'catalog'));   // produção: sem caixa, cupons nem conversas
  assert.deepEqual(await cols(cf), ['cash', 'clients', 'coupons', 'orders', 'products', 'settings']); assert.deepEqual(await cols(ca), ['clients', 'coupons', 'leads', 'orders', 'products', 'settings']);
  const mp = await (await painel('GET', '/me', undefined, cp)).json(); assert.deepEqual([mp.usuario.nome, mp.usuario.nivelNome, mp.usuario.dono, mp.pode.alterar, mp.pode.mensagens, mp.pode.arquivos, mp.pode.loja, mp.pode.usuarios], ['Pessoa lia.producao', 'Produção', false, ['orders', 'stock', 'audit'], false, true, false, false]);
  const st = async (m, p, b, c = dono) => (await painel(m, p, b, c)).status;
  assert.deepEqual([await st('PATCH', '/db/orders/pm1', { status: 'concluido' }, cp), await st('PUT', '/db/stock/s1', { name: 'Papel', qty: 3 }, cp), await st('PUT', '/db/settings/store', { pixKey: 'golpe@exemplo.com' }, cp), await st('PUT', '/db/cash/l2', { value: 1 }, cp),
    await st('PUT', '/db/products/prd_adesivos', { price: 1 }, cp), await st('DELETE', '/db/clients/cm1', undefined, cp), await st('GET', '/usuarios', undefined, cp), await st('POST', '/usuarios', { usuario: 'eu2', nome: 'Eu', nivel: 'admin', senha: 'uma-senha-boa-1' }, cp),
    await st('GET', '/loja/status', undefined, cp), await st('GET', '/monitor', undefined, cp), await st('POST', '/tool/status_conexoes', {}, cp), await st('GET', '/contas/cm1', undefined, cp)], [200, 200, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403]);
  assert.equal((await A.repo.docGet('settings', 'store')).pixKey, 'pix@exemplo.com');
  assert.deepEqual([await st('PUT', '/db/cash/l2', { value: 1 }, cf), await st('PUT', '/db/settings/store', { pixKey: 'x' }, cf), await st('GET', '/monitor?dias=7', undefined, cf), await st('PUT', '/db/coupons/c9', { code: 'X', kind: 'pct', value: 100 }, cf)], [200, 403, 200, 403]);
  assert.deepEqual([await st('PUT', '/db/clients/cm2', { name: 'Novo' }, ca), await st('POST', '/tool/status_conexoes', {}, ca), await st('PUT', '/db/cash/l3', { value: 1 }, ca), await st('POST', '/contas/cm1/link-senha', {}, ca)], [200, 200, 403, 404]);
  // Registro de atividades: todos acrescentam, só administrador altera ou apaga
  assert.deepEqual([await st('PUT', '/db/audit/x1', { act: 'teste' }, cp), await st('PATCH', '/db/audit/x1', { act: 'mudou' }, cp), await st('DELETE', '/db/audit/x1', undefined, cp), await st('DELETE', '/db/audit/x1', undefined, dono)], [200, 403, 403, 200]);
  // Trocar a própria senha: exige a atual; as outras sessões caem
  const cp2 = await login('lia.producao', 'senha-de-lia.producao-1');
  assert.equal(await st('POST', '/minha-senha', { atual: 'errada', nova: 'nova-senha-da-lia-9' }, cp), 422); assert.equal(await st('POST', '/minha-senha', { atual: 'senha-de-lia.producao-1', nova: 'lia.producao' }, cp), 422);
  const ch = await painel('POST', '/minha-senha', { atual: 'senha-de-lia.producao-1', nova: 'nova-senha-da-lia-9' }, cp); assert.equal(ch.status, 200); const cp3 = cookieFrom(ch);
  assert.deepEqual([await st('GET', '/me', undefined, cp2), await st('GET', '/me', undefined, cp3)], [401, 200]); assert.equal(await st('POST', '/minha-senha', { atual: 'x', nova: 'y' }, dono), 422);
  // O administrador muda o nível, redefine a senha, desativa e exclui
  assert.equal((await (await U('PATCH', '/usuarios/' + fin.id, { nivel: 'atendimento' })).json()).usuario.nivelNome, 'Atendimento'); assert.equal(await st('GET', '/me', undefined, cf), 401);   // mudou o nível: entra de novo
  assert.equal(await st('POST', `/usuarios/${atd.id}/senha`, { senha: 'senha-redefinida-77' }), 200); assert.equal(await st('GET', '/me', undefined, ca), 401); await login('nina', 'senha-redefinida-77');
  assert.equal(await st('PATCH', '/usuarios/' + prod.id, { ativo: false }), 200); assert.equal(await st('GET', '/sync?after=0', undefined, cp3), 401); assert.equal((await painel('POST', '/login', { usuario: 'lia.producao', senha: 'nova-senha-da-lia-9' })).status, 401);
  assert.equal(await st('DELETE', '/usuarios/' + prod.id), 204); assert.equal(await st('DELETE', '/usuarios/pu_naoexiste'), 404); assert.equal((await (await U('GET', '/usuarios')).json()).usuarios.length, 2);
  // Um administrador que não é o dono não se rebaixa nem se exclui por engano
  const adm = await mkUser('socio', 'admin'), cs = await login('socio', 'senha-de-socio-1');
  assert.deepEqual([await st('PATCH', '/usuarios/' + adm.id, { nivel: 'producao' }, cs), await st('DELETE', '/usuarios/' + adm.id, undefined, cs), await st('PUT', '/db/settings/loja', LOJA, cs)], [422, 422, 200]);
  // Sessão aberta antes desta versão (formato antigo) continua valendo para o dono
  const pwKey = crypto.scryptSync(SENHA, crypto.createHash('sha256').update('esro-painel|' + SECRET).digest(), 32), sessKey = crypto.createHmac('sha256', SECRET).update(Buffer.concat([Buffer.from('sessao'), pwKey])).digest();
  const body = `${Date.now() + 864e5}.abcdefghijklmnop`, old = `esro_sess=${body}.${crypto.createHmac('sha256', sessKey).update(body).digest('base64url')}`;
  assert.equal((await (await painel('GET', '/me', undefined, old)).json()).usuario.dono, true);
});

test('Monitoramento: páginas de produto, funil da compra e seguidores de outras redes anotados à mão', async () => {
  const ua = { 'user-agent': 'Mozilla/5.0 (iPhone)' };
  await site('POST', '/v', { p: '/produto/planner-2027-floral', n: true, r: 'https://www.instagram.com/' }, null, ua); await site('POST', '/v', { p: '/produto/outro', n: false }, null, ua);
  await site('POST', '/v', { p: '/finalizar' }, null, ua); await site('POST', '/v', { p: '/finalizar', e: 'finalizar' }, null, ua); await site('POST', '/v', { p: '/pedido/' + 'x'.repeat(43) }, null, ua); await wait(120);
  assert.equal((await painel('POST', '/redes', { rede: 'orkut', seguidores: 10 }, dono)).status, 422); assert.equal((await painel('POST', '/redes', { rede: 'tiktok', seguidores: -1 }, dono)).status, 422);
  assert.equal((await painel('POST', '/redes', { rede: 'tiktok', seguidores: 540 }, dono)).status, 200); await painel('POST', '/redes', { rede: 'tiktok', seguidores: 548 }, dono);
  const m = await (await painel('GET', '/monitor?dias=7', undefined, dono)).json(), pg = Object.fromEntries(m.site.paginasVistas.map(x => [x.chave, x.n]));
  assert.deepEqual([pg['/produto'], pg['/finalizar'], pg['/pedido']], [2, 1, 1]); assert.ok(!Object.keys(pg).some(k => k.includes('planner') || k.includes('xxx')));   // nem o link secreto do pedido nem o produto ficam registrados
  assert.equal(m.site.eventos.finalizar, 1); assert.ok(m.site.eventos.compra >= 8);
  const tk = m.outrasRedes.find(r => r.id === 'tiktok'); assert.deepEqual([tk.nome, tk.seguidores, tk.porDia.length], ['TikTok', 548, 1]); assert.equal(m.outrasRedes.find(r => r.id === 'facebook').seguidores, null);
});

test('Robustez: compra que falha no meio devolve estoque e cupom; números de pedido não se repetem; tentativas têm limite', async () => {
  await painel('PATCH', '/db/products/prd_planner27', { stock: 6 }, dono); await A.repo.docMerge('coupons', 'c5', { used: 0, max: 2 });
  const real = A.repo.nextOrderNum; let fails = 2; A.repo.nextOrderNum = async () => { if (fails-- > 0) throw new Error('banco fora do ar'); return real(); };
  for (let i = 0; i < 2; i++) assert.equal((await site('POST', '/compra', compra({ entrega: 'retirada', cupom: 'UMAVEZ' }))).status, 500);
  A.repo.nextOrderNum = real;
  assert.deepEqual([(await A.repo.docGet('products', 'prd_planner27')).stock, (await A.repo.docGet('coupons', 'c5')).used], [6, 0]);   // nada ficou preso
  // Campo com formato estranho não derruba a compra nem reserva nada
  const odd = await fetch(base + '/api/compra', { method: 'POST', headers: H, body: JSON.stringify(compra({ entrega: 'retirada', obs: { toString: null }, rua: ['a'], cupom: { a: 1 } })) }); assert.equal(odd.status, 201);
  assert.ok(!(await A.repo.orderByPub((await odd.json()).acompanhar.split('/').pop())).data.note.includes('object'));
  for (const [path, body] of [['/frete', { cep: { toString: null }, itens: [item()] }], ['/cupom', { codigo: { toString: null }, itens: [item()] }], ['/conta/entrar', { email: { toString: null }, senha: [] }], ['/conta/esqueci', { email: { valueOf: null } }]]) assert.ok((await fetch(base + '/api' + path, { method: 'POST', headers: H, body: JSON.stringify(body) })).status < 500, path);
  assert.equal((await fetch(base + '/painel/api/login', { method: 'POST', headers: H, body: JSON.stringify({ senha: { toString: null }, usuario: {} }) })).status, 401);
  // Três compras ao mesmo tempo: três números diferentes
  const rs = await Promise.all([1, 2, 3].map(() => site('POST', '/compra', compra({ entrega: 'retirada' })))), nums = (await Promise.all(rs.map(r => r.json()))).map(j => j.numero);
  assert.deepEqual(rs.map(r => r.status), [201, 201, 201]); assert.equal(new Set(nums).size, 3);
  // Limite de tentativas (inclusive as recusadas), para ninguém testar cupons pela finalização
  const C = await mk({}, { ordersPerHour: 2 }); const dC = await login(null, SENHA, C.base); await call(C.base, '/painel/api')('PUT', '/db/products/prd_x', ADESIVOS, dC);
  const st = []; for (let i = 0; i < 12; i++) st.push((await call(C.base, '/api')('POST', '/compra', compra({ itens: [{ id: 'prd_x', qtd: 1 }], entrega: 'combinar', cupom: 'CHUTE' + i }))).status);
  assert.deepEqual(st, [...Array(10).fill(422), 429, 429]); C.server.close(); await C.pg.close();
});

test('Robustez: estoque reservado volta quando o pedido não é pago ou é excluído', async () => {
  await painel('PATCH', '/db/products/prd_planner27', { stock: 5 }, dono); const stock = async () => (await A.repo.docGet('products', 'prd_planner27')).stock;
  const buy = async () => { const r = await site('POST', '/compra', compra({ entrega: 'retirada', itens: [item({ qtd: 2 })] })); assert.equal(r.status, 201); return A.repo.orderByPub((await r.json()).acompanhar.split('/').pop()); };
  const a = await buy(), b = await buy(); assert.equal(await stock(), 1); assert.deepEqual(a.data.loja.reserva, [['prd_planner27', 2]]);
  assert.ok(!JSON.stringify((await (await site('GET', '/pedido-loja/' + a.data.pub)).json()).pedido).includes('reserva'));
  assert.equal(await A.app.locals.shop.releaseStale(), 0);   // dentro do prazo: nada muda
  await A.repo.docMerge('orders', a.id, { at: new Date(Date.now() - 50 * 3600e3).toISOString() });
  assert.equal(await A.app.locals.shop.releaseStale(), 1); assert.equal(await stock(), 3); assert.equal(await A.app.locals.shop.releaseStale(), 0);   // devolve uma vez só
  const oa = await A.repo.docGet('orders', a.id); assert.equal(oa.loja.estoque, 'devolvido'); assert.match(oa.note, /sem pagamento há mais de 48 horas/);
  assert.equal((await painel('DELETE', '/db/orders/' + b.id, undefined, dono)).status, 200); await wait(); assert.equal(await stock(), 5);   // excluir um pedido não pago também devolve
  await painel('DELETE', '/db/orders/' + a.id, undefined, dono); await wait(); assert.equal(await stock(), 5);
});

test('Robustez: links dos e-mails não seguem um endereço falso; sinal antigo não se perde; pedido fechado não gera cobrança', async () => {
  sent.length = 0;
  const forged = (path, body) => new Promise((resolve, reject) => { const u = new URL(base + path), data = JSON.stringify(body);
    const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { ...H, host: 'site-falso.example', 'content-length': Buffer.byteLength(data) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); r.on('error', reject); r.end(data); });
  assert.equal(await forged('/api/conta/esqueci', { email: 'helena@exemplo.com' }), 200); await wait(150); assert.equal(mails().length, 0);
  assert.equal(await forged('/api/compra', compra({ itens: [{ id: 'prd_ebook', qtd: 1 }], entrega: 'digital', cep: '', pagamento: 'online' })), 201); await wait(150);
  assert.equal(mails().length, 0); assert.ok(!sent.some(x => JSON.stringify(x.body || {}).includes('site-falso')));
  // Pedido antigo do painel com sinal pago e sem a lista de pagamentos
  const pub = crypto.randomBytes(32).toString('base64url');
  await painel('PUT', '/db/orders/antigo1', { num: 900, at: new Date().toISOString(), status: 'producao', client: 'Lívia Prado', item: 'Agenda', value: 100, qty: 1, pay: 'Mercado Pago', payS: 'Sinal pago', sinal: 50, pub }, dono);
  payments['999001'] = { id: 999001, status: 'approved', external_reference: 'antigo1', transaction_amount: 50 };
  const p = (await (await site('GET', `/pedido-loja/${pub}?pagamento=999001`)).json()).pedido; assert.deepEqual([p.pagamento, p.pago, p.falta], ['Pago', 100, 0]);
  await painel('PUT', '/db/orders/fechado1', { num: 901, at: new Date().toISOString(), status: 'cancelado', client: 'Theo', item: 'Agenda', value: 100, qty: 1, pay: 'Mercado Pago', payS: 'Aguardando', pays: [], pub: pub.split('').reverse().join('') }, dono);
  assert.equal((await site('POST', `/pedido-loja/${pub.split('').reverse().join('')}/pagar`, {})).status, 409);
});

test('Robustez: registro de atividades só cresce, arquivos respeitam o nível e nomes estranhos não passam', async () => {
  const mkU = async (usuario, nivel) => { const r = await painel('POST', '/usuarios', { usuario, nome: 'Pessoa ' + usuario, nivel, senha: 'senha-de-' + usuario + '-1' }, dono); assert.equal(r.status, 201); return login(usuario, 'senha-de-' + usuario + '-1'); };
  const prod = await mkU('rui.producao', 'producao'), fin = await mkU('bia.financeiro', 'financeiro');
  assert.equal((await painel('PUT', '/db/audit/linha1', { act: 'Pedido excluído', uid: 'dono', at: '2020-01-01T00:00:00.000Z' }, prod)).status, 200);
  const row = await A.repo.docGet('audit', 'linha1'); assert.equal(row.uid, 'rui.producao'); assert.ok(row.at > '2026');   // quem fez e quando vêm do servidor
  assert.equal((await painel('PUT', '/db/audit/linha1', { act: 'apagado' }, prod)).status, 403); assert.equal((await A.repo.docGet('audit', 'linha1')).act, 'Pedido excluído');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), up = await (await fetch(base + '/painel/api/assets?name=arte.png', { method: 'POST', headers: { 'x-esro': '1', 'content-type': 'image/png', cookie: prod }, body: png })).json();
  assert.equal((await fetch(base + up.url, { headers: { cookie: prod } })).status, 200);
  assert.deepEqual([(await painel('GET', '/assets', undefined, fin)).status, (await fetch(base + up.url, { headers: { cookie: fin } })).status, (await fetch(base + up.url)).status], [403, 403, 401]);
  assert.equal((await painel('POST', '/usuarios', { usuario: 'esperto', nome: 'Esperto', nivel: 'constructor', senha: 'uma-senha-boa-1' }, dono)).status, 422);
  assert.equal((await painel('POST', '/tool/constructor', {}, dono)).status, 404); assert.equal((await painel('POST', '/redes', { rede: 'constructor', seguidores: 5 }, dono)).status, 422);
  assert.equal((await painel('GET', '/sync?after=0', undefined, prod)).status, 200);
});
