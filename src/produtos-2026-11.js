// Produtos de pronta-entrega das artes de catálogo enviadas pela ESRO em 14/11/2026 (planners, agenda A5, cadernos,
// cadernos inteligentes, canetas, marca-textos, estojos e kits de Natal). Nome, preço e modelos vêm das artes.
// As fotos foram recortadas das próprias artes (site/assets/produtos/novembro/).
// Cadastro único no banco: cria só os produtos que ainda não existem (pelo id). Depois disso, tudo é editado no painel.

const ID = 'migracao:produtos-2026-11';
const IMG = (n) => `/assets/produtos/novembro/${n}.jpg`;
const op = (...ns) => ns.map(n => ({ n, add: 0 }));
// tamanho e peso aproximados para a caixa do frete (ajuste no painel se for usar o Melhor Envio)
const T = { caneta: [20, 16, 4, 2], kitCaneta: [120, 20, 12, 3], marca: [80, 15, 10, 3], estojo: [180, 24, 10, 6], caderno: [300, 22, 16, 2], inteligente: [450, 25, 20, 3], planner: [250, 20, 18, 2], kit: [200, 25, 18, 3] };

const P = (id, name, cat, price, imgs, desc, vars = [], t = 'caneta', ord = 50) => ({ id: 'prd_' + id, data: {
  name, cat, desc, mode: 'compra', price, min: 0, max: 0, imgs: imgs.map(IMG), vars, pers: '', stock: null,
  peso: T[t][0], c: T[t][1], l: T[t][2], a: T[t][3], digital: false, on: true, vitrine: true, ord } });

