/* ESRO — acompanhamento do pedido pelo link secreto: etapas, itens, pagamento (PIX ou Mercado Pago), rastreio e nota fiscal. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var money = function (v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var token = location.pathname.split('/').filter(Boolean).pop() || '', WA = 'https://wa.me/5511992481676';
  // Voltando do Mercado Pago: o número do pagamento vem no endereço; ele é conferido no servidor e depois sai da barra de endereço.
  var qs = new URLSearchParams(location.search), payId = /^\d{5,20}$/.test(qs.get('payment_id') || qs.get('collection_id') || '') ? (qs.get('payment_id') || qs.get('collection_id')) : '';
  if (location.search) { try { history.replaceState(null, '', location.pathname); } catch (_) { } }
  var polls = 0, timer = null, shown = '';

  async function get(first) {
    var r = await fetch('/api/pedido-loja/' + encodeURIComponent(token) + (first && payId ? '?pagamento=' + payId : ''), { headers: { 'X-ESRO': '1' }, credentials: 'omit', cache: 'no-store' });
    var j = null; try { j = await r.json(); } catch (_) { }
    if (!r.ok) { var e = new Error((j && j.erro) || 'Não foi possível abrir o pedido.'); e.status = r.status; throw e; }
    return j.pedido;
  }

  function steps(p) {
    var ol = $('#steps'), order = ['novo', 'producao', 'enviado', 'concluido'], names = ['Recebido', 'Em produção', 'Enviado', 'Concluído'];
    var at = p.status === 'orcamento' ? 0 : p.status === 'arte' ? 1 : Math.max(0, order.indexOf(p.status)); ol.textContent = '';
    names.forEach(function (n, i) { var li = el('li', i < at ? 'done' : i === at ? 'now' : '', i === at ? p.statusNome : n); if (i === at) li.setAttribute('aria-current', 'step'); ol.appendChild(li); });
  }
  function items(p) {
    var ul = $('#items'); ul.textContent = '';
    p.itens.forEach(function (it) {
      var li = el('li'); li.style.gridTemplateColumns = 'minmax(0,1fr) auto';
      var info = el('div'); info.appendChild(el('strong', null, it.qtd + ' × ' + it.nome));
      var d = (it.vars || []).map(function (v) { return v[0] + ': ' + v[1]; }); if (it.pers) d.push('Personalização: ' + it.pers); if (d.length) info.appendChild(el('small', null, d.join(' · ')));
      li.appendChild(info); li.appendChild(el('strong', null, it.unit == null ? '' : money(it.unit * it.qtd))); ul.appendChild(li);
    });
    var box = $('#totals'); box.textContent = '';
    var line = function (label, value, cls) { var d = el('div', cls); d.appendChild(el('span', null, label)); d.appendChild(el('span', null, value)); box.appendChild(d); };
    if (p.subtotal != null) line('Subtotal', money(p.subtotal));
    if (p.desconto > 0) line('Cupom ' + (p.cupom || ''), '− ' + money(p.desconto), 'off');
    if (p.frete) line('Entrega', p.frete.combinar ? 'a combinar' : p.frete.valor > 0 ? money(p.frete.valor) : 'grátis');
    line('Total', money(p.total), 'grand');
    if (p.pago > 0 && p.falta > 0) { line('Já pago', money(p.pago), 'off'); line('Falta pagar', money(p.falta)); }
  }
  function shipping(p) {
    var dl = $('#shipBox'); dl.textContent = '';
    var row = function (k, node) { var d = el('div'); d.appendChild(el('dt', null, k)); var dd = el('dd'); if (typeof node === 'string') dd.textContent = node; else dd.appendChild(node); d.appendChild(dd); dl.appendChild(d); };
    var link = function (text, href) { var a = el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
    if (p.frete) { row('Forma', p.frete.nome); if (p.frete.prazo) row('Prazo', p.frete.prazo); }
    if (p.cidade) row('Destino', p.cidade);
    if (p.entrega) row('Previsão de entrega', p.entrega.slice(8, 10) + '/' + p.entrega.slice(5, 7) + '/' + p.entrega.slice(0, 4));
    if (p.rastreio) { row('Código de rastreio', p.rastreio.codigo); if (p.rastreio.url) row('Rastrear', link('Abrir o rastreamento', p.rastreio.url)); }
    if (p.nota) row('Nota fiscal', p.nota.url ? link(p.nota.numero ? 'Nota nº ' + p.nota.numero : 'Abrir a nota fiscal', p.nota.url) : 'nº ' + p.nota.numero);
    if (!dl.children.length) row('Entrega', 'A ESRO combina a entrega com você pelo WhatsApp.');
  }
  function payment(p) {
    var box = $('#payBox'), sig = p.pagamento + '|' + p.falta + '|' + (p.pix ? p.pix.codigo : '') + '|' + p.pagarOnline; if (sig === shown) return; shown = sig; box.textContent = '';
    if (p.falta <= 0) { box.appendChild(el('p', 'paid', p.total > 0 ? 'Pagamento confirmado. Obrigada!' : 'Este pedido não tem valor a pagar.')); return; }
    if (p.pago > 0) box.appendChild(el('p', null, 'Recebemos ' + money(p.pago) + '. Falta pagar ' + money(p.falta) + '.'));
    if (p.pix) {
      var wrap = el('div', 'pix-box'), qr = el('div', 'pix-qr'), side = el('div', 'pix-side');
      side.appendChild(el('p', 'pix-how', 'Abra o app do seu banco, escolha PIX e leia o QR Code. Ou copie o código abaixo e cole em "PIX copia e cola".'));
      var lab = el('label', 'pix-lab', 'Código copia e cola (' + money(p.pix.valor) + ' para ' + p.pix.favorecido + ')'), ta = document.createElement('textarea'); ta.className = 'pix-code'; ta.readOnly = true; ta.rows = 4; ta.value = p.pix.codigo; ta.id = 'pixCode'; lab.htmlFor = 'pixCode';
      ta.addEventListener('focus', function () { ta.select(); });
      var acts = el('div', 'pix-actions'), copy = el('button', 'btn primary small', 'Copiar código'), said = el('span', 'pix-said'); copy.type = 'button'; said.setAttribute('role', 'status');
      copy.addEventListener('click', async function () { try { await navigator.clipboard.writeText(p.pix.codigo); said.textContent = 'Código copiado.'; } catch (_) { ta.focus(); ta.select(); said.textContent = 'Selecione e copie o código.'; } });
      acts.appendChild(copy); acts.appendChild(said);
      side.appendChild(lab); side.appendChild(ta); side.appendChild(acts);
      side.appendChild(el('p', 'pix-note', 'Depois de pagar, a ESRO confere o recebimento e esta página muda para "Pagamento confirmado".'));
      wrap.appendChild(qr); wrap.appendChild(side); box.appendChild(wrap);
      try { new QRCode(qr, { text: p.pix.codigo, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); } catch (_) { qr.className = 'pix-qr off'; qr.textContent = 'QR Code indisponível: use o código ao lado.'; }
    } else if (p.pagarOnline) {
      box.appendChild(el('p', null, 'O pagamento deste pedido é feito no Mercado Pago (cartão, PIX ou boleto). Assim que for aprovado, esta página é atualizada.'));
      var acts2 = el('div', 'actions'), b = el('button', 'btn primary', 'Pagar ' + money(p.falta) + ' no Mercado Pago'), msg = el('p', 'msg bad'); b.type = 'button'; msg.hidden = true; msg.setAttribute('role', 'alert');
      b.addEventListener('click', async function () {
        b.disabled = true; msg.hidden = true;
        try { var r = await fetch('/api/pedido-loja/' + encodeURIComponent(token) + '/pagar', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: '{}', credentials: 'omit' }), j = await r.json(); if (!r.ok) throw new Error(j.erro); location.href = j.pagamentoUrl; }
        catch (e) { msg.textContent = e.message || 'Não foi possível abrir o pagamento agora.'; msg.hidden = false; b.disabled = false; }
      });
      acts2.appendChild(b); box.appendChild(acts2); box.appendChild(msg);
    } else {
      box.appendChild(el('p', null, 'Valor a pagar: ' + money(p.falta) + '. A ESRO combina o pagamento com você pelo WhatsApp.'));
    }
  }
  function render(p) {
    document.title = 'Pedido nº ' + p.numero + ' | ESRO';
    $('#title').textContent = 'Pedido nº ' + p.numero;
    $('#when').textContent = (p.cliente ? p.cliente + ', a' : 'A') + 'qui está o seu pedido' + (p.data ? ' de ' + new Date(p.data).toLocaleDateString('pt-BR') : '') + '.';
    $('#waBtn').href = WA + '?text=' + encodeURIComponent('Olá, ESRO! Quero falar sobre o pedido nº ' + p.numero + '.');
    steps(p); items(p); shipping(p); payment(p);
    $('#loading').hidden = true; $('#content').hidden = false;
    clearTimeout(timer);   // enquanto falta pagar, confere de novo de tempos em tempos (por até 20 minutos)
    if (p.falta > 0 && polls < 40) timer = setTimeout(function () { polls++; if (document.visibilityState === 'visible') get(false).then(render).catch(function () { }); else render(p); }, 30000);
  }
  get(true).then(function (p) { render(p); $('#title').focus(); }).catch(function (e) {
    $('#loading').hidden = true; $('#notFound').hidden = false;
    if (e.status !== 404) $('#notFoundText').textContent = e.status === 429 ? 'Muitas consultas em pouco tempo. Aguarde um minuto e atualize a página.' : 'Não foi possível abrir o pedido agora. Confira a internet e atualize a página.';
  });
})();
