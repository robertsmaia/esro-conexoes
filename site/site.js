/* ESRO — site: pedido de orçamento, catálogo vindo do painel, busca, novidades e contagem de visitas.
   Tudo o que vem do servidor entra na página como texto (nunca como HTML). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var WA = 'https://wa.me/5511992481676';
  var money = function (v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  var priceText = function (i) { return !i.min && !i.max ? 'Sob consulta' : i.min === i.max ? money(i.min) : money(i.min) + ' a ' + money(i.max); };

  async function api(method, path, body) {
    var r, j = null;
    try { r = await fetch('/api' + path, { method: method, headers: body ? { 'X-ESRO': '1', 'Content-Type': 'application/json' } : { 'X-ESRO': '1' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' }); }
    catch (_) { var off = new Error('Não foi possível falar com o servidor. Confira a internet e tente de novo.'); off.status = 0; throw off; }
    if (r.status !== 204) { try { j = await r.json(); } catch (_) { } }
    if (r.ok) return j || {};
    var e = new Error((j && j.erro) || 'Algo deu errado. Tente de novo em instantes.'); e.status = r.status; e.campo = j && j.campo; throw e;
  }

  /* ---------- Contagem de visitas: sem cookies; só avisa o servidor qual página abriu ---------- */
  function track(data) {
    try { fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { }
  }
  (function () {
    var first = true; try { first = !sessionStorage.getItem('esro_v'); sessionStorage.setItem('esro_v', '1'); } catch (_) { }
    track(first ? { p: location.pathname, n: true, r: document.referrer || '' } : { p: location.pathname });
  })();
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]'); if (!a) return;
    if (/^https:\/\/wa\.me\//.test(a.href)) track({ p: location.pathname, e: 'whatsapp' });
    else if (/\.pdf($|\?)/.test(a.getAttribute('href'))) track({ p: location.pathname, e: 'catalogo_pdf' });
  });

  /* ---------- Aviso rápido ---------- */
  var toast = $('#toast'), toastT;
  function say(text) { if (!toast) return; toast.textContent = text; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('show'); }, 2000); }

  /* ---------- Pedido de orçamento (carrinho) ---------- */
  var cart = $('#cart'), overlay = $('#overlay'), count = $('#count'), items = $('#cartItems');
  var form = $('#quoteForm'), done = $('#quoteDone'), direct = $('#quoteCart'), est = $('#cartEst'), who = $('#quoteWho'), whoSigned = $('#quoteSigned');
  var Cart = window.ESROCart;
  var order = Cart ? Cart.load() : [];   // [{ nome, qtd, img, id, tipo, vars, pers, preco }] — fica guardado neste aparelho
  var prices = {};           // nome em minúsculas → { min, max }
  var products = [];         // produtos da vitrine (vêm do painel)
  var account = null;
  var buyBox = $('#buyBox'), buyTotal = $('#buyTotal'), mixed = $('#quoteMixed');
  var keep = function () { if (Cart) Cart.save(done && !done.hidden ? [] : order); };
  var openCart = function () { cart.classList.add('open'); overlay.classList.add('show'); };
  var closeCart = function () { cart.classList.remove('open'); overlay.classList.remove('show'); };
  $('#cartOpen').addEventListener('click', openCart); $('#cartClose').addEventListener('click', closeCart); overlay.addEventListener('click', closeCart);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });

  function waText(ref) {
    var list = order.map(function (i) { var d = Cart ? Cart.detail(i) : ''; return (i.qtd > 1 ? i.qtd + '× ' : '') + i.nome + (d ? ' (' + d + ')' : ''); }).join(', ');
    return 'Olá, ESRO! ' + (ref ? 'Enviei pelo site o pedido de orçamento nº ' + ref + ': ' : 'Gostaria de um orçamento para: ') + list + '.';
  }
  function renderCart() {
    var total = order.reduce(function (a, i) { return a + i.qtd; }, 0);
    count.textContent = total; items.textContent = '';
    if (!order.length) items.appendChild(el('p', 'cart-empty', 'Seu pedido está vazio. Escolha um item da vitrine ou do catálogo.'));
    order.forEach(function (it) {
      var row = el('div', 'cart-row'), th = el('div', 'thumb');
      if (it.img) { var im = document.createElement('img'); im.src = it.img; im.alt = ''; th.appendChild(im); }
      else { th.className = 'thumb empty'; th.textContent = '♥'; th.setAttribute('aria-hidden', 'true'); }
      var info = el('div'); info.appendChild(el('strong', null, it.nome));
      var det = Cart ? Cart.detail(it) : ''; if (det) info.appendChild(el('small', 'cart-price', det));
      var p = prices[it.nome.toLowerCase()]; info.appendChild(el('small', 'cart-price', it.tipo === 'compra' && it.preco ? Cart.money(it.preco) : p ? priceText(p) : ''));
      var qty = el('div', 'qty'), minus = el('button', null, '−'), n = el('span', null, String(it.qtd)), plus = el('button', null, '+');
      minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'Diminuir ' + it.nome); plus.setAttribute('aria-label', 'Aumentar ' + it.nome); n.setAttribute('aria-live', 'polite');
      minus.setAttribute('data-qty', '-'); plus.setAttribute('data-qty', '+');
      minus.addEventListener('click', function () { it.qtd--; if (it.qtd < 1) order.splice(order.indexOf(it), 1); renderCart(); });
      plus.addEventListener('click', function () { if (it.qtd < 99) it.qtd++; renderCart(); });
      qty.appendChild(minus); qty.appendChild(n); qty.appendChild(plus);
      row.appendChild(th); row.appendChild(info); row.appendChild(qty); items.appendChild(row);
    });
    // Só produtos de preço fixo: segue para a finalização da compra. Com algum item sob orçamento, o pedido inteiro vira orçamento.
    var buy = !!Cart && Cart.allBuy(order) && done.hidden;
    if (buyBox) { buyBox.hidden = !buy; if (buy) buyTotal.textContent = Cart.money(order.reduce(function (a, i) { return a + i.preco * i.qtd; }, 0)); }
    if (form) form.hidden = !order.length || !done.hidden || buy;
    if (mixed) mixed.hidden = !(order.length && !buy && order.some(function (i) { return i.tipo === 'compra'; }));
    keep();
    direct.href = order.length ? WA + '?text=' + encodeURIComponent(waText()) : WA;
    if (est) {
      var lo = 0, hi = 0, open = 0;
      order.forEach(function (i) { var p = i.tipo === 'compra' && i.preco ? { min: i.preco, max: i.preco } : prices[i.nome.toLowerCase()]; if (p && (p.min || p.max)) { lo += p.min * i.qtd; hi += p.max * i.qtd; } else open++; });
      est.textContent = !order.length ? '' : (lo || hi ? 'Estimativa: ' + (lo === hi ? money(lo) : money(lo) + ' a ' + money(hi)) + (open ? ', mais ' + open + ' item(ns) sob consulta' : '') + '. ' : '') + 'O valor final é confirmado no orçamento.';
    }
  }
  function addItem(btn) {
    var nome = btn.getAttribute('data-name'); if (!nome) return;
    if (!done.hidden) { done.hidden = true; order = []; }
    var prod = products.filter(function (x) { return x.id === btn.getAttribute('data-id'); })[0];
    var twin = btn.getAttribute('data-img') ? btn : $$('#kits .add').filter(function (x) { return x.getAttribute('data-name') === nome; })[0];   // item do catálogo que também está na vitrine usa a mesma imagem
    var it = { nome: nome, qtd: 1, img: twin ? twin.getAttribute('data-img') || '' : '', id: prod ? prod.id : '', tipo: prod ? prod.modo : 'orcamento', vars: {}, pers: '', preco: prod && prod.modo === 'compra' ? prod.preco : 0, slug: prod ? prod.slug : '' };
    if (!(Cart ? Cart.add(order, it) : order.push(it))) { say('O pedido pode ter até 20 itens'); return; }
    renderCart(); say('Item adicionado ao pedido'); track({ p: location.pathname, e: 'carrinho' });
  }
  document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('.add'); if (b) addItem(b); });

  function fieldError(name, text) {
    var inp = form.elements[name], box = inp && document.getElementById(inp.id + '-err'); if (!inp || !box) return false;
    inp.setAttribute('aria-invalid', 'true'); box.textContent = text; box.hidden = false; inp.focus(); return true;
  }
  function clearErrors() {
    $$('[aria-invalid]', form).forEach(function (i) { i.removeAttribute('aria-invalid'); });
    $$('.err', form).forEach(function (b) { b.hidden = true; b.textContent = ''; });
    var m = $('.msg', form); m.hidden = true; m.textContent = '';
  }
  if (form) {
    var maskPhone = function (v) {
      var d = String(v).replace(/\D/g, ''); if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2); d = d.slice(0, 11);
      if (d.length <= 2) return d.length ? '(' + d : '';
      var rest = d.slice(2), cut = rest.length > 8 ? 5 : 4; return '(' + d.slice(0, 2) + ') ' + (rest.length > cut ? rest.slice(0, cut) + '-' + rest.slice(cut) : rest);
    };
    form.elements.telefone.addEventListener('input', function () { var t = form.elements.telefone, end = t.selectionStart === t.value.length; t.value = maskPhone(t.value); if (end) t.setSelectionRange(t.value.length, t.value.length); });
    var busy = false, btn = $('button[type=submit]', form), label = btn.textContent;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault(); if (busy || !order.length) return; clearErrors();
      if (!account) {
        if (form.elements.nome.value.trim().length < 2) { fieldError('nome', 'Escreva o seu nome.'); return; }
        var n = form.elements.telefone.value.replace(/\D/g, '').length; if (n !== 10 && n !== 11) { fieldError('telefone', 'Escreva o WhatsApp com DDD, por exemplo (11) 99999-0000.'); return; }
      }
      busy = true; btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        var r = await api('POST', '/pedido', { itens: order.map(function (i) { return { nome: i.nome, qtd: i.qtd, detalhe: Cart ? Cart.detail(i) : '' }; }), nome: form.elements.nome.value, telefone: form.elements.telefone.value, obs: form.elements.obs.value, site: form.elements.site.value });
        $('#quoteRef').textContent = r.referencia; $('#quoteWa').href = WA + '?text=' + encodeURIComponent(waText(r.referencia));
        $('#quoteHint').textContent = account ? 'Ele já aparece em "Minha conta". A ESRO confirma os valores e o prazo pelo WhatsApp.' : 'A ESRO confirma os valores e o prazo pelo WhatsApp que você informou.';
        done.hidden = false; form.hidden = true; form.elements.obs.value = ''; keep(); done.querySelector('h3').focus();
      } catch (e) { if (!(e.campo && fieldError(e.campo, e.message))) { var m = $('.msg', form); m.textContent = e.message; m.hidden = false; } }
      finally { busy = false; btn.disabled = false; btn.textContent = label; }
    });
    $('#quoteNew').addEventListener('click', function () { order = []; done.hidden = true; renderCart(); closeCart(); });
    var buyGo = $('#buyGo'); if (buyGo) buyGo.addEventListener('click', function () { keep(); track({ p: location.pathname, e: 'finalizar' }); });
  }

  /* ---------- Conta do cliente: o botão "Entrar" vira o primeiro nome e o pedido dispensa nome e telefone ---------- */
  fetch('/api/conta/sessao', { headers: { 'X-ESRO': '1' }, credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.conta) return; account = j.conta;
    var link = $('#accountLink'); if (link) { link.textContent = String(account.nome || '').split(' ')[0] || 'Minha conta'; link.href = '/conta'; link.setAttribute('aria-label', 'Minha conta'); }
    if (who && whoSigned) { who.hidden = true; whoSigned.hidden = false; whoSigned.textContent = 'Pedido em nome de ' + account.nome + ', com o WhatsApp ' + account.telefone + ' da sua conta.'; }
  }).catch(function () { });

  /* ---------- Catálogo: vem do painel da ESRO (o que está na página é só a versão de reserva) ---------- */
  function catalogCard(c) {
    var art = el('article', 'catalog-card'); art.id = 'catalogo-' + Number(c.n);
    art.appendChild(el('span', 'eyebrow', c.n)); art.appendChild(el('h3', null, c.titulo)); if (c.descricao) art.appendChild(el('p', null, c.descricao.replace(/\.?$/, '.')));
    var ul = el('ul');
    c.itens.forEach(function (i) {
      var li = el('li'); li.appendChild(el('span', null, i.nome));
      var right = el('span', 'li-price'); right.appendChild(el('strong', null, priceText(i)));
      var b = el('button', 'add li-add', '+'); b.type = 'button'; b.setAttribute('data-name', i.nome); b.setAttribute('aria-label', 'Adicionar ' + i.nome + ' ao pedido'); right.appendChild(b);
      li.appendChild(right); ul.appendChild(li);
    });
    art.appendChild(ul);
    var a = el('a', 'btn secondary', 'Pedir orçamento'); a.href = WA + '?text=' + encodeURIComponent('Olá, ESRO! Gostaria de um orçamento para ' + c.titulo + '.'); a.target = '_blank'; a.rel = 'noopener noreferrer'; art.appendChild(a);
    return art;
  }
  function applyCatalog(data) {
    var cats = (data && data.categorias) || []; if (!cats.length) return;
    prices = {}; cats.forEach(function (c) { c.itens.forEach(function (i) { prices[i.nome.toLowerCase()] = i; }); });
    products.forEach(function (p) { if (p.modo !== 'compra' && !prices[p.nome.toLowerCase()]) prices[p.nome.toLowerCase()] = { min: p.min, max: p.max }; });
    var grid = $('#catalogo .catalog-grid');
    if (grid) { grid.textContent = ''; cats.forEach(function (c) { if (c.itens.length) grid.appendChild(catalogCard(c)); }); grid.setAttribute('data-live', '1'); }
    renderCart(); filterCatalog();
  }
  var catalogData = null;
  fetch('/api/catalogo', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { catalogData = d; applyCatalog(d); }).catch(function () { });

  /* ---------- Vitrine: produtos cadastrados no painel (o que está na página é só a versão de reserva) ---------- */
  function productCard(p) {
    var art = el('article', 'product'), link = el('a', 'product-img'); link.href = '/produto/' + p.slug; link.setAttribute('aria-label', 'Ver ' + p.nome);
    if (p.imagens[0]) { var im = document.createElement('img'); im.src = p.imagens[0]; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 800; im.height = 640; link.appendChild(im); }
    else { link.className = 'product-img empty'; link.textContent = '♥'; }
    if (p.precoDe) link.appendChild(el('span', 'flag', 'Oferta')); else if (!p.disponivel) link.appendChild(el('span', 'flag off', 'Esgotado'));
    var body = el('div', 'product-body'); if (p.categoria) body.appendChild(el('span', 'tag', p.categoria));
    var h = el('h3'), ha = el('a', null, p.nome); ha.href = '/produto/' + p.slug; h.appendChild(ha); body.appendChild(h);
    var price = el('div', 'price'), val = el('strong');
    if (p.modo === 'compra') { if (p.precoDe) { var old = el('s', null, Cart.money(p.precoDe)); val.appendChild(old); val.appendChild(document.createTextNode(' ')); } val.appendChild(document.createTextNode(Cart.money(p.preco))); }
    else val.textContent = priceText(p);
    price.appendChild(val);
    var needsPage = p.modo === 'compra' && (p.variacoes.length || p.personalizacao || !p.disponivel);
    if (needsPage) { var go = el('a', 'add', '→'); go.href = '/produto/' + p.slug; go.setAttribute('aria-label', (p.disponivel ? 'Escolher opções de ' : 'Ver ') + p.nome); price.appendChild(go); }
    else { var b = el('button', 'add', '+'); b.type = 'button'; b.setAttribute('data-name', p.nome); b.setAttribute('data-id', p.id); b.setAttribute('data-img', p.imagens[0] || ''); b.setAttribute('aria-label', 'Adicionar ' + p.nome); price.appendChild(b); }
    body.appendChild(price); art.appendChild(link); art.appendChild(body); return art;
  }
  if (Cart) fetch('/api/produtos', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !Array.isArray(d.produtos)) return; products = d.produtos;
    var grid = $('#kits .product-grid'), shown = products.filter(function (p) { return p.vitrine; });
    if (grid && shown.length) { grid.textContent = ''; shown.forEach(function (p) { grid.appendChild(productCard(p)); }); grid.setAttribute('data-live', '1'); }
    // Carrinho guardado: atualiza preço e tira o que saiu da loja.
    order = order.filter(function (i) { if (!i.id) return true; var p = products.filter(function (x) { return x.id === i.id; })[0]; if (!p) return false; i.tipo = p.modo; if (p.modo === 'compra') { var add = 0; p.variacoes.forEach(function (v) { var o = v.opcoes.filter(function (x) { return x.nome === i.vars[v.nome]; })[0]; if (o) add += o.acrescimo; }); i.preco = Math.round((p.preco + add) * 100) / 100; } return true; });
    if (catalogData) applyCatalog(catalogData); else { products.forEach(function (p) { if (p.modo !== 'compra') prices[p.nome.toLowerCase()] = { min: p.min, max: p.max }; }); renderCart(); }
  }).catch(function () { });
  if (location.hash === '#pedido') { openCart(); try { history.replaceState(null, '', location.pathname); } catch (_) { } }

  /* ---------- Busca no catálogo ---------- */
  var search = $('#catalogSearch'), searchInfo = $('#catalogSearchInfo');
  var norm = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  function filterCatalog() {
    if (!search) return; var q = norm(search.value.trim()), shown = 0;
    $$('#catalogo .catalog-card').forEach(function (card) {
      var inTitle = q && norm($('h3', card).textContent).indexOf(q) >= 0, any = 0;
      $$('li', card).forEach(function (li) { var ok = !q || inTitle || norm(li.textContent).indexOf(q) >= 0; li.hidden = !ok; if (ok) any++; });
      card.hidden = !any; shown += any;
    });
    if (searchInfo) searchInfo.textContent = !q ? '' : shown ? shown + ' item(ns) encontrado(s).' : 'Nada encontrado. Tente outra palavra ou peça um orçamento sob medida pelo WhatsApp.';
  }
  if (search) search.addEventListener('input', filterCatalog);
  var searchBtn = $('#searchOpen');
  if (searchBtn && search) searchBtn.addEventListener('click', function () { $('#catalogo').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setTimeout(function () { search.focus(); }, 350); });

  /* ---------- Novidades por e-mail ---------- */
  var news = $('#emailForm');
  if (news) news.addEventListener('submit', async function (ev) {
    ev.preventDefault(); var inp = $('input[type=email]', news), b = $('button', news), msg = $('#emailMsg');
    b.disabled = true;
    try { await api('POST', '/novidades', { email: inp.value, site: news.elements.site ? news.elements.site.value : '' }); news.reset(); if (msg) { msg.textContent = 'Pronto! Você vai receber as novidades da ESRO neste e-mail.'; msg.hidden = false; } say('Bem-vindo ao Círculo ESRO!'); }
    catch (e) { if (msg) { msg.textContent = e.message; msg.hidden = false; } }
    finally { b.disabled = false; }
  });

  /* ---------- Menu, filtros do "o que você precisa hoje" ---------- */
  $$('.chips').forEach(function (group) { $$('.chip', group).forEach(function (chip) { chip.addEventListener('click', function () { $$('.chip', group).forEach(function (c) { c.classList.remove('active'); }); chip.classList.add('active'); }); }); });
  var menu = $('.menu'), links = $('.links');
  if (menu && links) {
    menu.addEventListener('click', function () { menu.setAttribute('aria-expanded', String(links.classList.toggle('mobile-open'))); });
    $$('a', links).forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('mobile-open'); menu.setAttribute('aria-expanded', 'false'); }); });
  }
  renderCart();
})();