export const PRODUTOS_2026_11 = [
  // Natal
  P('kit_escolar_natal', 'Kit Escolar Natal / Ursinho / Coelhinho', 'Natal', 10, ['kit-escolar-natal-ursinho-coelhinho'],
    'Kit escolar temático, ideal para presentear. Escolha o tema: Natal, Ursinho ou Coelhinho.', [{ nome: 'Tema', ops: op('Natal', 'Ursinho', 'Coelhinho') }], 'kit', -2),
  P('kit_escolar_natal_12', 'Kit Escolar de Natal 12 peças', 'Natal', 22, ['kit-escolar-de-natal-12-pecas'],
    'Kit escolar de Natal com 12 peças, prático e completo. Ideal para presentear.', [], 'kit', -1),
  // Planners e agendas
  P('planner_espiral_gatinho', 'Planner Espiral Gatinho', 'Planners', 20, ['planner-espiral-gatinho'],
    'Planner semanal com espiral e capa de gatinhos.', [{ nome: 'Capa', ops: op('Rosa', 'Preta', 'Verde-água', 'Lilás') }], 'planner', 30),
  P('caderno_planejamento_diario', 'Caderno de Planejamento Diário', 'Planners', 20, ['caderno-planejamento-diario'],
    'Caderno com espiral e páginas de planejamento diário. Capas em cores variadas.', [], 'planner', 31),
  P('planner_semanal_modelo_1', 'Planner Semanal Modelo 1', 'Planners', 20, ['planner-semanal-modelo-1'],
    'Planner semanal de mesa com espiral: prioridades, tarefas e um quadro para cada dia da semana.', [], 'planner', 32),
  P('agenda_a5_80_folhas', 'Agenda A5 com 80 folhas', 'Agendas', 12, ['agenda-a5-80-folhas', 'agenda-a5-80-folhas-lisas', 'agenda-a5-80-folhas-coracoes'],
    'Agenda formato A5 (14,8 x 21 cm), 80 folhas pautadas e elástico. Disponível em cores lisas e estampas Corações.',
    [{ nome: 'Cor', ops: op('Creme', 'Vinho', 'Azul-claro', 'Rosa', 'Roxo', 'Preta', 'Azul-marinho', 'Corações cinza', 'Corações pink', 'Corações azul', 'Corações amarelo') }], 'caderno', 33),
  // Cadernos
  P('caderno_espiral_capivara', 'Caderno Espiral Capivara', 'Cadernos', 15, ['caderno-espiral-capivara'],
    'Caderno espiral tamanho A5 com 60 folhas e capa de capivara.', [{ nome: 'Capa', ops: op('Lilás com melancia', 'Lilás com flores', 'Amarela', 'Rosa') }], 'caderno', 40),
  P('kit_4_cadernos_pequenos', 'Kit 4 Cadernos Pequenos', 'Cadernos', 20, ['kit-4-cadernos-pequenos', 'kit4-glam-girl', 'kit4-espiral-pandas', 'kit4-menina'],
    'Kit com 4 cadernos pequenos (formato mini) com encadernação espiral e 4 capas diferentes. Ideal para presentear, estudar e organizar.',
    [{ nome: 'Kit', ops: op('Glam Girl', 'Espiral Pandas', 'Menina') }], 'kit', 41),
  // Cadernos inteligentes
  P('caderno_inteligente_8_discos', 'Caderno Inteligente 8 discos', 'Cadernos inteligentes', 25, ['ci8-capivara', 'ci8-borboletas', 'ci8-flores', 'ci8-pontinhos', 'ci8-marmore', 'caderno-inteligente-8-discos'],
    'Caderno inteligente com 8 discos reposicionáveis, folhas removíveis e capa resistente. Cada estampa tem modelos variados.',
    [{ nome: 'Estampa', ops: op('Capivara', 'Borboletas A5', 'Flores', 'Pontinhos', 'Desenhos Holográficos', 'Purpurinado', 'Mármore') }], 'inteligente', 45),
  P('caderno_inteligente_10_discos', 'Caderno Inteligente 10 discos', 'Cadernos inteligentes', 35, ['ci10-coracoes', 'ci10-glitter-zigzag', 'ci10-estrelas', 'ci10-capa-colorida-b5', 'ci10-liso-com-regua', 'caderno-inteligente-10-discos'],
    'Caderno inteligente com 10 discos reposicionáveis e folhas trocáveis. Versátil para estudo, trabalho e planejamento.',
    [{ nome: 'Modelo', ops: op('Corações', 'Glitter ZigZag', 'Estrelas', 'Capa Colorida B5', 'Liso com Régua', 'Degradê (capa courino)', 'Coloridos Estrelas B5', 'Corações B5') }], 'inteligente', 46),
  P('caderno_inteligente_11_discos', 'Caderno Inteligente 11 discos', 'Cadernos inteligentes', 45, ['ci11-flores', 'ci11-grade-de-flores', 'ci11-borboletas-a4', 'ci11-galvanizados-marmore', 'caderno-inteligente-11-discos'],
    'Caderno inteligente com 11 discos reposicionáveis e folhas trocáveis. Versátil para estudo, trabalho e planejamento.',
    [{ nome: 'Modelo', ops: op('Flores', 'Grade de Flores', 'Borboletas A4', 'Galvanizados Mármore') }], 'inteligente', 47),
  // Canetas
  P('caneta_topo_gato', 'Caneta Topo de Gato e Pata de Gato', 'Canetas', 8, ['caneta-topo-gato-pata'], 'Caneta com topo de gatinho ou patinha. Preço por unidade.', [], 'caneta', 60),
  P('caneta_coroa_real', 'Caneta Esferográfica Coroa Real', 'Canetas', 8, ['caneta-coroa-real'], 'Caneta esferográfica com topo de coroa. Preço por unidade.', [], 'caneta', 61),
  P('caneta_laco_dos_sonhos', 'Caneta Esferográfica Laço dos Sonhos', 'Canetas', 8, ['caneta-laco-dos-sonhos'], 'Caneta esferográfica com laço no topo. Preço por unidade.', [], 'caneta', 62),
  P('caneta_unicornio_arco_iris', 'Caneta Ponta Unicórnio Arco-Íris', 'Canetas', 8, ['caneta-ponta-unicornio-arco-iris'], 'Caneta com topo de unicórnio e corpo arco-íris. Preço por unidade.', [], 'caneta', 63),
  P('caneta_10_cores_ursinho', 'Caneta 10 Cores Ursinho', 'Canetas', 12, ['caneta-10-cores-ursinho'], 'Caneta com 10 cores e topo de ursinho. Preço por unidade.', [], 'caneta', 64),
  P('caneta_capivara_toucas', 'Caneta Fofa de Capivara com Toucas', 'Canetas', 12, ['caneta-capivara-toucas'], 'Caneta com topo de capivara de touca. Preço por unidade.', [], 'caneta', 65),
  P('caneta_10_cores_panda', 'Caneta 10 Cores Panda Cute', 'Canetas', 12, ['caneta-10-cores-panda-cute'], 'Caneta com 10 cores e topo de panda. Preço por unidade.', [], 'caneta', 66),
  P('caneta_gel_10_cores_unicornio', 'Caneta de Gel 10 Cores Unicórnio', 'Canetas', 12, ['caneta-gel-10-cores-unicornio'], 'Caneta de gel com 10 cores e topo de unicórnio. Preço por unidade.', [], 'caneta', 67),
  P('caneta_press_bolinha', 'Caneta Press com Bolinha Colorida', 'Canetas', 8, ['caneta-press-bolinha-colorida'], 'Caneta retrátil com bolinha colorida no topo. Preço por unidade.', [], 'caneta', 68),
  P('kit_10_canetas_cis', 'Kit 10 Canetas CIS Next Colors', 'Canetas', 8, ['kit-10-canetas-cis-next-colors'], 'Kit com 10 canetas coloridas CIS Next Colors.', [], 'kitCaneta', 69),
  P('kit_12_canetas_pastel_neon', 'Kit 12 Canetas Pastel Neon', 'Canetas', 6, ['kit-12-canetas-pastel-neon'], 'Kit com 12 canetas em cores pastel e neon.', [], 'kitCaneta', 70),
  P('caneta_astronauta', 'Caneta Astronauta YJ-9001', 'Canetas', 8, ['caneta-astronauta-yj-9001'], 'Caneta com tema de astronauta. Preço por unidade.', [], 'caneta', 71),
  // Marca-textos
  P('marca_texto_mutic_colour', 'Marca-Texto Mutic Colour 24 cores', 'Marca-textos', 6, ['marca-texto-mutic-colour-24'], 'Kit de marca-texto Mutic Colour com 24 cores.', [], 'marca', 80),
  P('marca_texto_unicornio', 'Marca-Texto Unicórnio', 'Marca-textos', 8, ['marca-texto-unicornio'], 'Kit com 6 marca-textos de unicórnio em casquinha.', [], 'marca', 81),
  P('marca_texto_apagavel_wen_zhou', 'Marca-Texto Apagável Wen Zhou', 'Marca-textos', 6, ['marca-texto-apagavel-wen-zhou'], 'Marca-texto apagável Wen Zhou. Preço por unidade.', [], 'marca', 82),
  P('marca_texto_coelho_fluorescente', 'Marca-Texto Coelho Fluorescente', 'Marca-textos', 25, ['marca-texto-coelho-fluorescente'], 'Kit de marca-texto fluorescente de coelhinho com 6 cores.', [], 'marca', 83),
  P('marca_texto_pandinhas', 'Marca-Texto Pandinhas', 'Marca-textos', 8, ['marca-texto-pandinhas'], 'Kit com 6 marca-textos de pandinhas em casquinha.', [], 'marca', 84),
  P('marca_texto_pata_de_gato', 'Marca-Texto Pata de Gato', 'Marca-textos', 8, ['marca-texto-pata-de-gato'], 'Kit de marca-texto pata de gato com 6 cores.', [], 'marca', 85),
  P('marca_texto_capivara', 'Marca-Texto Capivara', 'Marca-textos', 8, ['marca-texto-capivara'], 'Kit com 6 marca-textos de capivara em casquinha.', [], 'marca', 86),
  P('marca_texto_cervos_fofos', 'Marca-Texto Cervos Fofos', 'Marca-textos', 30, ['marca-texto-cervos-fofos'], 'Kit de marca-texto de cervos com 6 cores e estojo.', [], 'marca', 87),
  P('marca_texto_ursinho_boow', 'Marca-Texto Ursinho Boow', 'Marca-textos', 8, ['marca-texto-ursinho-boow'], 'Marca-texto fluorescente Ursinho Boow. Preço por unidade.', [], 'marca', 88),
  P('marca_texto_capivara_carinha', 'Marca-Texto Capivara com Carinha', 'Marca-textos', 8, ['marca-texto-capivara-carinha'], 'Kit de marca-texto capivara com carinha, 6 cores.', [], 'marca', 89),
  P('marca_texto_dinossauros', 'Marca-Texto Dinossauros', 'Marca-textos', 8, ['marca-texto-dinossauros'], 'Kit com 6 marca-textos de dinossauros em casquinha.', [], 'marca', 90),
  P('marca_texto_ponta_flor', 'Marca-Texto Ponta Flor', 'Marca-textos', 8, ['marca-texto-ponta-flor'], 'Marca-texto com florzinha no topo. Preço por unidade.', [], 'marca', 91),
  // Estojos
  P('estojo_grade', 'Estojo Grade', 'Estojos', 20, ['estojo-grade'], 'Estojo xadrez com laço.', [{ nome: 'Cor', ops: op('Preto', 'Verde', 'Marrom') }], 'estojo', 100),
  P('estojo_lacre_adesivo', 'Estojo Lacre Adesivo', 'Estojos', 25, ['estojo-lacre-adesivo'], 'Estojo com fechamento em lacre adesivo.', [{ nome: 'Cor', ops: op('Azul', 'Lilás', 'Preto', 'Rosa') }], 'estojo', 101),
  P('estojo_mi', 'Estojo Mi', 'Estojos', 35, ['estojo-mi'], 'Estojo com zíper e etiqueta bordada.', [{ nome: 'Cor', ops: op('Lilás', 'Pêssego', 'Rosa') }], 'estojo', 102),
  P('estojo_monster', 'Estojo Monster', 'Estojos', 40, ['estojo-monster'], 'Estojo com ursinho de pelúcia na frente.', [{ nome: 'Cor', ops: op('Roxo', 'Azul-claro', 'Azul-petróleo') }], 'estojo', 103),
  P('estojo_coelho', 'Estojo de Coelho', 'Estojos', 40, ['estojo-coelho'], 'Estojo com coelhinho de pelúcia e visor transparente.', [{ nome: 'Cor', ops: op('Rosa', 'Verde-água', 'Lilás') }], 'estojo', 104),
  P('estojo_escolar_grande', 'Estojo Escolar Grande', 'Estojos', 25, ['estojo-escolar-grande'], 'Estojo escolar grande estampado.', [{ nome: 'Estampa', ops: op('Gatinho', 'Espaço', 'Unicórnio', 'Dino') }], 'estojo', 105),
  P('estojo_escolar_3_ziperes', 'Estojo Escolar 3 Zíperes Estampado', 'Estojos', 30, ['estojo-escolar-3-ziperes'], 'Estojo escolar com 3 zíperes.', [{ nome: 'Cor', ops: op('Verde-água', 'Lilás', 'Rosa', 'Azul') }], 'estojo', 106),
  P('estojo_escolar_cor_lisa', 'Estojo Escolar Cor Lisa', 'Estojos', 10, ['estojo-escolar-cor-lisa'], 'Estojo escolar cilíndrico de cor lisa (21 x 3 x 3 cm).', [{ nome: 'Cor', ops: op('Cinza', 'Preto', 'Vermelho', 'Azul-marinho', 'Verde-oliva', 'Azul') }], 'estojo', 107),
];

export async function importProdutos2026_11(repo, slugify, log = console) {
  if (await repo.kvGet(ID)) return { feito: false };
  const now = new Date().toISOString(), criados = [];
  for (const p of PRODUTOS_2026_11) {
    if (await repo.docGet('products', p.id)) continue;
    await repo.docSet('products', p.id, { ...p.data, slug: slugify(p.data.name), at: now, updatedAt: now });
    criados.push(p.data.name);
  }
  await repo.kvSet(ID, now);
  log.log?.(`[produtos] novembro: ${criados.length} produto(s) cadastrado(s)`);
  return { feito: true, criados };
}
