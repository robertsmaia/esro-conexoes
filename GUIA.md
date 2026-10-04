# ESRO Conexões — guia de instalação

Este servidor liga o painel da ESRO ao **WhatsApp (11) 99248-1676**, ao **Instagram Direct @esro.papelaria** e aos **pedidos do site**.
Ele recebe as mensagens da Meta, guarda tudo num banco Postgres e responde pelo painel.

```
Cliente ── WhatsApp / Instagram ──► Meta ──(webhook)──► ESRO Conexões (Render) ──► banco (Supabase)
                                                              ▲
Painel ESRO (claude.ai) ──── conector "ESRO Conexões" ────────┘
```

Custo: Render e Supabase têm plano gratuito. No WhatsApp, responder quem escreveu para você é gratuito dentro de 24 h.
Um parceiro oficial do WhatsApp (se você usar um) cobra mensalidade; confira no site dele.

---

## 1. Banco de dados (Supabase) — 5 min

1. Crie uma conta em <https://supabase.com> e clique em **New project**.
   - Região: **South America (São Paulo)**.
   - Anote a senha do banco.
2. Abra **Project Settings → Database → Connection string** e escolha **Session pooler**.
3. Copie a URL e troque `[YOUR-PASSWORD]` pela senha. Esse é o valor de `DATABASE_URL`.

As tabelas são criadas sozinhas quando o servidor liga pela primeira vez.

## 2. Código no GitHub — 5 min

O Render publica a partir de um repositório do GitHub.

1. Crie uma conta em <https://github.com> e depois um repositório **privado** chamado `esro-conexoes`.
2. Clique em **Add file → Upload files** e envie o conteúdo desta pasta.
   Não envie `node_modules` nem nenhum arquivo `.env`.

## 3. Servidor (Render) — 10 min

1. Crie uma conta em <https://render.com> e entre com o GitHub.
2. Vá em **New → Blueprint** e escolha o repositório `esro-conexoes`. O Render lê o arquivo `render.yaml`.
3. Ele vai pedir os valores das variáveis. Por enquanto preencha só `DATABASE_URL`; as da Meta você completa nos passos 5 e 6.
   `MCP_SECRET`, `WA_VERIFY_TOKEN`, `IG_VERIFY_TOKEN` e `SITE_WEBHOOK_TOKEN` são gerados automaticamente.
4. Quando terminar, abra o endereço do serviço (algo como `https://esro-conexoes.onrender.com`). Deve aparecer `{"ok":true,...}`.
5. Em **Environment**, copie o valor gerado de `MCP_SECRET`. Você vai usar no passo 4.

> O plano gratuito "dorme" após 15 min sem uso e leva até 1 minuto para acordar.
> A Meta reenvia as mensagens se ele demorar, então nada se perde.
> Para evitar a espera, crie um monitor gratuito em <https://uptimerobot.com> que acesse o endereço a cada 10 minutos.

## 4. Conector no Claude — 2 min

1. Em claude.ai, abra **Configurações → Conectores → Adicionar conector personalizado**.
2. Preencha:
   - **Nome:** `ESRO Conexões` (exatamente assim, com acento).
   - **URL:** `https://SEU-ENDERECO.onrender.com/mcp/SEU_MCP_SECRET`
3. Abra o painel ESRO, vá em **Inbox → Mensagens → Conectar mensagens** e permita o acesso.

> O `MCP_SECRET` é a chave de acesso às suas conversas: não compartilhe a URL do conector.
> Se ela vazar, gere outro valor no Render e atualize o conector.

## 5. WhatsApp no mesmo número do celular (coexistência)

Com a coexistência, o número continua funcionando no **app WhatsApp Business**, e as conversas também chegam ao painel.
Uma resposta dada pelo celular aparece no painel como "pelo celular".

**Antes de começar**
- Use o app **WhatsApp Business** na versão 2.24.17 ou mais nova.
- Abra o app no celular pelo menos **a cada 14 dias**; se ficar mais tempo sem abrir, a conexão cai.
- Depois de conectar, a Meta desliga no app as listas de transmissão, as mensagens temporárias e a visualização única.
- Os grupos continuam no celular, mas não vão para o painel.

A Meta só libera a coexistência pelo **Cadastro Incorporado (Embedded Signup)**, que é oferecido pelos parceiros oficiais do WhatsApp (BSP). Há dois caminhos:

