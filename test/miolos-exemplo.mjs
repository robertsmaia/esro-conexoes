// SÓ PARA O SERVIDOR DE TESTE: categorias e modelos de miolo de mentira, com páginas desenhadas aqui mesmo (PNG simples).
// Nada disto vai para o banco de produção: lá, as categorias, os modelos e as imagens são cadastrados pela ESRO no painel.
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Página de miolo: fundo creme, faixa de título na cor do modelo, linhas e (às vezes) uma grade de calendário.
export function page(w, h, color, kind, n) {
  const px = Buffer.alloc(w * h * 3), set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c); };
  const C = hex(color), cream = [255, 252, 246], ink = [190, 176, 166], soft = C.map(v => Math.round(v + (255 - v) * 0.6));
  rect(0, 0, w, h, cream);
  const m = Math.round(w * 0.08);
  rect(m, m, w - m, m + Math.round(h * 0.07), kind === 'capa' ? C : soft);
  if (kind === 'capa') { rect(0, 0, w, h, C); rect(m, Math.round(h * 0.4), w - m, Math.round(h * 0.47), cream); }
  else if (kind === 'mes') { const top = m + Math.round(h * 0.11), cw = Math.floor((w - 2 * m) / 7), ch = Math.floor((h - top - m) / 6);
    for (let r = 0; r <= 6; r++) rect(m, top + r * ch, m + 7 * cw, top + r * ch + 2, ink); for (let c = 0; c <= 7; c++) rect(m + c * cw, top, m + c * cw + 2, top + 6 * ch, ink); }
  else { const step = Math.round(h * 0.035); for (let y = m + Math.round(h * 0.12); y < h - m; y += step) rect(m, y, w - m, y + 1, ink); }
  for (let i = 0; i < Math.min(n, 30); i++) rect(w - m - 8 - i * 6, h - m + 6, w - m - 4 - i * 6, h - m + 10, C);   // número da página (pontinhos)
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
async function pic(repo, color, kind, n) {
  const f = crypto.randomBytes(12).toString('hex'), t = crypto.randomBytes(12).toString('hex');
  await repo.assetPut({ id: f, name: `pagina-${n}.png`, type: 'image/png', data: page(600, 800, color, kind, n) });
  await repo.assetPut({ id: t, name: `miniatura-${n}.png`, type: 'image/png', data: page(150, 200, color, kind, n) });
  return { f, t };
}
const pages = async (repo, color, n) => { const out = []; for (let i = 1; i <= n; i++) out.push(await pic(repo, color, i === 1 ? 'capa' : i % 5 === 2 ? 'mes' : 'linhas', i)); return out; };

export async function seedMiolos(repo) {
  await repo.docSet('miolocats', 'mc1', { nome: 'Agenda com 1 dia por página', desc: 'Um dia inteiro em cada página, com espaço para compromissos e anotações.', ord: 1, on: true });
  await repo.docSet('miolocats', 'mc2', { nome: 'Agenda com 2 dias por página', desc: 'Dois dias em cada página, mais leve para carregar.', ord: 2, on: true });
  await repo.docSet('miolocats', 'mc3', { nome: 'Planners', desc: 'Planejamento semanal e mensal.', ord: 3, on: true });
  await repo.docSet('miolocats', 'mc4', { nome: 'Agenda jurídica', ord: 4, on: true });   // sem modelo publicado: não aparece
  const rosa = await pages(repo, '#d98f7a', 18), verde = [await pic(repo, '#8e9a6e', 'capa', 1), await pic(repo, '#8e9a6e', 'mes', 2)], gal = [await pic(repo, '#d98f7a', 'mes', 2), await pic(repo, '#d98f7a', 'linhas', 3)];
  await repo.docSet('miolos', 'mx1', { nome: 'Floral', codigo: 'AG1D-01', cat: 'mc1', desc: 'Miolo com detalhes florais delicados, calendário anual e planejamento mensal.', on: true, ord: 1, destaque: true,
    cores: [{ nome: 'Rosa', hex: '#d98f7a', imgs: [rosa[0], rosa[1]] }, { nome: 'Verde-sálvia', hex: '#8e9a6e', imgs: verde }, { nome: 'Areia', hex: '#d8c3a5', disp: false }],
    tamanhos: [{ nome: 'A5', medida: '14,8 × 21 cm' }, { nome: 'A4', medida: '21 × 29,7 cm' }], anos: [{ ano: '2027' }], bloqueios: [{ cor: 'Verde-sálvia', tamanho: 'A4' }],
    formatos: ['Espiral', 'Capa dura'], secoes: ['Dados pessoais', 'Calendário 2027', 'Planejamento mensal', 'Controle financeiro', 'Datas especiais', 'Anotações'], galeria: gal, paginas: rosa, produtos: ['prd_agenda', 'prd_planner'] });
  const azul = await pages(repo, '#7f97b2', 6);
  await repo.docSet('miolos', 'mx2', { nome: 'Clássico', codigo: 'AG1D-02', cat: 'mc1', desc: 'Miolo de linhas simples para quem gosta de escrever bastante.', on: true, ord: 2,
    cores: [{ nome: 'Azul', hex: '#7f97b2', imgs: [azul[0]] }], tamanhos: [{ nome: 'A5', medida: '14,8 × 21 cm' }], anos: [{ ano: '2026', disp: false }, { ano: '2027' }], secoes: ['Calendário', 'Anotações'], galeria: [azul[1]], produtos: ['prd_agenda'] });
  const terra = await pages(repo, '#b96f50', 4);
  await repo.docSet('miolos', 'mx3', { nome: 'Dois dias', codigo: 'AG2D-01', cat: 'mc2', desc: 'Dois dias por página.', on: true, cores: [{ nome: 'Terracota', hex: '#b96f50', imgs: [terra[0]] }], tamanhos: [{ nome: 'A5' }], anos: [{ ano: '2027' }], galeria: [terra[2]], produtos: ['prd_agenda'] });
  const mostarda = await pages(repo, '#d8ad65', 3);
  await repo.docSet('miolos', 'mx4', { nome: 'Semana inteira', codigo: 'PL-01', cat: 'mc3', desc: 'Planner semanal sem data.', on: true, cores: [{ nome: 'Mostarda', hex: '#d8ad65', imgs: [mostarda[0]] }], tamanhos: [{ nome: 'A5' }], galeria: [mostarda[1]], produtos: ['prd_planner'] });
  await repo.docSet('miolos', 'mx5', { nome: 'Esgotado de teste', codigo: 'PL-02', cat: 'mc3', on: true, indisp: true, indispMsg: 'Volta em novembro.', produtos: ['prd_planner'] });
  await repo.docSet('miolos', 'mx6', { nome: 'Rascunho', codigo: 'JUR-01', cat: 'mc4', on: false });
}
