# Segurança — ESRO Conexões

Este documento lista as proteções do servidor de conexões e do painel da ESRO, e o que depende de quem administra as contas.

## Certificados e criptografia

| Parte | Como é protegida |
|---|---|
| Site e painel no seu domínio | HTTPS com certificado emitido e renovado automaticamente pelo Render, depois que o domínio é apontado. |
| Painel no claude.ai | HTTPS com certificado da Anthropic. Os dados só são lidos por quem tem acesso de edição ao painel. |
| Servidor (`*.onrender.com`) | HTTPS obrigatório, com certificado emitido e renovado automaticamente pelo Render. O servidor envia o cabeçalho HSTS e recusa chamadas sem criptografia. |
| Banco (Supabase) | Conexão sempre com TLS. Com a variável `DATABASE_CA_CERT`, o servidor também confere o certificado do banco. |
| Meta (WhatsApp e Instagram) | Chamadas saem por HTTPS; as que chegam precisam da assinatura `X-Hub-Signature-256`. |

Não é preciso comprar nem instalar certificado: cada serviço já fornece o seu.

## Proteções do servidor

- **Assinatura dos webhooks**: mensagens só são aceitas se assinadas com a chave secreta do app da Meta. Sem a chave configurada, o servidor recusa tudo.
- **Segredos comparados em tempo constante**: `MCP_SECRET`, tokens de verificação e o token do site.
- **Bloqueio por tentativas**: 10 credenciais erradas em 15 minutos bloqueiam o endereço nas rotas protegidas (resposta 429).
- **Limite de requisições**: 600 por minuto por endereço.
- **Cabeçalhos de segurança**: HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, política de conteúdo restritiva e `Cache-Control: no-store`.
- **Erros sem detalhes**: respostas de erro não revelam caminhos, versões nem pilha de erro.
- **Corpo limitado a 1 MB** e JSON inválido recusado.
- **Menos dados guardados**: o conteúdo bruto dos webhooks não é mais salvo (só o texto da mensagem). `RETENTION_DAYS` apaga mensagens antigas, se você quiser.
- **Banco fechado para a API pública**: RLS ligado e permissões das funções `anon` e `authenticated` removidas nas quatro tabelas.
- **Dependências**: `npm audit` sem vulnerabilidades conhecidas na data da última atualização.

## Proteções do painel (`/painel`)

- **Login por senha** (`PAINEL_SENHA`, mínimo de 10 caracteres). A senha nunca é guardada no banco nem enviada de volta; o servidor compara um resumo calculado com `scrypt`.
- **Sessão em cookie** `HttpOnly`, `Secure` e `SameSite=Strict`, assinado pelo servidor e com validade (30 dias por padrão). Trocar a senha encerra todas as sessões.
- **Nenhum dado sem login**: a página do painel é só a "casca"; pedidos, clientes, caixa e arquivos só saem pela API, depois do login.
- **Proteção contra chamadas forjadas**: a API exige um cabeçalho próprio e a mesma origem do painel.
- **Bloqueio por tentativas**: 10 senhas erradas em 15 minutos bloqueiam o endereço.
- **Política de conteúdo rígida**: o navegador só executa scripts vindos do próprio servidor; nada embutido na página e nada de outros sites.
- **Arquivos anexados**: tipos conferidos, limite de 8 MB, servidos só com login e em modo isolado (nunca executam como página).
- **Fora dos buscadores**: `/painel` e os arquivos têm `noindex` e estão no `robots.txt`.

## Contas de clientes do site (`/entrar` e `/conta`)
- **Senha nunca guardada:** fica só o resultado do scrypt, com sal próprio de cada conta. Nem a ESRO consegue ler a senha de um cliente.
- **Sessão em cookie** `HttpOnly`, `SameSite=Lax` e `Secure`, válida por 30 dias. Nada fica no armazenamento do navegador. Trocar a senha desconecta os outros aparelhos.
- **Tentativas limitadas:** 10 erros de senha bloqueiam o endereço (e aquele e-mail) por 15 minutos; no máximo 5 cadastros por hora por endereço.
- **Sem pistas para curiosos:** e-mail inexistente e senha errada recebem a mesma resposta, no mesmo tempo.
- **Cada cliente só vê o que é dele:** os pedidos vêm da ficha ligada à conta, sem observações internas. Uma conta nova nunca se liga sozinha a uma ficha antiga; a união é feita por você no painel.
- **Senha nova** só por link de uso único gerado no painel (vale 2 horas), guardado no banco apenas como código embaralhado.
- **LGPD:** o cadastro exige aceite da Política de Privacidade (`/privacidade`) e o cliente pode excluir a própria conta.

## O que depende de você

1. **Verificação em duas etapas** nas contas: GitHub, Render, Supabase, Meta (Facebook) e na conta do Claude.
2. **Segredos**: nunca compartilhe a URL do conector (ela contém o `MCP_SECRET`). Se vazar, gere outro valor no Render e atualize o conector no Claude.
3. **Chave de API do Render guardada em arquivo de texto**: revogue em Render → Account Settings → API Keys e apague o arquivo.
4. **Certificado do banco (opcional)**: no Supabase, em Project Settings → Database → SSL Configuration, baixe o certificado e cole o conteúdo na variável `DATABASE_CA_CERT` do Render. No mesmo lugar, ligue **Enforce SSL on incoming connections**.
5. **Repositório**: ele não contém segredos. Os segredos ficam só nas variáveis de ambiente do Render.
6. **Backup**: no painel, exporte tudo para o Excel a cada 15 dias.

## Se algo der errado

- **Suspeita de vazamento do segredo do conector**: troque `MCP_SECRET` no Render, faça o deploy e atualize a URL do conector.
- **Token do Instagram ou do WhatsApp exposto**: gere um novo no painel de desenvolvedores da Meta e atualize a variável no Render.
- **Senha do banco exposta**: redefina em Supabase → Project Settings → Database e atualize `DATABASE_URL`.
- Contato do responsável: esro.papelaria@gmail.com
