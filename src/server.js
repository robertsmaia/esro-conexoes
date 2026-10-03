// Ponto de entrada: `npm start`
import { readFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { openDb, migrate, repo as makeRepo } from './db.js';
import { createApp } from './app.js';
import { refreshInstagramToken } from './channels.js';

const cfg = loadConfig();
const missing = ['DATABASE_URL', 'MCP_SECRET'].filter(k => !process.env[k]);
if (missing.length) { console.error(`Faltam variáveis de ambiente: ${missing.join(', ')}. Veja o arquivo .env.example.`); process.exit(1); }
if (cfg.mcpSecret.length < 24) { console.error('MCP_SECRET precisa ter pelo menos 24 caracteres.'); process.exit(1); }
// Avisos de configuração insegura (não impedem o servidor de subir)
if (cfg.whatsapp.token && cfg.whatsapp.mode === 'meta' && !cfg.whatsapp.appSecret) console.warn('[segurança] WA_APP_SECRET não definido: os webhooks do WhatsApp serão recusados até você cadastrar a chave secreta do app.');
if (cfg.instagram.token && !cfg.instagram.appSecret) console.warn('[segurança] IG_APP_SECRET não definido: os webhooks do Instagram serão recusados até você cadastrar a chave secreta do app.');
if (cfg.whatsapp.mode === '360dialog' && !cfg.whatsapp.webhookToken) console.warn('[segurança] 360dialog não assina webhooks: defina WA_WEBHOOK_TOKEN e cadastre a URL com ?token=<valor>.');
for (const [k, v] of [['WA_VERIFY_TOKEN', cfg.whatsapp.verifyToken], ['IG_VERIFY_TOKEN', cfg.instagram.verifyToken], ['SITE_WEBHOOK_TOKEN', cfg.site.token]]) if (v && v.length < 16) console.warn(`[segurança] ${k} é curto; use pelo menos 16 caracteres aleatórios.`);
console.log(cfg.databaseCa ? '[segurança] banco: TLS com verificação do certificado' : '[segurança] banco: TLS sem verificação do certificado (defina DATABASE_CA_CERT para verificar)');
process.on('unhandledRejection', (e) => console.error('[erro] promessa rejeitada:', e?.message || e));

const db = await openDb(cfg);
await migrate(db);
const repo = makeRepo(db);

// Primeiro uso do painel: grava o catálogo de serviços (o mesmo que aparece no site) se ainda não houver nenhum.
if (await repo.docCount('catalog') === 0) {
  const seed = JSON.parse(await readFile(new URL('./seed-catalog.json', import.meta.url), 'utf8'));
  for (const c of seed) await repo.docSet('catalog', c.id, c.data);
  console.log(`[painel] catálogo inicial gravado (${seed.length} categorias)`);
}
if (!cfg.panel.password) console.warn('[painel] PAINEL_SENHA não definida: o painel em /painel fica desativado até você cadastrar a senha no Render.');
else if (cfg.panel.password.length < 10) console.warn('[painel] PAINEL_SENHA precisa ter pelo menos 10 caracteres; o painel fica desativado até lá.');

const app = createApp({ cfg, repo });
app.listen(cfg.port, () => console.log(`ESRO conexões rodando na porta ${cfg.port}`));

const tick = () => refreshInstagramToken(cfg, repo).catch(() => {});
tick(); setInterval(tick, 12 * 3600e3).unref();

// Retenção (opcional, LGPD): apaga mensagens mais antigas que RETENTION_DAYS. Desligado por padrão.
if (cfg.retentionDays > 0) {
  const purge = () => repo.purgeOlderThan(cfg.retentionDays).then(n => { if (n) console.log(`[retenção] ${n} mensagem(ns) com mais de ${cfg.retentionDays} dias apagada(s)`); }).catch(e => console.error('[retenção]', e.message));
  purge(); setInterval(purge, 24 * 3600e3).unref();
}
