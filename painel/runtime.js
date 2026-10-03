/* ESRO Painel — ponte entre a tela do painel e o servidor da ESRO.
   Fornece ao app.js as mesmas funções que ele usava dentro do claude.ai (banco, arquivos, downloads, mensagens),
   só que falando com /painel/api neste mesmo endereço, depois do login com a senha do painel. */
(function () {
  'use strict';
  window.ESRO_STANDALONE = true;
  var API = '/painel/api', CONN = 'ESRO Conexões';
  var CODES = { 400: 'unavailable', 401: 'not_granted', 403: 'not_granted', 404: 'unavailable', 413: 'too_large', 415: 'unsupported_type', 422: 'tool_error', 429: 'resource_exhausted', 503: 'disabled', 507: 'quota_exceeded' };
  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }

  var loginWait = null;
  async function http(method, path, body, opt) {
    opt = opt || {}; var headers = Object.assign({ 'X-ESRO': '1' }, opt.headers || {}), payload;
    if (opt.raw) payload = body; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    var r;
    try { r = await fetch(API + path, { method: method, headers: headers, body: payload, credentials: 'same-origin', cache: 'no-store' }); }
    catch (_) { throw fail('unavailable'); }
    if (r.status === 401 && !opt.noLogin) { askLogin(); throw fail('unavailable', 'Sessão encerrada. Entre de novo.'); }
    if (r.ok) return r.status === 204 ? null : r.json();
    var j = null; try { j = await r.json(); } catch (_) { }
    throw fail(CODES[r.status] || 'unavailable', j && j.erro);
  }

  /* ---------- Tela de login ---------- */
  function el(tag, attrs, text) { var n = document.createElement(tag); for (var k in (attrs || {})) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }
  function askLogin() {
    if (loginWait) return loginWait;
    loginWait = new Promise(function (resolve) {
      var wrap = el('div', { id: 'esroLogin', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'esroLoginT' });
      wrap.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:16px;background:var(--bg,#F9F6F0)';
      var form = el('form', { autocomplete: 'on' });
      form.style.cssText = 'width:min(380px,100%);background:var(--card,#fff);border:1px solid var(--line,#EFE7DE);border-radius:18px;padding:26px;display:flex;flex-direction:column;gap:14px;box-shadow:0 10px 40px rgba(62,49,43,.12)';
      var logo = document.querySelector('.brand .mark img');
      if (logo) { var im = el('img', { src: logo.src, alt: '' }); im.style.cssText = 'width:72px;height:72px;border-radius:50%;align-self:center'; form.appendChild(im); }
      var h = el('h2', { id: 'esroLoginT' }, 'Painel ESRO'); h.style.cssText = 'margin:0;text-align:center;font-size:22px'; form.appendChild(h);
      var p = el('p', null, 'Entre com a senha do painel.'); p.style.cssText = 'margin:0;text-align:center;color:var(--text2,#7C716A)'; form.appendChild(p);
      var user = el('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'esro', hidden: '' }); form.appendChild(user);
      var lab = el('label', null, 'Senha'); lab.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:12.5px;color:var(--text2,#7C716A)';
      var inp = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: '', class: 'inp' }); inp.style.cssText = 'padding:11px 12px;border:1px solid var(--line,#EFE7DE);border-radius:10px;font:inherit;background:var(--card,#fff);color:inherit';
      lab.appendChild(inp); form.appendChild(lab);
      var msg = el('div', { role: 'alert' }); msg.style.cssText = 'color:var(--crit,#B4493A);font-size:13px;min-height:18px'; form.appendChild(msg);
      var btn = el('button', { type: 'submit', class: 'btn primary' }, 'Entrar'); btn.style.cssText = 'justify-content:center;padding:11px 14px;border-radius:11px;border:0;background:var(--primary,#9C5237);color:#fff;font-weight:700;font:inherit;font-weight:700;cursor:pointer'; form.appendChild(btn);
      var back = el('a', { href: '/' }, 'Voltar ao site'); back.style.cssText = 'text-align:center;color:var(--text2,#7C716A);font-size:13px'; form.appendChild(back);
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault(); ev.stopPropagation(); msg.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
        try { await http('POST', '/login', { senha: inp.value }, { noLogin: true }); wrap.remove(); loginWait = null; resolve(); }
        catch (e) {
          msg.textContent = e.code === 'not_granted' ? 'Senha incorreta.' : e.code === 'resource_exhausted' ? 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' : e.code === 'disabled' ? (e.message || 'Painel desativado.') : 'Não foi possível falar com o servidor. Tente de novo.';
          btn.disabled = false; btn.textContent = 'Entrar'; inp.select();
        }
      });
      wrap.appendChild(form); document.body.appendChild(wrap); inp.focus();
    });
    return loginWait;
  }

  /* ---------- Banco de documentos (cópia local + sincronização) ---------- */
  var cache = new Map(), subs = new Set(), seq = 0, syncing = null;
  function colMap(c) { var m = cache.get(c); if (!m) { m = new Map(); cache.set(c, m); } return m; }
  function apply(col, id, data, del) {
    var m = colMap(col), cur = m.get(id);
    if (del) { if (cur === undefined) return false; m.delete(id); return true; }
    var json = JSON.stringify(data); if (cur === json) return false; m.set(id, json); return true;
  }
  function docSnap(col, id) { var j = colMap(col).get(id); return { id: id, exists: j !== undefined, data: function () { return j === undefined ? undefined : JSON.parse(j); } }; }
  function runQuery(q) {
    var rows = Array.from(colMap(q.col).keys()).sort().map(function (id) { return docSnap(q.col, id); });
    q.filters.forEach(function (f) { rows = rows.filter(function (d) { var v = d.data()[f[0]], x = f[2]; switch (f[1]) { case '==': return v === x; case '!=': return v !== x; case '<': return v < x; case '<=': return v <= x; case '>': return v > x; case '>=': return v >= x; case 'in': return x.indexOf(v) >= 0; case 'not-in': return x.indexOf(v) < 0; case 'array-contains': return Array.isArray(v) && v.indexOf(x) >= 0; default: return true; } }); });
    if (q.order) { var f = q.order[0], s = q.order[1] === 'desc' ? -1 : 1; rows.sort(function (a, b) { var x = a.data()[f], y = b.data()[f]; if (x === undefined) return y === undefined ? 0 : 1; if (y === undefined) return -1; return (x < y ? -1 : x > y ? 1 : 0) * s; }); }
    if (q.lim) rows = rows.slice(0, q.lim);
    return { docs: rows, size: rows.length, empty: !rows.length, docChanges: function () { return []; }, metadata: {} };
  }
  function deliver(s) { try { s.next(s.id ? docSnap(s.q.col, s.id) : runQuery(s.q)); } catch (e) { console.error(e); } }
  function notify(cols) { subs.forEach(function (s) { if (cols.has(s.q.col)) deliver(s); }); }
  async function sync() {
    if (syncing) return syncing;
    syncing = (async function () {
      try {
        var r = await http('GET', '/sync?after=' + Math.max(0, seq - 50)), touched = new Set();
        r.docs.forEach(function (d) { if (apply(d.col, d.id, d.data, d.del)) touched.add(d.col); });
        if (r.seq > seq) seq = r.seq; if (touched.size) notify(touched);
      } finally { syncing = null; }
    })();
    return syncing;
  }
  function newId() { var a = new Uint8Array(15); crypto.getRandomValues(a); var s = ''; a.forEach(function (b) { s += 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]; }); return s; }
  function docRef(col, id) {
    var path = '/db/' + encodeURIComponent(col) + '/' + encodeURIComponent(id);
    return { id: id, path: col + '/' + id,
      get: async function () { return docSnap(col, id); },
      set: async function (data) { var clean = JSON.parse(JSON.stringify(data)); await http('PUT', path, clean); if (apply(col, id, clean)) notify(new Set([col])); },
      update: async function (patch) { var r = await http('PATCH', path, JSON.parse(JSON.stringify(patch))); if (apply(col, id, r.data)) notify(new Set([col])); },
      delete: async function () { await http('DELETE', path); if (apply(col, id, null, true)) notify(new Set([col])); },
      onSnapshot: function (next) { var s = { q: { col: col, filters: [] }, id: id, next: next }; subs.add(s); setTimeout(function () { deliver(s); }); return function () { subs.delete(s); }; } };
  }
  function query(q) {
    var w = function (extra) { return query(Object.assign({}, q, extra)); };
    return { where: function (f, op, v) { return w({ filters: q.filters.concat([[f, op, v]]) }); }, orderBy: function (f, dir) { return w({ order: [f, dir || 'asc'] }); }, limit: function (n) { return w({ lim: n }); },
      get: async function () { return runQuery(q); },
      onSnapshot: function (next) { var s = { q: q, next: next }; subs.add(s); setTimeout(function () { deliver(s); }); return function () { subs.delete(s); }; } };
  }
  var db = {
    doc: function (p) { var i = p.indexOf('/'); return docRef(p.slice(0, i), p.slice(i + 1)); },
    collection: function (col) { var q = query({ col: col, filters: [] }); q.path = col; q.doc = function (id) { return docRef(col, id || newId()); }; q.add = async function (data) { var r = docRef(col, newId()); await r.set(data); return r; }; return q; }
  };

  /* ---------- Arquivos, downloads, mensagens ---------- */
  var assets = {
    upload: async function (file, opt) { var type = (opt && opt.type) || file.type || 'application/octet-stream'; return http('POST', '/assets?name=' + encodeURIComponent(file.name || 'arquivo'), file, { raw: true, headers: { 'Content-Type': type } }); },
    list: function () { return http('GET', '/assets'); },
    delete: function (id) { return http('DELETE', '/assets/' + encodeURIComponent(id)); }
  };
  var downloads = { save: async function (o) {
    var blob = o.data instanceof Blob ? o.data : new Blob([o.data]); var url = URL.createObjectURL(blob), a = el('a', { href: url, download: String(o.filename || 'arquivo') });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  } };
  var watchers = new Set();
  var mcp = {
    listTools: async function () { return { servers: [{ server: CONN, authStatus: 'connected', tools: [] }] }; },
    describeTool: async function () { return null; },
    callTool: async function (_server, tool, input) {
      try { return { payload: await http('POST', '/tool/' + encodeURIComponent(tool), input || {}), cache: { storedAt: Date.now() } }; }
      catch (e) { if (e.code === 'unavailable') e.code = 'server_unavailable'; throw e; }
    },
    watchTool: function (server, tool, input, handler, opts) {
      var w = { tool: tool, stop: false }; w.run = async function () { try { var result = await mcp.callTool(server, tool, input); if (!w.stop) handler({ type: 'data', result: result }); } catch (error) { if (!w.stop) handler({ type: 'error', error: error }); } };
      watchers.add(w); w.run();
      var iv = opts && opts.refetchInterval ? setInterval(function () { if (document.visibilityState === 'visible') w.run(); }, opts.refetchInterval) : null;
      return function () { w.stop = true; watchers.delete(w); if (iv) clearInterval(iv); };
    },
    invalidate: async function (_server, tool) { watchers.forEach(function (w) { if (!tool || w.tool === tool) w.run(); }); }
  };
  var user = { can: async function () { return true; }, canEdit: async function () { return true; }, isOwner: async function () { return true; }, id: async function () { return 'admin'; } };
  var caps = { db: db, user: user, assets: assets, downloads: downloads, mcp: mcp };

  /* ---------- Início: confere a sessão, pede login se preciso, carrega os dados ---------- */
  var boot = (async function () {
    for (;;) {
      try { await http('GET', '/me', undefined, { noLogin: true }); break; }
      catch (e) { if (e.code === 'not_granted' || e.code === 'disabled') await askLogin(); else await new Promise(function (r) { setTimeout(r, 2500); }); }
    }
    for (;;) { try { await sync(); break; } catch (_) { if (loginWait) await loginWait; else await new Promise(function (r) { setTimeout(r, 2500); }); } }
    setInterval(function () { if (document.visibilityState === 'visible' && !loginWait) sync().catch(function () { }); }, 5000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !loginWait) sync().catch(function () { }); });
    var prof = document.querySelector('.profile');
    if (prof) { var out = el('button', { type: 'button', class: 'btn sm', id: 'esroLogout', title: 'Sair do painel' }, 'Sair'); out.style.marginLeft = '4px';
      out.addEventListener('click', async function (ev) { ev.stopPropagation(); try { await http('POST', '/logout', {}, { noLogin: true }); } catch (_) { } location.reload(); }); prof.appendChild(out); }
  })();
  // Chamadas diretas do painel ao servidor (ex.: link de senha nova para a conta de um cliente do site).
  window.ESRO_API = function (method, path, body) { return http(method, path, body); };
  window.claude = { use: function (name) { return boot.then(function () { return caps[name] || null; }); } };
})();
