import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export function pwaBuild(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'horangnabi-pwa', apply: 'build',
    configResolved(value) { config = value; },
    async closeBundle() {
      if (!config.build.write) return;
      const directory = resolve(config.root, config.build.outDir);
      const html = await readFile(resolve(directory, 'index.html'), 'utf8');
      const entryAssets = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.(?:js|css))"/g)].map(match => match[1]);
      if (!entryAssets.some(path => path.endsWith('.js'))) throw new Error('PWA build entry was not found.');
      // Large map/auth chunks are cached on first use, not downloaded on install.
      const assets = [...new Set(['offline.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', ...entryAssets])];
      const workerPath = resolve(directory, 'offline-worker.js');
      const source = await readFile(workerPath, 'utf8');
      const hash = createHash('sha256').update(source).update(html);
      for (const asset of assets) hash.update(await readFile(resolve(directory, asset)));
      await writeFile(workerPath, source
        .replace("const APP_VERSION = 'development';", `const APP_VERSION = '${hash.digest('hex').slice(0, 16)}';`)
        .replace('const APP_ASSETS = [];', `const APP_ASSETS = ${JSON.stringify(assets)};`));
    },
  };
}
