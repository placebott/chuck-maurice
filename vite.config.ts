import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * public/assets/ contient aussi les illustrations originales (≈ 15 Mo) et les
 * maquettes de référence. Le jeu ne charge que public/assets/sprites/ :
 * on retire donc les originaux du build pour ne pas les déployer.
 */
function dropSourceArt(): Plugin {
  const dirs = ['characters', 'objects', 'backgrounds', 'references', 'shared', 'saucissonator'];
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

export default defineConfig({
  base: './',
  plugins: [dropSourceArt()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  server: { host: true },
});