### Caminho A — por um parceiro oficial (mais simples)

Escolha um parceiro que ofereça coexistência e use o formato da Cloud API.
A **360dialog** é um exemplo, e este servidor já fala com ela.

1. No painel do parceiro, conecte o número escolhendo a opção de **usar o app WhatsApp Business já existente**.
   O app vai mostrar um QR Code ou uma confirmação: siga até o fim. O histórico de até 6 meses pode ser importado nessa hora.
2. Gere a **API key** do número.
3. No Render (Environment), preencha:
   - `WA_MODE=360dialog`
   - `WA_TOKEN=` a API key
   - deixe `WA_APP_SECRET` e `WA_PHONE_NUMBER_ID` vazios.
4. Cadastre o webhook no parceiro com a URL `https://SEU-ENDERECO.onrender.com/webhooks/whatsapp`.
   Na 360dialog isso é feito com `POST https://waba-v2.360dialog.io/v1/configs/webhook` enviando `{"url": "…"}`; confirme na documentação deles.
5. Ative também o evento de **mensagens enviadas pelo app** (echoes / `smb_message_echoes`), para as respostas do celular aparecerem no painel.

### Caminho B — direto na Meta (se o seu app tiver acesso ao Cadastro Incorporado)

1. Em <https://developers.facebook.com> clique em **Criar app** (tipo *Empresa*) e adicione o produto **WhatsApp**.
2. Conecte o número pelo Cadastro Incorporado com a opção de coexistência.
3. Em **WhatsApp → Configuração da API**, copie o **Phone number ID** para `WA_PHONE_NUMBER_ID`.
4. No Gerenciador de Negócios, crie um **Usuário do sistema**:
   - Gere um token **permanente** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
   - Esse token vai em `WA_TOKEN`.
5. Em **Configurações do app → Básico**, copie a **Chave secreta do app** para `WA_APP_SECRET`.
6. Em **WhatsApp → Configuração → Webhook**:
   - URL: `https://SEU-ENDERECO.onrender.com/webhooks/whatsapp`
   - Verificar token: o valor de `WA_VERIFY_TOKEN`.
   - Assine os campos **messages** e **smb_message_echoes**.
7. Mantenha `WA_MODE=meta`.

**A regra das 24 h:** o WhatsApp só deixa responder livremente até 24 h depois da última mensagem do cliente.
Fora desse prazo, o painel mostra "Fora da janela de 24 h" e você responde pelo celular.

## 6. Instagram Direct

1. No app do Instagram, confirme que @esro.papelaria é uma **conta profissional** (Comercial ou Criador de conteúdo).
2. No app do Instagram, ative **Configurações → Mensagens e respostas a stories → Ferramentas conectadas → Permitir acesso a mensagens**.
3. No mesmo app da Meta do passo 5 (ou num novo), adicione o produto **Instagram → API com login do Instagram**.
4. Em **Gerar tokens de acesso**, adicione a conta @esro.papelaria e gere o token. Cole em `IG_TOKEN`.
   O servidor renova esse token sozinho a cada 7 dias.
5. Em **Configurações básicas do app do Instagram**, copie a **Chave secreta do app do Instagram** para `IG_APP_SECRET`.
6. Em **Configurar webhooks**:
   - URL: `https://SEU-ENDERECO.onrender.com/webhooks/instagram`
   - Verificar token: o valor de `IG_VERIFY_TOKEN`.
   - Assine o campo **messages**.
7. As permissões necessárias são `instagram_business_basic` e `instagram_business_manage_messages`.
   Como a conta é sua (você é administradora do app), o acesso padrão basta e não precisa de análise da Meta.

## 7. Pedidos do site

Quando uma compra for concluída, o checkout do site precisa enviar os dados do pedido para o servidor:

```
POST https://SEU-ENDERECO.onrender.com/webhooks/site
Cabeçalho: x-esro-token: (valor de SITE_WEBHOOK_TOKEN)
Content-Type: application/json

{
  "numero": "W1050",
  "cliente": { "nome": "Juliana Prado", "telefone": "11987124410", "cidade": "São Paulo/SP" },
  "itens": [ { "nome": "Planner personalizado", "qtd": 1, "valor": 78 } ],
  "total": 78,
  "pagamento": "pix",
  "status": "pago"
}
```

