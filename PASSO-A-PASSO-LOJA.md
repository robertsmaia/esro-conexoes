# ESRO — Loja online: passo a passo de cada recurso (versão 1.4)

Este guia mostra como usar cada recurso novo do site e do painel. Está na ordem em que vale a pena fazer.

**O que já funciona assim que a versão 1.4 for publicada, sem cadastrar nada em outro lugar:** produtos com foto e variações, compra direta com PIX, cupons, promoções, frete por tabela de CEP, retirada, acompanhamento do pedido, rastreio, nota fiscal no pedido, vários usuários no painel, lista de produtos para Instagram/Google e anotação de seguidores de outras redes.

**O que precisa de uma conta em outro serviço (todos opcionais):** e-mails automáticos (Brevo), pagamento com cartão e confirmação automática (Mercado Pago) e frete por transportadora (Melhor Envio).

| Recurso | Onde fica no painel | Precisa de conta fora? |
|---|---|---|
| 1. Produtos com foto, variações e compra direta | Loja online → Produtos | Não |
| 2. Cupons e promoções | Loja online → Cupons / Produtos | Não |
| 3. Frete por CEP | Loja online → Entrega e avisos | Só para transportadora (Melhor Envio) |
| 4. Pagamento | Configurações (PIX) / Loja online → Integrações | Só para cartão (Mercado Pago) |
| 5. E-mails automáticos | Loja online → Integrações | Sim (Brevo, gratuito) |
| 6. Vários usuários | Configurações → Usuários do painel | Não |
| 7. Rastreio e nota fiscal | Pedidos → abrir o pedido | Nota: emissor de notas |
| 8. Canais de venda | Loja online → Integrações | Conta na Meta / Google |
| 9. Outras redes sociais | Monitoramento → Outras redes | Não |

---

## 0. Antes de tudo: publicar a versão 1.4

1. Abra o GitHub no repositório `esro-conexoes` → **Add file → Upload files**.
2. Envie o arquivo **`esro-pacote.tgz`** que está na pasta `Site Esro` do computador e clique em **Commit changes**.
3. Espere um minuto (a rotina de desempacotar coloca os arquivos no lugar).
4. No Render, abra o serviço `esro-conexoes` → **Manual Deploy → Deploy latest commit**.
5. Quando o deploy terminar, abra `https://www.esro-papelaria.com.br/painel`. Deve aparecer o menu novo **Loja online**.

**Recomendado (2 minutos):** no Render → **Environment → Add Environment Variable**, crie `PUBLIC_URL` com o valor `https://www.esro-papelaria.com.br` e salve. Assim os links dos e-mails e o retorno do pagamento usam sempre o endereço certo.

> Na primeira vez, os oito produtos ilustrados da vitrine viram produtos da **Loja online**, todos como "Sob orçamento". Nada muda para o cliente até você ligar a compra direta em algum produto.

---

## 1. Produtos com foto, variações e compra direta

### Cadastrar um produto
1. No painel, abra **Loja online → Produtos → Novo produto**.
2. Preencha o **Nome**, a **Categoria** (a etiqueta que aparece acima do nome, como "Organização") e a **Descrição**.
3. Em **Como é vendido**, escolha:
   - **Compra direta (preço fixo):** o cliente coloca no carrinho, paga e pronto.
   - **Sob orçamento:** o item entra no pedido de orçamento, como hoje.
4. Em compra direta, informe o **Preço**.
5. Em **Fotos**, clique em **Enviar fotos** (JPG, PNG ou WebP, até 6). A primeira é a principal. O formato ideal é deitado, 5 por 4 (por exemplo 1500 × 1200). Fotos grandes são reduzidas sozinhas.
6. Clique em **Cadastrar produto**. Em até um minuto ele aparece no site.

### Variações (opções que o cliente escolhe)
1. No cadastro do produto, em **Opções que o cliente escolhe**, dê um nome ao grupo. Exemplo: `Tamanho`.
2. No campo **Opções**, escreva as opções separadas por ponto e vírgula. Exemplo: `A5; A4 +15`.
   - O `+15` soma R$ 15,00 ao preço quando o cliente escolhe aquela opção.
3. Há espaço para três grupos (por exemplo Tamanho, Miolo e Cor da capa).

### Personalização (nome na capa)
- No campo **Personalização: pergunta para o cliente**, escreva a pergunta. Exemplo: `Nome para a capa`.
- O site só deixa comprar depois que o cliente responde. A resposta aparece no pedido, em **Compra pelo site** e nas observações.
- Deixe o campo vazio em produtos que não são personalizados.

