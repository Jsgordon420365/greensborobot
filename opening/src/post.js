// The lens: bloom, then one pass for fisheye (the reach), radial rush (the descent),
// tilt-shift (miniature photography), vignette, fringe and film grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uTime: { value: 0 },
    uBarrel: { value: 0 },          // + = fisheye bulge
    uBarrelCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRush: { value: 0 },            // radial zoom blur
    uTilt: { value: 0 },            // tilt-shift blur strength (px)
    uTiltCenter: { value: 0.45 },
    uTiltBand: { value: 0.16 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uFringe: { value: 0.0015 },
    uFade: { value: 0 },            // fade to black (only for the replay loop)
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
    uniform float uBarrel; uniform vec2 uBarrelCenter; uniform float uRush;
    uniform float uTilt; uniform float uTiltCenter; uniform float uTiltBand;
    uniform float uVignette; uniform float uGrain; uniform float uFringe; uniform float uFade;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec2 barrel(vec2 uv){
      vec2 c = uv - uBarrelCenter; c.x *= uRes.x/uRes.y;
      float r2 = dot(c,c);
      c *= 1.0 / (1.0 + uBarrel * r2);
      c.x /= uRes.x/uRes.y;
      return uBarrelCenter + c * (1.0 + uBarrel * 0.18);
    }
    vec3 tap(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
    void main(){
      vec2 uv = barrel(vUv);
      vec3 col;
      // chromatic fringe grows toward the edges
      vec2 d = (uv - 0.5);
      float fr = uFringe * (1.0 + uBarrel * 1.2) * length(d) * 2.0;
      col = vec3(tap(uv + d*fr).r, tap(uv).g, tap(uv - d*fr).b);
      // tilt-shift: blur grows away from a horizontal focus band
      if (uTilt > 0.0) {
        float band = smoothstep(uTiltBand, uTiltBand + 0.28, abs(uv.y - uTiltCenter));
        float rad = uTilt * band;
        if (rad > 0.2) {
          vec3 acc = col; float w = 1.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996 + h(uv*uRes)*0.5;
            float rr = sqrt(float(i)+0.5)/3.5;
            vec2 o = vec2(cos(a), sin(a)) * rr * rad / uRes;
            acc += tap(uv + o); w += 1.0;
          }
          col = acc / w;
        }
      }
      // radial rush toward the centre (falling down the hole)
      if (uRush > 0.0) {
        vec3 acc = col; float w = 1.0;
        vec2 dir = uv - 0.5;
        for (int i = 1; i < 14; i++) {
          float k = 1.0 - uRush * float(i) / 14.0 * 0.35;
          acc += tap(0.5 + dir * k); w += 1.0;
        }
        col = acc / w;
      }
      // vignette
      vec2 vv = vUv - 0.5; vv.x *= uRes.x/uRes.y * 0.75;
      col *= mix(1.0, smoothstep(0.95, 0.2, length(vv)), uVignette);
      // grain (a whisper of film)
      float g = h(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (0.4 + 0.6 * (1.0 - dot(col, vec3(0.33))));
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  const rp = new RenderPass(scene, camera);
  composer.addPass(rp);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.6, 0.82);
  composer.addPass(bloom);
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  return { composer, renderPass: rp, bloom, lens: lens.uniforms };
}
