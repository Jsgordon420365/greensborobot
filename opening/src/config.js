// greensborobot opening — every editable timing / position lives here.
// All times are seconds on the master timeline. The timeline HOLDS at WAIT.at
// (the beckon) until the visitor clicks/taps, then continues.

export const T = {
  // ACT I — nothing but the object
  medallionIn: [0.3, 2.2],        // medallion resolves out of white
  glint: 2.9,                     // light sweeps the gold
  pushIn: [0.0, 5.6],             // slow camera push toward the object

  // ACT II — something is under there
  rattle: 5.6,                    // tiny tremble of the cover
  lift: [6.3, 6.9],               // front edge lifts, dark slit
  eyesUp: [7.0, 7.7],             // eyes rise into the slit
  lookL: 8.0, lookR: 8.8, lookC: 9.5,
  blinks: [10.0, 10.55, 10.8],
  recognise: 11.4,                // eyes widen: he has seen *us*

  // ACT III — come on
  pop: 12.0,                      // cover flips off, he launches
  popLand: 12.85,                 // lands on the paper in front of the hole
  wave: [13.4, 15.0],
  reach: [15.0, 16.0],            // giant plush arm reaches at the camera
  // WAIT happens at reach end
};

export const WAIT = {
  at: 16.2,                       // timeline freezes here while he beckons
  autoAdvance: 0,                 // seconds; 0 = wait for the visitor forever
  hintAfter: 3.5,                 // show the tiny "follow" hint after this long
};

export const T2 = {
  // ACT IV — down the hole  (these are relative to WAIT.at, added at runtime)
  retract: [0.0, 0.45],
  turn: [0.35, 0.85],
  hop: [0.85, 1.55],              // hop up, dive into the hole
  descend: [1.2, 3.3],            // camera follows him down
  black: 3.3,                     // hole has eaten the screen
  // ACT V — build the world (relative)
  stars: [4.1, 7.6],
  backdrop: [6.4, 9.4],
  build: [7.6, 13.6],
  road: [12.4, 15.2],
  trees: [14.2, 16.2],
  props: [14.8, 16.6],
  moon: 16.8,                     // moon drops; settles over ~2.4s
  // ACT VI — dusk becomes alive
  windows: [19.2, 22.4],
  lamps: [19.8, 21.8],
  cars: 21.6, people: 22.6, dogs: 23.6,
  takeIn: [19.0, 30.5],           // slow camera drift while we look
  // ACT VII — something huge behind us
  creak: 29.9,
  swing: [30.4, 32.0],            // over the shoulder -> release (he fills the top-right ~u .6-.75)
  // ACT VIII — the landing
  land: 32.85,
  settle: [32.85, 34.4],
  // ACT IX — title is part of the world
  snap: 34.9,
  beaconUp: [35.2, 36.1],         // lamp rises out of the city manhole
  beaconFlip: [36.6, 37.5],       // he flips it away from us, beam climbs
  title: [37.5, 39.4],
  enterHint: 41.5,
};

// City stage geometry (units ≈ decimetres of cardboard)
export const CITY = {
  camera: { pos: [0, 3.6, 14.5], look: [0, 3.2, 0], fov: 42 },
  final: { pos: [0, 4.2, 16.6], look: [0, 5.2, 0], fov: 46 },   // wide enough for him + the title
  landing: [-0.35, 0, 3.15],
  manhole: [1.55, 0, 3.55],
  charHeight: 1.35,
  // pendulum the swing is built around (behind the audience, above the stage)
  pivot: [0.2, 18.0, 4.6],
  swingStart: [1.1, 7.0, 16.3],   // behind + above the camera's right shoulder
  swingRelease: [0.0, 3.2, 6.9],
};

export const WHITE = {
  camera0: { pos: [0, 9.2, 13.5], look: [0, 0, 0.1], fov: 26 },
  camera1: { pos: [0, 4.4, 7.4], look: [0, 0.35, 0.3], fov: 28 },
  holeR: 1.0,
  charHeight: 3.2,
};

export const TITLE = { text: 'greensborobot', font: '"Fredoka", "Baloo 2", system-ui, sans-serif' };
