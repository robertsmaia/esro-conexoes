// Configuração lida das variáveis de ambiente (veja .env.example).
export function loadConfig(env = process.env) {
  const g = (k, d = '') => String(env[k] ?? d).trim();
  return {
    port: Number(g('PORT', '3000')),
    databaseUrl: g('DATABASE_URL'),
    mcpSecret: g('MCP_SECRET'),
    graphVersion: g('GRAPH_VERSION', 'v23.0'),
    whatsapp: {
      mode: g('WA_MODE', 'meta'),                 // meta | 360dialog
      token: g('WA_TOKEN'),                       // token permanente (meta) ou D360-API-KEY (360dialog)
      phoneNumberId: g('WA_PHONE_NUMBER_ID'),
      appSecret: g('WA_APP_SECRET'),              // valida a assinatura X-Hub-Signature-256 (modo meta)
      verifyToken: g('WA_VERIFY_TOKEN'),
    },
    instagram: {
      token: g('IG_TOKEN'),                       // token de longa duração (Instagram Login)
      userId: g('IG_USER_ID', 'me'),
      appSecret: g('IG_APP_SECRET'),
      verifyToken: g('IG_VERIFY_TOKEN'),
      apiVersion: g('IG_API_VERSION', 'v25.0'),
    },
    site: { token: g('SITE_WEBHOOK_TOKEN') },
  };
}
