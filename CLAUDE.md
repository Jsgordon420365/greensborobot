# Working in this repository

## Read `CONCEPT.md` first

**The code is an earlier generation than the design.** The build is faithful to
a 2025-era conception of Nagimals — animal companions attached to tasks, with
PARA-ish labels and an escalation engine that gets louder as things are
neglected. It describes itself accurately in its own comments, which makes
reading the code a closed loop: you will come away confident and wrong.

`CONCEPT.md` is the current canon and is dated. Read it before reasoning about
the domain model, the rules engine, or what any creature is *for*.

## Treat remembered context as potentially stale

This applies to more than this repository. Infrastructure, tool availability,
versions, hosts, paths, deployment state and project status all change faster
than any description of them. Prefer dated evidence and direct inspection over
recall. If a fact matters, establish it now rather than inferring a toolbox
from an older conversation.

Within this repo specifically: the concept has moved several times. Do not
merge incompatible generations merely because they share the name "Nagimals".

## Ask rather than infer on design questions

The gap between the shipped app and the concept is structural, not cosmetic.
When a change touches what the system *means* — the hierarchy, what plants
represent, what a Speaker does, when escalation is appropriate — that is the
author's call. Implementation detail is yours; design intent is not.

## House rules that came out of real defects

These are recorded because each one shipped and had to be found by hand.

- **Never `touch-action: none` on a 3D viewer.** It hands every touch gesture
  to the canvas. The viewer fills most of a phone screen, so the page becomes
  unscrollable. Use `pan-y`.
- **Controls name the action, not the state.** A button reading "Sound off"
  next to a row of tabs is indistinguishable from a status label, and nobody
  presses it. Say "Turn sound on".
- **Do not gate features behind setup.** Reaching for the household is the
  request; satisfy it rather than presenting a disabled tab and a dead end.
- **No CDN fetches at runtime.** The app must render with no network at all.
  drei's `<Environment>` downloads an HDR and took the whole scene down when it
  failed. Plain lights only.
- **`.nvmrc` wins over `netlify.toml`.** Netlify reads it in preference to
  `NODE_VERSION`, so a stale `.nvmrc` fails the build with an error that points
  at the bundler instead.

## Verifying

`npm run verify` runs the whole chain: edge-domain sync check, typecheck, lint,
unit tests, build.

- `src/domain` is the single source of truth for rules and is synced into
  `supabase/functions/_shared/domain`. Never edit the copy; run `npm run
  sync:edge`. A test guards the drift.
- End-to-end tests are `npm run test:e2e`. They run against a real Chromium in
  the sandbox and cover the scenario walkthrough, AR pathways and PWA
  behaviour.
- Deployment is automatic: Netlify builds `main` on push. There is no manual
  deploy step.
