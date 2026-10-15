// Catálogo de miolos (páginas internas de agendas, planners e cadernos personalizados).
// O cadastro é feito no painel (coleções "miolocats" e "miolos"). O site só vê os modelos publicados de categorias ativas,
// e só as imagens de prévia e o PDF de demonstração. Os arquivos de produção (campo "producao") nunca saem pelo site.
//  - /miolos                 → página "Escolha seu miolo"
//  - /api/miolos             → categorias e modelos publicados (só os campos públicos)
//  - /miolos/img/:id         → imagens de prévia (só as que estão em um modelo publicado)
//  - /miolos/demo/:id        → PDF de demonstração (só o marcado como demonstração de um modelo publicado)
import path from 'node:path';
import { str } from './util.js';

const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const line = (s, max) => str(s).normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (s, max) => str(s).normalize('NFC').replace(/\r/g, '').replace(new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g'), ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const ASSET = /^[a-f0-9]{24}$/;
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp']);
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
export const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const CODIGO = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const key = (s) => line(s, 60).toLowerCase();

// Imagem cadastrada no painel: { f: id da imagem grande, t: id da miniatura }.
function pic(v, assets) {
  const f = ASSET.test(String(v?.f || '')) ? v.f : null, t = ASSET.test(String(v?.t || '')) ? v.t : f;
  if (!f) return null;
  assets.add(f); assets.add(t);
  return { src: '/miolos/img/' + f, thumb: '/miolos/img/' + t };
}

export function makeMiolos({ cfg, repo, log = console }) {
  const ttl = () => cfg.store?.catalogTtlMs ?? 30e3;
  let cache = { at: 0 };

  async function load(force) {
    if (!force && cache.at && Date.now() - cache.at < ttl()) return cache;
    const [cats, mods, prods] = await Promise.all([repo.docList('miolocats'), repo.docList('miolos'), repo.docList('products')]);
    const assets = new Set(), demos = new Set();
    const produtos = new Map(prods.filter(r => r.data && r.data.on !== false).map(r => [r.id, { id: r.id, slug: line(r.data.slug, 80), nome: line(r.data.name, 120), modo: r.data.mode === 'compra' ? 'compra' : 'orcamento', digital: !!r.data.digital }]));
    const catById = new Map();
    for (const r of cats) {
      const c = r.data || {}; if (c.on === false || !line(c.nome, 60)) continue;
      catById.set(r.id, { id: r.id, slug: slugify(c.nome) || r.id, nome: line(c.nome, 60), desc: text(c.desc, 300), ord: Number(c.ord) || 0, imgRaw: c.img });
    }
    const usados = new Set(), modelos = [];
    for (const r of mods) {
      const m = r.data || {}, cat = catById.get(m.cat), codigo = line(m.codigo, 20).toUpperCase();
      if (m.on !== true || !cat || !CODIGO.test(codigo) || usados.has(codigo) || !line(m.nome, 80)) continue;
      usados.add(codigo);
      const local = new Set();   // imagens deste modelo (só entram na lista pública se o modelo aparecer)
      const cores = arr(m.cores, 24).map(c => ({ nome: line(c?.nome, 40), hex: /^#[0-9a-f]{6}$/i.test(String(c?.hex || '')) ? String(c.hex).toLowerCase() : null, disp: c?.disp !== false,
        imgs: arr(c?.imgs, 12).map(i => pic(i, local)).filter(Boolean) })).filter(c => c.nome);
      const tamanhos = arr(m.tamanhos, 12).map(t => ({ nome: line(t?.nome, 30), medida: line(t?.medida, 40), disp: t?.disp !== false })).filter(t => t.nome);
      const anos = arr(m.anos, 6).map(a => ({ ano: line(a?.ano, 10), disp: a?.disp !== false })).filter(a => a.ano);
      const bloqueios = arr(m.bloqueios, 60).map(b => [line(b?.cor, 40), line(b?.tamanho, 30), line(b?.ano, 10)]).filter(b => b.some(Boolean));
      const demo = ASSET.test(String(m.demo || '')) ? m.demo : null;
      const mod = { id: r.id, codigo, nome: line(m.nome, 80), cat: cat.id, desc: text(m.desc, 1200), cores, tamanhos, anos, formatos: arr(m.formatos, 8).map(x => line(x, 40)).filter(Boolean),
        bloqueios, secoes: arr(m.secoes, 30).map(x => line(x, 80)).filter(Boolean), galeria: arr(m.galeria, 12).map(i => pic(i, local)).filter(Boolean),
        paginas: arr(m.paginas, 400).map(i => pic(i, local)).filter(Boolean), demo, produtos: arr(m.produtos, 12).map(id => produtos.get(String(id))).filter(Boolean),
        destaque: !!m.destaque, disponivel: m.indisp !== true, aviso: m.indisp === true ? (line(m.indispMsg, 160) || 'Indisponível no momento.') : '', ord: Number(m.ord) || 0, local };
      modelos.push(mod);
    }
    // Só aparecem categorias com pelo menos um modelo disponível. Um modelo indisponível continua abrindo pelo código (com o aviso),
    // mesmo quando a categoria dele está fora da lista; modelos de categorias desligadas ficam fora.
    const ativas = new Set(modelos.filter(m => m.disponivel).map(m => m.cat));
    const visiveis = modelos.sort((a, b) => (b.disponivel - a.disponivel) || (b.destaque - a.destaque) || (a.ord - b.ord) || a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const m of visiveis) { for (const a of m.local) assets.add(a); if (m.demo) demos.add(m.demo); delete m.local; }
    const categorias = [...catById.values()].filter(c => ativas.has(c.id)).sort((a, b) => a.ord - b.ord || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map(c => ({ id: c.id, slug: c.slug, nome: c.nome, desc: c.desc, img: pic(c.imgRaw, assets), total: visiveis.filter(m => m.cat === c.id && m.disponivel).length }));
    // A categoria sem foto usa a primeira prévia do primeiro modelo.
    for (const c of categorias) if (!c.img) { const m = visiveis.find(x => x.cat === c.id && x.disponivel); c.img = m ? (m.galeria[0] || m.cores.find(x => x.imgs.length)?.imgs[0] || m.paginas[0] || null) : null; }
    cache = { at: Date.now(), categorias, modelos: visiveis, assets, demos };
    return cache;
  }

  const pubModelo = (m) => ({ codigo: m.codigo, nome: m.nome, cat: m.cat, desc: m.desc, cores: m.cores, tamanhos: m.tamanhos, anos: m.anos, formatos: m.formatos, bloqueios: m.bloqueios,
    secoes: m.secoes, galeria: m.galeria, paginas: m.paginas, demo: m.demo ? `/miolos/demo/${m.demo}` : null,
    produtos: m.produtos.map(p => ({ id: p.id, slug: p.slug, nome: p.nome, modo: p.modo })), destaque: m.destaque, disponivel: m.disponivel, aviso: m.aviso });

  // Confere a escolha do cliente: modelo publicado e disponível, compatível com o produto e com cor/tamanho/ano cadastrados e liberados.
  function validar(snap, productId, sel) {
    if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return null;
    const codigo = line(sel.codigo, 20).toUpperCase(); if (!codigo) return null;
    const m = snap.modelos.find(x => x.codigo === codigo);
    if (!m) return { erro: 'O miolo escolhido não está mais disponível. Escolha outro em "Escolha seu miolo".' };
    if (!m.disponivel) return { erro: `O miolo ${m.codigo} está indisponível no momento. Escolha outro.` };
    if (!m.produtos.some(p => p.id === productId)) return { erro: `O miolo ${m.codigo} não é usado neste produto.` };
    const pickOne = (list, v, nome, campo) => {
      if (!list.length) return { v: '' };
      const it = list.find(x => key(x[campo]) === key(v));
      if (!it) return { erro: `Escolha ${nome} do miolo ${m.codigo}.` };
      if (!it.disp) return { erro: `${nome[0].toUpperCase() + nome.slice(1)} "${it[campo]}" do miolo ${m.codigo} está indisponível.` };
      return { v: it[campo] };
    };
    const cor = pickOne(m.cores, sel.cor, 'a cor', 'nome'); if (cor.erro) return cor;
    const tam = pickOne(m.tamanhos, sel.tamanho, 'o tamanho', 'nome'); if (tam.erro) return tam;
    const ano = pickOne(m.anos, sel.ano, 'o ano', 'ano'); if (ano.erro) return ano;
    if (bloqueado(m, cor.v, tam.v, ano.v)) return { erro: `A combinação escolhida do miolo ${m.codigo} não está disponível.` };
    return { rotulo: [m.codigo + ' ' + m.nome, cor.v, tam.v, ano.v].filter(Boolean).join(' · ').slice(0, 160) };
  }
  const bloqueado = (m, cor, tam, ano) => m.bloqueios.some(([c, t, a]) => (!c || key(c) === key(cor)) && (!t || key(t) === key(tam)) && (!a || key(a) === key(ano)));

  function mount(app, siteHeaders, SITE_DIR) {
    app.get('/miolos', (_req, res) => { siteHeaders(res); res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(SITE_DIR, 'miolos.html')); });
    app.get('/api/miolos', async (_req, res) => {
      const s = await load();
      res.set({ 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex' });
      res.json({ categorias: s.categorias, modelos: s.modelos.map(pubModelo) });
    });
    const serve = (types, extra = {}) => async (req, res) => {
      const id = String(req.params.id), s = await load();
      const ok = ASSET.test(id) && (types === 'pdf' ? s.demos.has(id) : s.assets.has(id));
      const a = ok ? await repo.assetGet(id) : null;
      if (!a || (types === 'pdf' ? a.type !== 'application/pdf' : !RASTER.has(a.type))) return res.status(404).json({ erro: 'não encontrado' });
      res.set({ 'Content-Type': a.type, 'Content-Length': String(a.data.length), 'Cache-Control': 'public, max-age=604800', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff', ...extra });
      res.end(a.data);
    };
    app.get('/miolos/img/:id', serve('img', { 'Cross-Origin-Resource-Policy': 'same-site' }));
    app.get('/miolos/demo/:id', serve('pdf', { 'Content-Disposition': 'inline; filename="miolo-demonstracao.pdf"', 'X-Robots-Tag': 'noindex' }));
  }

  return { load, validar, mount, invalidate: () => { cache = { at: 0 }; } };
}
