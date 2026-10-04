// Monitoramento das redes sociais. Hoje: Instagram (perfil, últimas publicações e, se o token permitir, alcance).
// Usa o mesmo token do Direct. Guarda um retrato por dia (seguidores, publicações) para mostrar a evolução no painel.
import { igToken } from './channels.js';

const TTL = 30 * 60e3;   // consulta o Instagram no máximo a cada 30 minutos
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const KIND = { IMAGE: 'Foto', VIDEO: 'Vídeo', CAROUSEL_ALBUM: 'Carrossel' };

export async function instagramOverview(cfg, repo, fetchImpl = fetch, { force = false, day } = {}) {
  const token = await igToken(cfg, repo);
  if (!token) return { configurado: false };
  const saved = await repo.kvGet('ig_overview');
  let cached = null; try { cached = saved ? JSON.parse(saved.value) : null; } catch { cached = null; }
  if (!force && cached && Date.now() - new Date(saved.updated_at).getTime() < TTL) return cached;

  const base = `https://graph.instagram.com/${cfg.instagram.apiVersion}`;
  const get = async (path, params) => {
    const u = new URL(base + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    u.searchParams.set('access_token', token);
    const r = await fetchImpl(u.toString(), { signal: AbortSignal.timeout(12000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error('instagram'), { code: d.error?.code, status: r.status });
    return d;
  };
  try {
    const me = await get('/me', { fields: 'user_id,username,name,followers_count,follows_count,media_count' });
    const media = await get('/me/media', { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: 12 }).catch(() => ({ data: [] }));
    // Alcance e visualizações exigem a permissão de "insights" no token; sem ela, o resto continua funcionando.
    let ins = null;
    try {
      const until = Math.floor(Date.now() / 1000);
      const r = await get('/me/insights', { metric: 'reach,views,accounts_engaged,total_interactions', period: 'day', metric_type: 'total_value', since: until - 28 * 86400, until });
      const by = Object.fromEntries((Array.isArray(r.data) ? r.data : []).map(m => [m.name, num(m.total_value?.value)]));
      if (Object.values(by).some(v => v !== null)) ins = { alcance: by.reach ?? null, visualizacoes: by.views ?? null, contasEngajadas: by.accounts_engaged ?? null, interacoes: by.total_interactions ?? null };
    } catch { ins = null; }
    const out = {
      configurado: true, atualizadoEm: new Date().toISOString(),
      perfil: { usuario: me.username ? String(me.username).slice(0, 60) : null, nome: me.name ? String(me.name).slice(0, 80) : null,
        seguidores: num(me.followers_count), seguindo: num(me.follows_count), publicacoes: num(me.media_count) },
      posts: (Array.isArray(media.data) ? media.data : []).slice(0, 12).map(p => ({
        id: String(p.id || ''), data: p.timestamp || null, tipo: p.media_product_type === 'REELS' ? 'Reels' : (KIND[p.media_type] || 'Publicação'),
        legenda: String(p.caption || '').replace(/\s+/g, ' ').trim().slice(0, 140), curtidas: num(p.like_count), comentarios: num(p.comments_count),
        link: /^https:\/\/(www\.)?instagram\.com\//.test(String(p.permalink || '')) ? String(p.permalink) : null })),
      ultimos28dias: ins,
    };
    await repo.kvSet('ig_overview', JSON.stringify(out));
    if (day) {
      for (const [metric, v] of [['seguidores', out.perfil.seguidores], ['seguindo', out.perfil.seguindo], ['publicacoes', out.perfil.publicacoes]]) if (v !== null) await repo.socialSet(day, 'instagram', metric, v);
    }
    return out;
  } catch (e) {
    const erro = e.code === 190 ? 'O acesso ao Instagram expirou. Gere um token novo no painel da Meta e atualize IG_TOKEN no Render.'
      : e.code === 10 || e.code === 200 || e.status === 403 ? 'O token do Instagram não tem permissão para ler os dados do perfil.'
      : 'Não foi possível falar com o Instagram agora. Tente de novo em alguns minutos.';
    return cached ? { ...cached, erro, desatualizado: true } : { configurado: true, erro };
  }
}
