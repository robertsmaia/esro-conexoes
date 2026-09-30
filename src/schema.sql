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
