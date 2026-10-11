/* ESRO — finalização da compra: dados, entrega pelo CEP, cupom e pagamento.
   Os valores mostrados aqui são conferidos de novo no servidor antes de o pedido ser registrado. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var Cart = window.ESROCart, money = Cart.money, form = $('#coForm');
  var order = Cart.load(), account = null, loja = { pagamentos: {} }, ship = [], shipId = '', coupon = null, digital = false, subtotal = 0, busy = false;

  async function api(method, path, body) {
    var r, j = null;
    try { r = await fetch('/api' + path, { method: method, headers: body ? { 'X-ESRO': '1', 'Content-Type': 'application/json' } : { 'X-ESRO': '1' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' }); }
    catch (_) { var off = new Error('Não foi possível falar com o servidor. Confira a internet e tente de novo.'); off.status = 0; throw off; }
    if (r.status !== 204) { try { j = await r.json(); } catch (_) { } }
    if (r.ok) return j || {};
    var e = new Error((j && j.erro) || 'Algo deu errado. Tente de novo em instantes.'); e.status = r.status; e.campo = j && j.campo; throw e;
  }
  try { fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ p: '/finalizar' }), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { }

  var payload = function () { return order.map(function (i) { return { id: i.id, qtd: i.qtd, vars: i.vars, pers: i.pers }; }); };
  var chosenShip = function () { return ship.filter(function (o) { return o.id === shipId; })[0] || null; };
  var needsAddress = function () { var s = chosenShip(); return !!s && s.id !== 'retirada' && s.id !== 'digital'; };

  /* ---------- Mensagens de erro nos campos ---------- */
  function fieldError(name, text) {
    var box = document.getElementById('co-' + name + '-err'), inp = document.getElementById('co-' + name); if (!box) return false;
    box.textContent = text; box.hidden = false; if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); } else box.scrollIntoView({ block: 'center' });
    return true;
  }
  function clearErrors() {
    $$('[aria-invalid]', form).forEach(function (i) { i.removeAttribute('aria-invalid'); });
    $$('.err', form).forEach(function (b) { b.hidden = true; b.textContent = ''; });
    $('#coMsg').hidden = true;
  }
  form.addEventListener('input', function (ev) { var t = ev.target; if (t.id && t.hasAttribute('aria-invalid')) { t.removeAttribute('aria-invalid'); var b = document.getElementById(t.id + '-err'); if (b) b.hidden = true; } });
  function working(btn, on) { if (on) { btn.dataset.label = btn.textContent; btn.textContent = btn.getAttribute('data-busy') || btn.textContent; btn.disabled = true; } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; } }

  /* ---------- Resumo ---------- */
  function renderSummary() {
    var ul = $('#sumItems'); ul.textContent = '';
    order.forEach(function (it) {
      var li = el('li'), th = el('span', 'sum-thumb');
      if (it.img) { var im = document.createElement('img'); im.src = it.img.charAt(0) === '/' ? it.img : '/' + it.img; im.alt = ''; th.appendChild(im); } else th.textContent = '♥';
      var info = el('div'); info.appendChild(el('strong', null, it.qtd + ' × ' + it.nome)); var d = Cart.detail(it); if (d) info.appendChild(el('small', null, d));
      li.appendChild(th); li.appendChild(info); li.appendChild(el('strong', null, money(it.preco * it.qtd))); ul.appendChild(li);
    });
    subtotal = Math.round(order.reduce(function (a, i) { return a + i.preco * i.qtd; }, 0) * 100) / 100;
    renderTotals();
  }
  function renderTotals() {
    var box = $('#totals'), s = chosenShip(); box.textContent = '';
    var line = function (label, value, cls) { var d = el('div', cls); d.appendChild(el('span', null, label)); d.appendChild(el('span', null, value)); box.appendChild(d); };
    var frete = s ? (coupon && coupon.freteGratis ? 0 : s.valor) : 0, desc = coupon ? coupon.desconto : 0;
    line('Subtotal', money(subtotal));
    if (coupon && desc > 0) line('Cupom ' + coupon.codigo, '− ' + money(desc), 'off');
    line('Entrega', !s ? (digital ? 'grátis' : 'informe o CEP') : s.combinar ? 'a combinar' : frete > 0 ? money(frete) : 'grátis', s && !s.combinar && frete === 0 ? 'off' : '');
    line('Total', money(Math.max(0, subtotal - desc + frete)) + (s && s.combinar ? ' + entrega' : ''), 'grand');
  }

  /* ---------- Entrega ---------- */
  function renderShip() {
    var list = $('#shipList'); list.textContent = '';
    if (shipId && !chosenShip()) shipId = '';
    if (!shipId && ship.length === 1) shipId = ship[0].id;
    ship.forEach(function (o) {
      var lab = el('label', 'choice'), inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'entrega'; inp.value = o.id; inp.checked = o.id === shipId;
      inp.addEventListener('change', function () { shipId = o.id; $('#co-entrega-err').hidden = true; $('#addrBox').hidden = !needsAddress(); recheckCoupon(); renderTotals(); });
      lab.appendChild(inp); lab.appendChild(el('strong', null, o.nome)); lab.appendChild(el('span', 'val' + (o.combinar || o.valor > 0 ? '' : ' free'), o.combinar ? 'a combinar' : o.valor > 0 ? money(o.valor) : 'grátis'));
      if (o.prazo) lab.appendChild(el('small', null, o.prazo)); else if (o.gratis) lab.appendChild(el('small', null, 'Frete grátis nesta compra'));
      list.appendChild(lab);
    });
    $('#addrBox').hidden = !needsAddress(); renderTotals();
  }
  async function quote(showErrors) {
    var cep = $('#co-cep').value.replace(/\D/g, '');
    if (!digital && cep.length !== 8) { if (showErrors) fieldError('cep', 'Digite o CEP com 8 números.'); return; }
    var btn = $('#cepBtn'); working(btn, true);
    try {
      var r = await api('POST', '/frete', { cep: cep, itens: payload() });
      digital = !!r.digital; ship = r.opcoes || [];
      if (r.endereco) { ['rua', 'bairro', 'cidade'].forEach(function (k) { var inp = $('#co-' + k); if (r.endereco[k] && !inp.dataset.typed) inp.value = r.endereco[k]; }); if (r.endereco.uf) $('#co-uf').value = r.endereco.uf; }
      renderShip(); recheckCoupon();
      if (r.endereco && needsAddress() && !$('#co-numero').value) $('#co-numero').focus();
    } catch (e) { if (!(e.campo && fieldError(e.campo, e.message))) { $('#coMsg').textContent = e.message; $('#coMsg').hidden = false; } }
    finally { working(btn, false); }
  }
  var cepInp = $('#co-cep');
  cepInp.addEventListener('input', function () { var d = cepInp.value.replace(/\D/g, '').slice(0, 8); cepInp.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; if (d.length === 8) quote(false); });
  $('#cepBtn').addEventListener('click', function () { clearErrors(); quote(true); });
  ['rua', 'bairro', 'cidade'].forEach(function (k) { $('#co-' + k).addEventListener('input', function () { this.dataset.typed = '1'; }); });
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').forEach(function (uf) { var o = el('option', null, uf); o.value = uf; $('#co-uf').appendChild(o); });

  /* ---------- Cupom ---------- */
  async function applyCoupon(silent) {
    var code = $('#co-cupom').value.trim(), ok = $('#cupomOk');
    if (!code) { coupon = null; ok.hidden = true; renderTotals(); if (!silent) fieldError('cupom', 'Digite o código do cupom.'); return; }
    var btn = $('#cupomBtn'); if (!silent) working(btn, true);
    try { var s = chosenShip(); coupon = await api('POST', '/cupom', { codigo: code, itens: payload(), frete: s ? s.valor : 0 }); ok.textContent = 'Cupom ' + coupon.codigo + ' aplicado: ' + coupon.descricao.toLowerCase() + '.'; ok.hidden = false; $('#co-cupom-err').hidden = true; $('#co-cupom').removeAttribute('aria-invalid'); }
    catch (e) { coupon = null; ok.hidden = true; if (!silent || e.status === 422) fieldError('cupom', e.message); }
    finally { if (!silent) working(btn, false); renderTotals(); }
  }
  function recheckCoupon() { if (coupon) applyCoupon(true); }
  $('#cupomBtn').addEventListener('click', function () { clearErrors(); applyCoupon(false); });
  $('#co-cupom').addEventListener('input', function () { if (coupon) { coupon = null; $('#cupomOk').hidden = true; renderTotals(); } });

  /* ---------- Pagamento ---------- */
  function renderPay() {
    var list = $('#payList'), opts = []; list.textContent = '';
    if (loja.pagamentos.pix) opts.push(['pix', 'PIX', 'Você recebe o QR Code e o código "copia e cola" na próxima tela.']);
    if (loja.pagamentos.online) opts.push(['online', 'Cartão, PIX ou boleto pelo Mercado Pago', 'Você é levada ao ambiente seguro do Mercado Pago e o pagamento é confirmado automaticamente.']);
    if (!opts.length) opts.push(['combinar', 'Combinar com a ESRO', 'A ESRO entra em contato pelo WhatsApp para combinar o pagamento.']);
    opts.forEach(function (o, i) {
      var lab = el('label', 'choice'), inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'pagamento'; inp.value = o[0]; inp.checked = i === 0;
      lab.appendChild(inp); lab.appendChild(el('strong', null, o[1])); lab.appendChild(el('span', 'val', '')); lab.appendChild(el('small', null, o[2])); list.appendChild(lab);
    });
  }

  /* ---------- Envio ---------- */
  var phone = $('#co-telefone');
  phone.addEventListener('input', function () {
    var d = phone.value.replace(/\D/g, ''); if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2); d = d.slice(0, 11);
    var rest = d.slice(2), cut = rest.length > 8 ? 5 : 4, end = phone.selectionStart === phone.value.length;
    phone.value = d.length <= 2 ? (d.length ? '(' + d : '') : '(' + d.slice(0, 2) + ') ' + (rest.length > cut ? rest.slice(0, cut) + '-' + rest.slice(cut) : rest);
    if (end) phone.setSelectionRange(phone.value.length, phone.value.length);
  });
  form.addEventListener('submit', async function (ev) {
    ev.preventDefault(); if (busy) return; clearErrors();
    var f = form.elements, v = function (k) { return f[k].value.trim(); };
    if (!account) {
      if (v('nome').length < 2) return fieldError('nome', 'Escreva o seu nome.');
      var n = v('telefone').replace(/\D/g, '').length; if (n !== 10 && n !== 11) return fieldError('telefone', 'Escreva o WhatsApp com DDD, por exemplo (11) 99999-0000.');
      if (v('email') && !/^\S+@\S+\.\S+$/.test(v('email'))) return fieldError('email', 'Confira o e-mail: ele precisa ter o formato nome@exemplo.com.');
    }
    if (!shipId) { if (!digital && v('cep').replace(/\D/g, '').length !== 8) return fieldError('cep', 'Digite o CEP para calcular a entrega.'); return fieldError('entrega', 'Escolha a forma de entrega.'); }
    if (needsAddress()) {
      var req = [['rua', 'Preencha a rua.'], ['numero', 'Preencha o número.'], ['bairro', 'Preencha o bairro.'], ['cidade', 'Preencha a cidade.'], ['uf', 'Escolha o estado.']];
      for (var i = 0; i < req.length; i++) if (!v(req[i][0])) return fieldError(req[i][0], req[i][1]);
    }
    if (!f.aceite.checked) return fieldError('aceite', 'Marque que você leu e aceita a Política de Privacidade.');
    var btn = $('#coBtn'); busy = true; working(btn, true);
    try {
      var pay = $('input[name=pagamento]:checked');
      var r = await api('POST', '/compra', { itens: payload(), nome: v('nome'), telefone: v('telefone'), email: v('email'), cep: v('cep'), rua: v('rua'), numero: v('numero'), complemento: v('complemento'), bairro: v('bairro'), cidade: v('cidade'), uf: v('uf'),
        entrega: shipId, cupom: coupon ? coupon.codigo : '', pagamento: pay ? pay.value : 'pix', obs: v('obs'), aceite: true, site: f.site.value });
      Cart.save([]);
      location.href = r.pagamentoUrl || r.acompanhar;
    } catch (e) {
      if (e.campo === 'entrega') { await quote(false); }
      if (!(e.campo && fieldError(e.campo, e.message))) { var m = $('#coMsg'); m.textContent = e.message; m.hidden = false; m.scrollIntoView({ block: 'center' }); }
      busy = false; working(btn, false);
    }
  });

  /* ---------- Início ---------- */
  function empty(text) { $('#loading').hidden = true; form.hidden = true; if (text) $('#emptyText').textContent = text; $('#emptyBox').hidden = false; }
  (async function () {
    if (!order.length) return empty();
    try {
      var got = await Promise.all([api('GET', '/produtos'), api('GET', '/loja'), api('GET', '/conta/sessao').catch(function () { return {}; })]);
      var products = got[0].produtos || []; loja = got[1]; account = got[2].conta || null;
      var quoteOnly = false;
      order = order.filter(function (i) {
        var p = products.filter(function (x) { return x.id === i.id; })[0]; if (!p) return false;
        if (p.modo !== 'compra') { quoteOnly = true; return true; }
        var add = 0; p.variacoes.forEach(function (v) { var o = v.opcoes.filter(function (x) { return x.nome === i.vars[v.nome]; })[0]; if (o) add += o.acrescimo; });
        i.preco = Math.round((p.preco + add) * 100) / 100; i.tipo = 'compra'; return true;
      });
      Cart.save(order);
      if (!order.length) return empty('Os produtos do seu pedido não estão mais disponíveis. Escolha outros na loja.');
      if (quoteOnly) { empty('Seu pedido tem itens feitos sob orçamento. Volte ao pedido para enviar tudo como pedido de orçamento.'); var a = $('#emptyBox .btn'); a.textContent = 'Voltar ao pedido'; a.href = '/#pedido'; return; }
      if (account) { $('#coWho').hidden = true; var s = $('#coSigned'); s.hidden = false; s.textContent = 'Pedido em nome de ' + account.nome + ' (' + account.email + '), com o WhatsApp ' + account.telefone + ' da sua conta.'; }
      renderSummary(); renderPay();
      var r = await api('POST', '/frete', { itens: payload() });
      digital = !!r.digital; ship = r.opcoes || [];
      if (digital) { $('#cepBox').hidden = true; $('#digitalNote').hidden = false; }
      renderShip();
      $('#loading').hidden = true; form.hidden = false;
    } catch (e) { empty(e.status === 422 || e.status === 409 ? e.message : 'Não foi possível abrir a finalização agora. Confira a internet e atualize a página.'); if (e.status === 422 || e.status === 409) { var b = $('#emptyBox .btn'); b.textContent = 'Voltar ao pedido'; b.href = '/#pedido'; } }
  })();
})();
