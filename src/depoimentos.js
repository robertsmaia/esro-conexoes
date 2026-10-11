// Depoimentos de clientes. Só aparecem no site os que a ESRO aprovou no painel.
// Chegam de três jeitos:
//  - o cliente escreve na página do pedido (link secreto) ou na área "Minha conta" do site: compra verificada;
//  - a ESRO cadastra no painel um depoimento real recebido pelo WhatsApp/Instagram, com a autorização do cliente;
//  - o painel sugere comentários positivos das publicações do Instagram da ESRO, para a ESRO pedir autorização e publicar.
import crypto from 'node:crypto';
import { str, siteBase } from './util.js';
import { igToken } from './channels.js';

const CONTROL = new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const line = (s, max) => str(s).normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (s, max) => str(s).normalize('NFC').replace(/\r/g, '').replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const TOKEN = /^[\w-]{40,50}$/;
const ORIGENS = { site: 'Pelo site', conta: 'Pelo site', whatsapp: 'Pelo WhatsApp', instagram: 'Pelo Instagram', pessoalmente: 'Pessoalmente', email: 'Por e-mail' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PODE_DEPOIMENTO = new Set(['enviado', 'concluido']);   // só depois que o pedido saiu da ESRO

// ---------- Comentários do Instagram: separa os elogios ----------
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const POS = /\b(amei|amo|adorei|adoro|lind[oa]s?|lindez[a]?|maravilhos[oa]s?|perfeit[oa]s?|perfeicao|incrive(l|is)|apaixonad[oa]|encantad[oa]|capricho|caprichad[oa]|delicad[oa]|delicadeza|qualidade|recomendo|indico|parabens|sucesso|top|show|demais|fofo|fofa|fofura|obrigad[oa]|gratidao|chegou|uma graca|que graca|sensacional|excelente|otim[oa]|lindissim[oa]|amando|feliz|amou|amaram|adoraram)\b|❤|♥|😍|🥰|🤩|👏|💖|💕|💗|💓|😻|✨|🙌|💛|💜|🧡|💚|💙/u;
const NEG = /\b(nao gostei|nao chegou|ainda nao|demor(ou|a|ando)|atras(o|ou|ada|ado)|problema|ruim|pessim[oa]|horrivel|defeito|reclama|decepcion|errad[oa]|cade|quebr|rasgad|nunca|absurdo|golpe|enganad)\b|😡|😠|😞|😢|👎/u;
const PERGUNTA = /\?|\b(quanto|valor|preco|como (faco|compro|peco)|tem (como|disponivel)|faz(em)? (entrega|envio)|qual o)\b/;
export function elogio(t) {
  const n = norm(t); if (n.replace(/[^a-z]/g, '').length < 3 && !POS.test(t)) return false;
  if (NEG.test(n) || NEG.test(t)) return false;
  if (PERGUNTA.test(n)) return false;
  return POS.test(n) || POS.test(t);
}

export function parseInstagramComments(body) {
  const out = [];
  for (const entry of body?.entry || []) for (const ch of entry.changes || []) {
    if (ch.field !== 'comments' || !ch.value) continue;
    const v = ch.value;
    if (!v.id || !v.text) continue;
    out.push({ id: String(v.id).slice(0, 60), texto: text(v.text, 600), usuario: line(v.from?.username, 40), mediaId: String(v.media?.id || '').slice(0, 60), data: new Date().toISOString() });
  }
  return out;
}

export function makeDepoimentos({ cfg, repo, log = console, clientIp, counter, mailer, fetchImpl = fetch }) {
  const sends = counter(3600e3);

  // O que o site mostra: só aprovados, sem telefone, e-mail ou número do pedido.
  async function publicos() {
    return (await repo.docList('depoimentos')).map(r => ({ id: r.id, ...r.data })).filter(d => d.status === 'aprovado' && d.autorizado === true && line(d.texto, 10))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 12)
      .map(d => ({ nome: line(d.nome, 40), cidade: line(d.cidade, 40), texto: text(d.texto, 600), produto: line(d.produto, 80), mes: String(d.at || '').slice(0, 7), verificado: !!d.verificado, origem: ORIGENS[d.origem] || '' }));
  }

  // Grava o depoimento do cliente de um pedido (pela página do pedido ou pela conta). Responde e avisa a ESRO.
  async function criar(row, b, req, res, origem) {
    const nome = line(b.nome, 40), cidade = line(b.cidade, 40), texto = text(b.texto, 600), o = row.data;
    if (!PODE_DEPOIMENTO.has(o.status)) return res.status(409).json({ erro: 'Você poderá escrever o depoimento depois que o pedido for enviado.' });
    if (nome.length < 2 || !/\p{L}/u.test(nome)) return res.status(422).json({ campo: 'nome', erro: 'Escreva como o seu nome deve aparecer (por exemplo, Ana S.).' });
    if (texto.length < 20) return res.status(422).json({ campo: 'texto', erro: 'Conte um pouco mais: pelo menos 20 letras.' });
    if (b.aceite !== true) return res.status(422).json({ campo: 'aceite', erro: 'Para publicar, é preciso autorizar o uso do depoimento.' });
    const id = 'dep_' + row.id, now = new Date().toISOString();
    if (await repo.docGet('depoimentos', id)) return res.status(409).json({ erro: 'Você já enviou um depoimento para este pedido. Obrigada!' });
    const produto = Array.isArray(o.loja?.itens) && o.loja.itens.length ? o.loja.itens.map(i => i.nome).join(', ') : line(o.item, 80);
    await repo.docSet('depoimentos', id, { nome, cidade, texto, produto: line(produto, 80), origem, verificado: true, pedido: o.num ?? null, clientId: o.clientId || null,
      autorizado: true, autorizadoEm: now, status: 'pendente', at: now });
    res.status(201).json({ ok: true });
    const base = siteBase(cfg, req);
    if (mailer?.enabled && mailer.owner && base) mailer.send({ to: mailer.owner, toName: 'ESRO', subject: `Novo depoimento para aprovar (pedido nº ${o.num ?? ''})`,
      html: `<p><b>${esc(nome)}</b>${cidade ? ' · ' + esc(cidade) : ''} escreveu sobre o pedido nº ${esc(o.num ?? '')}:</p><blockquote>${esc(texto).replace(/\n/g, '<br>')}</blockquote><p>Aprove em <a href="${esc(base)}/painel">Loja online → Depoimentos</a>.</p>`,
      text: `${nome} escreveu sobre o pedido nº ${o.num ?? ''}: ${texto}\nAprove no painel: ${base}/painel` }).catch(() => {});
  }
  const limit = (req, res) => { const ip = clientIp(req); if (sends.add(ip) > 6) { res.status(429).set('Retry-After', String(sends.retryAfter(ip))).json({ erro: 'Muitos envios em pouco tempo. Aguarde um pouco.' }); return true; } return false; };
  const bodyOf = (req) => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const situacao = (d) => d ? (d.status === 'aprovado' ? 'publicado' : 'em revisão') : null;

  function publicRoutes(api) {
    api.get('/depoimentos', async (_req, res) => { res.set('Cache-Control', 'public, max-age=120'); res.json({ depoimentos: await publicos() }); });

    // O cliente escreve pela página do pedido. Fica pendente até a ESRO aprovar; um por pedido.
    api.post('/depoimentos', async (req, res) => {
      const b = bodyOf(req);
      if (b.site) return res.status(400).json({ erro: 'Não foi possível enviar.' });
      if (limit(req, res)) return;
      const t = str(b.token), row = TOKEN.test(t) ? await repo.orderByPub(t) : null;
      if (!row) return res.status(404).json({ erro: 'Pedido não encontrado. Use o link que você recebeu da ESRO.' });
      await criar(row, b, req, res, 'site');
    });

    // A página do pedido pergunta se já há depoimento, para não mostrar o formulário de novo.
    api.get('/depoimentos/pedido/:token', async (req, res) => {
      const t = str(req.params.token), row = TOKEN.test(t) ? await repo.orderByPub(t) : null;
      if (!row) return res.status(404).json({ erro: 'Pedido não encontrado.' });
      const d = await repo.docGet('depoimentos', 'dep_' + row.id);
      res.set('Cache-Control', 'no-store'); res.json({ enviado: !!d, status: situacao(d) });
    });
  }

  // "Minha conta": rotas que já passaram pelo login do cliente (req.user). Só pedidos da ficha do próprio cliente.
  function contaRoutes(api) {
    api.post('/depoimentos', async (req, res) => {
      const b = bodyOf(req); if (b.site) return res.status(400).json({ erro: 'Não foi possível enviar.' });
      if (limit(req, res)) return;
      const num = Number(b.numero), rows = req.user.client_id && Number.isInteger(num) ? await repo.ordersOfClient(req.user.client_id) : [];
      const row = rows.find(r => Number(r.data?.num) === num);
      if (!row) return res.status(404).json({ erro: 'Pedido não encontrado na sua conta.' });
      await criar(row, b, req, res, 'conta');
    });
  }
  // Para a lista de pedidos da conta: situação do depoimento de cada pedido.
  async function situacaoDoPedido(row) {
    if (!PODE_DEPOIMENTO.has(row.data?.status)) return null;
    return situacao(await repo.docGet('depoimentos', 'dep_' + row.id)) || 'pode';
  }

  // ---------- Instagram ----------
  async function guardarComentarios(list) {
    if (!list.length) return;
    const saved = await repo.kvGet('ig_comentarios'); let arr = []; try { arr = saved ? JSON.parse(saved.value) : []; } catch { arr = []; }
    const ids = new Set(arr.map(c => c.id));
    for (const c of list) if (!ids.has(c.id)) arr.unshift(c);
    await repo.kvSet('ig_comentarios', JSON.stringify(arr.slice(0, 300)));
  }
  async function ignorados() { const s = await repo.kvGet('ig_coment_ignorados'); try { return new Set(s ? JSON.parse(s.value) : []); } catch { return new Set(); } }

  // Lê os comentários das últimas publicações (precisa da permissão de comentários no token) e junta com os que chegaram pelo aviso automático.
  async function comentariosInstagram({ force = false } = {}) {
    const token = await igToken(cfg, repo);
    let erro = null, lidos = 0, perfil = null;
    const cache = await repo.kvGet('ig_comentarios_lidos');
    const fresh = cache && Date.now() - new Date(cache.updated_at).getTime() < 10 * 60e3;
    if (token && (force || !fresh)) {
      const base = `https://graph.instagram.com/${cfg.instagram.apiVersion}`;
      const get = async (path, params) => {
        const u = new URL(base + path); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v)); u.searchParams.set('access_token', token);
        const r = await fetchImpl(u.toString(), { signal: AbortSignal.timeout(12000) }); const d = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error('instagram'), { code: d.error?.code, status: r.status }); return d;
      };
      try {
        const me = await get('/me', { fields: 'username' }); perfil = line(me.username, 60);
        const media = await get('/me/media', { fields: 'id,caption,permalink,timestamp,comments_count', limit: 25 });
        const posts = (Array.isArray(media.data) ? media.data : []).filter(p => Number(p.comments_count) > 0).slice(0, 25);
        const novos = [];
        for (const p of posts) {
          const c = await get(`/${encodeURIComponent(p.id)}/comments`, { fields: 'id,text,username,timestamp', limit: 50 });
          for (const x of Array.isArray(c.data) ? c.data : []) {
            lidos++;
            if (!x.id || !x.text || (perfil && line(x.username, 60).toLowerCase() === perfil.toLowerCase())) continue;
            novos.push({ id: String(x.id).slice(0, 60), texto: text(x.text, 600), usuario: line(x.username, 40), mediaId: String(p.id), data: x.timestamp || null,
              post: /^https:\/\/(www\.)?instagram\.com\//.test(String(p.permalink || '')) ? String(p.permalink) : null, legenda: line(p.caption, 80) });
          }
        }
        await guardarComentarios(novos);
        await repo.kvSet('ig_comentarios_lidos', JSON.stringify({ lidos, perfil }));
      } catch (e) {
        erro = e.code === 190 ? 'O acesso ao Instagram expirou. Gere um token novo no painel da Meta e atualize IG_TOKEN no Render.'
          : e.code === 10 || e.code === 200 || e.status === 403 ? 'O token do Instagram não tem a permissão de ler comentários (instagram_business_manage_comments). Os comentários que chegarem pelo aviso automático continuam aparecendo aqui.'
          : 'Não foi possível falar com o Instagram agora. Tente de novo em alguns minutos.';
      }
    }
    const saved = await repo.kvGet('ig_comentarios'); let arr = []; try { arr = saved ? JSON.parse(saved.value) : []; } catch { arr = []; }
    const ign = await ignorados(), usados = new Set((await repo.docList('depoimentos')).map(r => r.data?.igComentario).filter(Boolean));
    const comentarios = arr.filter(c => !ign.has(c.id) && !usados.has(c.id) && elogio(c.texto)).slice(0, 60);
    return { configurado: !!token, erro, comentarios, total: arr.length, atualizadoEm: (await repo.kvGet('ig_comentarios_lidos'))?.updated_at || null };
  }

  // Rotas do painel (já passaram pelo login do painel e pela permissão de depoimentos).
  function adminRoutes(panelApi) {
    panelApi.get('/depoimentos/instagram', async (req, res) => res.json(await comentariosInstagram({ force: req.query.atualizar === '1' })));
    panelApi.post('/depoimentos/instagram/:id/ignorar', async (req, res) => {
      const id = str(req.params.id); if (!/^[\w-]{1,60}$/.test(id)) return res.status(422).json({ erro: 'Comentário inválido.' });
      const ign = await ignorados(); ign.add(id); await repo.kvSet('ig_coment_ignorados', JSON.stringify([...ign].slice(-1000))); res.json({ ok: true });
    });
  }

  return { publicRoutes, contaRoutes, adminRoutes, situacaoDoPedido, guardarComentarios, publicos, novoId: () => 'dep_' + crypto.randomBytes(9).toString('hex') };
}
