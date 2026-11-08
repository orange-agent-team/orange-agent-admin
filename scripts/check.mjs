import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

if (process.version !== 'v22.23.2') throw new Error('Use the pinned Node 22.23.2 toolchain');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cwd = path.join(root, 'apps/admin');
const contracts = path.join(root, 'docs/contracts');
const snapshot = JSON.parse(readFileSync(path.join(contracts, 'snapshot.json'), 'utf8'));
if (snapshot.source_repository !== 'orange-agent-server' || !/^[0-9a-f]{40}$/.test(snapshot.source_commit ?? '')) throw new Error('Fixed producer commit required');
const expectedSources = { 'admin.openapi.json': 'contracts/openapi/admin.v1.json', 'admin.schema.json': 'contracts/json-schema/admin.schema.json' };
if (Object.keys(snapshot.files).sort().join() !== Object.keys(expectedSources).sort().join()) throw new Error('Unexpected snapshot inventory');
for (const [name, entry] of Object.entries(snapshot.files)) if (entry.source !== expectedSources[name]) throw new Error('Unexpected contract origin path');
const api = JSON.parse(readFileSync(path.join(contracts, 'admin.openapi.json'), 'utf8'));
if (api.info.version !== snapshot.openapi_version) throw new Error('Contract version differs from snapshot');

for (const [name, entry] of Object.entries(snapshot.files)) {
  const actual = createHash('sha256').update(readFileSync(path.join(contracts, name))).digest('hex');
  if (actual !== entry.sha256) throw new Error(`Contract snapshot changed: ${name}`);
}
const npm = path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
const env = { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH };
for (const command of ['test', 'build']) {
  const result = spawnSync(process.execPath, [npm, 'run', command], { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const dist = path.join(cwd, 'dist');
const manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  initial.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key);
const chunks = Object.entries(manifest).filter(([, chunk]) => chunk.file.endsWith('.js'))
  .map(([key, chunk]) => ({ file: chunk.file, bytes: statSync(path.join(dist, chunk.file)).size, initial: initial.has(key) }));
const report = { initial_js_bytes: chunks.filter(c => c.initial).reduce((sum, c) => sum + c.bytes, 0),
  largest_chunk_bytes: Math.max(...chunks.map(c => c.bytes)), chunks };
writeFileSync(path.join(dist, 'bundle-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Bundle: initial JS ${report.initial_js_bytes} bytes; largest chunk ${report.largest_chunk_bytes} bytes`);
if (report.largest_chunk_bytes > 500000) throw new Error('JavaScript chunk exceeds the unchanged 500 kB budget');
if (process.argv.includes('--browser')) {
  const result = spawnSync(process.execPath, [npm, 'run', 'test:e2e'], { cwd, env: { ...env, ORANGE_ADMIN_TEST_BUILD: '1' }, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