### Estoque
- Para produto feito sob encomenda, deixe **Controlar estoque** desmarcado.
- Para pronta entrega, marque **Controlar estoque** e informe a quantidade. Cada compra desconta sozinha; ao zerar, o site mostra "Esgotado" e não vende.
- Se a compra não for paga em 48 horas, o estoque reservado volta sozinho (o pedido ganha um aviso nas observações). Excluir um pedido não pago também devolve o estoque.

### Outras opções do produto
- **Produto digital (sem frete):** para PDFs e artes. O site não pede CEP.
- **Peso e medidas:** do pacote já embalado. São usados no frete por transportadora.
- **Ativo no site / Mostrar na página inicial / Ordem na vitrine:** controlam onde e em que ordem o produto aparece. Na lista, o interruptor **No site / Oculto** liga e desliga na hora.

### Passar um produto da vitrine para compra direta
1. **Loja online → Produtos →** clique em **Editar** no produto (por exemplo "Bloquinho em brochura").
2. Troque **Como é vendido** para **Compra direta**, informe o preço e salve.

> **Produto sob orçamento com o mesmo nome de um item do Catálogo & Serviços** segue o Catálogo: vale a faixa de preço de lá e, se o item for ocultado no Catálogo, o produto também sai do site.

**Como conferir:** abra o site, clique no produto e veja a página dele (`/produto/nome-do-produto`), com fotos, opções e o botão **Adicionar ao pedido**.

---

## 2. Cupons e promoções

### Criar um cupom
1. **Loja online → Cupons → Novo cupom**.
2. Escreva o **Código** (por exemplo `BEMVINDA10`).
3. Escolha o **Tipo**: porcentagem, valor fixo em reais ou frete grátis.
4. Se quiser, defina **compra mínima**, **datas de validade** e **limite de usos**.
5. Salve. O cliente digita o código na finalização da compra.

- O interruptor **Ativo / Desligado** pausa o cupom sem apagar.
- A lista mostra quantas vezes cada cupom foi usado.

### Promoção (de/por) em um produto
1. **Loja online → Produtos → Editar**.
2. Preencha **Preço promocional** e, se quiser, **Promoção vale até**.
3. O site mostra o preço antigo riscado, o preço novo e a etiqueta "Oferta". Na data final a promoção acaba sozinha.

### Frete grátis acima de um valor
- **Loja online → Entrega e avisos → Frete grátis a partir de (R$)**. Vale para a opção de entrega mais barata do CEP do cliente.

---

## 3. Frete por CEP

Tudo em **Loja online → Entrega e avisos**. Clique em **Salvar entrega e avisos** no fim.

### Retirada
1. Marque **Oferecer retirada com a ESRO**.
2. Escreva o texto que o cliente vê (região e como combinar). Exemplo: `Zona Leste de São Paulo, com hora marcada`.

### Tabela por faixa de CEP (entrega própria ou motoboy)
1. Clique em **Adicionar faixa**.
2. Preencha **Nome** (o cliente vê), **CEP inicial**, **CEP final**, **Valor** e **Prazo**.
   - Exemplo: `Entrega ESRO (São Paulo capital)`, de `01000-000` até `05999-999`, R$ 15,00, `até 3 dias úteis`.
3. Repita para cada região.

### Quando não houver opção para o CEP
- Com **oferecer "entrega a combinar"** marcado, o cliente fecha o pedido e a ESRO combina o frete pelo WhatsApp. O total do pedido fica sem o frete até você ajustar o valor no pedido.

### Frete por transportadora (Melhor Envio) — opcional
Traz o valor e o prazo dos Correios e de transportadoras pelo CEP.
1. Crie a conta em `melhorenvio.com.br` e complete o cadastro.
2. No painel do Melhor Envio, gere um **token de acesso** com a permissão de **cálculo de fretes** (procure por **Integrações → Permissões de acesso → Gerar novo token**; os nomes dos menus podem mudar).
3. No Render → **Environment**, crie a variável `ME_TOKEN` e cole o token. **Quem cola o token é você**; ele não deve ser enviado por mensagem.
4. Faça **Manual Deploy**.
5. No painel da ESRO, preencha o **CEP de onde saem os pedidos** e o **Prazo de produção (dias)**, que é somado ao prazo da transportadora.
6. Confira o peso e as medidas de cada produto.

