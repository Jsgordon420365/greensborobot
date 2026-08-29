# Nagimals

An intention ecology, rendered as a small household of persistent living
things. Runs at [greensborobot.com](https://greensborobot.com).

**Start with [`CONCEPT.md`](./CONCEPT.md).** It is the current design and it is
dated. The shipped app is an earlier generation of the idea and describes
itself accurately in its own comments, so reading the code alone will leave you
confident and out of date. [`CLAUDE.md`](./CLAUDE.md) carries the working rules
for anyone — human or agent — making changes.

## Running it

```bash
npm install
npm run dev        # development server
npm run verify     # sync check, typecheck, lint, unit tests, build
npm run test:e2e   # end-to-end tests against a real browser
```

Node 22 (`.nvmrc`). No credentials are needed: with no Supabase environment
variables the app runs in **Local Demonstration Mode**, where everything lives
in the browser and persists across reloads.

## How it is put together

| | |
|---|---|
| `src/domain` | The rules engine. Pure, deterministic, no environment globals. The single source of truth. |
| `src/services` | Storage. A local repository (IndexedDB + localStorage) and a Supabase one, behind one contract. |
| `src/components/ar` | The 3D and AR view. WebXR with hit-testing, falling back to an orbit viewer, Quick Look, or a state card. |
| `supabase/functions` | Server-side evaluation, action recording, and web push. |

`src/domain` is copied into `supabase/functions/_shared/domain` by
`npm run sync:edge` so the browser and the server cannot disagree about the
rules. Edit the original, never the copy — a test enforces this.

Web push is implemented from the specifications (RFC 8291 encryption, RFC 8292
VAPID) using only WebCrypto, so the same code runs unchanged in the browser,
in Deno, and under Node in tests.

## Deployment

Netlify builds `main` on every push. `netlify.toml` holds the build command,
the SPA fallback, and the cache headers. There is no manual deploy step.
