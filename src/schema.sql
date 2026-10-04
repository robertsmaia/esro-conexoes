-- Banco do servidor de conexões ESRO (Postgres / Supabase)
CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,            -- "whatsapp:5511999990000" ou "instagram:<IGSID>"
  channel     TEXT NOT NULL,               -- whatsapp | instagram
  peer_id     TEXT NOT NULL,               -- telefone (wa_id) ou IGSID
  name        TEXT,
  username    TEXT,
  last_text   TEXT,
  last_at     TIMESTAMPTZ,
  last_in_at  TIMESTAMPTZ,                 -- última mensagem recebida (janela de 24h)
  unread      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_last_at ON contacts (last_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,            -- wamid / mid
  contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  direction   TEXT NOT NULL,               -- in | out
  origin      TEXT,                        -- painel | app | cliente
  type        TEXT NOT NULL,
  text        TEXT,
  media_id    TEXT,
  status      TEXT,
  ts          TIMESTAMPTZ NOT NULL,
  raw         JSONB
);
CREATE INDEX IF NOT EXISTS messages_contact_ts ON messages (contact_id, ts);

CREATE TABLE IF NOT EXISTS site_orders (
  id          SERIAL PRIMARY KEY,
  ext_id      TEXT UNIQUE NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS kv (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Painel administrativo: documentos (pedidos, clientes, caixa...) e arquivos anexados
CREATE SEQUENCE IF NOT EXISTS panel_seq;
CREATE TABLE IF NOT EXISTS panel_docs (
  col         TEXT NOT NULL,               -- coleção: orders, clients, cash...
  id          TEXT NOT NULL,
  data        JSONB NOT NULL,
  seq         BIGINT NOT NULL,             -- ordem da alteração (o navegador pede só o que mudou depois do último seq)
  deleted     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (col, id)
);
CREATE INDEX IF NOT EXISTS panel_docs_seq ON panel_docs (seq);
CREATE TABLE IF NOT EXISTS panel_assets (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  type        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contas de clientes do site (login e cadastro). A senha nunca é guardada: só o resultado do scrypt.
CREATE TABLE IF NOT EXISTS site_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,        -- sempre em minúsculas
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  pass_hash     TEXT NOT NULL,               -- scrypt$N$r$p$sal$resultado
  client_id     TEXT,                        -- ficha em Clientes no painel (panel_docs: clients/<id>)
  session_ver   INTEGER NOT NULL DEFAULT 1,  -- trocar a senha encerra as sessões antigas
  reset_hash    TEXT,                        -- link de nova senha (guardado só como sha256), de uso único
  reset_expires TIMESTAMPTZ,
  consent_at    TIMESTAMPTZ NOT NULL,        -- quando aceitou a política de privacidade
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS site_users_client ON site_users (client_id);
CREATE INDEX IF NOT EXISTS panel_docs_order_client ON panel_docs ((data->>'clientId')) WHERE col = 'orders';

-- Estatísticas do site: só contagens por dia (visitas, páginas, origem, aparelho, eventos). Não guarda IP nem identifica ninguém.
CREATE TABLE IF NOT EXISTS site_stats (
  day   DATE NOT NULL,
  kind  TEXT NOT NULL,                       -- visita | pagina | origem | aparelho | evento
  key   TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);
-- Números das redes sociais, um por dia (ex.: seguidores do Instagram), para acompanhar a evolução.
CREATE TABLE IF NOT EXISTS social_stats (
  day     DATE NOT NULL,
  network TEXT NOT NULL,                     -- instagram
  metric  TEXT NOT NULL,                     -- seguidores | publicacoes | seguindo
  value   BIGINT NOT NULL,
  PRIMARY KEY (day, network, metric)
);
-- Usuários do painel (além da senha principal do dono). A senha nunca é guardada: só o resultado do scrypt.
CREATE TABLE IF NOT EXISTS panel_users (
  id            TEXT PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,        -- sempre em minúsculas
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,               -- admin | atendimento | producao | financeiro
  pass_hash     TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  session_ver   INTEGER NOT NULL DEFAULT 1,  -- trocar a senha ou desativar encerra as sessões
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS panel_docs_order_pub ON panel_docs ((data->>'pub')) WHERE col = 'orders';
CREATE INDEX IF NOT EXISTS site_orders_client ON site_orders ((payload->>'clientId')) WHERE imported = false;
CREATE INDEX IF NOT EXISTS messages_ts ON messages (ts);

-- Segurança: bloqueia a leitura e a escrita destas tabelas pela API pública do Supabase (PostgREST).
-- O servidor entra como dono das tabelas e continua funcionando normalmente.
ALTER TABLE contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE kv          ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_docs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_users ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE contacts, messages, site_orders, kv, panel_docs, panel_assets, site_users, site_stats, social_stats, panel_users FROM %I', r);
      EXECUTE format('REVOKE ALL ON SEQUENCE site_orders_id_seq, panel_seq FROM %I', r);
    END IF;
  END LOOP;
END $$;