- Para testar antes, use um token do ambiente de testes do Melhor Envio e crie também `ME_SANDBOX` com o valor `1`. Para valer, troque pelo token de produção e apague `ME_SANDBOX`.
- O site só **calcula** o frete. A etiqueta de envio continua sendo comprada no site do Melhor Envio.

**Como conferir:** no site, coloque um produto no carrinho, clique em **Finalizar compra** e digite um CEP.

---

## 4. Pagamento

### PIX (já funciona)
1. Confira a chave em **Configurações → PIX** (tipo, chave, nome e cidade do recebedor).
2. Na compra, o cliente recebe o **QR Code** e o **código copia e cola** com o valor exato.
3. Quando o dinheiro cair, abra o pedido e mude **Situação do pagamento** para **Pago**. A página do cliente muda para "Pagamento confirmado" (e ele recebe um e-mail, se os e-mails estiverem ligados).

> Em **Configurações → PIX**, o tipo está como "CPF / CNPJ" e a chave tem 14 números (CNPJ). Funciona assim mesmo; só confira se a chave está certa.

### Cartão, PIX e boleto com confirmação automática (Mercado Pago) — opcional
1. Entre em `mercadopago.com.br/developers` com a conta da ESRO → **Suas integrações → Criar aplicação**. Escolha pagamentos online com **Checkout Pro**.
2. Na aplicação, abra **Credenciais de produção** e copie o **Access Token**.
3. No Render → **Environment**, crie `MP_ACCESS_TOKEN` e cole o valor. **Quem cola é você.**
4. Faça **Manual Deploy**.
5. No painel da ESRO, abra **Loja online → Integrações** e copie o **Endereço para os avisos de pagamento**.
6. No Mercado Pago, na aplicação, abra **Webhooks → Configurar notificações → Modo produtivo**, cole o endereço, marque o evento **Pagamentos** e salve.
7. Faça uma compra de teste de valor baixo e pague.

- O cliente escolhe "Cartão, PIX ou boleto pelo Mercado Pago", paga no ambiente do Mercado Pago e volta para a página do pedido já como "Pagamento confirmado".
- O Mercado Pago cobra uma tarifa por venda; confira os valores na sua conta.
- **Assinatura dos avisos (`MP_WEBHOOK_SECRET`):** é opcional. Comece **sem** ela. O site nunca confia no aviso sozinho: ele sempre consulta o pagamento direto no Mercado Pago antes de marcar como pago. Se quiser ligar depois, copie a "chave secreta" que aparece ao salvar os webhooks, crie a variável e faça uma compra de teste; se a confirmação automática parar, apague a variável.
- Devolução ou contestação no Mercado Pago gera um alerta nas observações do pedido; o ajuste do pagamento é feito por você.

---

## 5. E-mails automáticos

O site envia: **pedido recebido** (cliente e loja), **pagamento confirmado**, **pedido enviado** (com o rastreio), **novo pedido de orçamento** (loja) e o link de **senha nova** quando o cliente esquece a senha.

### Ligar com a Brevo (gratuito até 300 e-mails por dia)
1. Crie a conta em `brevo.com`.
2. Em **Configurações → Remetentes, domínios e IPs**, adicione o remetente (por exemplo `contato@esro-papelaria.com.br`) e confirme o e-mail.
3. **Recomendado:** na mesma tela, em **Domínios**, autentique `esro-papelaria.com.br`. A Brevo mostra de 3 a 4 registros (verificação, DKIM e DMARC) para criar no **registro.br → DNS**. Sem isso, a Brevo troca o remetente por um endereço dela e os e-mails caem mais no spam. Com endereço `@gmail.com` como remetente acontece o mesmo.
4. Em **Configurações → SMTP e API → Chaves de API**, gere uma chave.
5. No Render → **Environment**, crie:
   - `EMAIL_PROVIDER` = `brevo`
   - `EMAIL_API_KEY` = a chave (quem cola é você)
   - `EMAIL_FROM` = `ESRO Papelaria <contato@esro-papelaria.com.br>` (o remetente confirmado)
   - `EMAIL_OWNER` = o e-mail onde a loja recebe os avisos (por exemplo `esro.papelaria@gmail.com`)
6. Faça **Manual Deploy**.
7. No painel, abra **Loja online → Integrações** e clique em **Enviar e-mail de teste**. Olhe também a caixa de spam.

- Em **Loja online → Entrega e avisos** você liga e desliga os avisos de "pagamento confirmado" e "pedido enviado".
- Cada aviso é enviado uma única vez por pedido.
- Com os e-mails ligados, o "Esqueci minha senha" do site passa a mandar o link por e-mail. Sem eles, continua pelo WhatsApp, como hoje.
- Também funciona com a Resend: `EMAIL_PROVIDER` = `resend`.

