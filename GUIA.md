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

1. Abra `https://SEU-ENDERECO.onrender.com/`. Deve mostrar `"whatsapp": true` e `"instagram": true` depois dos passos 5 e 6.
2. Peça para alguém mandar "oi" no WhatsApp e no Direct. Em até 30 segundos a conversa aparece em **Inbox → Mensagens**.
3. Responda pelo painel e confira no celular do cliente.
4. Se algo não chegar, olhe os **Logs** do serviço no Render: as mensagens de erro estão em português.

## Rodando no computador (opcional, para testes)

```powershell
cd esro-conexoes
copy .env.example .env      # preencha os valores
npm install
npm test                    # testes automáticos (não precisam de internet nem do banco)
npm run dev                 # lê o arquivo .env
```
