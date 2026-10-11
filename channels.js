// Integração com as APIs da Meta: WhatsApp Cloud API (direto ou via 360dialog) e Instagram API com login do Instagram.
import crypto from 'node:crypto';

export class ChannelError extends Error {
  constructor(message, detail) { super(message); this.detail = detail; }
}

// Confere a assinatura X-Hub-Signature-256 da Meta. Sem a chave secreta configurada, recusa (nunca aceita webhook sem assinatura).
export function verifySignature(appSecret, rawBody, header) {
  if (!appSecret || !header || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const tsFrom = (s) => new Date(Number(s) * (String(s).length > 11 ? 1 : 1000)).toISOString();

function describe(m) {
  const t = m.type;
  if (t === 'text') return m.text?.body ?? '';
  if (t === 'button') return m.button?.text ?? '[botão]';
  if (t === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[resposta interativa]';
  const labels = { image: 'imagem', video: 'vídeo', audio: 'áudio', document: 'documento', sticker: 'figurinha', location: 'localização', contacts: 'contato', reaction: 'reação' };
  if (t === 'reaction') return `[reação ${m.reaction?.emoji || ''}]`.trim();
  const cap = m[t]?.caption || m[t]?.filename;
  return `[${labels[t] || t}]${cap ? ' ' + cap : ''}`;
}

/* ---------- WhatsApp ---------- */
export function parseWhatsApp(body) {
  const out = { messages: [], statuses: [] };
  for (const entry of body?.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
    for (const m of v.messages || []) {
      out.messages.push({ channel: 'whatsapp', peerId: m.from, name: names[m.from], id: m.id, direction: 'in', origin: 'cliente',
        type: m.type, text: describe(m), mediaId: m[m.type]?.id, ts: tsFrom(m.timestamp), raw: m });
    }
    // Coexistência: mensagens enviadas pelo app WhatsApp Business no celular (campo smb_message_echoes)
    for (const m of v.message_echoes || []) {
      out.messages.push({ channel: 'whatsapp', peerId: m.to, id: m.id, direction: 'out', origin: 'app',
        type: m.type, text: describe(m), mediaId: m[m.type]?.id, ts: tsFrom(m.timestamp), raw: m });
    }
    for (const s of v.statuses || []) out.statuses.push({ id: s.id, status: s.status });
  }
  return out;
}

export async function sendWhatsApp(cfg, to, text, fetchImpl = fetch) {
  const w = cfg.whatsapp;
  if (!w.token) throw new ChannelError('WhatsApp não configurado: defina WA_TOKEN.');
  const is360 = w.mode === '360dialog';
  if (!is360 && !w.phoneNumberId) throw new ChannelError('WhatsApp não configurado: defina WA_PHONE_NUMBER_ID.');
  const url = is360 ? 'https://waba-v2.360dialog.io/messages' : `https://graph.facebook.com/${cfg.graphVersion}/${w.phoneNumberId}/messages`;
  const headers = { 'Content-Type': 'application/json', ...(is360 ? { 'D360-API-KEY': w.token } : { Authorization: `Bearer ${w.token}` }) };
  const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: true, body: text } }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || {}; const code = err.code;
    if (code === 131047 || code === 470) throw new ChannelError('Passaram mais de 24 h desde a última mensagem do cliente. O WhatsApp só permite responder com um modelo aprovado; responda pelo celular ou espere o cliente escrever.', err);
    throw new ChannelError(`WhatsApp recusou o envio: ${err.message || res.status}`, err);
  }
  return data.messages?.[0]?.id || `wa-out-${Date.now()}`;
}

export async function markWhatsAppRead(cfg, messageId, fetchImpl = fetch) {
  const w = cfg.whatsapp; if (!w.token || !messageId) return;
  const is360 = w.mode === '360dialog';
  const url = is360 ? 'https://waba-v2.360dialog.io/messages' : `https://graph.facebook.com/${cfg.graphVersion}/${w.phoneNumberId}/messages`;
  const headers = { 'Content-Type': 'application/json', ...(is360 ? { 'D360-API-KEY': w.token } : { Authorization: `Bearer ${w.token}` }) };
  try { await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }) }); } catch { /* confirmação de leitura é opcional */ }
}

/* ---------- Instagram ---------- */
export function parseInstagram(body) {
  const out = { messages: [] };
  for (const entry of body?.entry || []) for (const ev of entry.messaging || []) {
    const m = ev.message; if (!m || m.is_deleted) continue;
    const echo = !!m.is_echo;
    const peer = echo ? ev.recipient?.id : ev.sender?.id;
    const att = m.attachments?.[0];
    const text = m.text ?? (att ? `[${({ image: 'imagem', video: 'vídeo', audio: 'áudio', file: 'arquivo', share: 'compartilhamento', story_mention: 'menção no story' })[att.type] || att.type}]` : '[mensagem]');
    out.messages.push({ channel: 'instagram', peerId: peer, id: m.mid, direction: echo ? 'out' : 'in', origin: echo ? 'app' : 'cliente',
      type: m.text != null ? 'text' : (att?.type || 'unknown'), text, ts: new Date(Number(ev.timestamp) || Date.now()).toISOString(), raw: ev });
  }
  return out;
}

export async function igToken(cfg, repo) {
  const saved = await repo.kvGet('ig_token');
  return saved?.value || cfg.instagram.token;
}

export async function sendInstagram(cfg, repo, recipientId, text, fetchImpl = fetch) {
  const token = await igToken(cfg, repo);
  if (!token) throw new ChannelError('Instagram não configurado: defina IG_TOKEN.');
  const url = `https://graph.instagram.com/${cfg.instagram.apiVersion}/${cfg.instagram.userId}/messages`;
  const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || {};
    if (err.code === 10 || err.error_subcode === 2534022) throw new ChannelError('Passaram mais de 24 h desde a última mensagem do cliente no Direct; responda pelo app do Instagram.', err);
    throw new ChannelError(`Instagram recusou o envio: ${err.message || res.status}`, err);
  }
  return data.message_id || `ig-out-${Date.now()}`;
}

export async function instagramProfile(cfg, repo, igsid, fetchImpl = fetch) {
  const token = await igToken(cfg, repo); if (!token) return {};
  try {
    const res = await fetchImpl(`https://graph.instagram.com/${cfg.instagram.apiVersion}/${igsid}?fields=name,username&access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return {};
    const d = await res.json(); return { name: d.name, username: d.username };
  } catch { return {}; }
}

// O token do Instagram vale 60 dias; renovamos a cada 7 dias e guardamos no banco.
export async function refreshInstagramToken(cfg, repo, fetchImpl = fetch) {
  const saved = await repo.kvGet('ig_token');
  const token = saved?.value || cfg.instagram.token; if (!token) return false;
  if (saved && Date.now() - new Date(saved.updated_at).getTime() < 7 * 864e5) return false;
  try {
    const res = await fetchImpl(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const d = await res.json();
    if (res.ok && d.access_token) { await repo.kvSet('ig_token', d.access_token); return true; }
    console.warn('[instagram] não foi possível renovar o token:', d.error?.message || res.status);
  } catch (e) { console.warn('[instagram] erro ao renovar o token:', e.message); }
  return false;
}
