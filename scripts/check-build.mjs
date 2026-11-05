// Verifies the build against CrazyGames' technical limits.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const LIMITS = { totalMB: 250, initialMB: 50, mobileMB: 20, files: 1500 };
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk('dist');
const total = files.reduce((a, f) => a + statSync(f).size, 0);
const gz = files.reduce((a, f) => a + gzipSync(readFileSync(f)).length, 0);
const html = readFileSync('dist/index.html', 'utf8');
const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
const mb = (b) => (b / 1048576).toFixed(2);
console.log(`files: ${files.length} (limit ${LIMITS.files})`);
console.log(`total: ${mb(total)} MB, gzipped ${mb(gz)} MB (limits: ${LIMITS.totalMB} MB total, ${LIMITS.initialMB} MB initial, ${LIMITS.mobileMB} MB for the mobile homepage)`);
for (const f of files.sort((a, b) => statSync(b).size - statSync(a).size).slice(0, 8)) console.log(`  ${(statSync(f).size / 1024).toFixed(0).padStart(7)} KB  ${f}`);
const problems = [];
if (files.length > LIMITS.files) problems.push('too many files');
if (total > LIMITS.mobileMB * 1048576) problems.push('over the 20 MB mobile homepage limit');
if (absolute.length) problems.push(`absolute paths in index.html: ${absolute.join(', ')}`);
if (!files.some((f) => f === path.join('dist', 'index.html'))) problems.push('index.html must be at the upload root');
if (problems.length) { console.error('FAILED:', problems.join('; ')); process.exit(1); }
console.log('OK: within CrazyGames limits');
