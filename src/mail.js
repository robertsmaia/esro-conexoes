// E-mails automáticos (opcional). Funciona com a Brevo ou com a Resend: basta cadastrar no Render
// EMAIL_PROVIDER (brevo ou resend), EMAIL_API_KEY e EMAIL_FROM. Sem isso, nada é enviado e o site segue funcionando.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function parseFrom(from) {
  const m = /^\s*(.*?)\s*<\s*([^<>\s]+)\s*>\s*$/.exec(from || '');
  const email = (m ? m[2] : String(from || '').trim()), name = (m && m[1] ? m[1] : 'ESRO Papelaria').replace(/^"|"$/g, '');
  return EMAIL_RE.test(email) ? { name, email } : null;
}

// Moldura simples, com cores da marca e estilos embutidos (programas de e-mail ignoram folhas de estilo).
function layout(title, inner, footer) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#fbf6ee;font-family:Arial,Helvetica,sans-serif;color:#35241e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf6ee;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdfa;border:1px solid #e9ded3;border-radius:16px">
<tr><td style="padding:24px 28px 8px;font-family:Georgia,serif;font-size:26px;font-style:italic;color:#35241e">Esro<span style="color:#b96f50">&#9829;</span></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:20px;font-weight:bold;color:#35241e">${esc(title)}</td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.55;color:#35241e">${inner}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e9ded3;font-size:12.5px;line-height:1.5;color:#725c52">${footer || 'ESRO Papelaria • Personalizados • Soluções Educacionais<br>WhatsApp (11) 99248-1676'}</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (url, label) => `<p style="margin:18px 0"><a href="${esc(url)}" style="display:inline-block;background:#6c4030;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${esc(label)}</a></p>`;
const p = (html) => `<p style="margin:0 0 12px">${html}</p>`;

function itemsTable(l) {
  const rows = (l.itens || []).map(i => `<tr><td style="padding:6px 0;border-bottom:1px solid #e9ded3">${esc(i.qtd)} × ${esc(i.nome)}${(i.vars || []).length ? `<br><span style="color:#725c52;font-size:13px">${esc(i.vars.map(v => v[0] + ': ' + v[1]).join(' · '))}</span>` : ''}${i.pers ? `<br><span style="color:#725c52;font-size:13px">Personalização: ${esc(i.pers)}</span>` : ''}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #e9ded3;white-space:nowrap">${money(i.unit * i.qtd)}</td></tr>`).join('');
  const line = (label, value, bold) => `<tr><td style="padding:4px 0${bold ? ';font-weight:bold' : ''}">${esc(label)}</td><td align="right" style="padding:4px 0;white-space:nowrap${bold ? ';font-weight:bold' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14.5px;margin:6px 0 14px">${rows}
${line('Subtotal', money(l.subtotal))}${l.desconto > 0 ? line('Desconto' + (l.cupom ? ' (cupom ' + l.cupom + ')' : ''), '− ' + money(l.desconto)) : ''}${line(l.frete?.nome || 'Entrega', l.frete?.combinar ? 'a combinar' : l.frete?.valor > 0 ? money(l.frete.valor) : 'grátis')}${line('Total', money(l.total), true)}</table>`;
}