- Os pedidos aparecem em **Pedidos → Pedidos novos do site**, com o botão **Importar**.
- Se a plataforma do site não permite enviar webhooks, continue registrando os pedidos à mão no painel.

Para testar no PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri "https://SEU-ENDERECO.onrender.com/webhooks/site" `
  -Headers @{ "x-esro-token" = "SEU_SITE_WEBHOOK_TOKEN" } -ContentType "application/json" `
  -Body '{"numero":"TESTE1","cliente":{"nome":"Teste"},"itens":[{"nome":"Bloquinho em brochura","qtd":1,"valor":20}],"total":20}'
```

## 8. Conferindo se está tudo certo

1. Abra `https://SEU-ENDERECO.onrender.com/healthz`. Deve mostrar `"whatsapp": true` e `"instagram": true` depois dos passos 5 e 6.
2. Peça para alguém mandar "oi" no WhatsApp e no Direct. Em até 30 segundos a conversa aparece em **Inbox → Mensagens**.
3. Responda pelo painel e confira no celular do cliente.
4. Se algo não chegar, olhe os **Logs** do serviço no Render: as mensagens de erro estão em português.

## 9. Site e painel no seu domínio

O mesmo servidor entrega três coisas:

| Endereço | O que é |
|---|---|
| `https://www.esro-papelaria.com.br/` | o site da ESRO (pasta `site/`) |
| `https://www.esro-papelaria.com.br/painel` | o painel administrativo, com login por senha (pasta `painel/`) |
| `https://www.esro-papelaria.com.br/healthz` | resposta curta para conferir se o servidor está no ar |

### 9.1 Senha do painel
1. No Render, abra o serviço **esro-conexoes → Environment → Add Environment Variable**.
2. Nome: `PAINEL_SENHA`. Valor: uma senha com pelo menos 10 caracteres, que você não usa em nenhum outro lugar.
3. Salve e faça **Manual Deploy → Deploy latest commit**.

Trocar a senha (ou o `MCP_SECRET`) desconecta todos os aparelhos. Dez senhas erradas seguidas bloqueiam o endereço por 15 minutos.

### 9.2 Domínio do registro.br
1. No Render: **esro-conexoes → Settings → Custom Domains → Add Custom Domain**. Adicione `www.esro-papelaria.com.br` (o Render oferece incluir também `esro-papelaria.com.br`, que passa a redirecionar para o `www`).
2. No registro.br: entre na sua conta, clique no domínio e abra **DNS → Configurar zona DNS** (se o domínio usa outros servidores DNS, escolha antes **Utilizar os servidores DNS do Registro.br**; a mudança pode levar até 2 horas).
3. Em **Nova entrada**, crie:

   | Nome | Tipo | Valor |
   |---|---|---|
   | (em branco, o próprio domínio) | A | `216.24.57.1` |
   | `www` | CNAME | `esro-conexoes.onrender.com` |

   Se existir algum registro **AAAA** para o domínio, apague: a Render usa só IPv4.
4. Salve. De volta ao Render, clique em **Verify** em cada domínio. O certificado HTTPS é emitido sozinho em alguns minutos.

### 9.3 Trazer os dados que estão no painel do Claude
1. No painel antigo (claude.ai): **Configurações → Segurança → Backup completo → Baixar**.
2. No painel novo (`/painel`): **Configurações → Segurança → Backup completo → Restaurar** e escolha o arquivo.

Imagens anexadas aos pedidos não vão no backup; anexe de novo as que precisar.

### 9.4 Servidor sempre acordado
No plano gratuito o Render "dorme" depois de 15 minutos sem visitas, e a primeira visita seguinte demora até 1 minuto.
Para evitar isso, o repositório tem uma rotina do GitHub (`.github/workflows/manter-acordado.yml`) que visita `/healthz` a cada 10 minutos. Ela é gratuita e não precisa de conta nova.

- O GitHub às vezes atrasa essas rotinas; se o site ainda dormir de vez em quando, um monitor gratuito como <https://uptimerobot.com> em `https://www.esro-papelaria.com.br/healthz` a cada 5 minutos resolve.
- O GitHub desativa rotinas agendadas depois de 60 dias sem alteração no repositório e avisa por e-mail; basta clicar em **Enable workflow** na aba **Actions**.
- Para desligar, apague o arquivo.

