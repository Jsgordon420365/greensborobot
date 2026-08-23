/**
 * Copies the pure rules package into the Edge Function bundle.
 *
 * `src/domain` is the single source of truth for escalation. The Supabase CLI
 * bundles only what lives under `supabase/functions`, so a verbatim copy goes
 * to `supabase/functions/_shared/domain`. Nothing is edited on the way across.
 *
 *   npm run sync:edge          copies
 *   npm run sync:edge -- --check   fails if the copy has drifted
 *
 * `src/test/edgeSync.test.ts` runs the check, so drift breaks the suite rather
 * than quietly shipping two different rulebooks.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../src/domain');
const TARGET = resolve(here, '../supabase/functions/_shared/domain');

const HEADER = `// GENERATED FILE — do not edit.
// Copied verbatim from src/domain by scripts/sync-edge-domain.mjs.
// Edit the original and run \`npm run sync:edge\`.
`;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

const files = walk(SOURCE);
const check = process.argv.includes('--check');
const drift = [];

for (const file of files) {
  const rel = relative(SOURCE, file);
  const dest = join(TARGET, rel);
  const contents = HEADER + readFileSync(file, 'utf8');

  if (check) {
    let existing = null;
    try {
      existing = readFileSync(dest, 'utf8');
    } catch {
      existing = null;
    }
    if (existing !== contents) drift.push(rel);
    continue;
  }

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);
}

if (check) {
  if (drift.length > 0) {
    console.error(
      `The Edge Function copy of the rules package has drifted:\n  ${drift.join('\n  ')}\n` +
        'Run `npm run sync:edge` to bring it back in step.',
    );
    process.exit(1);
  }
  console.log(`Edge Function rules copy is in sync (${files.length} files).`);
} else {
  // Remove anything the source no longer has, so deletions propagate.
  const copied = new Set(files.map((f) => relative(SOURCE, f)));
  try {
    for (const file of walk(TARGET)) {
      const rel = relative(TARGET, file);
      if (!copied.has(rel)) rmSync(file);
    }
  } catch {
    // The target may not exist on a first run; nothing to prune.
  }
  console.log(`Copied ${files.length} rules files to supabase/functions/_shared/domain.`);
}
