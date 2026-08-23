/**
 * Guards the single source of truth.
 *
 * `src/domain` is the rulebook. `supabase/functions/_shared/domain` is a
 * generated copy so the Supabase CLI can bundle it. If the two ever diverge,
 * Connected Mode and Local Demonstration Mode would silently disagree about
 * when a dog should bark — so that divergence fails the build here instead.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SOURCE = join(ROOT, 'src/domain');
const TARGET = join(ROOT, 'supabase/functions/_shared/domain');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

describe('the Edge Function rules copy', () => {
  it('is in sync with src/domain', () => {
    expect(() =>
      execFileSync('node', ['scripts/sync-edge-domain.mjs', '--check'], {
        cwd: ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('contains every rules file', () => {
    const source = walk(SOURCE).map((f) => f.slice(SOURCE.length));
    const target = walk(TARGET).map((f) => f.slice(TARGET.length));
    expect(target).toEqual(source);
  });

  it('imports nothing outside the rules package', () => {
    for (const file of walk(SOURCE)) {
      const contents = readFileSync(file, 'utf8');
      const imports = [...contents.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const specifier of imports) {
        // A bare specifier would mean a dependency Deno cannot resolve; an
        // upward path would mean the rules package reaches into the app.
        expect(specifier.startsWith('./') || specifier.startsWith('../')).toBe(true);
        expect(specifier).not.toMatch(/\.\.\/\.\.\//);
      }
    }
  });

  it('uses explicit .ts extensions so Deno can resolve it', () => {
    for (const file of walk(SOURCE)) {
      const contents = readFileSync(file, 'utf8');
      const imports = [...contents.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);
      for (const specifier of imports) {
        expect(specifier.endsWith('.ts')).toBe(true);
      }
    }
  });

  it('touches no browser or Node global', () => {
    // The rules must run identically in a browser, in Deno and under test.
    // Match actual global *usage*, not a local named `window` or a comment.
    const forbidden =
      /(?:^|[^.\w])(?:window|document|localStorage|sessionStorage|indexedDB|navigator)\s*\.|process\.env|\brequire\s*\(/;
    for (const file of walk(SOURCE)) {
      const contents = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(contents, `${file} must stay environment-neutral`).not.toMatch(forbidden);
    }
  });
});
