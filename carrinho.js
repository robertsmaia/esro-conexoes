/* ESRO — carrinho compartilhado entre as páginas do site.
   Fica guardado só neste aparelho (localStorage), sem dados pessoais: produto, quantidade e opções escolhidas. */
(function () {
  'use strict';
  var KEY = 'esro_carrinho';
  var str = function (v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); };
  function clean(it) {
    if (!it || typeof it !== 'object') return null;
    var nome = str(it.nome, 120), qtd = Math.floor(Number(it.qtd)); if (!nome || !(qtd >= 1)) return null;
    var vars = {}; if (it.vars && typeof it.vars === 'object' && !Array.isArray(it.vars)) Object.keys(it.vars).slice(0, 4).forEach(function (k) { vars[str(k, 40)] = str(it.vars[k], 40); });
    var img = String(it.img || ''); if (!/^\/?(assets|img)\/[\w\-./]+$/.test(img) || img.indexOf('..') >= 0) img = '';
    return { nome: nome, qtd: Math.min(99, qtd), img: img, id: str(it.id, 60), tipo: it.tipo === 'compra' ? 'compra' : 'orcamento', vars: vars, pers: str(it.pers, 120), preco: Math.max(0, Number(it.preco) || 0), slug: str(it.slug, 80) };
  }
  function load() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return (Array.isArray(a) ? a : []).map(clean).filter(Boolean).slice(0, 20); } catch (_) { return []; }
  }
  function save(list) {
    try { if (list && list.length) localStorage.setItem(KEY, JSON.stringify(list.map(clean).filter(Boolean).slice(0, 20))); else localStorage.removeItem(KEY); } catch (_) { }
  }
  var keyOf = function (it) { return (it.id || it.nome) + '|' + JSON.stringify(it.vars || {}) + '|' + (it.pers || ''); };
  // Junta com um item igual (mesmo produto, mesmas opções) ou acrescenta. Devolve false se o carrinho estiver cheio.
  function add(list, it) {
    it = clean(it); if (!it) return false;
    var same = list.filter(function (x) { return keyOf(x) === keyOf(it); })[0];
    if (same) { same.qtd = Math.min(99, same.qtd + it.qtd); return true; }
    if (list.length >= 20) return false;
    list.push(it); return true;
  }
  var detail = function (it) {
    var parts = Object.keys(it.vars || {}).map(function (k) { return k + ': ' + it.vars[k]; });
    if (it.pers) parts.push('Personalização: ' + it.pers);
    return parts.join(' · ');
  };
  var money = function (v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  window.ESROCart = { load: load, save: save, add: add, keyOf: keyOf, detail: detail, money: money, allBuy: function (list) { return list.length > 0 && list.every(function (i) { return i.tipo === 'compra' && i.id; }); } };
})();
