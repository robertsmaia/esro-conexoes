// Miolos da Agenda 2027 (tema floral rosé) enviados pela ESRO em 15/10/2026: 25 páginas.
// As imagens desta pasta são PRÉVIAS (reduzidas e com marca d'água "Prévia · ESRO Papelaria"); os arquivos de impressão ficam com a ESRO.
// Cadastro único no banco: cria as categorias e os modelos se ainda não existirem. Depois disso, tudo é editado no painel.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const ID = 'migracao:miolos-agenda-2027';
const DIR = new URL('./miolos-agenda2027/', import.meta.url);

// Páginas, pelo número impresso em cada uma.
export const PAGINAS = {
  1: 'Folha de rosto', 2: 'Dados pessoais e contatos de emergência', 3: 'Calendário 2027', 4: 'Calendário 2028 resumido', 5: 'Feriados e datas comemorativas 2027',
  6: 'Planejamento anual', 7: 'Metas do ano', 8: 'Aniversários do ano', 9: 'Abertura de mês', 10: 'Calendário mensal', 11: 'Mensal em lista vertical',
  12: 'Metas e prioridades do mês', 13: 'Revisão do mês', 14: 'Mensal com rastreador de hábitos', 15: 'Semanal vertical', 16: 'Semanal horizontal',
  17: 'Semanal com lista de tarefas lateral', 18: 'Semanal com horários', 19: 'Semana em uma página com metas e notas', 20: 'Cardápio da semana e lista de compras',
  21: 'Um dia por página com horários', 22: 'Dois dias por página', 23: 'Diário com prioridades, tarefas e consumo de água', 24: 'Diário minimalista', 25: 'Diário de gratidão e reflexão',
};
const FIXAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];   // páginas comuns a todos os modelos
export const CATEGORIAS = [
  { chave: '1d', nome: 'Agenda com 1 dia por página', desc: 'Um dia inteiro em cada página, com espaço para a rotina, as prioridades e as anotações.', ord: 1 },
  { chave: '2d', nome: 'Agenda com 2 dias por página', desc: 'Dois dias em cada página: a agenda fica mais leve e continua organizada.', ord: 2 },
  { chave: 'pl', nome: 'Planners', desc: 'Planejamento semanal, com a semana inteira à vista.', ord: 5 },
];
export const MODELOS = [
  { codigo: 'AG27-1D-01', cat: '1d', proprias: [21], desc: 'Cada dia tem foco, prioridades e horários das 7h às 22h, para quem organiza a rotina hora a hora.' },
  { codigo: 'AG27-1D-02', cat: '1d', proprias: [23], desc: 'Cada dia tem prioridades, tarefas, notas e um marcador de consumo de água.' },
  { codigo: 'AG27-1D-03', cat: '1d', proprias: [24], desc: 'Página diária com data e linhas livres, para quem prefere escrever do seu jeito.' },
  { codigo: 'AG27-1D-04', cat: '1d', proprias: [25], desc: 'Página diária para gratidão, aprendizados, como você se sentiu e uma intenção para amanhã.' },
  { codigo: 'AG27-2D-01', cat: '2d', proprias: [22], desc: 'Dois dias por página, cada um com foco, prioridades, tarefas e notas.' },
  { codigo: 'PL27-01', cat: 'pl', proprias: [15, 20], desc: 'Semana em colunas verticais, de segunda a domingo, mais a página de cardápio e lista de compras.' },
  { codigo: 'PL27-02', cat: 'pl', proprias: [16, 20], desc: 'Semana em faixas horizontais, de segunda a domingo, mais a página de cardápio e lista de compras.' },
  { codigo: 'PL27-03', cat: 'pl', proprias: [17, 20], desc: 'Semana com lista lateral de tarefas, prioridades e notas, mais a página de cardápio e lista de compras.' },
  { codigo: 'PL27-04', cat: 'pl', proprias: [18, 20], desc: 'Semana com grade de horários das 7h às 22h, mais a página de cardápio e lista de compras.' },
  { codigo: 'PL27-05', cat: 'pl', proprias: [19, 20], desc: 'Semana em uma página, com metas da semana, prioridades, tarefas e notas, mais a página de cardápio e lista de compras.' },
].map(m => ({ ...m, nome: PAGINAS[m.proprias[0]] }));
const PRODUTOS = ['prd_agenda', 'prd_planner', 'prd_caderno'];
const COMUM = 'Miolo da Agenda 2027 da ESRO, tema floral rosé. Além das páginas do dia a dia, inclui folha de rosto, dados pessoais, calendários 2027 e 2028, feriados, planejamento anual, metas, aniversários e páginas mensais (calendário, lista, metas, revisão e rastreador de hábitos).';

export async function importAgenda2027(repo, log = console) {
  if (await repo.kvGet(ID)) return { feito: false };
  // Imagens: cada página vira uma prévia grande e uma miniatura, usadas por todos os modelos que têm a página.
  const pic = {};
  for (const n of Object.keys(PAGINAS).map(Number)) {
    const nn = String(n).padStart(2, '0'), ids = { f: crypto.randomBytes(12).toString('hex'), t: crypto.randomBytes(12).toString('hex') };
    await repo.assetPut({ id: ids.f, name: `agenda2027-pagina-${nn}-previa.jpg`, type: 'image/jpeg', data: await fs.readFile(new URL(`p${nn}.jpg`, DIR)) });
    await repo.assetPut({ id: ids.t, name: `agenda2027-pagina-${nn}-miniatura.jpg`, type: 'image/jpeg', data: await fs.readFile(new URL(`t${nn}.jpg`, DIR)) });
    pic[n] = ids;
  }
  const now = new Date().toISOString(), cats = await repo.docList('miolocats'), mods = await repo.docList('miolos'), catId = {};
  for (const c of CATEGORIAS) {
    const found = cats.find(r => String(r.data?.nome || '').toLowerCase() === c.nome.toLowerCase());
    catId[c.chave] = found ? found.id : 'mc_' + c.chave + '_' + crypto.randomBytes(4).toString('hex');
    if (!found) await repo.docSet('miolocats', catId[c.chave], { nome: c.nome, desc: c.desc, img: null, ord: c.ord, on: true, at: now, updatedAt: now });
  }
  const criados = [];
  for (const [i, m] of MODELOS.entries()) {
    if (mods.some(r => String(r.data?.codigo || '').toUpperCase() === m.codigo)) continue;
    const paginas = [...FIXAS, ...m.proprias];
    await repo.docSet('miolos', 'mm_' + m.codigo.toLowerCase().replace(/-/g, '_'), {
      nome: m.nome, codigo: m.codigo, cat: catId[m.cat], desc: `${m.desc}\n\n${COMUM}`, ord: i + 1,
      cores: [{ nome: 'Rosé floral', hex: '#efcfc3', disp: true, imgs: [] }], tamanhos: [], anos: [{ ano: '2027' }], formatos: [], bloqueios: [],
      secoes: paginas.map(n => PAGINAS[n]), galeria: [...m.proprias, 3, 10, 1].map(n => pic[n]), paginas: paginas.map(n => pic[n]),
      demo: null, demoNome: '', producao: [], produtos: PRODUTOS, destaque: false, on: true, indisp: false, indispMsg: '', at: now, updatedAt: now });
    criados.push(m.codigo);
  }
  await repo.kvSet(ID, now);
  log.log?.(`[miolos] Agenda 2027 cadastrada: ${criados.join(', ') || 'nenhum modelo novo'}`);
  return { feito: true, criados };
}
