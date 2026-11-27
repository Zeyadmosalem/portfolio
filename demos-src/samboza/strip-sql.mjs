// Copies the migrations for the demo with every comment removed and the real
// family's names swapped for the demo family's, so the published bundle says
// nothing about the real household. Usage: node strip-sql.mjs <in-dir> <out-dir>
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const [, , inDir, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });

function stripComments(sql) {
  let out = ''; let i = 0; let quote = false;
  while (i < sql.length) {
    const c = sql[i]; const n = sql[i + 1];
    if (quote) {
      out += c;
      if (c === "'" && n === "'") { out += n; i += 2; continue; }
      if (c === "'") quote = false;
      i += 1; continue;
    }
    if (c === "'") { quote = true; out += c; i += 1; continue; }
    if (c === '-' && n === '-') { while (i < sql.length && sql[i] !== '\n') i += 1; continue; }
    if (c === '/' && n === '*') { const end = sql.indexOf('*/', i + 2); i = end < 0 ? sql.length : end + 2; continue; }
    out += c; i += 1;
  }
  return out;
}

const NAMES = [[/\bAbdo\b/g, 'Karim'], [/\bGhada\b/g, 'Laila'], [/\bJoe\b/g, 'Sami'], [/\bMarwa\b/g, 'Salma'],
  [/\bZeyad\b/g, 'Omar'], [/\bRewan\b/g, 'Nada'], [/\bMona\b/g, 'Hoda'], [/\bAnas\b/g, 'Malek']];

for (const f of readdirSync(inDir).filter((x) => x.endsWith('.sql')).sort()) {
  let sql = stripComments(readFileSync(`${inDir}/${f}`, 'utf8'));
  sql = sql.replace(/comment\s+on\s+[^;']*?\s+is\s+'(?:[^']|'')*'(?:\s*'(?:[^']|'')*')*\s*;/gis, '');
  for (const [re, to] of NAMES) sql = sql.replace(re, to);
  sql = sql.replace(/\n\s*\n+/g, '\n');
  writeFileSync(`${outDir}/${f}`, sql);
}
