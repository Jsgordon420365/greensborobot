// greensborobot himself.
//  - Body: the canonical pose cut-outs (identity authority), as camera-facing cards.
//  - Tuck: the Rodin model, used only where true 3D rotation is needed
//    (turning his back to us, the cannonball dive, the somersault).
//  - Reach: a shell-fur plush arm + mitten + silver wrist band for the
//    forced-perspective "come on!" beckon.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const POSES = ['stand', 'stand34', 'wave_low', 'wave_high', 'step', 'jump', 'clasp', 'sit'];
const PEEK = ['open', 'half', 'closed', 'left', 'right'];
const STAND_PX = 678;                      // reference pixel height == 1 body height
export const PLUSH = new THREE.Color('rgb(135,176,40)').convertSRGBToLinear();

export async function loadCharacterAssets(base = 'assets/') {
  const tl = new THREE.TextureLoader();
  const load = (u) => new Promise((res, rej) => tl.load(u, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
  const poses = {}, peek = {};
  await Promise.all([
    ...POSES.map(async (p) => (poses[p] = await load(`${base}char/pose_${p}.webp`))),
    ...PEEK.map(async (p) => (peek[p] = await load(`${base}char/peek_${p}.webp`))),
  ]);
  let glb = null;
  try { glb = await new GLTFLoader().loadAsync(`${base}model/greensborobot_lod.glb`); } catch (e) { console.warn('tuck model unavailable', e); }
  return { poses, peek, glb };
}

function cardMaterial(map) {
  return new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
}

export class Bot {
  constructor(assets, height) {
    this.H = height;
    this.assets = assets;
    this.root = new THREE.Group();          // world position = between his feet
    this.card = new THREE.Group();          // billboarded
    this.root.add(this.card);
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.mat = cardMaterial(assets.poses.stand);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: assets.poses.stand, alphaTest: 0.35 });
    this.card.add(this.mesh);
    // soft contact shadow blob
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const g = sc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 1;
    this.root.add(this.blob);
    // tuck model
    this.tuck = new THREE.Group();
    if (assets.glb) {
      const m = assets.glb.scene.clone(true);
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      m.position.sub(c);                    // pivot at the centre of the ball
      const s = (height * 0.74) / size.y;
      const holder = new THREE.Group(); holder.scale.setScalar(s); holder.add(m);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.envMapIntensity = 0.9; } });
      this.tuck.add(holder);
      this.tuckRadius = (size.y * s) / 2;
    } else this.tuckRadius = height * 0.37;
    this.tuck.visible = false;
    this.root.add(this.tuck);
    this.pose = 'stand';
    this.state = { sx: 1, sy: 1, roll: 0, flip: 1, tint: new THREE.Color(1, 1, 1) };
  }
  setPose(p) {
    if (this.pose === p) return;
    this.pose = p;
    const t = this.assets.poses[p];
    this.mat.map = t; this.mesh.customDepthMaterial.map = t;
    this.mat.needsUpdate = true; this.mesh.customDepthMaterial.needsUpdate = true;
  }
  // mode: 'card' | 'tuck' | 'hidden'
  update(camera, { mode = 'card', sx = 1, sy = 1, roll = 0, flipX = 1, tint = 1, tintColor = null, blob = 1, blobY = 0.002 } = {}) {
    const t = this.assets.poses[this.pose].image;
    const h = (t.height / STAND_PX) * this.H, w = (t.width / STAND_PX) * this.H;
    this.card.visible = mode === 'card';
    this.tuck.visible = mode === 'tuck';
    this.mesh.scale.set(w * sx * flipX, h * sy, 1);
    this.mesh.rotation.z = roll;
    // billboard around Y only while standing, fully while airborne-rolling
    const p = new THREE.Vector3(); this.root.getWorldPosition(p);
    const cp = camera.position;
    this.card.rotation.set(0, Math.atan2(cp.x - p.x, cp.z - p.z), 0);
    if (tintColor) this.mat.color.copy(tintColor).multiplyScalar(tint); else this.mat.color.setScalar(tint);
    this.blob.visible = blob > 0.01;
    this.blob.material.opacity = blob;
    this.blob.position.y = blobY - this.root.position.y;
    this.blob.scale.set(this.H * 0.62, this.H * 0.26, 1);
  }
}

// The peek: canonical head card with blink / gaze frames.
export class PeekHead {
  constructor(assets, H) {
    this.assets = assets;
    this.W = 0.54 * H * (760 / 651);
    this.Hh = this.W * (690 / 760);
    this.eyeFromTop = 400 / 690;
    this.mat = new THREE.MeshBasicMaterial({ map: assets.peek.open, transparent: true, alphaTest: 0.3, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.W, this.Hh), this.mat);
    this.root = new THREE.Group();
    this.root.add(this.mesh);
  }
  frame(name) {
    const t = this.assets.peek[name];
    if (this.mat.map !== t) { this.mat.map = t; this.mat.needsUpdate = true; }
  }
  // place so the eye line sits at world height eyeY
  setEyeY(eyeY) { this.mesh.position.y = eyeY + this.Hh * (this.eyeFromTop - 0.5); }
}