---

## 6. Vários usuários no painel

1. Entre no painel com a senha principal (deixe o campo **Usuário** vazio).
2. **Configurações → Usuários do painel → Novo usuário**.
3. Preencha o **Nome**, o **Usuário** (por exemplo `ana.atendimento`), o **Nível** e uma **Senha inicial** com pelo menos 10 caracteres. Quem digita a senha é você ou a própria pessoa.
4. Clique em **Criar usuário**. A pessoa entra em `/painel` com usuário e senha.

| Nível | O que vê e faz |
|---|---|
| Administrador | Tudo, inclusive configurações, loja e usuários |
| Atendimento | Pedidos, clientes, conversas e arquivos. Não vê o caixa nem altera configurações |
| Produção | Pedidos, arquivos de arte e estoque. Não vê o caixa nem as conversas |
| Financeiro | Pedidos, caixa, contas e relatórios. Não altera produtos nem configurações |

- **Trocar o nível:** escolha na lista ao lado do nome. A pessoa precisa entrar de novo.
- **Bloquear:** desligue o interruptor **Ativo**. A sessão dela cai na hora.
- **Senha esquecida:** clique em **Nova senha**.
- Cada pessoa troca a própria senha em **Configurações → Meu acesso**.
- A senha principal continua sendo a da dona. Ela é trocada no Render, em `PAINEL_SENHA`; trocar desconecta todo mundo.
- O **Registro de atividades** guarda quem fez cada exclusão ou mudança de configuração.

---

## 7. Rastreio e nota fiscal

### Rastreio
1. Abra o pedido em **Pedidos**.
2. Em **Envio e nota fiscal**, preencha o **Código de rastreio** e, se tiver, o **Link para rastrear** (precisa começar com `https://`).
3. Mude o **Status** para **Enviado** e salve.
4. O cliente vê o código na página do pedido e recebe o e-mail "Seu pedido foi enviado" (se os e-mails estiverem ligados).

- **Link de acompanhamento:** no mesmo quadro, clique em **Copiar** para enviar o link do pedido pelo WhatsApp. Pedidos registrados à mão no painel ganham esse link depois do primeiro aviso por e-mail.

### Nota fiscal
O painel **não emite** a nota: ele guarda o número e o link para o cliente baixar.
1. Emita a nota no seu emissor:
   - **Serviços** (assessoria, materiais digitais): NFS-e, pelo Emissor Nacional (`gov.br/nfse`) ou pelo sistema da prefeitura.
   - **Produtos físicos:** NF-e, pelo sistema da Secretaria da Fazenda do estado ou por um programa emissor.
   - Se a ESRO for MEI, a nota é obrigatória nas vendas para empresas e, para pessoa física, quando o cliente pedir. **Confirme com a sua contabilidade** qual nota vale para cada caso.
2. No pedido, preencha **Nº da nota fiscal** e, se tiver o PDF em um endereço na internet, o **Link da nota fiscal**.
3. Salve. O cliente vê a nota na página do pedido.

- O site não pede CPF na compra. Se o cliente quiser nota com CPF, peça o número pelo WhatsApp.

---

## 8. Canais de venda

### Instagram e Facebook (loja no perfil)
1. Cadastre produtos de **compra direta** com **foto** (ilustração em SVG não é aceita pela Meta).
2. No painel, abra **Loja online → Integrações → Canais de venda** e copie a **Lista de produtos (feed)**.
3. No **Gerenciador de Comércio** da Meta (`business.facebook.com/commerce`), crie um catálogo → **Fontes de dados → Feed de dados → Feed programado**, cole o endereço e escolha atualização diária.
4. Depois que a Meta aprovar a loja, marque os produtos nas publicações. O botão leva para a página do produto no site.

### Google (aba Shopping, anúncios gratuitos)
1. Crie a conta no **Google Merchant Center** e confirme o site.
2. Em **Produtos → Feeds**, adicione um feed programado com o mesmo endereço da lista de produtos.
3. Em **Search Console**, envie o **Mapa do site** (o endereço também está em Integrações).

### Mercado Livre, Shopee e vendas presenciais
- **Não há ligação automática** com esses marketplaces. O anúncio e o estoque de lá são cuidados no próprio marketplace.
- Para o painel somar essas vendas: **Pedidos → Novo pedido** e escolha o **Canal** "Mercado Livre", "Shopee" ou "Presencial / feira". Assim o pedido entra no caixa, na produção e nos relatórios.

