/* ESRO — "Escolha seu miolo": categorias, busca e filtros, página do modelo, visualizador do miolo completo e escolha.
   Tudo o que vem do servidor entra na página como texto (nunca como HTML). Os filtros ficam no endereço da página,
   então voltar do modelo para a lista mantém a busca, e o botão "voltar" do celular funciona como esperado. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var Cart = window.ESROCart, WA = 'https://wa.me/5511992481676', KEY = 'esro_miolo';
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); };
  var D = null, catById = {}, catBySlug = {}, ctx = null;
  var view = $('#mlView');

  try { $('#cartCount').textContent = Cart.load().reduce(function (a, i) { return a + i.qtd; }, 0); } catch (_) { }
  try { var first = !sessionStorage.getItem('esro_v'); sessionStorage.setItem('esro_v', '1');
    fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(first ? { p: '/miolos', n: true, r: document.referrer || '' } : { p: '/miolos' }), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { }

  /* ---------- Endereço da página = estado (filtros, categoria, modelo) ---------- */
  var FIELDS = ['produto', 'q', 'cat', 'ano', 'cor', 'tam', 'm'];
  function state() { var s = new URLSearchParams(location.search), o = {}; FIELDS.forEach(function (k) { o[k] = (s.get(k) || '').slice(0, 80); }); o.m = o.m.toUpperCase(); return o; }
  function urlOf(st) { var q = new URLSearchParams(); FIELDS.forEach(function (k) { if (st[k]) q.set(k, st[k]); }); var s = q.toString(); return '/miolos' + (s ? '?' + s : ''); }
  function go(st, replace) {
    history[replace ? 'replaceState' : 'pushState']({}, '', urlOf(st));
    route(); if (!replace) { window.scrollTo(0, 0); var main = $('#mlMain'); try { main.focus({ preventScroll: true }); } catch (_) { } }
  }
  function link(st, text, cls) { var a = el('a', cls, text); a.href = urlOf(st); a.addEventListener('click', function (ev) { if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return; ev.preventDefault(); go(st); }); return a; }
  var only = function (st, keep) { var o = {}; keep.forEach(function (k) { o[k] = st[k]; }); return o; };
  var listState = function (st) { var o = Object.assign({}, st); o.m = ''; return o; };

  /* ---------- Dados ---------- */
  function compat(m) { return !ctx || m.produtos.some(function (p) { return p.id === ctx.id; }); }
  function availOf(list, v, field) { return list.some(function (x) { return x.disp && norm(x[field]) === norm(v); }); }
  function filtered(st) {
    var q = norm(st.q), cat = catBySlug[st.cat];
    return D.modelos.filter(function (m) {
      if (!compat(m)) return false;
      if (cat && m.cat !== cat.id) return false;
      if (q && norm(m.nome + ' ' + m.codigo + ' ' + m.desc + ' ' + (catById[m.cat] ? catById[m.cat].nome : '')).indexOf(q) < 0) return false;
      if (st.ano && !availOf(m.anos, st.ano, 'ano')) return false;
      if (st.cor && !availOf(m.cores, st.cor, 'nome')) return false;
      if (st.tam && !availOf(m.tamanhos, st.tam, 'nome')) return false;
      return true;
    });
  }
  function firstPic(m, cor) {
    var c = cor && m.cores.filter(function (x) { return norm(x.nome) === norm(cor); })[0];
    if (c && c.imgs.length) return c.imgs[0];
    if (m.galeria.length) return m.galeria[0];
    var withImg = m.cores.filter(function (x) { return x.imgs.length; })[0];
    return withImg ? withImg.imgs[0] : m.paginas[0] || null;
  }
  function imgBox(p, alt, cls) {
    var box = el('div', cls || 'ml-img');
    if (p) { var im = document.createElement('img'); im.src = p.thumb; im.alt = alt || ''; im.loading = 'lazy'; im.decoding = 'async'; box.appendChild(im); }
    else { box.textContent = '♥'; box.setAttribute('aria-hidden', 'true'); }
    return box;
  }

  /* ---------- Busca e filtros ---------- */
  var tools = $('#mlTools');
  function fillSelect(sel, values, cur) {
    var keep = sel.options[0]; sel.textContent = ''; sel.appendChild(keep);
    values.forEach(function (v) { var o = document.createElement('option'); o.value = v[0]; o.textContent = v[1]; sel.appendChild(o); });
    sel.value = values.some(function (v) { return v[0] === cur; }) ? cur : '';
  }
  function uniq(list) { var seen = {}, out = []; list.forEach(function (v) { var k = norm(v); if (v && !seen[k]) { seen[k] = 1; out.push(v); } }); return out; }
  function syncTools(st) {
    var base = D.modelos.filter(compat);
    fillSelect($('#mlFCat'), D.categorias.filter(function (c) { return base.some(function (m) { return m.cat === c.id; }); }).map(function (c) { return [c.slug, c.nome]; }), st.cat);
    var anos = uniq([].concat.apply([], base.map(function (m) { return m.anos.filter(function (a) { return a.disp; }).map(function (a) { return a.ano; }); }))).sort();
    var cores = uniq([].concat.apply([], base.map(function (m) { return m.cores.filter(function (c) { return c.disp; }).map(function (c) { return c.nome; }); }))).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    var tams = uniq([].concat.apply([], base.map(function (m) { return m.tamanhos.filter(function (t) { return t.disp; }).map(function (t) { return t.nome; }); })));
    fillSelect($('#mlFAno'), anos.map(function (v) { return [v, v]; }), st.ano); $('#mlFAnoBox').hidden = !anos.length;
    fillSelect($('#mlFCor'), cores.map(function (v) { return [v, v]; }), st.cor); $('#mlFCorBox').hidden = !cores.length;
    fillSelect($('#mlFTam'), tams.map(function (v) { return [v, v]; }), st.tam); $('#mlFTamBox').hidden = !tams.length;
    if (document.activeElement !== $('#mlQ')) $('#mlQ').value = st.q;
    var n = ['cat', 'ano', 'cor', 'tam'].filter(function (k) { return st[k]; }).length; $('#mlFCount').textContent = n; $('#mlFCount').hidden = !n;
    $('#mlClear').hidden = !(n || st.q);
  }
  function setFilter(k, v) { var st = state(); st[k] = v; st.m = ''; go(st, true); }
  $('#mlFCat').addEventListener('change', function () { setFilter('cat', this.value); });
  $('#mlFAno').addEventListener('change', function () { setFilter('ano', this.value); });
  $('#mlFCor').addEventListener('change', function () { setFilter('cor', this.value); });
  $('#mlFTam').addEventListener('change', function () { setFilter('tam', this.value); });
  var qTimer = 0;
  $('#mlQ').addEventListener('input', function () { var v = this.value.slice(0, 60); clearTimeout(qTimer); qTimer = setTimeout(function () { setFilter('q', v.trim()); }, 250); });
  tools.addEventListener('submit', function (ev) { ev.preventDefault(); clearTimeout(qTimer); setFilter('q', $('#mlQ').value.trim()); });
  function clearAll() { var st = only(state(), ['produto']); $('#mlQ').value = ''; go(st, true); }
  $('#mlClear').addEventListener('click', clearAll);
  $('#mlFToggle').addEventListener('click', function () { var open = tools.classList.toggle('open'); this.setAttribute('aria-expanded', String(open)); });

  /* ---------- Telas ---------- */
  function crumb(parts) {
    var c = $('#mlCrumb'); c.textContent = ''; var a = el('a', null, 'Início'); a.href = '/'; c.appendChild(a);
    parts.forEach(function (p) { c.appendChild(document.createTextNode(' › ')); c.appendChild(p.st ? link(p.st, p.text) : el('span', null, p.text)); });
  }
  function emptyBox(title, textMsg, actions) {
    var b = el('div', 'ml-empty'); b.appendChild(el('h2', null, title)); b.appendChild(el('p', null, textMsg));
    var row = el('div', 'actions'); actions.forEach(function (a) { row.appendChild(a); }); b.appendChild(row); return b;
  }
  function waLink(text, label, cls) { var a = el('a', cls || 'btn primary', label); a.href = WA + '?text=' + encodeURIComponent(text); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }

  function renderCats(st) {
    crumb([{ text: 'Escolha seu miolo' }]);
    var cats = D.categorias.filter(function (c) { return D.modelos.some(function (m) { return m.cat === c.id && m.disponivel && compat(m); }); });
    if (!cats.length) { view.appendChild(emptyBox('Nenhum miolo para este produto ainda', 'A ESRO ainda não cadastrou modelos de miolo para este produto. Veja todos os modelos ou fale com a ESRO.', [link(only(st, []), 'Ver todos os modelos', 'btn primary'), waLink('Olá, ESRO! Quero saber dos modelos de miolo.', 'Falar pelo WhatsApp', 'btn secondary')])); return; }
    var grid = el('div', 'ml-cats');
    cats.forEach(function (c) {
      var n = D.modelos.filter(function (m) { return m.cat === c.id && m.disponivel && compat(m); }).length;
      var to = Object.assign({}, st, { cat: c.slug, m: '' }), a = link(to, null, 'ml-cat');
      a.setAttribute('aria-label', c.nome + ': ver ' + n + (n === 1 ? ' modelo' : ' modelos'));
      a.appendChild(imgBox(c.img, ''));
      var b = el('div', 'ml-cat-body'); b.appendChild(el('h2', null, c.nome)); if (c.desc) b.appendChild(el('p', null, c.desc));
      var g = el('div', 'go'); g.appendChild(el('span', null, n + (n === 1 ? ' modelo' : ' modelos'))); g.appendChild(el('span', null, 'Ver modelos')); b.appendChild(g);
      a.appendChild(b); grid.appendChild(a);
    });
    view.appendChild(grid);
  }

  function renderList(st) {
    var cat = catBySlug[st.cat], list = filtered(st);
    crumb([{ text: 'Escolha seu miolo', st: only(st, ['produto']) }].concat(cat ? [{ text: cat.nome }] : [{ text: 'Modelos' }]));
    var bar = el('div', 'ml-bar'), h = el('h2', null, cat ? cat.nome : st.q ? 'Resultado da busca' : 'Modelos'); bar.appendChild(h);
    var avail = list.filter(function (m) { return m.disponivel; }).length;
    bar.appendChild(el('p', null, list.length ? avail + (avail === 1 ? ' modelo disponível' : ' modelos disponíveis') + (list.length > avail ? ' · ' + (list.length - avail) + ' indisponível(is)' : '') : ''));
    view.appendChild(bar);
    if (cat && cat.desc) view.appendChild(el('p', 'ml-meta', cat.desc));
    if (!list.length) {
      var clear = el('button', 'btn primary', 'Limpar filtros'); clear.type = 'button'; clear.addEventListener('click', clearAll);
      view.appendChild(emptyBox('Nenhum modelo encontrado', 'Nenhum modelo combina com ' + (st.q ? 'a busca “' + st.q + '”' : 'esses filtros') + '. Tente outra palavra, tire algum filtro ou veja todas as categorias.', [clear, link(only(st, ['produto']), 'Ver todas as categorias', 'btn secondary')]));
      return;
    }
    var grid = el('div', 'ml-grid');
    list.forEach(function (m) {
      var a = link(Object.assign({}, st, { m: m.codigo }), null, 'ml-card'); a.setAttribute('aria-label', m.nome + ', código ' + m.codigo + (m.disponivel ? '' : ', indisponível'));
      a.appendChild(imgBox(firstPic(m, st.cor), ''));
      if (!m.disponivel) a.appendChild(el('span', 'ml-flag off', 'Indisponível')); else if (m.destaque) a.appendChild(el('span', 'ml-flag', 'Destaque'));
      var b = el('div', 'ml-card-body'); b.appendChild(el('span', 'ml-code', m.codigo)); b.appendChild(el('h3', null, m.nome));
      if (!cat && catById[m.cat]) b.appendChild(el('p', 'ml-meta', catById[m.cat].nome));
      var sizes = m.tamanhos.filter(function (t) { return t.disp; }).map(function (t) { return t.nome; }), anos = m.anos.filter(function (x) { return x.disp; }).map(function (x) { return x.ano; });
      if (sizes.length || anos.length) b.appendChild(el('p', 'ml-meta', sizes.concat(anos).join(' · ')));
      var cores = m.cores.filter(function (c) { return c.disp; });
      if (cores.length) { var dots = el('div', 'ml-dots'); dots.setAttribute('aria-label', 'Cores: ' + cores.map(function (c) { return c.nome; }).join(', ')); cores.slice(0, 8).forEach(function (c) { var d = el('span', 'ml-dot'); d.style.background = c.hex || '#ddd'; d.title = c.nome; dots.appendChild(d); }); if (cores.length > 8) dots.appendChild(el('small', null, '+' + (cores.length - 8))); b.appendChild(dots); }
      a.appendChild(b); grid.appendChild(a);
    });
    view.appendChild(grid);
  }

  /* ---------- Página do modelo ---------- */
  var M = null, sel = {}, galList = [], galI = 0;
  function blocked(c, t, y) { return M.bloqueios.some(function (b) { return (!b[0] || norm(b[0]) === norm(c)) && (!b[1] || norm(b[1]) === norm(t)) && (!b[2] || norm(b[2]) === norm(y)); }); }
  // Uma opção fica disponível se estiver liberada no cadastro e combinar com as outras escolhas feitas.
  function optOk(kind, v) {
    var c = kind === 'cor' ? v : sel.cor || '', t = kind === 'tam' ? v : sel.tam || '', y = kind === 'ano' ? v : sel.ano || '';
    if (!M.bloqueios.length) return true;
    var cs = c ? [c] : M.cores.filter(function (x) { return x.disp; }).map(function (x) { return x.nome; }), ts = t ? [t] : M.tamanhos.filter(function (x) { return x.disp; }).map(function (x) { return x.nome; }), ys = y ? [y] : M.anos.filter(function (x) { return x.disp; }).map(function (x) { return x.ano; });
    if (!cs.length) cs = ['']; if (!ts.length) ts = ['']; if (!ys.length) ys = [''];
    return cs.some(function (a) { return ts.some(function (b) { return ys.some(function (d) { return !blocked(a, b, d); }); }); });
  }
  function refreshOpts(changed) {
    var msg = '';
    [['cor', M.cores, 'nome', 'a cor'], ['tam', M.tamanhos, 'nome', 'o tamanho'], ['ano', M.anos, 'ano', 'o ano']].forEach(function (g) {
      Array.prototype.forEach.call(view.querySelectorAll('input[name="ml-' + g[0] + '"]'), function (inp) {
        var it = g[1][Number(inp.value)], ok = it.disp && optOk(g[0], it[g[2]]);
        inp.disabled = !ok; var lab = inp.closest('label'); lab.title = !it.disp ? 'Indisponível' : !ok ? 'Não disponível com a escolha atual' : '';
        var sr = lab.querySelector('.sr'); if (sr) sr.textContent = !it.disp ? ' (indisponível)' : !ok ? ' (não disponível com a escolha atual)' : '';
        if (!ok && inp.checked) { inp.checked = false; sel[g[0]] = ''; if (g[0] !== changed) msg = 'A combinação mudou: escolha ' + g[3] + ' de novo.'; }
      });
    });
    var box = $('#mlOptMsg'); if (box) { box.textContent = msg; box.hidden = !msg; }
  }
  function group(kind, legend, list, field, sw) {
    if (!list.length) return null;
    var fs = el('fieldset', 'opt'), wrap = el('div', sw ? 'sw' : 'chips'); fs.appendChild(el('legend', null, legend));
    list.forEach(function (it, i) {
      var lab = el('label'), inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'ml-' + kind; inp.value = String(i);
      if (norm(sel[kind]) === norm(it[field])) inp.checked = true;
      lab.appendChild(inp);
      if (sw) { var ball = el('span', 'ball'); ball.style.background = it.hex || '#ddd'; lab.appendChild(ball); lab.appendChild(el('span', null, it.nome)); }
      else { var sp = el('span', null, it[field]); if (it.medida) sp.appendChild(el('small', null, ' · ' + it.medida)); lab.appendChild(sp); }
      lab.appendChild(el('span', 'sr', ''));
      inp.addEventListener('change', function () { sel[kind] = it[field]; refreshOpts(kind); if (kind === 'cor') { setGallery(); } hidePick(); });
      wrap.appendChild(lab);
    });
    fs.appendChild(wrap); return fs;
  }
  function setGallery() {
    var c = sel.cor && M.cores.filter(function (x) { return norm(x.nome) === norm(sel.cor); })[0];
    galList = (c && c.imgs.length ? c.imgs : []).concat(M.galeria);
    if (!galList.length) { var w = M.cores.filter(function (x) { return x.imgs.length; })[0]; galList = w ? w.imgs : M.paginas.slice(0, 6); }
    galI = 0; drawGallery();
  }
  function drawGallery() {
    var main = $('#mlGalMain'), th = $('#mlGalThumbs'); main.textContent = ''; th.textContent = '';
    if (!galList.length) { main.appendChild(el('span', null, 'Prévia em preparação')); main.disabled = true; return; }
    main.disabled = false;
    var im = document.createElement('img'); im.src = galList[galI].src; im.alt = 'Prévia ' + (galI + 1) + ' de ' + galList.length + ' do miolo ' + M.nome + (sel.cor ? ', cor ' + sel.cor : ''); main.appendChild(im);
    main.appendChild(el('span', 'hint', 'Toque para ampliar'));
    if (galList.length > 1) galList.forEach(function (p, i) {
      var b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(i === galI)); b.setAttribute('aria-label', 'Prévia ' + (i + 1) + ' de ' + galList.length);
      var t = document.createElement('img'); t.src = p.thumb; t.alt = ''; t.loading = 'lazy'; b.appendChild(t);
      b.addEventListener('click', function () { galI = i; drawGallery(); }); th.appendChild(b);
    });
  }
  function renderModel(st) {
    M = D.modelos.filter(function (m) { return m.codigo === st.m; })[0];
    var back = listState(st), cat = M && catById[M.cat];
    crumb([{ text: 'Escolha seu miolo', st: only(st, ['produto']) }].concat(cat ? [{ text: cat.nome, st: Object.assign({}, back, { cat: cat.slug }) }] : []).concat([{ text: M ? M.nome : 'Modelo' }]));
    var row = el('div', 'ml-backrow'); row.appendChild(link(back, '← Voltar aos modelos')); row.appendChild(link(only(st, ['produto']), 'Início do catálogo')); view.appendChild(row);
    if (!M) { view.appendChild(emptyBox('Modelo não encontrado', 'Este miolo não está mais no catálogo ou o código mudou. Veja os outros modelos.', [link(back, 'Ver os modelos', 'btn primary')])); return; }
    document.title = M.nome + ' (' + M.codigo + ') | Escolha seu miolo | ESRO';
    // Pré-seleção: a escolha guardada deste modelo, os filtros da lista ou a única opção disponível.
    var saved = readSel(); sel = {};
    if (saved && saved.codigo === M.codigo) sel = { cor: saved.cor, tam: saved.tamanho, ano: saved.ano };
    else sel = { cor: st.cor, tam: st.tam, ano: st.ano };
    [['cor', M.cores, 'nome'], ['tam', M.tamanhos, 'nome'], ['ano', M.anos, 'ano']].forEach(function (g) {
      if (sel[g[0]] && !availOf(g[1], sel[g[0]], g[2])) sel[g[0]] = '';
      var av = g[1].filter(function (x) { return x.disp; }); if (!sel[g[0]] && av.length === 1) sel[g[0]] = av[0][g[2]];
    });
    var wrap = el('div', 'ml-model'), left = el('div'), right = el('div', 'ml-info');
    var main = el('button', 'ml-gal-main'); main.type = 'button'; main.id = 'mlGalMain'; main.setAttribute('aria-label', 'Ampliar a prévia');
    main.addEventListener('click', function () { if (galList.length) vOpen(galList, galI, M.nome + ' · prévia', main); });
    left.appendChild(main); var th = el('div', 'ml-gal-thumbs'); th.id = 'mlGalThumbs'; left.appendChild(th);
    right.appendChild(el('span', 'ml-code', 'Código ' + M.codigo));
    right.appendChild(el('h1', null, M.nome));
    if (cat) right.appendChild(el('span', 'eyebrow', cat.nome));
    if (!M.disponivel) right.appendChild(el('p', 'ml-off', M.aviso || 'Indisponível no momento.'));
    if (M.desc) right.appendChild(el('p', 'ml-desc', M.desc));
    var kind = el('p', 'ml-kind'); kind.appendChild(el('b', null, 'Produto físico personalizado'));
    kind.appendChild(document.createTextNode('A ESRO imprime e encaderna este miolo na sua agenda, planner ou caderno. Não é um arquivo digital para baixar.')); right.appendChild(kind);
    var form = el('div');
    var g1 = group('cor', 'Cor', M.cores, 'nome', true); if (g1) { form.appendChild(g1); g1.appendChild(el('p', 'ml-small', 'As cores podem variar conforme a tela e a impressão.')); }
    var g2 = group('tam', 'Tamanho', M.tamanhos, 'nome'); if (g2) form.appendChild(g2);
    var g3 = group('ano', 'Ano', M.anos, 'ano'); if (g3) form.appendChild(g3);
    var om = el('p', 'msg bad ml-msg'); om.id = 'mlOptMsg'; om.setAttribute('role', 'status'); om.hidden = true; form.appendChild(om);
    right.appendChild(form);
    if (M.formatos.length) { right.appendChild(el('p', 'ml-h', 'Formatos')); var f = el('div', 'ml-facts'); f.style.marginTop = '0'; M.formatos.forEach(function (x) { f.appendChild(el('span', null, x)); }); right.appendChild(f); }
    if (M.secoes.length) { right.appendChild(el('p', 'ml-h', 'O que tem dentro')); var ul = el('ul', 'ml-secs'); M.secoes.forEach(function (x) { ul.appendChild(el('li', null, x)); }); right.appendChild(ul); }
    var act = el('div', 'ml-actions');
    if (M.paginas.length) { var ver = el('button', 'btn secondary', 'Ver miolo completo (' + M.paginas.length + (M.paginas.length === 1 ? ' página)' : ' páginas)')); ver.type = 'button'; ver.addEventListener('click', function () { vOpen(M.paginas, 0, M.nome + ' · miolo completo', ver); }); act.appendChild(ver); }
    var pick = el('button', 'btn primary', 'Escolher este miolo'); pick.type = 'button'; pick.disabled = !M.disponivel; if (!M.disponivel) pick.title = 'Indisponível no momento';
    pick.addEventListener('click', choose); act.appendChild(pick);
    right.appendChild(act);
    if (!M.paginas.length) {
      var np = el('p', 'ml-small'); np.textContent = 'A prévia completa deste miolo ainda não está disponível. ';
      if (M.demo) { var pdf = el('a', null, 'Abrir o PDF de demonstração'); pdf.href = M.demo; pdf.target = '_blank'; pdf.rel = 'noopener'; np.appendChild(pdf); np.appendChild(document.createTextNode(' (abre em outra aba).')); }
      else np.appendChild(document.createTextNode('Peça pelo WhatsApp que a ESRO mostra as páginas.'));
      right.appendChild(np);
    } else if (M.demo) { var p2 = el('p', 'ml-small'); var a2 = el('a', null, 'Abrir o PDF de demonstração'); a2.href = M.demo; a2.target = '_blank'; a2.rel = 'noopener'; p2.appendChild(a2); right.appendChild(p2); }
    var pickBox = el('section', 'ml-pick'); pickBox.id = 'mlPick'; pickBox.tabIndex = -1; pickBox.hidden = true; pickBox.setAttribute('aria-labelledby', 'mlPickT'); right.appendChild(pickBox);
    wrap.appendChild(left); wrap.appendChild(right); view.appendChild(wrap);
    refreshOpts(''); setGallery();
  }
  function hidePick() { var b = $('#mlPick'); if (b) b.hidden = true; }
  function readSel() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' && s.codigo ? s : null; } catch (_) { return null; } }
  function choose() {
    var om = $('#mlOptMsg'), miss = M.cores.length && !sel.cor ? 'a cor' : M.tamanhos.length && !sel.tam ? 'o tamanho' : M.anos.length && !sel.ano ? 'o ano' : '';
    if (miss) { om.textContent = 'Escolha ' + miss + ' antes de continuar.'; om.hidden = false; om.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    om.hidden = true;
    var pic = firstPic(M, sel.cor), parts = [sel.cor, sel.tam, sel.ano].filter(Boolean);
    var s = { codigo: M.codigo, nome: M.nome, cor: sel.cor || '', tamanho: sel.tam || '', ano: sel.ano || '', rotulo: [M.codigo + ' ' + M.nome].concat(parts).join(' · '), thumb: pic ? pic.thumb : '', produtos: M.produtos.map(function (p) { return p.id; }), at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { }
    try { fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ p: '/miolos', e: 'miolo' }), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { }
    var box = $('#mlPick'); box.textContent = ''; box.hidden = false;
    box.appendChild(el('h2', null, 'Miolo escolhido')); box.firstChild.id = 'mlPickT';
    var dl = el('dl'); [['Modelo', M.codigo + ' · ' + M.nome], ['Cor', s.cor], ['Tamanho', s.tamanho], ['Ano', s.ano]].forEach(function (r) { if (!r[1]) return; dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); }); box.appendChild(dl);
    var acts = el('div', 'actions'), prods = M.produtos.slice();
    if (ctx) prods.sort(function (a, b) { return (b.id === ctx.id) - (a.id === ctx.id); });
    prods.forEach(function (p, i) { var a = el('a', 'btn ' + (i === 0 ? 'primary' : 'secondary'), (p.modo === 'compra' ? 'Continuar com ' : 'Pedir orçamento: ') + p.nome); a.appendChild(el('span', null, '→')); a.href = '/produto/' + encodeURIComponent(p.slug) + '?miolo=' + encodeURIComponent(M.codigo); acts.appendChild(a); });
    var prodName = ctx ? ctx.nome : prods.length === 1 ? prods[0].nome : 'agenda, planner ou caderno personalizado';
    var msg = 'Olá, ESRO! Quero um orçamento.\nProduto: ' + prodName + '\nMiolo: ' + M.codigo + ' — ' + M.nome + (s.cor ? '\nCor: ' + s.cor : '') + (s.tamanho ? '\nTamanho: ' + s.tamanho : '') + (s.ano ? '\nAno: ' + s.ano : '');
    acts.appendChild(waLink(msg, prods.length ? 'Prefiro pedir pelo WhatsApp' : 'Solicitar orçamento pelo WhatsApp', 'btn ' + (prods.length ? 'secondary' : 'primary')));
    box.appendChild(acts);
    box.appendChild(el('p', null, (prods.length ? 'Na página do produto, o miolo escolhido já aparece no pedido. ' : '') + 'O WhatsApp abre com a mensagem pronta para você revisar e enviar; nada é enviado sozinho.'));
    box.focus({ preventScroll: true }); box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- Visualizador (página ou miniatura ampliada) ---------- */
  var mv = $('#mv'), V = { list: [], i: 0, from: null, pushed: false };
  function vShow(i) {
    V.i = Math.max(0, Math.min(V.list.length - 1, i));
    var img = $('#mvImg'), p = V.list[V.i]; $('#mvWait').hidden = false; img.style.visibility = 'hidden';
    img.onload = function () { $('#mvWait').hidden = true; img.style.visibility = ''; };
    img.onerror = function () { $('#mvWait').textContent = 'Não foi possível carregar esta página.'; };
    $('#mvWait').textContent = 'Carregando a página…';
    img.src = p.src; img.alt = 'Página ' + (V.i + 1) + ' de ' + V.list.length;
    $('#mvCount').textContent = 'Página ' + (V.i + 1) + ' de ' + V.list.length;
    $('#mvPrev').disabled = V.i === 0; $('#mvNext').disabled = V.i === V.list.length - 1;
    Array.prototype.forEach.call($('#mvThumbs').children, function (b, j) { if (j === V.i) { b.setAttribute('aria-current', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'center' }); } else b.removeAttribute('aria-current'); });
    if (V.list[V.i + 1]) { var pre = new Image(); pre.src = V.list[V.i + 1].src; }   // a próxima página já fica pronta
    $('#mvScroll').scrollTop = 0;
  }
  function vZoom(on) { mv.classList.toggle('zoom', on); $('#mvZoom').setAttribute('aria-pressed', String(on)); $('#mvZoom').setAttribute('aria-label', on ? 'Reduzir a página' : 'Ampliar a página'); $('#mvZoom').textContent = on ? '−' : '＋'; }
  function vOpen(list, i, title, from) {
    V.list = list; V.from = from || null; $('#mvTitle').textContent = title;
    var th = $('#mvThumbs'); th.textContent = '';
    list.forEach(function (p, j) { var b = el('button'); b.type = 'button'; b.setAttribute('role', 'listitem'); b.setAttribute('aria-label', 'Ir para a página ' + (j + 1));
      var t = document.createElement('img'); t.src = p.thumb; t.alt = ''; t.loading = 'lazy'; t.decoding = 'async'; b.appendChild(t); b.appendChild(el('span', null, String(j + 1)));
      b.addEventListener('click', function () { vShow(j); }); th.appendChild(b); });
    $('#mvBack').textContent = V.from && V.from.closest && V.from.closest('.ml-gal-main') ? '← Voltar' : '← Voltar ao modelo';
    mv.hidden = false; document.body.classList.add('mv-open'); vZoom(false); vShow(i); $('#mvNext').disabled ? $('#mvClose').focus() : $('#mvNext').focus();
    if (!V.pushed) { history.pushState({ mv: 1 }, '', location.href); V.pushed = true; }
  }
  function vClose(fromHistory) {
    if (mv.hidden) return;
    mv.hidden = true; document.body.classList.remove('mv-open'); $('#mvImg').removeAttribute('src');
    if (V.pushed && !fromHistory) { V.pushed = false; V.ignorePop = true; history.back(); } else V.pushed = false;
    if (V.from && document.contains(V.from)) V.from.focus();
  }
  $('#mvPrev').addEventListener('click', function () { vShow(V.i - 1); });
  $('#mvNext').addEventListener('click', function () { vShow(V.i + 1); });
  $('#mvClose').addEventListener('click', function () { vClose(); });
  $('#mvBack').addEventListener('click', function () { vClose(); });
  $('#mvZoom').addEventListener('click', function () { vZoom(!mv.classList.contains('zoom')); });
  $('#mvImg').addEventListener('click', function () { vZoom(!mv.classList.contains('zoom')); });
  mv.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); vClose(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); vShow(V.i - 1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); vShow(V.i + 1); }
    else if (ev.key === 'Tab') {   // o foco fica dentro do visualizador
      var f = Array.prototype.filter.call(mv.querySelectorAll('button'), function (b) { return !b.disabled && b.offsetParent !== null; });
      var firstB = f[0], lastB = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === firstB) { ev.preventDefault(); lastB.focus(); } else if (!ev.shiftKey && document.activeElement === lastB) { ev.preventDefault(); firstB.focus(); }
    }
  });
  var tx = null;
  $('#mvScroll').addEventListener('touchstart', function (ev) { tx = ev.touches.length === 1 && !mv.classList.contains('zoom') ? ev.touches[0].clientX : null; }, { passive: true });
  $('#mvScroll').addEventListener('touchend', function (ev) { if (tx === null) return; var dx = ev.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) vShow(V.i + (dx < 0 ? 1 : -1)); }, { passive: true });

  /* ---------- Roteamento ---------- */
  function route() {
    var st = state(); view.textContent = '';
    ctx = null;
    if (st.produto) D.modelos.forEach(function (m) { m.produtos.forEach(function (p) { if (p.slug === st.produto) ctx = p; }); });
    var forBox = $('#mlFor'); forBox.textContent = '';
    if (ctx) { forBox.appendChild(el('span', null, 'Escolhendo o miolo para: ' + ctx.nome)); var all = Object.assign({}, st, { produto: '' }); forBox.appendChild(link(all, 'Ver todos os modelos')); var bk = el('a', null, 'Voltar ao produto'); bk.href = '/produto/' + encodeURIComponent(ctx.slug); forBox.appendChild(bk); }
    forBox.hidden = !ctx;
    syncTools(st);
    document.title = 'Escolha seu miolo | ESRO Papelaria';
    var mode = st.m ? 'model' : st.cat || st.q || st.ano || st.cor || st.tam ? 'list' : 'cats';
    $('.ml-hero h1').hidden = $('.ml-lead').hidden = $('.ml-hero .eyebrow').hidden = mode !== 'cats';   // título grande só no início do catálogo
    tools.hidden = mode === 'model';
    if (mode === 'model') renderModel(st); else if (mode === 'list') renderList(st); else renderCats(st);
  }
  window.addEventListener('popstate', function () {
    if (V.ignorePop) { V.ignorePop = false; return; }   // o próprio visualizador voltou o histórico ao fechar
    if (!mv.hidden && !(history.state && history.state.mv)) { vClose(true); return; }
    route();
  });

  fetch('/api/miolos', { headers: { 'X-ESRO': '1' } }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
    D = d; $('#mlLoading').hidden = true;
    D.categorias.forEach(function (c) { catById[c.id] = c; catBySlug[c.slug] = c; });
    if (!D.categorias.length) {
      crumb([{ text: 'Escolha seu miolo' }]);
      var prod = el('a', 'btn secondary', 'Ver os produtos'); prod.href = '/#kits';
      view.appendChild(emptyBox('Os modelos de miolo estão sendo preparados', 'Em breve você vai poder ver aqui as páginas internas das agendas, dos planners e dos cadernos. Enquanto isso, a ESRO mostra os modelos pelo WhatsApp.', [waLink('Olá, ESRO! Quero ver os modelos de miolo para agenda, planner ou caderno.', 'Ver modelos pelo WhatsApp'), prod]));
      return;
    }
    tools.hidden = false; route();
  }).catch(function () { $('#mlLoading').textContent = 'Não foi possível carregar os modelos. Confira a internet e atualize a página.'; });
})();
