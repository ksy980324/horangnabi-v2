import { build } from 'vite';
import { gzipSync } from 'node:zlib';

// Measure the actual production import graph, without printing environment values or code.
const result = await build({
  logLevel: 'warn',
  build: { write: false },
});
for (const bundle of Array.isArray(result) ? result : [result]) {
  const files = new Map(bundle.output.map(file => [file.fileName, file]));
  const visited = new Set();
  const chunks = [];
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const chunk = files.get(file);
    if (!chunk || chunk.type !== 'chunk') return;
    chunks.push({ file, bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).length });
    chunk.imports.forEach(visit);
  }
  bundle.output.filter(chunk => chunk.type === 'chunk' && chunk.isEntry).forEach(chunk => visit(chunk.fileName));
  console.log(JSON.stringify({ initialJavaScript: chunks, totalGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0) }, null, 2));
}
