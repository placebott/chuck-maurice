import { rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';

/**
 * public/assets/ contient aussi les illustrations originales (≈ 15 Mo) et les
 * maquettes de référence. Les jeux ne chargent que public/assets/sprites/ :
 * on retire donc les originaux du build pour ne pas les déployer.
 */
function dropSourceArt(): Plugin {
  const dirs = ['characters', 'objects', 'backgrounds', 'references', 'shared', 'saucissonator', 'olive-storm', 'bon-voisinage'];
  let outDir = 'dist';
  return {
    name: 'drop-source-art',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await Promise.all(dirs.map((d) => rm(resolve(outDir, 'assets', d), { recursive: true, force: true })));
    },
  };
}

/* =====================================================================
   RÉFÉRENCEMENT — tout ce que lisent Google et les aperçus de partage.

   Pour chaque page, le plugin ajoute au build : l'adresse canonique,
   l'image de partage (public/og/, générée par `npm run assets:og`), les
   balises Open Graph / Twitter et les données structurées. Il écrit aussi
   sitemap.xml, et recopie en dur dans l'accueil les cartes du tableau JEUX
   (sinon elles n'existent qu'après exécution du JavaScript).

   Nouvelle page de jeu : l'ajouter ici ET dans `input` plus bas.
   ===================================================================== */
const SITE = 'https://www.chuckmaurice.com';
const PAGES: Record<string, { path: string; image: string; game?: { name: string; genre: string } }> = {
  index: { path: '/', image: 'accueil.jpg' },
  cornichon: { path: '/cornichon', image: 'cornichon.jpg', game: { name: 'Opération Cornichon', genre: 'Arcade' } },
  saucissonator: { path: '/saucissonator', image: 'saucissonator.jpg', game: { name: 'Saucissonator 3000', genre: 'Arcade' } },
  'olive-storm': { path: '/olive-storm', image: 'olive-storm.jpg', game: { name: 'Olive Storm', genre: 'Arcade' } },
  mauriiiiice: { path: '/mauriiiiice', image: 'mauriiiiice.jpg', game: { name: 'MAURIIIIICE !!!', genre: 'Arcade' } },
  courrier: { path: '/courrier', image: 'courrier.jpg' },
};
/** Pages servies telles quelles depuis public/ (leurs balises sont écrites à la main). */
const STATIC_PATHS = ['/grand-debarras/'];

