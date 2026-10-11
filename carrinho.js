/* ESRO — carrinho compartilhado entre as páginas do site.
   Fica guardado só neste aparelho (localStorage), sem dados pessoais: produto, quantidade e opções escolhidas. */
(function () {
  'use strict';
  var KEY = 'esro_carrinho';
  // Preço por quantidade ("a partir de N unidades, R$ X cada"): só para mostrar; o valor que vale é sempre o calculado no servidor.
  function tiers(f) { return (Array.isArray(f) ? f : []).slice(0, 5).map(function (t) { return { min: Math.floor(Number(t && t.min)), preco: Number(t && t.preco) }; }).filter(function (t) { return t.min >= 2 && t.preco > 0; }); }
  function baseFor(base, faixas, q) { var b = base; tiers(faixas).forEach(function (t) { if (q >= t.min) b = Math.min(base, t.preco); }); return b; }
  // O degrau vale para o total do mesmo produto no pedido, somando as opções diferentes.
  function reprice(list) {
    var tot = {}; list.forEach(function (i) { if (i.id) tot[i.id] = (tot[i.id] || 0) + i.qtd; });
    list.forEach(function (i) { if (i.tipo === 'compra' && i.base > 0) i.preco = Math.round((baseFor(i.base, i.faixas, tot[i.id]) + i.add) * 100) / 100; });
    return list;
  }
  var str = function (v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); };
  function clean(it) {
    if (!it || typeof it !== 'object') return null;
    var nome = str(it.nome, 120), qtd = Math.floor(Number(it.qtd)); if (!nome || !(qtd >= 1)) return null;
    var vars = {}; if (it.vars && typeof it.vars === 'object' && !Array.isArray(it.vars)) Object.keys(it.vars).slice(0, 4).forEach(function (k) { vars[str(k, 40)] = str(it.vars[k], 40); });
    var img = String(it.img || ''); if (!/^\/?(assets|img)\/[\w\-./]+$/.test(img) || img.indexOf('..') >= 0) img = '';
    return { nome: nome, qtd: Math.min(99, qtd), img: img, id: str(it.id, 60), tipo: it.tipo === 'compra' ? 'compra' : 'orcamento', vars: vars, pers: str(it.pers, 120), preco: Math.max(0, Number(it.preco) || 0), slug: str(it.slug, 80),
      base: Math.max(0, Number(it.base) || 0), add: Math.max(0, Number(it.add) || 0), faixas: tiers(it.faixas) };
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
  window.ESROCart = { load: load, save: save, add: add, keyOf: keyOf, detail: detail, money: money, tiers: tiers, baseFor: baseFor, reprice: reprice, allBuy: function (list) { return list.length > 0 && list.every(function (i) { return i.tipo === 'compra' && i.id; }); } };
})();
