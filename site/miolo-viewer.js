/* ESRO — visualizador de páginas do miolo (usado na página do produto).
   window.ESROViewer.open(lista, indice, titulo, elementoDeOrigem): lista = [{ src, thumb }].
   Carrega uma página por vez (e a próxima em segundo plano); miniaturas sob demanda; teclado, deslizar e zoom. */
(function () {
  'use strict';
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var mv = null, V = { list: [], i: 0, from: null, pushed: false, ignorePop: false }, q = {};
  function build() {
    mv = el('div', 'mv'); mv.id = 'mv'; mv.hidden = true; mv.setAttribute('role', 'dialog'); mv.setAttribute('aria-modal', 'true'); mv.setAttribute('aria-labelledby', 'mvTitle');
    var head = el('div', 'mv-head'), back = el('button', 'btn secondary small', '← Voltar ao produto'); back.type = 'button';
    var title = el('div', 'mv-title'), tb = el('b'); tb.id = 'mvTitle'; var cnt = el('span'); cnt.setAttribute('aria-live', 'polite'); title.appendChild(tb); title.appendChild(cnt);
    var tools = el('div', 'mv-tools'), zoom = el('button', 'mv-icon', '＋'), close = el('button', 'mv-icon', '✕'); zoom.type = close.type = 'button';
    zoom.setAttribute('aria-pressed', 'false'); zoom.setAttribute('aria-label', 'Ampliar a página'); close.setAttribute('aria-label', 'Fechar'); tools.appendChild(zoom); tools.appendChild(close);
    head.appendChild(back); head.appendChild(title); head.appendChild(tools);
    var stage = el('div', 'mv-stage'), prev = el('button', 'mv-nav prev', '‹'), next = el('button', 'mv-nav next', '›'); prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Página anterior'); next.setAttribute('aria-label', 'Próxima página');
    var scroll = el('div', 'mv-scroll'), img = document.createElement('img'); img.decoding = 'async'; img.alt = ''; var wait = el('p', 'mv-wait', 'Carregando a página…');
    scroll.appendChild(img); scroll.appendChild(wait); stage.appendChild(prev); stage.appendChild(scroll); stage.appendChild(next);
    var thumbs = el('div', 'mv-thumbs'); thumbs.setAttribute('role', 'list'); thumbs.setAttribute('aria-label', 'Miniaturas das páginas');
    mv.appendChild(head); mv.appendChild(stage); mv.appendChild(thumbs); document.body.appendChild(mv);
    q = { back: back, title: tb, count: cnt, zoom: zoom, close: close, prev: prev, next: next, scroll: scroll, img: img, wait: wait, thumbs: thumbs };
    prev.addEventListener('click', function () { show(V.i - 1); });
    next.addEventListener('click', function () { show(V.i + 1); });
    close.addEventListener('click', function () { hide(); });
    back.addEventListener('click', function () { hide(); });
    zoom.addEventListener('click', function () { setZoom(!mv.classList.contains('zoom')); });
    img.addEventListener('click', function () { setZoom(!mv.classList.contains('zoom')); });
    mv.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); hide(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(V.i - 1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); show(V.i + 1); }
      else if (ev.key === 'Tab') {
        var f = Array.prototype.filter.call(mv.querySelectorAll('button'), function (b) { return !b.disabled && b.offsetParent !== null; });
        if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
      }
    });
    var tx = null;
    scroll.addEventListener('touchstart', function (ev) { tx = ev.touches.length === 1 && !mv.classList.contains('zoom') ? ev.touches[0].clientX : null; }, { passive: true });
    scroll.addEventListener('touchend', function (ev) { if (tx === null) return; var dx = ev.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) show(V.i + (dx < 0 ? 1 : -1)); }, { passive: true });
    window.addEventListener('popstate', function () {
      if (V.ignorePop) { V.ignorePop = false; return; }
      if (!mv.hidden && !(history.state && history.state.mv)) hide(true);
    });
  }
  function setZoom(on) { mv.classList.toggle('zoom', on); q.zoom.setAttribute('aria-pressed', String(on)); q.zoom.setAttribute('aria-label', on ? 'Reduzir a página' : 'Ampliar a página'); q.zoom.textContent = on ? '−' : '＋'; }
  function show(i) {
    V.i = Math.max(0, Math.min(V.list.length - 1, i));
    var p = V.list[V.i]; q.wait.hidden = false; q.wait.textContent = 'Carregando a página…'; q.img.style.visibility = 'hidden';
    q.img.onload = function () { q.wait.hidden = true; q.img.style.visibility = ''; };
    q.img.onerror = function () { q.wait.textContent = 'Não foi possível carregar esta página.'; };
    q.img.src = p.src; q.img.alt = 'Página ' + (V.i + 1) + ' de ' + V.list.length;
    q.count.textContent = 'Página ' + (V.i + 1) + ' de ' + V.list.length;
    q.prev.disabled = V.i === 0; q.next.disabled = V.i === V.list.length - 1;
    Array.prototype.forEach.call(q.thumbs.children, function (b, j) { if (j === V.i) { b.setAttribute('aria-current', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'center' }); } else b.removeAttribute('aria-current'); });
    if (V.list[V.i + 1]) { var pre = new Image(); pre.src = V.list[V.i + 1].src; }
    q.scroll.scrollTop = 0;
  }
  function open(list, i, title, from) {
    if (!list || !list.length) return;
    if (!mv) build();
    V.list = list; V.from = from || null; q.title.textContent = title || '';
    q.thumbs.textContent = '';
    list.forEach(function (p, j) { var b = el('button'); b.type = 'button'; b.setAttribute('role', 'listitem'); b.setAttribute('aria-label', 'Ir para a página ' + (j + 1));
      var t = document.createElement('img'); t.src = p.thumb; t.alt = ''; t.loading = 'lazy'; t.decoding = 'async'; b.appendChild(t); b.appendChild(el('span', null, String(j + 1)));
      b.addEventListener('click', function () { show(j); }); q.thumbs.appendChild(b); });
    mv.hidden = false; document.body.classList.add('mv-open'); setZoom(false); show(i || 0);
    (q.next.disabled ? q.close : q.next).focus();
    if (!V.pushed) { history.pushState({ mv: 1 }, '', location.href); V.pushed = true; }
  }
  function hide(fromHistory) {
    if (!mv || mv.hidden) return;
    mv.hidden = true; document.body.classList.remove('mv-open'); q.img.removeAttribute('src');
    if (V.pushed && !fromHistory) { V.pushed = false; V.ignorePop = true; history.back(); } else V.pushed = false;
    if (V.from && document.contains(V.from)) V.from.focus();
  }
  window.ESROViewer = { open: open, close: function () { hide(); } };
})();