### 9.4.1 Voltar o site para onde estava
Até outubro de 2026 o `www` apontava para a hospedagem anterior (`CNAME custom-domains.chatgpt.site`). Para desfazer a mudança, troque o valor do CNAME `www` no registro.br de volta para esse endereço.

### 9.5 Atualizar o site
As ilustrações dos produtos da vitrine ficam em `site/assets/produtos/` (uma por produto, em SVG). Para trocar uma delas por uma foto real, coloque a foto na mesma pasta e mude o endereço da imagem do produto em `site/index.html`.

Troque os arquivos da pasta `site/` no GitHub e faça um novo deploy. O site não pode ter `<script>` embutido na página nem eventos como `onclick="..."` no HTML: o código fica em `site/site.js`. Essa regra faz parte da proteção do servidor.

### 9.6 Contas de clientes (login e cadastro no site)
| Endereço | O que é |
|---|---|
| `/entrar` | tela de entrar e de criar conta (o botão **Entrar** fica no topo do site) |
| `/conta` | "Minha conta": pedidos do cliente, dados, troca de senha e exclusão da conta |
| `/privacidade` | Política de Privacidade (o cadastro exige o aceite) |

- **Cadastro:** nome, e-mail, WhatsApp e senha (mínimo de 8 caracteres). Cada conta nova vira uma ficha em **Clientes** no painel, com origem "site".
- **Pedidos na conta:** o cliente vê os pedidos ligados à ficha dele (número, item, valor, situação, prazo e pagamento). Observações internas não aparecem. Para um pedido aparecer, escolha o cliente certo ao registrar o pedido no painel.
- **Cliente que já existia:** a conta nova nunca se junta sozinha a uma ficha antiga, porque o e-mail não é confirmado. Abra a ficha nova em Clientes: se houver ficha antiga com o mesmo WhatsApp ou e-mail, aparece o botão **Unir fichas**. Confira se é a mesma pessoa antes de unir.
- **Esqueci minha senha:** com os e-mails automáticos ligados (seção 9.11), o site envia o link por e-mail. Sem eles, o site orienta o cliente a chamar no WhatsApp. No painel, abra a ficha do cliente → **Conta no site → Gerar link de senha nova** e envie o link para o WhatsApp da ficha. O link vale 2 horas e funciona uma vez.
- **Trocar o e-mail de uma conta:** ainda não há tela para isso; o cliente pode excluir a conta e criar outra.
- Não precisa de configuração nova no Render: a tabela `site_users` é criada sozinha no primeiro deploy.

### 9.7 Site e painel ligados
| No site | O que acontece no painel |
|---|---|
| Cliente monta o pedido e clica em **Enviar pedido de orçamento** | Aparece em **Pedidos → Pedidos novos do site**. Clique em **Importar**, combine o valor e registre. Se o cliente tem conta, o pedido já vai para a ficha dele. |
| Cliente com conta abre **Minha conta** | Vê o orçamento como "Orçamento solicitado" e, depois de importado, o pedido com a situação que você marcar. |
| Catálogo e preços da página | Vêm de **Catálogo & Serviços**. Mudou o preço ou desligou um item no painel, o site muda em até 1 minuto. Item desligado também some da vitrine. |
| **Receba ideias que fazem sentido** (e-mail) | Vira um contato em **Clientes**, com origem "site" e interesse "Novidades por e-mail". |
| Conta criada no site | Vira uma ficha em **Clientes** (seção 9.6). |
| Visitas, cliques e pedidos | Aparecem em **Monitoramento**. |

- O número do pedido do site começa com `S` (ex.: `S3KXYDJK`) e vai na mensagem do WhatsApp, para você achar o pedido no painel.
- A vitrine "Favoritos para começar" mostra os itens que têm ilustração. Para um item novo entrar na vitrine é preciso criar a imagem e incluir o cartão em `site/index.html`.
- Limites contra abuso: 8 pedidos por hora por endereço e 300 por dia no total; só entram itens que existem no catálogo.

