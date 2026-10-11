// Política de preços de outubro de 2026: produtos físicos com preço fixo (sem faixa), preço por quantidade
// e a categoria "Material pronto". Usado pelos produtos iniciais (banco novo) e pela migração única do banco em produção.

// Produtos físicos: preço base, opções (acréscimo) e pergunta de personalização.
// `antigo` é o nome que o produto e o item do Catálogo tinham antes, para achar o registro certo.
export const PRECOS_2026_10 = [
  { id: 'prd_planner', antigo: 'Planner personalizado', name: 'Planner personalizado', price: 59.9, pers: 'Nome na capa',
    vars: [{ nome: 'Capa', ops: [{ n: 'Capa dura', add: 0 }] }],
    desc: 'Planner com capa dura personalizada com o seu nome, divisórias e folhas para planejar a semana e o mês.',
    descAntiga: 'Planner em brochura com o seu nome na capa, divisórias e folhas para planejar a semana e o mês.' },
  { id: 'prd_agenda', antigo: 'Agenda personalizada', name: 'Agenda personalizada 2027', price: 59.9, pers: 'Nome na capa',
    vars: [{ nome: 'Capa', ops: [{ n: 'Capa dura', add: 0 }] }],
    desc: 'Agenda 2027 com capa dura personalizada com o seu nome, elástico e fita marcadora.',
    descAntiga: 'Agenda do ano com capa personalizada, elástico e fita marcadora.' },
  { id: 'prd_caderno', antigo: 'Caderno em brochura', name: 'Caderno personalizado', price: 42, pers: 'Nome na capa',
    vars: [{ nome: 'Miolo', ops: [{ n: 'Pautado', add: 0 }, { n: 'Caligrafia', add: 0 }] }],
    desc: 'Caderno com capa personalizada com o seu nome e acabamento artesanal. Escolha o miolo pautado ou de caligrafia.',
    descAntiga: 'Caderno em brochura com capa personalizada e acabamento artesanal.' },
  { id: 'prd_bloquinho', antigo: 'Bloquinho em brochura', name: 'Bloquinho personalizado', price: 18, pers: 'Nome na capa',
    vars: [{ nome: 'Capa', ops: [{ n: 'Capa simples + caneta', add: 0 }, { n: 'Capa dura', add: 17 }] }],
    tiers: [{ min: 10, price: 15 }],
    desc: 'Bloquinho de anotações com capa personalizada com o seu nome. Escolha capa simples com caneta ou capa dura. Ótimo para presentear.',
    descAntiga: 'Bloquinho de anotações com capa personalizada, ótimo para presentear.' },
  { id: 'prd_caderneta', antigo: 'Capa de caderneta de vacinação', name: 'Capa de caderneta de vacinação', price: 39.9, pers: 'Nome da criança',
    vars: [], desc: null, descAntiga: null },
];

// "Material pronto" (digital): fica desligado e sem preço até o Robert confirmar o valor no painel.
export const MATERIAL_PRONTO = [
  { id: 'prd_formacao_antirracista', name: 'Formação antirracista (Word + slides)', desc: 'Material pronto para formação: roteiro em Word e apresentação de slides sobre educação antirracista. Entrega digital.' },
  { id: 'prd_formacao_indigena', name: 'Formação indígena (Word + slides)', desc: 'Material pronto para formação: roteiro em Word e apresentação de slides sobre a temática indígena. Entrega digital.' },
].map((p, i) => ({ ...p, data: { name: p.name, cat: 'Material pronto', desc: p.desc, mode: 'compra', price: 0, min: 0, max: 0, imgs: ['/assets/produtos/slides.svg'], vars: [], pers: '', stock: null,
  peso: 1, c: 1, l: 1, a: 1, digital: true, on: false, vitrine: true, ord: 20 + i } }));

export const PRAZO_PAGAMENTO = 'A produção começa após a confirmação do pagamento via PIX ou do sinal de 50%.';
const ID = 'migracao:precos-2026-10';

// Migração única: vale só para os registros que existem e nunca mexe em pedidos.
export async function migratePrices(repo, slugify, log = console) {
  if (await repo.kvGet(ID)) return { feito: false };
  const now = new Date().toISOString(), resumo = [];
  for (const p of PRECOS_2026_10) {
    const d = await repo.docGet('products', p.id); if (!d) continue;
    const slug = slugify(p.name), antigos = [...new Set([...(Array.isArray(d.slugsAntigos) ? d.slugsAntigos : []), ...(d.slug && d.slug !== slug ? [d.slug] : [])])];
    await repo.docMerge('products', p.id, { name: p.name, slug, slugsAntigos: antigos, mode: 'compra', price: p.price, min: 0, max: 0, vars: p.vars, pers: p.pers, tiers: p.tiers || [], digital: false,
      ...(p.desc && (!d.desc || d.desc === p.descAntiga) ? { desc: p.desc } : {}), updatedAt: now });
    resumo.push(`${p.name}: R$ ${p.price.toFixed(2)}`);
  }
  // Catálogo (categoria 07): mesmo nome e mínimo = máximo = preço base, para não sobrar nenhuma faixa.
  const c07 = await repo.docGet('catalog', 'c07');
  if (c07 && Array.isArray(c07.items)) {
    const items = c07.items.map(i => { const p = PRECOS_2026_10.find(x => x.antigo === i?.name || x.name === i?.name); return p ? { ...i, name: p.name, min: p.price, max: p.price } : i; });
    for (const p of PRECOS_2026_10) if (!items.some(i => i?.name === p.name)) items.push({ name: p.name, min: p.price, max: p.price, on: true });
    await repo.docMerge('catalog', 'c07', { items, ...(c07.d === 'Produtos físicos em brochura, com capa personalizada e acabamento artesanal' ? { d: 'Produtos físicos com capa personalizada e acabamento artesanal. Preço fixo por unidade' } : {}) });
  }
  for (const m of MATERIAL_PRONTO) if (!await repo.docGet('products', m.id)) await repo.docSet('products', m.id, { ...m.data, slug: slugify(m.name), at: now, updatedAt: now });
  const store = await repo.docGet('settings', 'store');
  if (store && !String(store.prazo || '').includes('sinal de 50%')) await repo.docMerge('settings', 'store', { prazo: `${String(store.prazo || '').trim()} ${PRAZO_PAGAMENTO}`.trim() });
  await repo.kvSet(ID, now);
  log.log?.(`[preços] política de outubro aplicada: ${resumo.join('; ')}`);
  return { feito: true, resumo };
}
