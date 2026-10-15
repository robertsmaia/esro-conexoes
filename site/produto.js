/* ESRO — página de um produto: fotos, opções, quantidade e botão de adicionar ao pedido.
   Tudo o que vem do servidor entra na página como texto (nunca como HTML). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var Cart = window.ESROCart, WA = 'https://wa.me/5511992481676';
  var slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  var p = null, qtd = 1, order = Cart.load();
  var PROD = 'A produção começa após a confirmação do pagamento via PIX ou do sinal de 50%.';

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
    var c = chosen(), faixas = p.faixasQtd || [], unit = Math.round((Cart.baseFor(p.preco, faixas, qtd) + c.add) * 100) / 100, cheio = Math.round((p.preco + c.add) * 100) / 100;
    if (p.precoDe && unit === cheio) box.appendChild(el('s', null, Cart.money(p.precoDe + c.add)));
    else if (unit < cheio) box.appendChild(el('s', null, Cart.money(cheio)));   // preço por quantidade atingido
    box.appendChild(document.createTextNode(Cart.money(unit)));
    if (qtd > 1) box.appendChild(el('small', null, qtd + ' unidades: ' + Cart.money(Math.round(unit * qtd * 100) / 100)));
    var tb = $('#pdTiers'); tb.textContent = '';
    faixas.forEach(function (t) { var line = el('span', qtd >= t.min ? 'on' : '', 'A partir de ' + t.min + ' un.: ' + Cart.money(Math.min(p.preco, t.preco) + c.add) + ' cada'); tb.appendChild(line); });
    tb.hidden = !faixas.length;
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
    else note.textContent = p.modo === 'compra' ? (p.digital ? 'Produto digital: a entrega é feita por e-mail ou WhatsApp.' : 'O frete é calculado pelo CEP na finalização da compra. ' + PROD) : 'Este item é feito sob orçamento: você envia o pedido e a ESRO confirma o valor e o prazo pelo WhatsApp.' + (p.digital ? '' : ' ' + PROD);
    showPrice();
  }

  /* Miolo: agenda, planner, caderno… mostram aqui mesmo os modelos de miolo ligados ao produto no painel.
     A cliente escolhe o modelo, a cor, o tamanho e o ano e pode folhear o miolo completo sem sair da página. */
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); };
  var MIO = { list: [], cats: [], cat: '', m: null, cor: '', tam: '', ano: '' };
  var blockedM = function (m, c, t, y) { return m.bloqueios.some(function (b) { return (!b[0] || norm(b[0]) === norm(c)) && (!b[1] || norm(b[1]) === norm(t)) && (!b[2] || norm(b[2]) === norm(y)); }); };
  function optOk(kind, v) {   // a opção combina com o que já foi escolhido? (combinações indisponíveis do cadastro)
    var m = MIO.m; if (!m.bloqueios.length) return true;
    var av = function (list, f) { var a = list.filter(function (x) { return x.disp; }).map(function (x) { return x[f]; }); return a.length ? a : ['']; };
    var cs = kind === 'cor' ? [v] : MIO.cor ? [MIO.cor] : av(m.cores, 'nome'), ts = kind === 'tam' ? [v] : MIO.tam ? [MIO.tam] : av(m.tamanhos, 'nome'), ys = kind === 'ano' ? [v] : MIO.ano ? [MIO.ano] : av(m.anos, 'ano');
    return cs.some(function (a) { return ts.some(function (b) { return ys.some(function (d) { return !blockedM(m, a, b, d); }); }); });
  }
  function firstPicM(m) { var c = MIO.cor && m.cores.filter(function (x) { return norm(x.nome) === norm(MIO.cor); })[0]; return (c && c.imgs[0]) || m.galeria[0] || (m.cores.filter(function (x) { return x.imgs.length; })[0] || { imgs: [] }).imgs[0] || m.paginas[0] || null; }
  function pickModel(m, keep) {
    MIO.m = m; if (m) MIO.cat = m.cat;
    if (!keep) { MIO.cor = MIO.tam = MIO.ano = ''; }
    if (m) [['cor', m.cores, 'nome'], ['tam', m.tamanhos, 'nome'], ['ano', m.anos, 'ano']].forEach(function (g) {
      if (MIO[g[0]] && !g[1].some(function (x) { return x.disp && norm(x[g[2]]) === norm(MIO[g[0]]); })) MIO[g[0]] = '';
      var av = g[1].filter(function (x) { return x.disp; }); if (!MIO[g[0]] && av.length === 1) MIO[g[0]] = av[0][g[2]];
    });
  }
  function loadMiolos() {
    fetch('/api/miolos', { headers: { 'X-ESRO': '1' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      MIO.list = d.modelos.filter(function (m) { return m.produtos.some(function (x) { return x.id === p.id; }); });
      if (!MIO.list.length) return;
      var names = {}; d.categorias.forEach(function (c) { names[c.id] = c.nome; });
      MIO.cats = []; MIO.list.forEach(function (m) { if (!MIO.cats.some(function (c) { return c.id === m.cat; })) MIO.cats.push({ id: m.cat, nome: names[m.cat] || 'Outros modelos' }); });
      // Escolha que já veio do catálogo de miolos (ou de uma visita anterior), se ainda valer para este produto.
      var saved = null; try { saved = JSON.parse(localStorage.getItem('esro_miolo') || 'null'); } catch (_) { }
      var want = new URLSearchParams(location.search).get('miolo') || (saved && saved.codigo) || '';
      var m = MIO.list.filter(function (x) { return x.codigo === String(want).toUpperCase() && x.disponivel; })[0];
      if (m) { MIO.cor = saved && saved.codigo === m.codigo ? saved.cor : ''; MIO.tam = saved && saved.codigo === m.codigo ? saved.tamanho : ''; MIO.ano = saved && saved.codigo === m.codigo ? saved.ano : ''; pickModel(m, true); }
      else MIO.cat = MIO.cats[0].id;
      drawMiolo();
    }).catch(function () { });
  }
  function mioErr(t) { var b = $('#pdMioloMsg'); if (!b) return; b.textContent = t || ''; b.hidden = !t; }
  function drawMiolo() {
    var box = $('#pdMiolo'), m = MIO.m; box.textContent = ''; box.hidden = false;
    var h = el('p', 'pd-miolo-t', 'Escolha o miolo'); h.id = 'pdMioloT'; box.appendChild(h);
    box.appendChild(el('p', 'pd-miolo-txt', 'As páginas de dentro: toque em um modelo para ver as opções e folhear o miolo completo.'));
    if (MIO.cats.length > 1) {
      var tabs = el('div', 'pd-mtabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Tipo de miolo');
      MIO.cats.forEach(function (c) { var b = el('button', 'pd-mtab', c.nome); b.type = 'button'; b.setAttribute('aria-pressed', String(MIO.cat === c.id));
        b.addEventListener('click', function () { MIO.cat = c.id; if (MIO.m && MIO.m.cat !== c.id) pickModel(null); drawMiolo(); }); tabs.appendChild(b); });
      box.appendChild(tabs);
    }
    var grid = el('div', 'pd-mgrid'); grid.setAttribute('role', 'radiogroup'); grid.setAttribute('aria-labelledby', 'pdMioloT');
    MIO.list.filter(function (x) { return x.cat === MIO.cat; }).forEach(function (x) {
      var b = el('button', 'pd-mcard'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(m === x)); b.disabled = !x.disponivel;
      var pic = x.galeria[0] || (x.cores.filter(function (c) { return c.imgs.length; })[0] || { imgs: [] }).imgs[0] || x.paginas[0];
      var fig = el('span', 'pd-mimg'); if (pic) { var im = document.createElement('img'); im.src = pic.thumb; im.alt = ''; im.loading = 'lazy'; fig.appendChild(im); } fig.setAttribute('aria-hidden', 'true'); b.appendChild(fig);
      b.appendChild(el('span', 'pd-mcode', x.codigo)); b.appendChild(el('span', 'pd-mname', x.nome)); if (!x.disponivel) b.appendChild(el('span', 'pd-moff', 'Indisponível'));
      b.addEventListener('click', function () { pickModel(x); mioErr(''); drawMiolo(); var d = $('#pdMDet'); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    if (m) {
      var det = el('div', 'pd-mdet'); det.id = 'pdMDet';
      det.appendChild(el('b', null, m.codigo + ' · ' + m.nome));
      var first = String(m.desc || '').split('\n')[0]; if (first) det.appendChild(el('p', 'pd-mdesc', first));
      [['cor', 'Cor', m.cores, 'nome', true], ['tam', 'Tamanho', m.tamanhos, 'nome'], ['ano', 'Ano', m.anos, 'ano']].forEach(function (g) {
        if (!g[2].length) return;
        var fs = el('fieldset', 'opt'), wrap = el('div', g[4] ? 'sw' : 'chips'); fs.appendChild(el('legend', null, g[1]));
        g[2].forEach(function (it) {
          var lab = el('label'), inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'pdm-' + g[0]; inp.value = it[g[3]];
          var ok = it.disp && optOk(g[0], it[g[3]]); inp.disabled = !ok; inp.checked = ok && norm(MIO[g[0]]) === norm(it[g[3]]); lab.appendChild(inp);
          if (g[4]) { var ball = el('span', 'ball'); ball.style.background = it.hex || '#ddd'; lab.appendChild(ball); lab.appendChild(el('span', null, it.nome)); }
          else { var sp = el('span', null, it[g[3]]); if (it.medida) sp.appendChild(el('small', null, ' · ' + it.medida)); lab.appendChild(sp); }
          if (!ok) { lab.title = it.disp ? 'Não disponível com a escolha atual' : 'Indisponível'; lab.appendChild(el('span', 'sr', it.disp ? ' (não disponível com a escolha atual)' : ' (indisponível)')); }
          inp.addEventListener('change', function () { MIO[g[0]] = it[g[3]]; mioErr(''); drawMiolo(); });
          wrap.appendChild(lab);
        });
        fs.appendChild(wrap); if (g[0] === 'cor') fs.appendChild(el('p', 'ml-small', 'As cores podem variar conforme a tela e a impressão.')); det.appendChild(fs);
      });
      var acts = el('div', 'pd-macts');
      if (m.paginas.length) { var ver = el('button', 'btn secondary small', 'Ver miolo completo (' + m.paginas.length + (m.paginas.length === 1 ? ' página)' : ' páginas)')); ver.type = 'button'; ver.id = 'pdMVer';
        ver.addEventListener('click', function () { window.ESROViewer.open(m.paginas, 0, m.nome + ' · miolo completo', ver); }); acts.appendChild(ver); }
      else if (m.galeria.length) { var vg = el('button', 'btn secondary small', 'Ver prévias'); vg.type = 'button'; vg.addEventListener('click', function () { window.ESROViewer.open(m.galeria, 0, m.nome, vg); }); acts.appendChild(vg); }
      if (m.demo) { var pdf = el('a', 'linkish', 'PDF de demonstração'); pdf.href = m.demo; pdf.target = '_blank'; pdf.rel = 'noopener'; acts.appendChild(pdf); }
      det.appendChild(acts);
      if (m.secoes.length) { var dt = el('details', 'pd-msecs'), sm = el('summary', null, 'O que tem dentro (' + m.secoes.length + ')'); dt.appendChild(sm); var ul = el('ul', 'ml-secs'); m.secoes.forEach(function (x) { ul.appendChild(el('li', null, x)); }); dt.appendChild(ul); det.appendChild(dt); }
      box.appendChild(det);
    }
    var msg = el('p', 'msg bad'); msg.id = 'pdMioloMsg'; msg.setAttribute('role', 'alert'); msg.hidden = true; box.appendChild(msg);
  }
  // Para o carrinho: o miolo escolhido (ou o que falta escolher).
  function mioChoice() {
    if (!MIO.list.some(function (x) { return x.disponivel; })) return { ok: true, value: null };
    var m = MIO.m; if (!m) return { erro: 'Escolha o miolo antes de adicionar ao pedido.' };
    var miss = m.cores.length && !MIO.cor ? 'a cor' : m.tamanhos.length && !MIO.tam ? 'o tamanho' : m.anos.length && !MIO.ano ? 'o ano' : '';
    if (miss) return { erro: 'Escolha ' + miss + ' do miolo.' };
    var rot = [m.codigo + ' ' + m.nome, MIO.cor, MIO.tam, MIO.ano].filter(Boolean).join(' · '), pic = firstPicM(m);
    var v = { codigo: m.codigo, cor: MIO.cor, tamanho: MIO.tam, ano: MIO.ano, rotulo: rot };
    try { localStorage.setItem('esro_miolo', JSON.stringify(Object.assign({ nome: m.nome, thumb: pic ? pic.thumb : '', produtos: m.produtos.map(function (x) { return x.id; }), at: Date.now() }, v, { tamanho: MIO.tam }))); } catch (_) { }
    return { ok: true, value: v };
  }

  function addToCart() {
    $('#pdMsg').hidden = true;
    var mc = mioChoice(); if (mc.erro) { mioErr(mc.erro); $('#pdMiolo').scrollIntoView({ block: 'start', behavior: 'smooth' }); return false; }
    var c = chosen(); if (c.missing) { fail('Escolha uma opção de "' + c.missing + '".'); return false; }
    var pers = $('#pd-pers').value.trim();
    if (p.personalizacao && !pers) { var box = $('#pd-pers-err'); box.textContent = 'Preencha este campo para a ESRO personalizar o produto.'; box.hidden = false; $('#pd-pers').setAttribute('aria-invalid', 'true'); $('#pd-pers').focus(); return false; }
    order = Cart.load();
    var ok = Cart.add(order, { nome: p.nome, qtd: qtd, img: p.imagens[0] || '', id: p.id, tipo: p.modo, vars: c.vars, pers: pers, preco: p.modo === 'compra' ? Math.round((p.preco + c.add) * 100) / 100 : 0, slug: p.slug,
      base: p.modo === 'compra' ? p.preco : 0, add: c.add, faixas: p.faixasQtd || [], miolo: mc.value });
    Cart.reprice(order);
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
    p = d.produto; render(); loadMiolos();
  }).catch(function () { $('#pdNote').textContent = 'Não foi possível carregar as opções deste produto. Confira a internet e atualize a página.'; });
})();
