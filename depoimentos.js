// Depoimentos de clientes. Só aparecem no site os que a ESRO aprovou no painel.
// Chegam de dois jeitos: o próprio cliente escreve na página do pedido (link secreto, então é compra verificada),
// ou a ESRO cadastra no painel um depoimento real recebido pelo WhatsApp/Instagram, com a autorização do cliente.
import crypto from 'node:crypto';
import { str, siteBase } from './util.js';

const CONTROL = new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const line = (s, max) => str(s).normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (s, max) => str(s).normalize('NFC').replace(/\r/g, '').replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const TOKEN = /^[\w-]{40,50}$/;
const ORIGENS = { site: 'Pelo site', whatsapp: 'Pelo WhatsApp', instagram: 'Pelo Instagram', pessoalmente: 'Pessoalmente', email: 'Por e-mail' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function makeDepoimentos({ cfg, repo, log = console, clientIp, counter, mailer }) {
  const sends = counter(3600e3);

  // O que o site mostra: só aprovados, sem telefone, e-mail ou número do pedido.
  async function publicos() {
    return (await repo.docList('depoimentos')).map(r => ({ id: r.id, ...r.data })).filter(d => d.status === 'aprovado' && d.autorizado === true && line(d.texto, 10))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 12)
      .map(d => ({ nome: line(d.nome, 40), cidade: line(d.cidade, 40), texto: text(d.texto, 600), produto: line(d.produto, 80), mes: String(d.at || '').slice(0, 7), verificado: !!d.verificado, origem: ORIGENS[d.origem] || '' }));
  }

  function publicRoutes(api) {
    api.get('/depoimentos', async (_req, res) => { res.set('Cache-Control', 'public, max-age=120'); res.json({ depoimentos: await publicos() }); });

    // O cliente escreve pela página do pedido. Fica pendente até a ESRO aprovar; um por pedido.
    api.post('/depoimentos', async (req, res) => {
      const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}, ip = clientIp(req);
      if (b.site) return res.status(400).json({ erro: 'Não foi possível enviar.' });
      if (sends.add(ip) > 6) return res.status(429).set('Retry-After', String(sends.retryAfter(ip))).json({ erro: 'Muitos envios em pouco tempo. Aguarde um pouco.' });
      const t = str(b.token), row = TOKEN.test(t) ? await repo.orderByPub(t) : null;
      if (!row) return res.status(404).json({ erro: 'Pedido não encontrado. Use o link que você recebeu da ESRO.' });
      const nome = line(b.nome, 40), cidade = line(b.cidade, 40), texto = text(b.texto, 600);
      if (nome.length < 2 || !/\p{L}/u.test(nome)) return res.status(422).json({ campo: 'nome', erro: 'Escreva como o seu nome deve aparecer (por exemplo, Ana S.).' });
      if (texto.length < 20) return res.status(422).json({ campo: 'texto', erro: 'Conte um pouco mais: pelo menos 20 letras.' });
      if (b.aceite !== true) return res.status(422).json({ campo: 'aceite', erro: 'Para publicar, é preciso autorizar o uso do depoimento.' });
      const id = 'dep_' + row.id, now = new Date().toISOString(), o = row.data;
      if (await repo.docGet('depoimentos', id)) return res.status(409).json({ erro: 'Você já enviou um depoimento para este pedido. Obrigada!' });
      const produto = Array.isArray(o.loja?.itens) && o.loja.itens.length ? o.loja.itens.map(i => i.nome).join(', ') : line(o.item, 80);
      await repo.docSet('depoimentos', id, { nome, cidade, texto, produto: line(produto, 80), origem: 'site', verificado: true, pedido: o.num ?? null, clientId: o.clientId || null,
        autorizado: true, autorizadoEm: now, status: 'pendente', at: now });
      res.status(201).json({ ok: true });
      const base = siteBase(cfg, req);
      if (mailer?.enabled && mailer.owner && base) mailer.send({ to: mailer.owner, toName: 'ESRO', subject: `Novo depoimento para aprovar (pedido nº ${o.num ?? ''})`,
        html: `<p><b>${esc(nome)}</b>${cidade ? ' · ' + esc(cidade) : ''} escreveu sobre o pedido nº ${esc(o.num ?? '')}:</p><blockquote>${esc(texto).replace(/\n/g, '<br>')}</blockquote><p>Aprove em <a href="${esc(base)}/painel">Loja online → Depoimentos</a>.</p>`,
        text: `${nome} escreveu sobre o pedido nº ${o.num ?? ''}: ${texto}\nAprove no painel: ${base}/painel` }).catch(() => {});
    });

    // A página do pedido pergunta se já há depoimento, para não mostrar o formulário de novo.
    api.get('/depoimentos/pedido/:token', async (req, res) => {
      const t = str(req.params.token), row = TOKEN.test(t) ? await repo.orderByPub(t) : null;
      if (!row) return res.status(404).json({ erro: 'Pedido não encontrado.' });
      const d = await repo.docGet('depoimentos', 'dep_' + row.id);
      res.set('Cache-Control', 'no-store'); res.json({ enviado: !!d, status: d ? (d.status === 'aprovado' ? 'publicado' : 'em revisão') : null });
    });
  }
  return { publicRoutes, publicos, novoId: () => 'dep_' + crypto.randomBytes(9).toString('hex') };
}