// ---------- plush reach: shell-rendered fur ----------
const furVS = /* glsl */`
  uniform float uShell; uniform float uLen;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vUv = uv;
    vec3 p = position + normal * uShell * uLen;
    vec4 w = modelMatrix * vec4(p,1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const furFS = /* glsl */`
  uniform float uShell; uniform vec3 uColor; uniform vec3 uLightDir; uniform vec2 uDensity; uniform float uAmb; uniform vec3 uCam;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  void main(){
    vec2 g = vUv * uDensity;
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float n = h(id);
    float r = (1.0 - uShell * 0.8) * 0.62;
    if (uShell > 0.0 && (n < uShell * 0.7 || length(f + (h(id+3.1)-0.5)*0.25) > r)) discard;
    vec3 N = normalize(vN);
    float lam = clamp(dot(N, normalize(uLightDir))*0.5+0.5, 0.0, 1.0);
    vec3 V = normalize(uCam - vW);
    float rim = pow(1.0 - abs(dot(N, V)), 2.0);
    float ao = mix(0.62, 1.08, uShell);
    vec3 c = uColor * (uAmb + lam) * ao * (0.85 + 0.3 * n) + rim * uColor * 0.5;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

function furMesh(geo, shells, len, density, parent) {
  const g = new THREE.Group();
  const mats = [];
  for (let i = 0; i < shells; i++) {
    const m = new THREE.ShaderMaterial({
      vertexShader: furVS, fragmentShader: furFS,
      uniforms: {
        uShell: { value: i / (shells - 1) }, uLen: { value: len }, uColor: { value: PLUSH.clone() },
        uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.6) }, uDensity: { value: density }, uAmb: { value: 0.45 },
        uCam: { value: new THREE.Vector3() },
      },
    });
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  g.userData.mats = mats;
  parent.add(g);
  return g;
}

export class PlushArm {
  // All sizes in units of body height H.
  constructor(H, envMap) {
    this.H = H;
    this.root = new THREE.Group();      // at the shoulder, +Z points along the reach
    this.len = 0.3 * H;
    const R = 0.075 * H, fur = 0.0075 * H, shells = 22;   // short, dense plush pile
    // arm: unit-length tube along +Z, stretched to the reach (caps would stretch too, so no caps)
    const arm = new THREE.CylinderGeometry(R * 0.95, R * 0.68, 1, 28, 12, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.armGroup = new THREE.Group();
    this.root.add(this.armGroup);
    this.armFur = furMesh(arm, shells, fur, new THREE.Vector2(200, 900), this.armGroup);
    // shoulder joint (not stretched)
    this.shoulderFur = furMesh(new THREE.SphereGeometry(R * 0.7, 20, 14), shells, fur, new THREE.Vector2(120, 80), this.root);
    // hand at the end of the arm
    this.hand = new THREE.Group();
    this.root.add(this.hand);
    const palm = new THREE.SphereGeometry(0.1 * H, 32, 24).scale(1.0, 1.05, 0.62);
    const thumb = new THREE.CapsuleGeometry(0.036 * H, 0.06 * H, 8, 16).rotateZ(0.9).translate(-0.12 * H, 0.0, 0.025 * H);   // a thumb that sticks out, so it reads as a hand
    this.palmFur = furMesh(mergeGeometries([palm, thumb]), shells, fur, new THREE.Vector2(420, 260), this.hand);
    // finger mitt, hinged at the knuckle line (top of the palm)
    this.knuckle = new THREE.Group();
    this.knuckle.position.set(0.005 * H, 0.075 * H, 0);
    this.hand.add(this.knuckle);
    const fingers = new THREE.CapsuleGeometry(0.068 * H, 0.07 * H, 8, 20).scale(1.18, 1, 0.66).translate(0, 0.09 * H, 0);
    this.fingerFur = furMesh(fingers, shells, fur, new THREE.Vector2(300, 220), this.knuckle);
    // silver wrist band (he has one on each wrist)
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088 * H, 0.088 * H, 0.05 * H, 40, 1, true).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xdadfe3, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.3, side: THREE.DoubleSide }),
    );
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.088 * H, 0.008 * H, 8, 40), band.material);
    lip.position.z = 0.025 * H; const lip2 = lip.clone(); lip2.position.z = -0.025 * H;
    this.band = new THREE.Group(); this.band.add(band, lip, lip2);
    this.root.add(this.band);
    this.allFur = [this.armFur, this.shoulderFur, this.palmFur, this.fingerFur];
  }
  // reach: arm length in world units; curl: 0 open palm .. 1 fingers curled (the beckon)
  update(camera, { reach = 0.3, curl = 0, light = [0.4, 0.8, 0.6], amb = 0.45, tint = 1 }) {
    this.armGroup.scale.set(1, 1, Math.max(0.01, reach));
    this.hand.position.set(0, 0, reach + 0.1 * this.H);
    this.band.position.set(0, 0, reach - 0.005 * this.H);
    // palm faces the camera, fingers up
    this.hand.rotation.set(-0.35, 0.35, 0.3);   // palm to us, turned a little so the thumb and mitt read in silhouette
    this.knuckle.rotation.x = curl * 1.6;   // fingers fold toward us
    for (const f of this.allFur) for (const m of f.userData.mats) {
      m.uniforms.uCam.value.copy(camera.position);
      m.uniforms.uLightDir.value.set(...light);
      m.uniforms.uAmb.value = amb;
      m.uniforms.uColor.value.copy(PLUSH).multiplyScalar(tint);
    }
  }
}
