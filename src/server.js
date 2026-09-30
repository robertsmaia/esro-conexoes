// Ponto de entrada: `npm start`
import { loadConfig } from './config.js';
import { openDb, migrate, repo as makeRepo } from './db.js';
import { createApp } from './app.js';
import { refreshInstagramToken } from './channels.js';

const cfg = loadConfig();
const missing = ['DATABASE_URL', 'MCP_SECRET'].filter(k => !process.env[k]);
if (missing.length) { console.error(`Faltam variáveis de ambiente: ${missing.join(', ')}. Veja o arquivo .env.example.`); process.exit(1); }
if (cfg.mcpSecret.length < 24) { console.error('MCP_SECRET precisa ter pelo menos 24 caracteres.'); process.exit(1); }

const db = await openDb(cfg);
await migrate(db);
const repo = makeRepo(db);

const app = createApp({ cfg, repo });
app.listen(cfg.port, () => console.log(`ESRO conexões rodando na porta ${cfg.port}`));

const tick = () => refreshInstagramToken(cfg, repo).catch(() => {});
tick(); setInterval(tick, 12 * 3600e3).unref();
