// ACTS I–IV: a white field, one precious-looking handmade medallion,
// which is also a manhole cover, over a real hole in the paper.
import * as THREE from 'three';
import { whitePaper, flutes, medallionFace, kraft } from './textures.js';

export function makeMedallion(R, { layers = 5, thickness = 0.17 } = {}) {
  const face = medallionFace();
  const g = new THREE.Group();
  const edgeTex = flutes(9, [150, 120, 80]);
  edgeTex.repeat.set(8, 1);
  const lt = thickness / layers;
  // stacked, slightly mis-registered corrugated discs: the evidence of making
  for (let i = 0; i < layers; i++) {
    const rr = R * (0.985 + ((i * 37) % 7) * 0.004);
    const side = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.95, color: 0xd8c8a8 });
    const cap = new THREE.MeshStandardMaterial({ map: kraft(50 + i, [170, 135, 90], false), roughness: 1 });
    const d = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 0.998, lt * 0.96, 96, 1), [side, cap, cap]);
    d.position.set(((i * 13) % 5 - 2) * 0.004 * R, lt * (i + 0.5), ((i * 7) % 5 - 2) * 0.004 * R);
    d.rotation.y = i * 0.7;
    d.castShadow = d.receiveShadow = true;
    g.add(d);
  }
  // the emerald-and-gold face on top
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.995, 128),
    new THREE.MeshStandardMaterial({
      map: face.map, metalnessMap: face.metal, roughnessMap: null, bumpMap: face.bump, bumpScale: 2.2,
      metalness: 0.75, roughness: 0.42, envMapIntensity: 1.25,
    }),
  );
  // gold should be shiny, card should be matte: drive roughness from the metal mask
  top.material.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
       #ifdef USE_METALNESSMAP
         roughnessFactor = mix(0.9, 0.3, texture2D(metalnessMap, vMetalnessMapUv).g);
       #endif`);
  };
  top.rotation.x = -Math.PI / 2;
  top.position.y = thickness + 0.001;
  top.receiveShadow = true;
  g.add(top);
  g.userData.thickness = thickness;
  g.userData.face = top;
  return g;
}

export class WhiteStage {
  constructor(envMap) {
    const R = 1.0;
    this.R = R;
    this.scene = new THREE.Scene();
    // paper white, pushed a little past 1.0 so it matches the lit floor after tone mapping (an infinity sweep)
    this.scene.background = new THREE.Color(1.32, 1.3, 1.25);
    this.scene.fog = new THREE.Fog(new THREE.Color(1.32, 1.3, 1.25), 14, 34);
    this.scene.environment = envMap;
    const s = this.scene;
    // lights: soft top-left key with a real shadow, like the product shot in the film
    s.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.35));
    const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
    key.position.set(-4, 9, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -5;
    key.shadow.camera.right = key.shadow.camera.top = 5;
    key.shadow.radius = 6; key.shadow.blurSamples = 16; key.shadow.bias = -0.0004;
    s.add(key);
    this.key = key;
    // glint light that sweeps across the gold
    this.glint = new THREE.PointLight(0xfff2cc, 0, 4, 1.5);
    s.add(this.glint);

    // paper floor with a hole in it
    const floorMat = new THREE.MeshStandardMaterial({ map: whitePaper(), roughness: 1, color: 0xffffff });
    const floor = new THREE.Mesh(new THREE.RingGeometry(R, 60, 160, 1), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // the shaft: corrugated torn rim, then black
    const rimTex = flutes(12, [170, 140, 100], 1); rimTex.repeat.set(10, 1);
    const shaftRim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.16, 96, 1, true),
      new THREE.MeshStandardMaterial({ map: rimTex, side: THREE.BackSide, roughness: 1, color: 0x8a7a66 }));
    shaftRim.position.y = -0.08;
    s.add(shaftRim);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 30, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide }));
    shaft.position.y = -15.16;
    s.add(shaft);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ color: 0 }));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.5;
    this.holeBottom = bottom;             // a dark disc just inside, so the hole reads black from above
    s.add(bottom);

    // the medallion / cover, hinged at its back edge
    this.hinge = new THREE.Group();
    this.hinge.position.set(0, 0, -R * 1.02);
    s.add(this.hinge);
    this.medallion = makeMedallion(R * 1.07);
    this.medallion.position.set(0, 0, R * 1.02);
    this.hinge.add(this.medallion);
    this.coverFree = new THREE.Group();   // after the pop the cover is thrown free
    s.add(this.coverFree);
  }
}