interface Jeu {
  titre: string; pitch: string; url: string; genre: string;
  emoji?: string; couleur?: string; image?: string; duree?: string;
  mobile?: boolean; nouveau?: boolean; une?: boolean;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const absolute = (url: string): string => new URL(url, SITE + '/').href;
const jsonLd = (data: unknown): HtmlTagDescriptor => ({
  tag: 'script',
  attrs: { type: 'application/ld+json' },
  children: JSON.stringify(data).replace(/</g, '\\u003c'),
  injectTo: 'head',
});

/** Même rendu que le script de index.html, sans les états propres au visiteur (« ✓ Joué », animation). */
function prerenderHub(html: string): { html: string; jeux: Jeu[] } {
  const source = /const JEUX = (\[[\s\S]*?\n\]);/.exec(html)?.[1];
  if (!source) throw new Error('seo : tableau JEUX introuvable dans index.html');
  const jeux = new Function(`return ${source}`)() as Jeu[];
  const num = (i: number): string => String(i + 1).padStart(3, '0');
  const art = (j: Jeu, i: number): string =>
    `<div class="art" style="--c:${esc(j.couleur || '#555')}" data-num="${num(i)}">${
      j.image ? `<img src="${esc(j.image)}" alt="" loading="lazy">` : `<span class="emo">${esc(j.emoji || '🎮')}</span>`}</div>`;
  const meta = (j: Jeu): string =>
    `<div class="meta"><span>${esc(j.genre)}</span>${j.duree ? `<span>⏱ ${esc(j.duree)}</span>` : ''}${
      j.mobile ? '<span>📱 Mobile</span>' : '<span>⌨️ Clavier</span>'}</div>`;
  const iu = jeux.findIndex((j) => j.une);
  const une = iu < 0 ? '' : `<a class="feature" href="${esc(jeux[iu].url)}">${art(jeux[iu], iu)}
    <div class="body"><span class="num">Mission ${num(iu)}</span><h3>${esc(jeux[iu].titre)}</h3><p>${esc(jeux[iu].pitch)}</p>${meta(jeux[iu])}
    <span class="btn green">▶ Jouer maintenant</span></div></a>`;
  const grid = jeux.map((j, i) => `<a class="card" href="${esc(j.url)}">
  ${j.nouveau ? '<span class="tag-new">Nouveau</span>' : ''}${art(j, i)}<div class="cbody"><span class="num">Mission ${num(i)}</span><h3>${esc(j.titre)}</h3><p>${esc(j.pitch)}</p>${meta(j)}<span class="go">Jouer</span></div></a>`).join('\n');
  const swap = (from: string, to: string): void => {
    if (!html.includes(from)) throw new Error(`seo : repère « ${from} » introuvable dans index.html`);
    html = html.replace(from, () => to);
  };
  swap('<div id="une"></div>', `<div id="une">${une}</div>`);
  swap('<div class="grid" id="grid"></div>', `<div class="grid" id="grid">\n${grid}\n</div>`);
  swap('<span id="count">0</span>', `<span id="count">${jeux.length}</span>`);
  return { html, jeux };
}

function seo(): Plugin {
  return {
    name: 'seo',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const key = basename(ctx.filename, '.html');
        const page = PAGES[key];
        if (!page) return html;
        const url = SITE + page.path;
        const image = `${SITE}/og/${page.image}`;
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Chuck Maurice';
        const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
        const metaTag = (attr: 'property' | 'name', k: string, content: string): HtmlTagDescriptor => ({
          tag: 'meta', attrs: { [attr]: k, content }, injectTo: 'head',
        });
        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, injectTo: 'head' },
          metaTag('property', 'og:url', url),
          metaTag('property', 'og:site_name', 'Chuck Maurice'),
          metaTag('property', 'og:locale', 'fr_FR'),
          metaTag('property', 'og:image', image),
          metaTag('property', 'og:image:width', '1200'),
          metaTag('property', 'og:image:height', '630'),
          metaTag('property', 'og:image:alt', title),
          metaTag('name', 'twitter:card', 'summary_large_image'),
          metaTag('name', 'twitter:image', image),
        ];
        const free = { '@type': 'Offer', price: '0', priceCurrency: 'EUR' };
        if (page.game) {
          tags.push(jsonLd({
            '@context': 'https://schema.org', '@type': 'VideoGame',
            name: page.game.name, description, url, image, inLanguage: 'fr',
            genre: page.game.genre, gamePlatform: 'Navigateur web', applicationCategory: 'Game',
            operatingSystem: 'Tous', offers: free,
            publisher: { '@type': 'Organization', name: 'Chuck Maurice', url: SITE + '/' },
          }));
          return { html, tags };
        }
        if (key !== 'index') {
          tags.push(jsonLd({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url, description, inLanguage: 'fr', isPartOf: { '@type': 'WebSite', name: 'Chuck Maurice', url: SITE + '/' } }));
          return { html, tags };
        }
        const hub = prerenderHub(html);
        tags.push(
          jsonLd({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Chuck Maurice', url, description, inLanguage: 'fr' }),
          jsonLd({
            '@context': 'https://schema.org', '@type': 'ItemList', name: 'Les mini-jeux Chuck Maurice',
            itemListElement: hub.jeux.map((j, i) => ({
              '@type': 'ListItem', position: i + 1,
              item: { '@type': 'VideoGame', name: j.titre, description: j.pitch, url: absolute(j.url), genre: j.genre, gamePlatform: 'Navigateur web', offers: free },
            })),
          }),
        );
        return { html: hub.html, tags };
      },
    },
    generateBundle() {
      const day = new Date().toISOString().slice(0, 10);
      const paths = [...Object.values(PAGES).map((p) => p.path), ...STATIC_PATHS];
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
          paths.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [seo(), dropSourceArt()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // l'accueil (index.html) est le QG qui regroupe tous les jeux : la liste se modifie dans son tableau JEUX.
      // Puis une page par mission : Opération Cornichon, Saucissonator 3000, Olive Storm et MAURIIIIICE !!!
      input: {
        qg: fileURLToPath(new URL('./index.html', import.meta.url)),
        main: fileURLToPath(new URL('./cornichon.html', import.meta.url)),
        saucissonator: fileURLToPath(new URL('./saucissonator.html', import.meta.url)),
        'olive-storm': fileURLToPath(new URL('./olive-storm.html', import.meta.url)),
        mauriiiiice: fileURLToPath(new URL('./mauriiiiice.html', import.meta.url)),
        // Le Courrier des fans : livre d'or (lettres gardées dans Supabase, voir src/courrier.ts)
        courrier: fileURLToPath(new URL('./courrier.html', import.meta.url)),
      },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  server: { host: true },
});
