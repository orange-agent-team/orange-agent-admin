import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

if (!process.version.startsWith('v22.23.2')) throw new Error('Use the pinned Node 22.23.2 toolchain');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cwd = path.join(root, 'apps/admin');
const contracts = path.join(root, 'docs/contracts');
const snapshot = JSON.parse(readFileSync(path.join(contracts, 'snapshot.json'), 'utf8'));
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
if (process.argv.includes('--browser')) {
  const result = spawnSync(process.execPath, [npm, 'run', 'test:e2e'], { cwd, env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
