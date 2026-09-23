# greensborobot — opening cinematic (v1)

A real-time WebGL (three.js) entrance for greensborobot.com. No build step; plain ES modules.

## Run it

From the repository root:

    npm run dev:opening          # the opening alone, with hot reload
    npm run build                # Nagimals into dist/app, then the opening into dist/

Review captures: `python opening/tools/devserver.py 8767 dist` serves the built site and accepts
frame captures. Open `/?debug` and call `__gbb.shot(t, name)`. Frames land in `dist/versions/frames/`.
URL switches: `?debug` (time readout) · `?t=41` (start at a moment) · `?freeze`.

## Where it sits on greensborobot.com

`/` is this opening; its "enter greensborobot" button leads to Nagimals at `/app/`.
Old Nagimals links (`/index.html#/…`, installed home-screen apps) are bounced into `/app/` by a
one-line script in `index.html`. `public/sw.js` retires the old root-scoped Nagimals service worker.
three.js is bundled and the Fredoka font is self-hosted: the page makes no CDN requests.

## Where to change things

| To change | Edit |
|---|---|
| Every beat's timing (acts I–IX), the wait/click behaviour | `src/config.js` → `T`, `WAIT`, `T2` |
| Swing trajectory (pivot, over-the-shoulder start, release), landing spot, city camera | `src/config.js` → `CITY` |
| White-world cameras, the peek, the reach, the dive | `src/main.js` → `whiteFrame()` |
| City camera, swing/flip/landing, snap, his poses in Act IX | `src/main.js` → `cityFrame()` |
| Buildings, road, trees, moon, lamps, cars, people, dogs, beacon, title projection | `src/city.js` (one `build*()` per element) |
| Medallion / manhole construction | `src/whiteStage.js` → `makeMedallion()` |
| Cardboard, felt, flutes, medallion art, facades, backdrop, title gobo | `src/textures.js` |
| Lens: fisheye, rush blur, tilt-shift, grain | `src/post.js` |
| All sound (synthesized, no files) | `src/audio.js` |
| Character: pose cards, peek frames, tuck model, plush arm | `src/character.js` |

## Assets

- `public/media/char/`: pose cut-outs from the lineup and peek/blink/gaze frames from the seated
  close-up, as webp. `tools/cutout.py` and `tools/head_frames.py` made them from the reference
  images, which are kept out of this public repository.
- `public/media/model/greensborobot_lod.glb`: the Rodin model decimated, webp textures, 5 MB.
- `public/media/fonts/`: Fredoka (SIL Open Font License).

## Identity decisions

- The canonical images are the character. Every on-camera beat that shows his face uses them directly.
- The Rodin model appears only where real 3D rotation is needed: turning his back, the cannonball
  dive, the somersault. In those beats he is tucked (the model is seated), so the swap is hidden
  inside a crouch or mid-air.
- The giant reaching arm is procedural shell fur in the sampled plush green, with a silver wrist band.

## Known gaps / next pass

- The reach is a 3D plush approximation. His own card arm still hangs on that side, and the
  beckon is a mitten curl. A painted/rendered hero asset of the reaching hand would beat it.
- Poses are limited to the 8 lineup cards, so the wave is a 2-frame toggle. More canonical poses
  (e.g. a snap, holding the rope, a landing crouch) would slot straight into `assets/char/`.
- Landmarks are cardboard interpretations (Jefferson Standard, Lincoln Financial tower, Carolina
  Theatre, Revolution Mill, a GSO water tower). Check them against local knowledge.
- The title uses the Fredoka font as a stand-in for a real wordmark (`TITLE` in config.js).
- No reduced-motion variant yet.