---

## 9. Outras redes sociais

O Instagram é lido sozinho. Facebook, TikTok, YouTube, Pinterest e Canal do WhatsApp são anotados à mão:
1. **Monitoramento → Outras redes**.
2. Escolha a rede, escreva o número de seguidores de hoje e clique em **Anotar**.
3. Repita de tempos em tempos (por exemplo toda segunda). O painel mostra o último número e a variação no período.

---

## 10. Como fica para o cliente

1. Na vitrine, ele clica no produto, escolhe as opções e clica em **Adicionar ao pedido** ou **Comprar agora**.
2. Em **Finalizar compra**, informa nome, WhatsApp e e-mail (ou entra na conta), digita o CEP, escolhe a entrega, aplica o cupom e escolhe o pagamento.
3. Ao clicar em **Fazer o pedido**, vai para a **página do pedido**, com o PIX (ou o Mercado Pago), os itens e a entrega.
4. O pedido aparece no painel em **Pedidos**, como **Novo**, com o quadro **Compra pelo site**.
5. Você confirma o pagamento, produz, marca como **Enviado** e o cliente acompanha tudo pela mesma página ou em **Minha conta**.

- Se o carrinho tiver **algum item sob orçamento**, o pedido inteiro segue como pedido de orçamento (o site avisa).
- O monitoramento passou a mostrar o caminho completo: visitas → carrinho → finalização → compra.

### Roteiro de teste depois de publicar
1. Cadastre um produto de teste de R$ 1,00 com estoque 2.
2. Compre pelo celular, com PIX. Confira o pedido no painel e o estoque.
3. Marque como **Pago** e depois **Enviado** com um código de rastreio. Confira a página do pedido.
4. Exclua o pedido e o produto de teste.

---

## 11. Antes de divulgar: o que revisar

- **Página "Entregas, trocas e devoluções"** (`/entregas`): o texto é um modelo. Leia e ajuste prazos e condições ao que a ESRO pratica (o arquivo é `site/entregas.html`).
- **Política de Privacidade** (`/privacidade`): foi atualizada para citar a compra pelo site, o Mercado Pago, o Melhor Envio e o serviço de e-mails. Se não for usar algum deles, pode manter.
- **Endereço do site nas Configurações:** em **Configurações → Mensagens e prazos → Endereço do site**, troque o endereço antigo por `https://www.esro-papelaria.com.br/`.

## 12. O que foi testado e o que ainda não

- **Testado aqui, em um servidor de teste:** todo o caminho da compra (computador e celular), cálculo de preços, cupons, estoque, PIX, acompanhamento, painel (Loja, pedido, usuários e níveis), e-mails, frete e Mercado Pago **com respostas simuladas** desses serviços.
- **Ainda não testado com as contas de verdade:** Brevo, Mercado Pago e Melhor Envio. Por isso, depois de ligar cada um, faça o teste indicado na seção dele. A conferência da assinatura do Mercado Pago (`MP_WEBHOOK_SECRET`) é o ponto com mais chance de precisar de ajuste.
- **Não faz:** emissão de nota fiscal, compra de etiqueta de envio, integração automática com Mercado Livre e Shopee, leitura automática de Facebook e TikTok, parcelamento próprio (o parcelamento é o do Mercado Pago).

## Variáveis do Render (todas opcionais)

| Variável | Para quê | Exemplo |
|---|---|---|
| `PUBLIC_URL` | Endereço do site nos e-mails e no retorno do pagamento | `https://www.esro-papelaria.com.br` |
| `EMAIL_PROVIDER` | Serviço de e-mail | `brevo` |
| `EMAIL_API_KEY` | Chave do serviço de e-mail | (você cola) |
| `EMAIL_FROM` | Remetente | `ESRO Papelaria <contato@esro-papelaria.com.br>` |
| `EMAIL_OWNER` | Onde a loja recebe os avisos | `esro.papelaria@gmail.com` |
| `MP_ACCESS_TOKEN` | Mercado Pago (pagamento online) | (você cola) |
| `MP_WEBHOOK_SECRET` | Assinatura dos avisos do Mercado Pago | (você cola; opcional) |
| `ME_TOKEN` | Melhor Envio (frete por transportadora) | (você cola) |
| `ME_SANDBOX` | `1` enquanto usar o ambiente de testes do Melhor Envio | `1` |

Depois de criar ou mudar uma variável, faça **Manual Deploy → Deploy latest commit**.
