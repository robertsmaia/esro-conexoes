// Configuração lida das variáveis de ambiente (veja .env.example).
export function loadConfig(env = process.env) {
  const g = (k, d = '') => String(env[k] ?? d).trim();
  return {
    port: Number(g('PORT', '3000')),
    databaseUrl: g('DATABASE_URL'),
    databaseCa: g('DATABASE_CA_CERT').replace(/\\n/g, '\n'),   // certificado da autoridade do Supabase (PEM); com ele o servidor confere a identidade do banco
    storeRaw: g('STORE_RAW') === '1',                           // guardar o webhook completo (só para depuração)
    retentionDays: Math.max(0, Number(g('RETENTION_DAYS', '0')) || 0), // apaga mensagens mais antigas que N dias (0 = nunca)
    rateLimit: { perMinute: Number(g('RATE_LIMIT_PER_MINUTE', '600')) || 600, authFailures: Number(g('AUTH_FAILURES_LIMIT', '10')) || 10 },
    mcpSecret: g('MCP_SECRET'),
    graphVersion: g('GRAPH_VERSION', 'v23.0'),
    whatsapp: {
      mode: g('WA_MODE', 'meta'),                 // meta | 360dialog
      token: g('WA_TOKEN'),                       // token permanente (meta) ou D360-API-KEY (360dialog)
      phoneNumberId: g('WA_PHONE_NUMBER_ID'),
      appSecret: g('WA_APP_SECRET'),              // valida a assinatura X-Hub-Signature-256 (modo meta)
      verifyToken: g('WA_VERIFY_TOKEN'),
      webhookToken: g('WA_WEBHOOK_TOKEN'),        // só 360dialog (que não assina o webhook): cadastre a URL com ?token=<valor>
    },
    instagram: {
      token: g('IG_TOKEN'),                       // token de longa duração (Instagram Login)
      userId: g('IG_USER_ID', 'me'),
      appSecret: g('IG_APP_SECRET'),
      verifyToken: g('IG_VERIFY_TOKEN'),
      apiVersion: g('IG_API_VERSION', 'v25.0'),
    },
    site: { token: g('SITE_WEBHOOK_TOKEN') },
    panel: { password: String(env.PAINEL_SENHA ?? ''), sessionDays: Math.min(90, Math.max(1, Number(g('PAINEL_SESSAO_DIAS', '30')) || 30)) },
  };
}
