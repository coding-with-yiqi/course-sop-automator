import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { registerDocumentRoutes } from './documents.js';
import { paths, ensureDir } from '../util/paths.js';

const DOC_ID = 'doc_export_test';
const CN_NAME = '我的操作说明书.html'; // Chinese filename — the original 404 bug

async function buildApp() {
  const app = Fastify();
  registerDocumentRoutes(app);
  await app.ready();
  return app;
}

describe('export/download route — Chinese filename (404 bug)', () => {
  let exportDir: string;

  beforeAll(() => {
    exportDir = paths.exports(DOC_ID);
    ensureDir(exportDir);
    fs.writeFileSync(path.join(exportDir, CN_NAME), '<html><pre><code>x</code></pre></html>');
  });
  afterAll(() => {
    fs.rmSync(exportDir, { recursive: true, force: true });
  });

  it('serves a Chinese-named export with a UTF-8 Content-Disposition', async () => {
    // @fastify/static 404'd on URL-encoded Chinese paths; this dedicated route
    // streams the file with Content-Disposition filename* (RFC 5987) instead.
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/documents/${DOC_ID}/export/download?name=${encodeURIComponent(CN_NAME)}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    const cd = res.headers['content-disposition'] as string;
    expect(cd).toContain("filename*=UTF-8''");
    expect(cd).toContain(encodeURIComponent(CN_NAME));
    expect(res.body).toContain('<pre><code>');
  });

  it('rejects path traversal in name', async () => {
    const app = await buildApp();
    for (const bad of ['../secret.txt', 'a/b.html', '..\\x']) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/documents/${DOC_ID}/export/download?name=${encodeURIComponent(bad)}`,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('404 when the named export file does not exist', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/documents/${DOC_ID}/export/download?name=${encodeURIComponent('不存在.html')}`,
    });
    expect(res.statusCode).toBe(404);
  });
});
