// Pequenas funções usadas por mais de um arquivo.

// Endereço público do site, para os links dos e-mails e o retorno do pagamento.
// Vale o PUBLIC_URL cadastrado no Render. Sem ele, usa o endereço da requisição somente se for um dos endereços conhecidos do site;
// assim ninguém consegue fazer o servidor montar um link para outro site mandando um cabeçalho "Host" falso.
export function siteBase(cfg, req) {
  if (cfg.publicUrl) return cfg.publicUrl;
  const host = String(req?.get?.('host') || '').toLowerCase(), name = host.split(':')[0];
  const known = (cfg.publicHosts || []).includes(name) || name.endsWith('.onrender.com') || name === 'localhost' || name === '127.0.0.1';
  if (!known || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return '';
  return `${req.get('x-forwarded-proto') === 'https' || req.secure ? 'https' : 'http'}://${host}`;
}

// Texto vindo de fora: só aceita texto ou número; qualquer outra coisa vira vazio.
export const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
