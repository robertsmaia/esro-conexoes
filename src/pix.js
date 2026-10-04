// PIX "copia e cola" (BR Code estático, padrão do Banco Central). É o mesmo cálculo que o painel usa para gerar o QR.
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase();

export function crc16(s) {
  let c = 0xFFFF;
  for (const b of new TextEncoder().encode(s)) { c ^= b << 8; for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

function pixKey(settings) {
  const k = String(settings?.pixKey || '').trim(); if (!k) return '';
  if (settings.pixType === 'telefone') { const d = digits(k); return '+' + (d.startsWith('55') && d.length > 11 ? d : '55' + d); }
  if (settings.pixType === 'cpf') return digits(k);
  if (settings.pixType === 'email') return k.toLowerCase();
  return k;
}

// settings: o documento "settings/store" do painel (pixKey, pixType, pixName, pixCity). Devolve null se não houver chave.
export function pixPayload(settings, amount, desc, txid) {
  const key = pixKey(settings); if (!key) return null;
  let mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const d = norm(desc).slice(0, Math.max(0, 95 - mai.length)); if (d) mai += tlv('02', d);
  let p = tlv('00', '01') + tlv('26', mai) + tlv('52', '0000') + tlv('53', '986') + (amount > 0 ? tlv('54', (+amount).toFixed(2)) : '') + tlv('58', 'BR')
    + tlv('59', norm(settings.pixName || 'ESRO PAPELARIA').slice(0, 25) || 'ESRO') + tlv('60', norm(settings.pixCity || 'SAO PAULO').slice(0, 15) || 'SAO PAULO')
    + tlv('62', tlv('05', String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'));
  p += '6304';
  return p + crc16(p);
}

// Quanto já foi pago e quanto falta em um pedido do painel (mesma regra do painel, inclusive para pedidos antigos sem a lista de pagamentos).
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
export function paidOf(o) {
  const value = Number(o.value) || 0;
  const pays = Array.isArray(o.pays) ? o.pays : o.payS === 'Pago' ? [{ value }] : o.payS === 'Sinal pago' ? [{ value: Number(o.sinal) > 0 ? Math.min(Number(o.sinal), value) : value / 2 }] : [];
  return r2(pays.reduce((a, p) => a + (Number(p?.value) || 0), 0));
}
export const dueOf = (o) => Math.max(0, r2((Number(o.value) || 0) - paidOf(o)));
