/* ESRO — página de um produto: fotos, opções, quantidade e botão de adicionar ao pedido.
   Tudo o que vem do servidor entra na página como texto (nunca como HTML). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var Cart = window.ESROCart, WA = 'https://wa.me/5511992481676';
  var slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  var p = null, qtd = 1, order = Cart.load();

  // Contagem de visitas (sem cookies): registra só que uma página de produto foi aberta.
  try { var first = !sessionStorage.getItem('esro_v'); sessionStorage.setItem('esro_v', '1');
    fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(first ? { p: location.pathname, n: true, r: document.referrer || '' } : { p: location.pathname }), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { }
  var track = function (e) { try { fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ p: location.pathname, e: e }), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { } };

  function count() { $('#cartCount').textContent = order.reduce(function (a, i) { return a + i.qtd; }, 0); }
  count();

  function chosen() {
    var vars = {}, add = 0, missing = '';
    p.variacoes.forEach(function (v, i) {
      var inp = $('input[name="v' + i + '"]:checked'); if (!inp) { missing = missing || v.nome; return; }
      var o = v.opcoes[Number(inp.value)]; vars[v.nome] = o.nome; add += o.acrescimo;
    });
    return { vars: vars, add: add, missing: missing };
  }
  function showPrice() {
    var box = $('#pdPrice'); box.textContent = '';
    if (p.modo !== 'compra') { box.appendChild(document.createTextNode(!p.min && !p.max ? 'Sob consulta' : p.min === p.max ? Cart.money(p.min) : Cart.money(p.min) + ' a ' + Cart.money(p.max))); box.appendChild(el('small', null, 'valor confirmado no orçamento')); return; }
    var c = chosen();
    if (p.precoDe) box.appendChild(el('s', null, Cart.money(p.precoDe + c.add)));
    box.appendChild(document.createTextNode(Cart.money(p.preco + c.add)));
    if (qtd > 1) box.appendChild(el('small', null, qtd + ' unidades: ' + Cart.money((p.preco + c.add) * qtd)));
  }
  function showImage(i) {
    var main = $('#pdMain');
    if (!p.imagens.length) { main.className = 'pd-main empty'; main.textContent = '♥'; return; }
    $('#pdImg').src = p.imagens[i]; $('#pdImg').alt = p.nome;
    Array.prototype.forEach.call($('#pdThumbs').children, function (b, j) { b.setAttribute('aria-pressed', String(j === i)); });
  }
  function fail(text) { var m = $('#pdMsg'); m.textContent = text; m.hidden = false; }

  function render() {
    document.title = p.nome + ' | ESRO Papelaria';
    $('#pdName').textContent = p.nome; $('#crumbName').textContent = p.nome; $('#pdCat').textContent = p.categoria || ''; $('#pdText').textContent = p.descricao || ''; $('#pdText').style.whiteSpace = 'pre-line';
    var thumbs = $('#pdThumbs'); thumbs.textContent = '';
    if (p.imagens.length > 1) p.imagens.forEach(function (src, i) { var b = el('button'); b.type = 'button'; b.setAttribute('aria-label', 'Foto ' + (i + 1) + ' de ' + p.imagens.length); var im = document.createElement('img'); im.src = src; im.alt = ''; b.appendChild(im); b.addEventListener('click', function () { showImage(i); }); thumbs.appendChild(b); });
    showImage(0);
    var opts = $('#pdOptions'); opts.textContent = '';
    p.variacoes.forEach(function (v, i) {
      var fs = el('fieldset', 'opt'), chips = el('div', 'chips'); fs.appendChild(el('legend', null, v.nome));
      v.opcoes.forEach(function (o, j) {
        var lab = el('label'), inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'v' + i; inp.value = String(j); if (v.opcoes.length === 1) inp.checked = true;
        var sp = el('span', null, o.nome); if (o.acrescimo > 0) sp.appendChild(el('small', null, ' + ' + Cart.money(o.acrescimo)));
        lab.appendChild(inp); lab.appendChild(sp); chips.appendChild(lab);
      });
      fs.appendChild(chips); opts.appendChild(fs);
    });
    opts.addEventListener('change', function () { $('#pdMsg').hidden = true; showPrice(); });
    if (p.personalizacao) { $('#pdPersField').hidden = false; $('#pdPersLabel').textContent = p.personalizacao; }
    var stock = $('#pdStock');
    if (p.modo === 'compra' && !p.disponivel) { stock.textContent = 'Esgotado no momento'; stock.className = 'pd-stock out'; stock.hidden = false; }
    else if (p.restam) { stock.textContent = p.restam === 1 ? 'Última unidade' : 'Restam ' + p.restam + ' unidades'; stock.className = 'pd-stock low'; stock.hidden = false; }
    var form = $('#pdForm'), canAdd = p.modo !== 'compra' || p.disponivel;
    form.hidden = !canAdd; $('#pdNow').hidden = p.modo !== 'compra';
    $('#pdAdd').textContent = p.modo === 'compra' ? 'Adicionar ao pedido' : 'Adicionar ao pedido de orçamento';
    var note = $('#pdNote'); note.textContent = '';
    if (!canAdd) { note.appendChild(document.createTextNode('Quer ser avisada quando voltar? ')); var a = el('a', null, 'Fale com a ESRO pelo WhatsApp'); a.href = WA + '?text=' + encodeURIComponent('Olá, ESRO! Quero saber quando volta o produto ' + p.nome + '.'); a.target = '_blank'; a.rel = 'noopener noreferrer'; note.appendChild(a); note.appendChild(document.createTextNode('.')); }
    else note.textContent = p.modo === 'compra' ? (p.digital ? 'Produto digital: a entrega é feita por e-mail ou WhatsApp.' : 'O frete é calculado pelo CEP na finalização da compra.') : 'Este item é feito sob orçamento: você envia o pedido e a ESRO confirma o valor e o prazo pelo WhatsApp.';
    showPrice();
  }

  function addToCart() {
    $('#pdMsg').hidden = true;
    var c = chosen(); if (c.missing) { fail('Escolha uma opção de "' + c.missing + '".'); return false; }
    var pers = $('#pd-pers').value.trim();
    if (p.personalizacao && !pers) { var box = $('#pd-pers-err'); box.textContent = 'Preencha este campo para a ESRO personalizar o produto.'; box.hidden = false; $('#pd-pers').setAttribute('aria-invalid', 'true'); $('#pd-pers').focus(); return false; }
    order = Cart.load();
    var ok = Cart.add(order, { nome: p.nome, qtd: qtd, img: p.imagens[0] || '', id: p.id, tipo: p.modo, vars: c.vars, pers: pers, preco: p.modo === 'compra' ? Math.round((p.preco + c.add) * 100) / 100 : 0, slug: p.slug });
    if (!ok) { fail('O pedido pode ter até 20 itens diferentes.'); return false; }
    Cart.save(order); count(); track('carrinho'); return true;
  }
  $('#pdForm').addEventListener('submit', function (ev) {
    ev.preventDefault(); if (!p || !addToCart()) return;
    $('#pdAdded').hidden = false; $('#pdFinish').hidden = !Cart.allBuy(order);
  });
  $('#pdNow').addEventListener('click', function () { if (!p || !addToCart()) return; track('finalizar'); location.href = Cart.allBuy(order) ? '/finalizar' : '/#pedido'; });
  $('#pd-pers').addEventListener('input', function () { this.removeAttribute('aria-invalid'); $('#pd-pers-err').hidden = true; });
  $('#qtyMinus').addEventListener('click', function () { if (qtd > 1) qtd--; $('#qty').textContent = qtd; if (p) showPrice(); });
  $('#qtyPlus').addEventListener('click', function () { var max = p && p.restam ? p.restam : 99; if (qtd < max) qtd++; $('#qty').textContent = qtd; if (p) showPrice(); });

  fetch('/api/produtos/' + encodeURIComponent(slug), { headers: { 'X-ESRO': '1' }, cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.produto) { $('#pdNote').textContent = ''; var a = el('a', 'btn primary', 'Ver os produtos da ESRO'); a.href = '/#kits'; $('#pdNote').appendChild(a); $('#pdMain').className = 'pd-main empty'; $('#pdMain').textContent = '♥'; return; }
    p = d.produto; render();
  }).catch(function () { $('#pdNote').textContent = 'Não foi possível carregar as opções deste produto. Confira a internet e atualize a página.'; });
})();
