#!/usr/bin/env node
/**
 * Bundle the Fastify server into a single ESM file with esbuild.
 *
 * Why bundle:
 *  - @sop/shared is a workspace symlink. electron-builder won't pack it
 *    reliably; bundling compiles it straight into the output.
 *  - Avoids shipping the entire root node_modules into the app.
 *
 * What stays external:
 *  - better-sqlite3, sharp — native modules (.node binaries) that can't be
 *    bundled. They're shipped separately and resolved at runtime from the
 *    app's node_modules.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await build({
  entryPoints: [path.join(root, 'server/src/index.ts')],
  outfile: path.join(root, 'server/dist/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Native modules and their loaders must stay external — esbuild can't
  // inline .node binaries.  Everything else (including @sop/shared) is bundled.
  external: ['better-sqlite3', 'sharp'],
  // ESM output needs these shims so bundled CJS deps that reference
  // require/__dirname/__filename keep working.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import { fileURLToPath as __ftp } from 'node:url';",
      "import { dirname as __dn } from 'node:path';",
      'const require = __cr(import.meta.url);',
      'const __filename = __ftp(import.meta.url);',
      'const __dirname = __dn(__filename);',
    ].join('\n'),
  },
  sourcemap: true,
  logLevel: 'info',
});

console.log('✓ server bundled → server/dist/index.js');
