#!/usr/bin/env node
/**
 * RSC boundary guard (master_plan §2BN - incident 2026-09-15, Players tab crash).
 *
 * React Server Components cannot pass FUNCTIONS as props to Client Components ('use client'). Doing so
 * type-checks, builds, and passes unit tests, then throws at request time and shows the error page. The
 * Players tab went down for every signed-in user because a server component passed
 * `hrefFor={(n) => ...}` to the client `PlayersPagination`.
 *
 * This check scans every server-side .tsx under apps/web/src (no 'use client' directive), finds the
 * components it imports from 'use client' modules, and fails when one of those components is given an
 * inline function prop: `prop={(...) => ...}`, `prop={async (...) =>`, `prop={function ...}`, or an event
 * handler prop `onXxx={...}`.
 *
 * Heuristic by design (regex, no TS compiler): it catches the inline-function mistake that caused the
 * incident. A function passed via a variable is not detected - prefer strings/serializable data, and
 * mark genuine server actions with 'use server' (those ARE allowed: module-level imports from files
 * starting with 'use server' are skipped).
 *
 * Exit 1 with a report when a violation is found. Wired into `npm run lint` (and therefore CI).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
);
const SRC = join(ROOT, 'apps', 'web', 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const directive = (src) => {
  const head = src.replace(/^\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*/g, '').trimStart();
  if (/^['"]use client['"]/.test(head)) return 'client';
  if (/^['"]use server['"]/.test(head)) return 'server-actions';
  return 'server';
};

const cache = new Map();
function kindOf(file) {
  if (!cache.has(file)) cache.set(file, directive(readFileSync(file, 'utf8')));
  return cache.get(file);
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const cand of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

// A module without a directive runs on the CLIENT when a client module imports it (directly or
// transitively) - e.g. wizard steps imported by the 'use client' wizard. Only modules never reached
// from a client module are true Server Components. Build that "client context" set first.
const allFiles = [...walk(SRC), ...walkTs(SRC)];
function walkTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walkTs(p, out);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    if (/^\s*import\s+type\b/.test(m[0]) || /^\s*export\s+type\b/.test(m[0])) continue;
    const target = resolveImport(file, m[1]);
    if (target) out.push(target);
  }
  return out;
}
const clientContext = new Set(allFiles.filter((f) => kindOf(f) === 'client'));
const queue = [...clientContext];
while (queue.length) {
  const f = queue.pop();
  for (const dep of importsOf(f)) {
    if (!clientContext.has(dep) && kindOf(dep) !== 'server-actions') {
      clientContext.add(dep);
      queue.push(dep);
    }
  }
}

const violations = [];

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  if (kindOf(file) !== 'server' || clientContext.has(file)) continue;

  // Map local component names → imported from a 'use client' module.
  const clientNames = new Set();
  const importRe =
    /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]|import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(src))) {
    if (m[1]) continue; // type-only import
    const spec = m[3] ?? m[5];
    const target = resolveImport(file, spec);
    if (!target || kindOf(target) !== 'client') continue;
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const clean = part.replace(/\btype\b/, '').trim();
        if (!clean) continue;
        const local = clean.includes(' as ') ? clean.split(' as ')[1].trim() : clean;
        if (/^[A-Z]/.test(local)) clientNames.add(local);
      }
    } else if (m[4]) {
      clientNames.add(m[4]);
    }
  }
  if (clientNames.size === 0) continue;

  // For each JSX usage of a client component, inspect its props up to the tag end.
  for (const name of clientNames) {
    const tagRe = new RegExp(`<${name}(?=[\\s/>])`, 'g');
    let t;
    while ((t = tagRe.exec(src))) {
      // Walk forward to the end of the opening tag, respecting {...} nesting and strings.
      let i = t.index + name.length + 1;
      let depth = 0;
      let quote = null;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (quote) {
          if (ch === quote && src[i - 1] !== '\\') quote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '>' && depth === 0 && src[i - 1] !== '=') break;
      }
      const tag = src.slice(t.index, i);
      const fnProp =
        /\s([a-zA-Z][A-Za-z0-9]*)=\{\s*(async\s*)?(\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>/.exec(tag) ||
        /\s([a-zA-Z][A-Za-z0-9]*)=\{\s*(async\s+)?function\b/.exec(tag) ||
        /\s(on[A-Z][A-Za-z0-9]*)=\{/.exec(tag);
      if (fnProp) {
        const line = src.slice(0, t.index).split('\n').length;
        violations.push({ file: relative(ROOT, file), line, component: name, prop: fnProp[1] });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    'check-rsc-function-props: FAILED - a server component passes a function to a Client Component.',
  );
  console.error(
    'React Server Components cannot serialize functions; this crashes the page at request time.',
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  <${v.component} ${v.prop}={...}>`);
  }
  console.error(
    'Fix: pass serializable data (strings, numbers, arrays) and build the function inside the client component.',
  );
  process.exit(1);
}
console.log('check-rsc-function-props: OK (no function props from server to client components).');