export function templates({ publicUrl }) {
  const track = (o) => `${publicUrl}/pedido/${o.pub}`;
  return {
    pedidoRecebido(o, pix) {
      const first = String(o.client || '').split(' ')[0];
      const pay = o.payS === 'Pago' ? p('Pagamento confirmado. Obrigada!')
        : pix ? p('Para pagar com PIX, abra a página do pedido: lá estão o QR Code e o código "copia e cola".') : p('A ESRO combina o pagamento com você pelo WhatsApp.');
      return { subject: `Recebemos o seu pedido nº ${o.num}`, html: layout(`Pedido nº ${o.num} recebido`, p(`Olá, ${esc(first)}! Recebemos o seu pedido. Confira o resumo:`) + itemsTable(o.loja) + pay + button(track(o), 'Acompanhar o pedido') + p('Qualquer dúvida, é só responder a este e-mail ou chamar no WhatsApp.')),
        text: `Olá, ${first}! Recebemos o seu pedido nº ${o.num}, no valor de ${money(o.loja.total)}. Acompanhe em ${track(o)}` };
    },
    pedidoNovo(o) {   // aviso para a loja
      return { subject: `Novo pedido pelo site: nº ${o.num} (${money(o.loja.total)})`, html: layout(`Novo pedido nº ${o.num}`, p(`<b>${esc(o.client)}</b> · ${esc(o.contact || '')}${o.loja.email ? ' · ' + esc(o.loja.email) : ''}`) + itemsTable(o.loja) + p(`Pagamento: ${esc(o.pay)} (${esc(o.payS)}).`) + button(`${publicUrl}/painel`, 'Abrir o painel')),
        text: `Novo pedido nº ${o.num} de ${o.client}: ${money(o.loja.total)}. Abra o painel: ${publicUrl}/painel` };
    },
    orcamentoNovo(ref, payload) {   // aviso para a loja
      const list = (payload.itens || []).map(i => `${i.qtd} × ${i.nome}`).join(', ');
      return { subject: `Novo pedido de orçamento pelo site: ${ref}`, html: layout(`Pedido de orçamento ${ref}`, p(`<b>${esc(payload.cliente?.nome)}</b> · ${esc(payload.cliente?.telefone || '')}`) + p(esc(list)) + (payload.obs ? p('Observações: ' + esc(payload.obs)) : '') + button(`${publicUrl}/painel`, 'Abrir o painel')),
        text: `Novo pedido de orçamento ${ref} de ${payload.cliente?.nome}: ${list}. Abra o painel: ${publicUrl}/painel` };
    },
    pagamentoConfirmado(o) {
      const first = String(o.client || '').split(' ')[0];
      return { subject: `Pagamento confirmado: pedido nº ${o.num}`, html: layout('Pagamento confirmado', p(`Olá, ${esc(first)}! Recebemos o pagamento do pedido nº ${esc(o.num)}. Agora é com a gente: você acompanha cada etapa pela página do pedido.`) + button(track(o), 'Acompanhar o pedido')),
        text: `Olá, ${first}! Recebemos o pagamento do pedido nº ${o.num}. Acompanhe em ${track(o)}` };
    },
    pedidoEnviado(o) {
      const first = String(o.client || '').split(' ')[0];
      const rast = o.track ? p(`Código de rastreio: <b>${esc(o.track)}</b>`) : '';
      return { subject: `Seu pedido nº ${o.num} foi enviado`, html: layout('Pedido enviado', p(`Olá, ${esc(first)}! O pedido nº ${esc(o.num)} já saiu para entrega.`) + rast + button(track(o), 'Ver o pedido')),
        text: `Olá, ${first}! O pedido nº ${o.num} foi enviado.${o.track ? ' Rastreio: ' + o.track + '.' : ''} Veja em ${track(o)}` };
    },
    senhaNova(name, url, minutes) {
      const first = String(name || '').split(' ')[0];
      return { subject: 'Crie uma senha nova para a sua conta ESRO', html: layout('Senha nova', p(`Olá, ${esc(first)}! Recebemos um pedido para criar uma senha nova na sua conta.`) + button(url, 'Criar senha nova') + p(`O link vale por ${Math.round(minutes / 60)} hora(s) e funciona uma única vez. Se não foi você que pediu, ignore este e-mail: a sua senha continua a mesma.`)),
        text: `Olá, ${first}! Para criar uma senha nova na sua conta ESRO, abra: ${url} (vale por ${Math.round(minutes / 60)} hora(s), uma única vez). Se não foi você, ignore este e-mail.` };
    },
    teste() { return { subject: 'Teste de e-mail do site ESRO', html: layout('E-mail funcionando', p('Este é um e-mail de teste enviado pelo painel da ESRO. Se você recebeu, os avisos automáticos estão ligados.')), text: 'E-mail de teste do painel da ESRO: os avisos automáticos estão ligados.' }; },
  };
}

export function makeMailer(cfg, fetchImpl = fetch, log = console) {
  const m = cfg.mail || {}, from = parseFrom(m.from);
  const provider = m.provider === 'resend' ? 'resend' : m.provider === 'brevo' ? 'brevo' : '';
  const enabled = !!(provider && m.key && from);
  const owner = EMAIL_RE.test(m.owner || '') ? m.owner : (from ? from.email : '');

  async function send({ to, toName, subject, html, text, replyTo }) {
    if (!enabled) return { ok: false, motivo: 'desativado' };
    if (!EMAIL_RE.test(String(to || ''))) return { ok: false, motivo: 'destinatário inválido' };
    try {
      let r;
      if (provider === 'brevo') {
        r = await fetchImpl('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(12000),
          headers: { 'api-key': m.key, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: from, to: [{ email: to, ...(toName ? { name: String(toName).slice(0, 70) } : {}) }], subject, htmlContent: html, textContent: text, ...(replyTo || owner ? { replyTo: { email: replyTo || owner } } : {}) }) });
      } else {
        r = await fetchImpl('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(12000),
          headers: { authorization: 'Bearer ' + m.key, 'content-type': 'application/json' },
          body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, html, text, ...(replyTo || owner ? { reply_to: replyTo || owner } : {}) }) });
      }
      if (!r.ok) { log.error(`[e-mail] ${provider} recusou o envio (HTTP ${r.status})`); return { ok: false, motivo: 'HTTP ' + r.status }; }
      return { ok: true };
    } catch (e) { log.error('[e-mail] falha ao enviar:', e?.message || e); return { ok: false, motivo: 'sem resposta do serviço de e-mail' }; }
  }
  return { enabled, provider, owner, from: from ? from.email : '', send };
}