### 9.8 Monitoramento (site, Instagram e atendimento)
- **Site:** visitas por dia, páginas abertas, de onde as visitas vêm, aparelho, e o caminho até o pedido (visitou → adicionou item → enviou orçamento). A contagem não usa cookies, não guarda IP e não identifica ninguém; ficam só os totais do dia.
- **Instagram:** seguidores, publicações recentes com curtidas e comentários, e a evolução dos seguidores (o painel guarda o número uma vez por dia). Usa o mesmo `IG_TOKEN` do Direct. Alcance e visualizações só aparecem se o token tiver a permissão `instagram_business_manage_insights`; para incluir, gere o token de novo no painel da Meta marcando essa permissão e atualize `IG_TOKEN` no Render.
- **Atendimento:** mensagens recebidas e enviadas por dia e o tempo até a primeira resposta, a partir do que passa pelo servidor (Direct do Instagram e, quando conectado, WhatsApp).
- Outras redes (Facebook, TikTok) não estão ligadas: cada uma exige um aplicativo e uma aprovação próprios.

### 9.9 Pagamento por PIX na conta do cliente
- Em **Minha conta**, todo pedido com valor em aberto mostra o botão **Pagar com PIX**, com o QR Code e o código "copia e cola" do valor que falta. A chave é a de **Configurações → PIX** do painel; sem chave cadastrada o botão não aparece.
- O site não recebe aviso do banco. Quando o dinheiro cair, registre o pagamento no pedido (ou importe o extrato em **Fluxo de Caixa**); a cobrança some da conta do cliente e o pedido aparece como pago.
- O valor cobrado é o **valor do pedido menos o que já foi pago**. Confira o valor ao importar um pedido do site, porque o cliente passa a ver o PIX assim que o pedido é registrado.

### 9.10 Buscadores e compartilhamento
O site informa o endereço oficial, o cartão que aparece ao compartilhar o link (WhatsApp, Instagram) e um mapa do site em `/sitemap.xml`. Para o Google acompanhar o site, cadastre o domínio no Google Search Console e envie esse mapa.

### 9.11 Loja online: compra direta, frete, cupons, pagamento, e-mails e usuários (versão 1.4)
O passo a passo de cada recurso está no arquivo **PASSO-A-PASSO-LOJA.md**. Resumo técnico:

| Endereço | O que é |
|---|---|
| `/produto/<nome>` | página de cada produto (fotos, opções, quantidade) |
| `/finalizar` | finalização da compra: dados, CEP e entrega, cupom, pagamento |
| `/pedido/<código>` | acompanhamento do pedido pelo link secreto enviado ao cliente |
| `/entregas` | entregas, trocas e devoluções (revise o texto) |
| `/feed/produtos.xml` | lista de produtos para Instagram/Facebook e Google |
| `/sitemap.xml` | mapa do site para os buscadores (agora inclui os produtos) |
| `/webhooks/mercadopago` | aviso de pagamento do Mercado Pago (só existe com `MP_ACCESS_TOKEN`) |

- **Painel:** menu novo **Loja online** (Produtos, Cupons, Entrega e avisos, Integrações); **Configurações → Usuários do painel**; no pedido, o quadro **Envio e nota fiscal**.
- **Sem configuração nova** já funcionam: produtos, variações, estoque, cupons, PIX, tabela de frete por CEP, retirada, acompanhamento, usuários e níveis.
- **Opcionais, por variável no Render:** `PUBLIC_URL`, e-mails (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_OWNER`), Mercado Pago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`) e Melhor Envio (`ME_TOKEN`, `ME_SANDBOX`). A tela **Loja online → Integrações** mostra o que está ligado.
- **Banco:** a tabela `panel_users` e os produtos iniciais são criados sozinhos no primeiro deploy.
- **Preço, frete e desconto** são sempre calculados no servidor; o que o navegador envia serve só para dizer quais itens o cliente quer.
- **Estoque reservado** por compra não paga volta sozinho depois de 48 horas.

## 10. Segurança

O que o servidor já faz sozinho e o que depende de você está no arquivo **SEGURANCA.md**. Em resumo:

- Toda a comunicação é criptografada (HTTPS com certificado válido, renovado automaticamente pelo Render).
- Webhooks da Meta só são aceitos com a assinatura correta; sem a chave secreta do app, tudo é recusado.
- Tentativas repetidas com segredo errado bloqueiam o endereço por 15 minutos.
- As tabelas do banco ficam fechadas para a API pública do Supabase (RLS ligado).
- Ative a verificação em duas etapas no GitHub, no Render, no Supabase e na Meta.

## Rodando no computador (opcional, para testes)

```powershell
cd esro-conexoes
copy .env.example .env      # preencha os valores
npm install
npm test                    # testes automáticos (não precisam de internet nem do banco)
npm run dev                 # lê o arquivo .env
```
