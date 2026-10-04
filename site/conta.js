/* ESRO — conta do cliente: entrar, criar conta, minha conta.
   Fala com o servidor em /api/conta. A senha só viaja por HTTPS e nunca fica guardada no navegador. */
(function () {
  'use strict';
  var API = '/api/conta';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var page = document.body.getAttribute('data-page');

  /* ---------- Conversa com o servidor ---------- */
  var FALLBACK = { 401: 'Entre na sua conta.', 429: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', 503: 'Serviço indisponível no momento. Tente de novo em instantes.' };
  async function call(method, path, body) {
    var r, j = null;
    try {
      r = await fetch(API + path, { method: method, headers: body ? { 'X-ESRO': '1', 'Content-Type': 'application/json' } : { 'X-ESRO': '1' },
        body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' });
    } catch (_) { var off = new Error('Não foi possível falar com o servidor. Confira a internet e tente de novo.'); off.status = 0; throw off; }
    if (r.status !== 204) { try { j = await r.json(); } catch (_) { } }
    if (r.ok) return j || {};
    var e = new Error((j && j.erro) || FALLBACK[r.status] || 'Algo deu errado. Tente de novo em instantes.');
    e.status = r.status; e.campo = j && j.campo; throw e;
  }

  async function fetchForgot(email) {
    var r, j = null;
    try { r = await fetch('/api/conta/esqueci', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }), credentials: 'same-origin' }); }
    catch (_) { throw new Error('Não foi possível falar com o servidor. Confira a internet e tente de novo.'); }
    try { j = await r.json(); } catch (_) { }
    if (!r.ok) { var e = new Error((j && j.erro) || FALLBACK[r.status] || 'Não foi possível enviar o link agora.'); e.status = r.status; throw e; }
  }

  /* ---------- Campos ---------- */
  function maskPhone(v) {
    var d = String(v).replace(/\D/g, '');
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    var rest = d.slice(2), cut = rest.length > 8 ? 5 : 4;
    return '(' + d.slice(0, 2) + ') ' + (rest.length > cut ? rest.slice(0, cut) + '-' + rest.slice(cut) : rest);
  }
  $$('input[data-phone]').forEach(function (inp) {
    inp.addEventListener('input', function () { var atEnd = inp.selectionStart === inp.value.length; inp.value = maskPhone(inp.value); if (atEnd) inp.setSelectionRange(inp.value.length, inp.value.length); });
  });
  $$('button[data-peek]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var inp = document.getElementById(btn.getAttribute('data-peek')), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; btn.textContent = show ? 'Ocultar' : 'Mostrar'; btn.setAttribute('aria-pressed', String(show)); inp.focus();
    });
  });

  function setError(form, name, text) {
    var inp = form.elements[name]; if (!inp) return false;
    var box = document.getElementById(inp.id + '-err'); if (!box) return false;
    inp.setAttribute('aria-invalid', 'true'); box.textContent = text; box.hidden = false; inp.focus(); return true;
  }
  function clearErrors(form) {
    $$('[aria-invalid]', form).forEach(function (i) { i.removeAttribute('aria-invalid'); });
    $$('.err', form).forEach(function (b) { b.hidden = true; b.textContent = ''; });
    var m = $('.msg', form); if (m) { m.hidden = true; m.textContent = ''; }
  }
  function say(form, text, good) {
    var m = $('.msg', form); if (!m) return;
    m.textContent = text; m.classList.toggle('good', !!good); m.classList.toggle('bad', !good); m.hidden = false;
  }
  $$('form').forEach(function (form) {
    form.addEventListener('input', function (ev) {
      var t = ev.target; if (!t.id) return;
      if (t.hasAttribute('aria-invalid')) { t.removeAttribute('aria-invalid'); var b = document.getElementById(t.id + '-err'); if (b) { b.hidden = true; b.textContent = ''; } }
    });
  });

  // Confere o básico antes de enviar; quem decide de verdade é o servidor.
  var RULES = {
    nome: function (v) { return v.trim().length >= 2 ? '' : 'Escreva o seu nome.'; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Confira o e-mail: ele precisa ter o formato nome@exemplo.com.'; },
    telefone: function (v) { var n = v.replace(/\D/g, '').length; return n === 10 || n === 11 ? '' : 'Escreva o WhatsApp com DDD, por exemplo (11) 99999-0000.'; },
    senhaNova: function (v) { return v.length >= 8 ? '' : 'A senha precisa ter pelo menos 8 caracteres.'; },
    senha: function (v) { return v.length ? '' : 'Escreva a sua senha.'; }
  };
  function check(form, list) {   // list: [nomeDoCampo, regra]
    for (var i = 0; i < list.length; i++) { var msg = RULES[list[i][1]](form.elements[list[i][0]].value); if (msg) { setError(form, list[i][0], msg); return false; } }
    return true;
  }

  // Envia um formulário: trava o botão enquanto espera e mostra o erro no campo certo.
  function onSubmit(form, handler) {
    var btn = $('button[type=submit]', form), label = btn.textContent, busy = false;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault(); if (busy) return;
      clearErrors(form);
      busy = true; btn.disabled = true; btn.textContent = btn.getAttribute('data-busy') || label;
      try { await handler(); }
      catch (e) { if (!(e.campo && setError(form, e.campo, e.message))) say(form, e.message || 'Algo deu errado. Tente de novo em instantes.'); }
      finally { busy = false; btn.disabled = false; btn.textContent = label; }
    });
  }
  var stop = function () { var e = new Error(''); e.silent = true; return e; };
  function guard(form, handler) { return async function () { try { await handler(); } catch (e) { if (!e.silent) throw e; } }; }

  /* ---------- Entrar / criar conta ---------- */
  function initAuth() {
    var title = $('#authTitle'), tabs = $$('.tab'), formIn = $('#form-entrar'), formUp = $('#form-cadastro'), formNew = $('#form-nova');
    var TITLES = { entrar: 'Entre na sua conta', cadastro: 'Crie a sua conta' };
    var panels = { entrar: formIn, cadastro: formUp };
    function select(which, focusTab) {
      tabs.forEach(function (t) {
        var on = t.id === 'tab-' + which; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focusTab) t.focus();
      });
      Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== which; });
      title.textContent = TITLES[which]; document.title = (which === 'cadastro' ? 'Criar conta' : 'Entrar') + ' | ESRO';
      try { history.replaceState(null, '', which === 'cadastro' ? '#criar-conta' : location.pathname); } catch (_) { }
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t.id.slice(4)); });
      t.addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft' && ev.key !== 'Home' && ev.key !== 'End') return;
        ev.preventDefault();
        var next = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        select(tabs[next].id.slice(4), true);
      });
    });

    var forgotBtn = $('#forgotBtn'), forgotBox = $('#forgotBox');
    forgotBtn.addEventListener('click', function () { var open = forgotBox.hidden; forgotBox.hidden = !open; forgotBtn.setAttribute('aria-expanded', String(open)); });
    // Se a loja tem envio de e-mails ligado, o link de senha nova vai por e-mail; senão, é pedido pelo WhatsApp.
    var fMail = $('#forgotMail'), fWa = $('#forgotWa'), fSend = $('#forgotSend'), fSaid = $('#forgotSaid');
    fetch('/api/loja', { headers: { 'X-ESRO': '1' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.emailSenha && fMail) { fMail.hidden = false; fWa.hidden = true; } }).catch(function () { });
    if (fSend) fSend.addEventListener('click', async function () {
      var form = $('#form-entrar'), email = form.elements.email.value.trim(); clearErrors(form); fSaid.hidden = true;
      if (!/^\S+@\S+\.\S+$/.test(email)) { setError(form, 'email', 'Escreva aqui o e-mail da sua conta e peça o link de novo.'); return; }
      var label = fSend.textContent; fSend.disabled = true; fSend.textContent = fSend.getAttribute('data-busy');
      try { await fetchForgot(email); fSaid.textContent = 'Se existir uma conta com este e-mail, o link chega em alguns minutos. Olhe também a caixa de spam.'; }
      catch (e) { fSaid.textContent = e.message; if (e.status === 503) { fMail.hidden = true; fWa.hidden = false; } }
      finally { fSaid.hidden = false; fSend.disabled = false; fSend.textContent = label; }
    });

    onSubmit(formIn, guard(formIn, async function () {
      if (!check(formIn, [['email', 'email'], ['senha', 'senha']])) throw stop();
      await call('POST', '/entrar', { email: formIn.elements.email.value.trim(), senha: formIn.elements.senha.value });
      location.assign('/conta');
    }));
    onSubmit(formUp, guard(formUp, async function () {
      if (!check(formUp, [['nome', 'nome'], ['email', 'email'], ['telefone', 'telefone'], ['senha', 'senhaNova']])) throw stop();
      if (!formUp.elements.aceite.checked) { setError(formUp, 'aceite', 'Para criar a conta é preciso aceitar a Política de Privacidade.'); throw stop(); }
      await call('POST', '/cadastro', { nome: formUp.elements.nome.value, email: formUp.elements.email.value.trim(), telefone: formUp.elements.telefone.value,
        senha: formUp.elements.senha.value, aceite: true, site: formUp.elements.site.value });
      location.assign('/conta');
    }));

    // Link de senha nova (enviado pela ESRO): o código vem depois do "#", que o navegador não manda para nenhum servidor.
    var m = /^#nova-senha=([\w-]{40,60})$/.exec(location.hash);
    if (m) {
      var token = m[1];
      try { history.replaceState(null, '', location.pathname); } catch (_) { }
      $('#authTabs').hidden = true; $('#resetSheet').hidden = false; title.textContent = 'Crie uma senha nova'; document.title = 'Senha nova | ESRO';
      onSubmit(formNew, guard(formNew, async function () {
        if (!check(formNew, [['senha', 'senhaNova']])) throw stop();
        await call('POST', '/nova-senha', { token: token, senha: formNew.elements.senha.value });
        location.assign('/conta');
      }));
      formNew.elements.senha.focus();
      return;
    }
    if (location.hash === '#criar-conta') select('cadastro');
    // Quem já está com a conta aberta vai direto para ela.
    call('GET', '/sessao').then(function (r) { if (r.conta) location.replace('/conta'); }, function () { });
  }

  /* ---------- Minha conta ---------- */
  var money = function (v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  function day(v) {
    if (!v) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); if (!m) return '';
    if (String(v).length <= 10) return m[3] + '/' + m[2] + '/' + m[1];
    var d = new Date(v); return isNaN(d) ? m[3] + '/' + m[2] + '/' + m[1] : d.toLocaleDateString('pt-BR');
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var PAY = { 'Aguardando': 'Pagamento a combinar', 'Sinal pago': 'Sinal pago', 'Pago': 'Pago' };

  function renderOrders(list) {
    var ul = $('#orders'); ul.textContent = '';
    $('#ordersEmpty').hidden = list.length > 0;
    list.forEach(function (o) {
      var li = el('li', 'order'), left = el('div');
      left.appendChild(el('strong', null, (o.quantidade > 1 ? o.quantidade + ' × ' : '') + o.item));
      left.appendChild(el('div', 'meta', (o.numero ? 'Pedido nº ' + o.numero : 'Pedido') + (o.data ? ', feito em ' + day(o.data) : '')));
      li.appendChild(left); li.appendChild(el('div', 'value', o.valor > 0 ? money(o.valor) : ''));
      var foot = el('div', 'foot'), st = el('span', 'status', o.statusNome); st.setAttribute('data-s', o.status); foot.appendChild(st);
      if (o.entrega && o.status !== 'concluido') foot.appendChild(el('span', null, 'Entrega prevista para ' + day(o.entrega)));
      foot.appendChild(el('span', null, o.falta > 0 && o.pago > 0 ? 'Pago ' + money(o.pago) + ', falta ' + money(o.falta) : (PAY[o.pagamento] || PAY.Aguardando)));
      if (o.rastreio) foot.appendChild(el('span', null, 'Rastreio: ' + o.rastreio));
      if (o.acompanhar) { var more = el('a', 'link', 'Ver detalhes do pedido'); more.href = o.acompanhar; foot.appendChild(more); }
      li.appendChild(foot);
      if (o.pix && o.pix.codigo) li.appendChild(pixBox(o));
      ul.appendChild(li);
    });
  }

  /* Pagamento por PIX: mostra o QR e o "copia e cola" do valor que falta. Quem confirma o recebimento é a ESRO. */
  var pixSeq = 0;
  function pixBox(o) {
    var wrap = el('div', 'pix'), id = 'pix-' + (++pixSeq);
    var btn = el('button', 'btn primary small', 'Pagar ' + money(o.pix.valor) + ' com PIX'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
    var box = el('div', 'pix-box'); box.id = id; box.hidden = true;
    var qr = el('div', 'pix-qr'); qr.setAttribute('role', 'img'); qr.setAttribute('aria-label', 'QR Code do PIX de ' + money(o.pix.valor));
    var side = el('div', 'pix-side');
    side.appendChild(el('p', 'pix-how', 'Abra o app do seu banco, escolha pagar com PIX e leia o QR Code, ou copie o código abaixo e use a opção "PIX copia e cola".'));
    var lab = el('label', 'pix-lab', 'Código copia e cola'), code = document.createElement('textarea');
    code.className = 'pix-code'; code.readOnly = true; code.rows = 5; code.value = o.pix.codigo; code.id = id + '-code'; lab.setAttribute('for', code.id);
    var copy = el('button', 'btn secondary small', 'Copiar código'); copy.type = 'button';
    var said = el('span', 'pix-said'); said.setAttribute('role', 'status');
    copy.addEventListener('click', async function () {
      var ok = false;
      try { await navigator.clipboard.writeText(o.pix.codigo); ok = true; } catch (_) { try { code.focus(); code.select(); ok = document.execCommand('copy'); } catch (__) { ok = false; } }
      said.textContent = ok ? 'Código copiado.' : 'Selecione o código e copie manualmente.';
    });
    code.addEventListener('focus', function () { code.select(); });
    side.appendChild(lab); side.appendChild(code);
    var row = el('div', 'pix-actions'); row.appendChild(copy); row.appendChild(said); side.appendChild(row);
    side.appendChild(el('p', 'pix-note', 'Favorecido: ' + o.pix.favorecido + '. Depois do pagamento, a ESRO confirma o recebimento e a situação do pedido é atualizada aqui.'));
    box.appendChild(qr); box.appendChild(side);
    btn.addEventListener('click', function () {
      var open = box.hidden; box.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open && !qr.firstChild) {
        try { new QRCode(qr, { text: o.pix.codigo, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); }
        catch (_) { qr.textContent = 'QR Code indisponível. Use o código copia e cola.'; qr.className = 'pix-qr off'; }
      }
    });
    wrap.appendChild(btn); wrap.appendChild(box);
    return wrap;
  }

  async function initAccount() {
    var me;
    try { me = (await call('GET', '/eu')).conta; }
    catch (e) { if (e.status === 401) { location.replace('/entrar'); return; } $('#loading').textContent = e.message; return; }
    var formData = $('#form-dados'), formPass = $('#form-senha'), formDel = $('#form-excluir');
    function fill(c) {
      me = c; $('#hello').textContent = 'Olá, ' + c.nome.split(' ')[0];
      var d = day(c.desde); $('#since').textContent = d ? 'Cliente ESRO desde ' + d : '';
      formData.elements.nome.value = c.nome; formData.elements.telefone.value = c.telefone; $('#me-email').value = c.email; $('#pw-user').value = c.email;
    }
    fill(me); $('#loading').hidden = true; $('#content').hidden = false;

    call('GET', '/pedidos').then(function (r) { renderOrders(r.pedidos || []); }, function (e) { var b = $('#ordersError'); b.textContent = 'Não foi possível carregar os pedidos. ' + e.message; b.hidden = false; });

    $('#logoutBtn').addEventListener('click', async function () { try { await call('POST', '/sair', {}); } catch (_) { } location.assign('/'); });

    onSubmit(formData, guard(formData, async function () {
      if (!check(formData, [['nome', 'nome'], ['telefone', 'telefone']])) throw stop();
      fill((await call('PATCH', '/eu', { nome: formData.elements.nome.value, telefone: formData.elements.telefone.value })).conta);
      say(formData, 'Dados salvos.', true);
    }));
    onSubmit(formPass, guard(formPass, async function () {
      if (!check(formPass, [['atual', 'senha'], ['nova', 'senhaNova']])) throw stop();
      await call('POST', '/senha', { atual: formPass.elements.atual.value, nova: formPass.elements.nova.value });
      formPass.reset(); $('#pw-user').value = me.email;
      say(formPass, 'Senha trocada. Os outros aparelhos foram desconectados.', true);
    }));
    onSubmit(formDel, guard(formDel, async function () {
      if (!check(formDel, [['senha', 'senha']])) throw stop();
      await call('POST', '/excluir', { senha: formDel.elements.senha.value });
      location.assign('/');
    }));
  }

  /* Contagem de visitas: sem cookies; só avisa o servidor qual página abriu. */
  (function () {
    var first = true; try { first = !sessionStorage.getItem('esro_v'); sessionStorage.setItem('esro_v', '1'); } catch (_) { }
    try { fetch('/api/v', { method: 'POST', headers: { 'X-ESRO': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(first ? { p: location.pathname, n: true, r: document.referrer || '' } : { p: location.pathname }), keepalive: true, credentials: 'omit' }).catch(function () { }); } catch (_) { }
  })();

  if (page === 'entrar') initAuth();
  else if (page === 'conta') initAccount();
})();
