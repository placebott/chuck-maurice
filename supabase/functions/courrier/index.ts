// Le Courrier des fans — guichet unique (fonction Edge Supabase, projet « chuck-maurice »).
//
//   GET  /courrier?avant=<id>&limite=<n>   lettres visibles, de la plus récente à la plus ancienne,
//                                          + un jeton de dépôt (horodaté, signé)
//   POST /courrier { pseudo, message, mission, site, jeton }   dépose une lettre
//   POST /courrier { action: "masquer" | "montrer", id, cle }  gardien : cache ou remet une lettre
//
// Anti-robots, sans compte ni captcha :
//   - « site » est un champ invisible : s'il est rempli, c'est un robot ;
//   - le jeton prouve que la page a été ouverte au moins 3 secondes avant l'envoi ;
//   - aucun lien dans les lettres (c'est ce que cherchent les spammeurs) ;
//   - 3 lettres par heure et 10 par jour par expéditeur (empreinte anonyme de l'adresse,
//     purgée après 24 h), doublons refusés, coupe-circuit global : voir courrier_poster (SQL).
//
// Déploiement : fonction publique (verify_jwt = false), elle fait ses propres contrôles.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINES = new Set([
  'https://www.chuckmaurice.com',
  'https://chuckmaurice.com',
  'https://www.chuck-maurice.com',
  'https://chuck-maurice.com',
]);
const origineAdmise = (o: string | null): o is string =>
  !!o && (ORIGINES.has(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || /^https:\/\/chuck-maurice-[a-z0-9-]+\.vercel\.app$/.test(o));

const MISSIONS = new Set(['cornichon', 'saucissonator', 'olive-storm', 'mauriiiiice', 'grand-debarras', 'boss-squadron']);
const LIEN = /(https?:\/\/|www\.|\b[a-z0-9-]+\s?(\.|\(dot\)|\[\.\])\s?(com|fr|net|org|ru|cn|xyz|io|co|info|biz|top|site|online|shop|store|app|dev|me|tv|ly|gg|link|click|club|live|pro|eu|de|uk|us|be|ch|ca|cc|vip|icu)\b)/i;
const DELAI_MIN_MS = 3_000;
const DELAI_MAX_MS = 6 * 3_600_000;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

let secrets: { sel: string; cleGardien: string } | null = null;
async function lireSecrets() {
  if (secrets) return secrets;
  const { data, error } = await db.from('courrier_secrets').select('nom, valeur');
  if (error || !data) throw new Error('secrets illisibles');
  const par = Object.fromEntries(data.map((r) => [r.nom, r.valeur]));
  secrets = { sel: par.sel, cleGardien: par.cle_gardien };
  return secrets;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(cle: string, texte: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(cle), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texte)));
}
const egal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function nouveauJeton(sel: string): Promise<string> {
  const t = Date.now().toString(36);
  return `${t}.${(await hmac(sel, `jeton:${t}`)).slice(0, 32)}`;
}
async function ageDuJeton(sel: string, jeton: unknown): Promise<number | null> {
  if (typeof jeton !== 'string') return null;
  const [t, sig] = jeton.split('.');
  if (!t || !sig || !egal(sig, (await hmac(sel, `jeton:${t}`)).slice(0, 32))) return null;
  const ts = parseInt(t, 36);
  return Number.isFinite(ts) ? Date.now() - ts : null;
}

/** Une ligne propre : pas de caractères de contrôle ni invisibles, espaces regroupés. */
const nettoyer = (s: unknown): string =>
  (typeof s === 'string' ? s : '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

Deno.serve(async (req: Request) => {
  const origine = req.headers.get('origin');
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': origineAdmise(origine) ? origine : 'https://www.chuckmaurice.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const refus = (raison: string, status = 400) => json({ ok: false, raison }, status);

  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const { sel, cleGardien } = await lireSecrets();
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const limite = Math.min(50, Math.max(1, Number(url.searchParams.get('limite')) || 30));
      const avant = Number(url.searchParams.get('avant')) || 0;
      const gardien = egal(url.searchParams.get('cle') ?? '', cleGardien);
      let q = db.from('courrier').select('id, pseudo, message, mission, created_at, masque').order('id', { ascending: false }).limit(limite + 1);
      if (!gardien) q = q.eq('masque', false);
      if (avant > 0) q = q.lt('id', avant);
      const [{ data, error }, { count }] = await Promise.all([
        q,
        db.from('courrier').select('id', { count: 'exact', head: true }).eq('masque', false),
      ]);
      if (error) throw error;
      const lettres = (data ?? []).slice(0, limite).map((l) => ({
        id: l.id, pseudo: l.pseudo, message: l.message, mission: l.mission, date: l.created_at, ...(gardien ? { masque: l.masque } : {}),
      }));
      return json({ ok: true, lettres, total: count ?? 0, suite: (data ?? []).length > limite, jeton: await nouveauJeton(sel), ...(gardien ? { gardien: true } : {}) });
    }

    if (req.method !== 'POST') return refus('methode', 405);
    if (!origineAdmise(origine)) return refus('origine', 403);
    const brut = await req.text();
    if (brut.length > 4000) return refus('trop-long', 413);
    let corps: Record<string, unknown>;
    try { corps = JSON.parse(brut); } catch { return refus('format'); }
    if (!corps || typeof corps !== 'object') return refus('format');

    // --- gardien : cacher ou remettre une lettre
    if (corps.action === 'masquer' || corps.action === 'montrer') {
      if (!egal(typeof corps.cle === 'string' ? corps.cle : '', cleGardien)) return refus('cle', 403);
      const id = Number(corps.id);
      if (!Number.isInteger(id)) return refus('format');
      const { error } = await db.from('courrier').update({ masque: corps.action === 'masquer' }).eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    // --- dépôt d'une lettre
    if (nettoyer(corps.site) !== '') return refus('robot', 403);
    const age = await ageDuJeton(sel, corps.jeton);
    if (age === null || age > DELAI_MAX_MS) return refus('jeton', 403);
    if (age < DELAI_MIN_MS) return refus('trop-vite', 429);

    const pseudo = nettoyer(corps.pseudo);
    const message = nettoyer(corps.message);
    const mission = typeof corps.mission === 'string' && MISSIONS.has(corps.mission) ? corps.mission : null;
    if ([...pseudo].length < 1 || [...pseudo].length > 24) return refus('pseudo');
    if ([...message].length < 2 || [...message].length > 280) return refus('message');
    if (LIEN.test(message) || LIEN.test(pseudo)) return refus('lien');

    // adresse posée par Cloudflare (en amont de Supabase) : un client ne peut pas la falsifier
    // (vérifié le 21/11/2026 : un X-Forwarded-For inventé est écrasé avant d'arriver ici)
    const ip = req.headers.get('cf-connecting-ip')?.trim() || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'inconnue';
    const empreinte = (await hmac(sel, `ip:${ip}`)).slice(0, 32);
    const { data, error } = await db.rpc('courrier_poster', { p_pseudo: pseudo, p_message: message, p_mission: mission, p_empreinte: empreinte });
    if (error) throw error;
    if (!data?.ok) return refus(data?.raison ?? 'erreur', 429);
    return json({ ok: true, lettre: { id: data.id, pseudo, message, mission, date: data.date } });
  } catch (e) {
    console.error('courrier', e);
    return refus('panne', 500);
  }
});
