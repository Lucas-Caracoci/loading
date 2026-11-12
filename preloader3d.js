import * as THREE from 'three';

/* =========================================================================
   0. LOGO VARIANTS (switchable via button / keys 1-5 / ?logo=<id>)
   ========================================================================= */

const LOGO_VARIANTS = [
  { id: 'brasao',     label: 'Brasão',          src: './assets/variants/brasao.png' },
  { id: 'brasao-jpg', label: 'Brasão (JPG)',    src: './assets/variants/brasao-jpg.png' },
  { id: 'vertical',   label: 'Logo Vertical',   src: './assets/Logo_PMAC_Vertical(1).png' },
  { id: 'horizontal', label: 'Logo Horizontal', src: './assets/Logo_PMAC_Horizontal(1).png' },
  { id: 'heraldico',  label: 'Heráldico',       src: './assets/variants/brasao-heraldico.png' },
];

const PARTICLE_COUNT = 80000;
const MAX_HALF_W = 1.75;

/* =========================================================================
   1. IMAGE → PARTICLE SAMPLING (COM CAMPO DE ONDAS OCEÂNICAS)
   ========================================================================= */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    img.src = src;
  });
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.max(-2.6, Math.min(2.6, Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)));
}

/** Chamfer distance transform: distance in px from each opaque pixel to nearest transparent one. */
function distanceToEdge(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 1e9 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

function sampleLogo(img) {
  const maxDim = 560;
  const s = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  let halfH = 1.0;
  let halfW = w / h;
  if (halfW > MAX_HALF_W) {
    const f = MAX_HALF_W / halfW;
    halfW *= f;
    halfH *= f;
  }

  const mask = new Uint8Array(w * h);
  const candidates = [];
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] > 110) {
      mask[i] = 1;
      candidates.push(i);
    }
  }
  const dist = distanceToEdge(mask, w, h);

  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const col = new Float32Array(PARTICLE_COUNT * 3);
  const wave = new Float32Array(PARTICLE_COUNT * 3);
  const meta = new Float32Array(PARTICLE_COUNT * 3); // edgeFactor, radialDist, unused

  let n = 0;
  while (n < PARTICLE_COUNT) {
    const ci = candidates[(Math.random() * candidates.length) | 0];
    const edgeFactor = Math.max(0, Math.min(1, 1 - dist[ci] / 6));
    if (Math.random() > 0.45 + 0.55 * edgeFactor) continue;

    const ix = ci % w;
    const iy = (ci / w) | 0;
    const x = (((ix + Math.random()) / w) * 2 - 1) * halfW;
    const y = (1 - ((iy + Math.random()) / h) * 2) * halfH;
    const nx = x / halfW;
    const ny = y / halfH;
    const i3 = n * 3;

    pos[i3] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = (Math.random() - 0.5) * 0.012;

    col[i3] = px[ci * 4] / 255;
    col[i3 + 1] = px[ci * 4 + 1] / 255;
    col[i3 + 2] = px[ci * 4 + 2] / 255;

    // Posições iniciais dispersas em um vasto oceano 3D (águas de Arraial do Cabo)
    // Cobertura ampla no plano XY e profundidade Z natural de ondulação
    const wx = (Math.random() * 2 - 1) * Math.max(2.4, halfW * 1.5) + gaussianRandom() * 0.22;
    const wy = (Math.random() * 2 - 1) * Math.max(1.5, halfH * 1.4) + gaussianRandom() * 0.18;
    const wz = (Math.random() * 2 - 1) * 0.45 + gaussianRandom() * 0.16;
    wave[i3] = wx;
    wave[i3 + 1] = wy;
    wave[i3 + 2] = wz;

    meta[i3] = edgeFactor;
    meta[i3 + 1] = Math.hypot(nx, ny);
    meta[i3 + 2] = Math.random();
    n++;
  }

  return { pos, col, wave, meta, halfW, halfH };
}

/* =========================================================================
   2. SHADERS (ONDAS OCEÂNICAS -> ESPIRAL -> LOGO DE PARTÍCULAS -> EXPLOSÃO)
   ========================================================================= */

const particleVertexShader = /* glsl */ `
  attribute vec3 aPosEmblem;
  attribute vec3 aPosOld;
  attribute vec3 aPosWave;
  attribute vec3 aRandom;
  attribute vec3 aMeta;      // x: edgeFactor, y: radialDist, z: randomSeed
  attribute vec3 aColor;
  attribute vec3 aColorOld;

  uniform float uCycle;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2  uPointer;
  uniform float uSwap;

  varying float vAlpha;
  varying float vDepthMix;
  varying float vWaveState;
  varying float vCrestGlow;
  varying float vBlastFlash;
  varying vec3  vColor;

  float easeInOutCubic(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
  }

  void main() {
    float edgeFactor = aMeta.x;
    float radialDist = aMeta.y;
    float pDelay     = aRandom.z * 0.04;
    float t          = uCycle;

    // Transição entre variantes de logo
    float swapEase  = easeInOutCubic(clamp(uSwap * 1.15 - aRandom.z * 0.15, 0.0, 1.0));
    float swapBurst = sin(3.14159265 * clamp(uSwap, 0.0, 1.0));
    vec3 emblemPos  = mix(aPosOld, aPosEmblem, swapEase);
    vec3 baseColor  = mix(aColorOld, aColor, swapEase);

    // -------------------------------------------------------------
    // FASE 1: FÍSICA DAS ONDAS DO MAR (t in [0.00, 0.32]) - ONDAS NATURAIS DE ANTES
    // -------------------------------------------------------------
    float waveSpeed = 2.4;
    float waveTime  = uTime * waveSpeed;

    // Ondulação oceânica primária
    float k1 = aPosWave.x * 2.1 + aPosWave.y * 0.7 + waveTime + aRandom.z * 0.4;
    float wSin1 = sin(k1);
    float wCos1 = cos(k1);

    // Marola transversal secundária
    float k2 = aPosWave.x * 3.5 - aPosWave.y * 1.8 + waveTime * 1.35;
    float wSin2 = sin(k2);

    // Micro-ondas de superfície
    float k3 = aPosWave.y * 3.8 + aPosWave.x * 1.1 + waveTime * 0.85;
    float wCos3 = cos(k3);

    vec3 currentWave = aPosWave;
    currentWave.z += wCos1 * 0.42 + wSin2 * 0.16 + aRandom.x * 0.06;
    currentWave.y += wSin1 * 0.28 + wCos3 * 0.12;
    currentWave.x += -wCos1 * 0.18;

    // -------------------------------------------------------------
    // FASE 2: CONVERGÊNCIA EM ESPIRAL (t in [0.32, 0.70])
    //         A espiral ocorre SOMENTE durante a transição da onda para a logo
    // -------------------------------------------------------------
    float inwardDelay = clamp(radialDist / 1.5, 0.0, 1.0) * 0.08;
    float gather = smoothstep(0.30 + pDelay + inwardDelay * 0.5, 0.70 + pDelay, t);
    float gatherEased = easeInOutCubic(gather);

    // Envelope em sino: ZERO nas ondas (gather=0), máxima no meio, ZERO na logo pronta (gather=1)
    float spiralEnvelope = sin(gatherEased * 3.14159265);

    // Ângulo de rotação em espiral (ativado somente durante o gather)
    float spiralTurns = 3.6;
    float spiralDir = (aPosWave.x >= 0.0 ? 1.0 : -1.0);
    float spiralAngle = (1.0 - gatherEased) * (spiralTurns * 6.28318) * spiralDir * spiralEnvelope
                        + (radialDist * 2.8 * spiralEnvelope);

    float cosS = cos(spiralAngle);
    float sinS = sin(spiralAngle);
    mat2 rotSpiral = mat2(cosS, -sinS, sinS, cosS);

    // Posição intermediária de convergência
    vec3 interPos = mix(currentWave, emblemPos, gatherEased);

    // Aplica o giro da espiral estritamente durante a transição:
    vec2 spunXY = rotSpiral * interPos.xy;
    interPos.xy = mix(interPos.xy, spunXY, spiralEnvelope);

    // Efeito funil em Z durante a espiral
    interPos.z += spiralEnvelope * (0.32 * (1.0 - clamp(radialDist, 0.0, 1.0)));

    vec3 pos = interPos;

    // Ondulações aquáticas suaves durante o encaixe
    float rippleDecay = smoothstep(0.52, 0.68, t) * (1.0 - smoothstep(0.74, 0.84, t));
    float ripple = sin(radialDist * 10.0 - uTime * 7.0 + aRandom.z * 3.14) * 0.038 * rippleDecay;
    pos.z += ripple;

    // Spray marinho
    float activeSpray = (1.0 - smoothstep(0.74, 0.84, t));
    float spray = activeSpray * (0.010 + 0.022 * (1.0 - gatherEased) + swapBurst * 0.07);
    float a = uTime * 0.85 + aRandom.z * 6.28318;
    vec2 turb = vec2(aRandom.x * cos(a) - aRandom.y * sin(a), aRandom.x * sin(a) + aRandom.y * cos(a));
    pos.xy += turb * spray;
    pos.z  += aRandom.y * spray * 0.6;

    // -------------------------------------------------------------
    // FASE 3: LOGO DE PARTÍCULAS (t in [0.68, 0.85])
    //         Logo formada 100% por partículas, com pulso vivo
    // -------------------------------------------------------------
    float inLogoWindow = smoothstep(0.68, 0.74, t) * (1.0 - smoothstep(0.84, 0.88, t));
    float particlePulse = sin(uTime * 3.5 + radialDist * 5.0) * 0.007 * inLogoWindow;
    pos.xy += (length(emblemPos.xy) < 0.001 ? vec2(0.0) : normalize(emblemPos.xy)) * particlePulse;

    // -------------------------------------------------------------
    // FASE 4: EXPLOSÃO RADIAL 3D (t in [0.85, 1.00])
    //         Detonação balística com dispersão volumétrica
    // -------------------------------------------------------------
    float blast = smoothstep(0.85, 0.99, t);
    float blastFlash = 0.0;

    if (t >= 0.85) {
      float blastPow = pow(blast, 1.6);
      vec3 blastDir = normalize(vec3(emblemPos.xy * 1.5, (aRandom.z - 0.5) * 2.4) + aRandom * 0.35);
      float blastVelocity = 5.2 + aRandom.y * 4.2;
      pos += blastDir * (blastPow * blastVelocity);

      float blastSpin = blastPow * 2.8 * (aRandom.x > 0.0 ? 1.0 : -1.0);
      mat2 rotBlast = mat2(cos(blastSpin), -sin(blastSpin), sin(blastSpin), cos(blastSpin));
      pos.xy = rotBlast * pos.xy;

      blastFlash = smoothstep(0.85, 0.88, t) * (1.0 - smoothstep(0.89, 0.95, t));
    }

    // Parallax interativo com o mouse
    float parallax = (0.12 * (1.0 - gatherEased) + 0.04 * gatherEased) * (1.0 - blast);
    pos.xy += uPointer * parallax * (0.35 + pos.z * 0.65);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Tamanho das partículas
    float baseSize = mix(3.2, 4.6, aRandom.z);
    float sizeMod = mix(1.15, 1.0, gatherEased);
    float blastSize = 1.0 + blast * 1.8;
    gl_PointSize = baseSize * sizeMod * blastSize * uPixelRatio * (4.0 / -mv.z);

    vDepthMix = clamp((pos.z + 0.5) / 1.0, 0.0, 1.0);
    vWaveState = 1.0 - gatherEased;
    vCrestGlow = smoothstep(0.15, 0.55, currentWave.z) * (1.0 - gatherEased);
    vBlastFlash = blastFlash;
    vColor = baseColor;

    // Opacidade com fade out suave no clímax da explosão
    float blastFade = smoothstep(0.92, 1.0, t);
    vAlpha = 1.0 - blastFade;
  }
`;

const particleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vDepthMix;
  varying float vWaveState;
  varying float vCrestGlow;
  varying float vBlastFlash;
  varying vec3  vColor;

  void main() {
    if (vAlpha <= 0.005) discard;
    vec2 c = 2.0 * gl_PointCoord - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float soft = 1.0 - smoothstep(0.38, 1.0, r2);

    // Cores Oceânicas de Arraial do Cabo
    vec3 oceanNavy   = vec3(0.08, 0.16, 0.28); // Mar profundo (#142947)
    vec3 arraialTurq = vec3(0.06, 0.56, 0.81); // Turquesa cristalino (#108FCE)
    vec3 waveFoam    = vec3(0.92, 0.98, 1.00); // Espuma luminosa da crista (#EBF7FF)

    // Gradiente da água por profundidade e brilho na crista das ondas
    vec3 waveColor = mix(oceanNavy, arraialTurq, vDepthMix);
    waveColor = mix(waveColor, waveFoam, vCrestGlow * 0.85);

    // Mistura fluida: nas ondas = água; na logo = cores exatas da logo
    vec3 finalColor = mix(vColor, waveColor, vWaveState);

    // Flash luminoso no momento da detonação da explosão (energia solar/ciano)
    vec3 flashEnergy = vec3(1.0, 0.96, 0.86);
    finalColor = mix(finalColor, flashEnergy, vBlastFlash * 0.75);

    // Salvaguarda de legibilidade para detalhes claros
    float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    finalColor = mix(finalColor, finalColor * 0.85, smoothstep(0.85, 0.96, lum));

    gl_FragColor = vec4(finalColor, vAlpha * soft);
  }
`;

const solidVertexShader = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 uPointer;
  uniform float uCycle;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float activeWindow = 1.0 - smoothstep(0.82, 0.90, uCycle);
    wp.xy += uPointer * (0.05 + 0.10 * activeWindow) * 0.35;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const solidFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uLogoTex;
  uniform float uCycle;
  uniform float uSwap;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    float t = uCycle;
    // A logo sólida aparece após as partículas da onda coalescerem
    float presence = smoothstep(0.84, 0.91, t) * (1.0 - smoothstep(0.965, 0.995, t));
    presence *= smoothstep(0.75, 1.0, uSwap);
    if (presence <= 0.001) discard;

    vec4 tex = texture2D(uLogoTex, vUv);
    if (tex.a <= 0.004) discard;

    float noise = hash12(gl_FragCoord.xy * 0.85);
    float stipple = smoothstep(1.0 - presence * 1.12, 1.0 - presence * 0.88, noise);
    float alpha = tex.a * mix(stipple, 1.0, smoothstep(0.82, 0.98, presence));
    gl_FragColor = vec4(tex.rgb, alpha);
  }
`;

/* =========================================================================
   3. SCENE
   ========================================================================= */

const urlParams = new URLSearchParams(window.location.search);
const canvas = document.getElementById('webgl-canvas');
const stage = document.getElementById('canvas-stage');
const percentEl = document.getElementById('loading-percent');
const progressFillEl = document.getElementById('progress-fill');
const statusTextEl = document.getElementById('loading-status-text');
const phasePills = Array.from(document.querySelectorAll('.phase-pill'));
const variantButtons = Array.from(document.querySelectorAll('.logo-switch__btn'));
const variantLabelEl = document.getElementById('variant-label');
const btnPrev = document.getElementById('btn-variant-prev');
const btnNext = document.getElementById('btn-variant-next');

const btnModeLoop = document.getElementById('btn-mode-loop');
const btnModePortal = document.getElementById('btn-mode-portal');
const btnReplay = document.getElementById('btn-replay');
const btnEnterPortal = document.getElementById('btn-enter-portal');
const btnBackToLoader = document.getElementById('btn-back-to-loader');
const portalView = document.getElementById('portal-view');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 40);

const uniforms = {
  uCycle: { value: 0 },
  uTime: { value: 0 },
  uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
  uPointer: { value: new THREE.Vector2() },
  uSwap: { value: 1 },
  uLogoTex: { value: null },
};

const geometry = new THREE.BufferGeometry();
const aRandom = new Float32Array(PARTICLE_COUNT * 3);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  aRandom[i * 3] = gaussianRandom();
  aRandom[i * 3 + 1] = gaussianRandom();
  aRandom[i * 3 + 2] = Math.random();
}
const attr = (name) => {
  const a = new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3);
  a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name, a);
  return a;
};
const attrs = {
  emblem: attr('aPosEmblem'),
  old: attr('aPosOld'),
  wave: attr('aPosWave'),
  meta: attr('aMeta'),
  color: attr('aColor'),
  colorOld: attr('aColorOld'),
};
geometry.setAttribute('position', attrs.emblem);
geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandom, 3));
geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);

const points = new THREE.Points(
  geometry,
  new THREE.ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
  })
);
points.frustumCulled = false;
scene.add(points);

const solidMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    vertexShader: solidVertexShader,
    fragmentShader: solidFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
  })
);
solidMesh.visible = false;
scene.add(solidMesh);

let isReady = false;
let extents = { halfW: 1, halfH: 1 };

function fitCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const usableH = h < 700 ? 0.62 : 0.70;
  const needH = (extents.halfH * 1.18) / usableH;
  const needW = (extents.halfW * 1.25) / 0.92;
  const z = Math.max(needH / tanHalf, needW / (tanHalf * camera.aspect));
  camera.position.set(0, 0.04 * (z * tanHalf), z);
  camera.updateProjectionMatrix();
  uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
}
window.addEventListener('resize', fitCamera);

/* =========================================================================
   4. VARIANT LOADING & SWITCHING
   ========================================================================= */

const cache = new Map();

function loadVariant(variant) {
  if (!cache.has(variant.id)) {
    cache.set(
      variant.id,
      loadImage(variant.src).then((img) => {
        const sample = sampleLogo(img);
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.NoColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        return { sample, texture };
      })
    );
  }
  return cache.get(variant.id);
}

let currentVariantIdx = -1;
let switchToken = 0;

function applySample({ sample, texture }, animate) {
  if (animate) {
    attrs.old.array.set(attrs.emblem.array);
    attrs.colorOld.array.set(attrs.color.array);
  }
  attrs.emblem.array.set(sample.pos);
  attrs.color.array.set(sample.col);
  attrs.wave.array.set(sample.wave);
  attrs.meta.array.set(sample.meta);
  if (!animate) {
    attrs.old.array.set(sample.pos);
    attrs.colorOld.array.set(sample.col);
  }
  Object.values(attrs).forEach((a) => (a.needsUpdate = true));

  uniforms.uLogoTex.value = texture;
  solidMesh.scale.set(sample.halfW, sample.halfH, 1);
  solidMesh.visible = false; // Brasão formado 100% por partículas, sem malha sólida
  isReady = true;
  extents = { halfW: sample.halfW, halfH: sample.halfH };
  fitCamera();

  if (pinnedT !== null) {
    uniforms.uCycle.value = cycleProgress;
    renderer.render(scene, camera);
    stage.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
    stage.style.backgroundSize = '100% 100%';
  }
}

async function selectVariant(idx, { animate = true } = {}) {
  idx = (idx + LOGO_VARIANTS.length) % LOGO_VARIANTS.length;
  if (idx === currentVariantIdx) return;
  const variant = LOGO_VARIANTS[idx];
  const token = ++switchToken;
  currentVariantIdx = idx;

  variantButtons.forEach((b, i) => {
    b.classList.toggle('is-active', i === idx);
    b.setAttribute('aria-pressed', String(i === idx));
  });
  variantLabelEl.textContent = `Variante ${idx + 1}/${LOGO_VARIANTS.length} · ${variant.label}`;

  const url = new URL(window.location.href);
  url.searchParams.set('logo', variant.id);
  history.replaceState(null, '', url);

  let data;
  try {
    data = await loadVariant(variant);
  } catch (err) {
    variantLabelEl.textContent = `Erro ao carregar ${variant.label}`;
    console.error(err);
    return;
  }
  if (token !== switchToken) return;

  const canAnimate = animate && pinnedT === null;
  applySample(data, canAnimate);
  if (canAnimate) {
    cycleProgress = 0;
    swapProgress = 0;
  }
}

/* =========================================================================
   5. TIMELINE, HUD & PORTAL
   ========================================================================= */

const targetPointer = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  targetPointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
});

const CYCLE_DURATION = 5.65;
const SWAP_DURATION = 1.1;
let cycleProgress = 0;
let swapProgress = 1;
let lastFrameTime = performance.now();
let autoOpenPortal = false;
let isPortalOpen = false;

let pinnedT = null;
const forcedT = urlParams.get('t');
if (forcedT !== null && !Number.isNaN(parseFloat(forcedT))) {
  pinnedT = Math.max(0, Math.min(1, parseFloat(forcedT)));
  cycleProgress = pinnedT;
  document.body.classList.add('no-transition');
}
if (urlParams.get('portal') === '1') document.body.classList.add('no-transition');

const STATUS_MESSAGES = [
  'Ondas oceânicas de Arraial do Cabo · Maré viva...',
  'Convergência em espiral das partículas municipais...',
  'Brasão de partículas oficial de Arraial do Cabo...',
  'Detonação de energia · Acesso ao Portal do Cidadão',
];

function updateHUD(t) {
  const pct = Math.min(100, Math.round(t * 100));
  const label = String(pct).padStart(2, '0') + '%';
  if (percentEl.textContent !== label) {
    percentEl.textContent = label;
    percentEl.setAttribute('aria-valuenow', String(pct));
  }
  progressFillEl.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;

  let stageIdx = 0;
  if (t >= 0.32 && t < 0.70) stageIdx = 1;
  else if (t >= 0.70 && t < 0.86) stageIdx = 2;
  else if (t >= 0.86) stageIdx = 3;

  if (statusTextEl.textContent !== STATUS_MESSAGES[stageIdx]) {
    statusTextEl.textContent = STATUS_MESSAGES[stageIdx];
  }
  phasePills.forEach((p, i) => p.classList.toggle('is-active', i === stageIdx));
}

function clearPin() {
  pinnedT = null;
  stage.style.backgroundImage = '';
}

function openPortal() {
  isPortalOpen = true;
  document.body.classList.add('is-portal-open');
  document.body.classList.remove('is-loading');
  portalView.setAttribute('aria-hidden', 'false');
}

function returnToLoader() {
  isPortalOpen = false;
  clearPin();
  cycleProgress = 0;
  document.body.classList.remove('is-portal-open');
  document.body.classList.add('is-loading');
  portalView.setAttribute('aria-hidden', 'true');
}

function setMode(portal) {
  autoOpenPortal = portal;
  clearPin();
  btnModePortal.classList.toggle('is-active', portal);
  btnModePortal.setAttribute('aria-pressed', String(portal));
  btnModeLoop.classList.toggle('is-active', !portal);
  btnModeLoop.setAttribute('aria-pressed', String(!portal));
}

btnModeLoop.addEventListener('click', () => setMode(false));
btnModePortal.addEventListener('click', () => setMode(true));
btnReplay.addEventListener('click', () => {
  clearPin();
  cycleProgress = 0;
  if (isPortalOpen) returnToLoader();
});
btnEnterPortal.addEventListener('click', openPortal);
btnBackToLoader.addEventListener('click', returnToLoader);

// Âncoras das 4 fases: Ondas -> Espiral -> Logo Partículas -> Explosão
const PHASE_ANCHORS = [0.15, 0.50, 0.78, 0.92];
phasePills.forEach((pill, i) =>
  pill.addEventListener('click', () => {
    clearPin();
    cycleProgress = PHASE_ANCHORS[i];
  })
);

variantButtons.forEach((btn, i) =>
  btn.addEventListener('click', () => {
    clearPin();
    selectVariant(i);
  })
);
btnPrev.addEventListener('click', () => { clearPin(); selectVariant(currentVariantIdx - 1); });
btnNext.addEventListener('click', () => { clearPin(); selectVariant(currentVariantIdx + 1); });

window.addEventListener('keydown', (e) => {
  if (isPortalOpen || e.target instanceof HTMLInputElement) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= LOGO_VARIANTS.length) { clearPin(); selectVariant(n - 1); }
  else if (e.key === 'ArrowRight') { clearPin(); selectVariant(currentVariantIdx + 1); }
  else if (e.key === 'ArrowLeft') { clearPin(); selectVariant(currentVariantIdx - 1); }
});

// Portal search filter
const searchInput = document.getElementById('service-search-input');
const serviceCards = Array.from(document.querySelectorAll('.service-card'));
const tagChips = Array.from(document.querySelectorAll('.tag-chip'));
function filterServices(q) {
  q = q.trim().toLowerCase();
  serviceCards.forEach((card) => {
    const text = (card.textContent + ' ' + (card.dataset.keywords || '')).toLowerCase();
    card.classList.toggle('is-hidden', q.length > 0 && !text.includes(q));
  });
}
searchInput?.addEventListener('input', (e) => {
  tagChips.forEach((c) => c.classList.remove('is-active'));
  filterServices(e.target.value);
});
tagChips.forEach((chip) =>
  chip.addEventListener('click', () => {
    const active = chip.classList.contains('is-active');
    tagChips.forEach((c) => c.classList.remove('is-active'));
    if (active) {
      searchInput.value = '';
      filterServices('');
    } else {
      chip.classList.add('is-active');
      searchInput.value = chip.dataset.filter || '';
      filterServices(searchInput.value);
    }
  })
);

/* =========================================================================
   6. RENDER LOOP
   ========================================================================= */

function renderFrame(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  if (isPortalOpen || !isReady) return;

  if (swapProgress < 1) {
    swapProgress = Math.min(1, swapProgress + dt / SWAP_DURATION);
  } else if (pinnedT !== null) {
    cycleProgress = pinnedT;
  } else {
    cycleProgress += dt / CYCLE_DURATION;
    if (cycleProgress >= 1) {
      if (autoOpenPortal) {
        cycleProgress = 1;
        updateHUD(1);
        openPortal();
      } else {
        cycleProgress %= 1;
      }
    }
  }

  uniforms.uCycle.value = cycleProgress;
  uniforms.uSwap.value = swapProgress;
  uniforms.uTime.value = now * 0.001;
  uniforms.uPointer.value.lerp(targetPointer, 0.08);
  updateHUD(cycleProgress);
  renderer.render(scene, camera);
}

function loop(now) {
  requestAnimationFrame(loop);
  renderFrame(now);
}

/* =========================================================================
   7. BOOT
   ========================================================================= */

fitCamera();
const requested = LOGO_VARIANTS.findIndex((v) => v.id === urlParams.get('logo'));
await selectVariant(requested >= 0 ? requested : 0, { animate: false });

if (urlParams.get('portal') === '1') openPortal();

renderFrame(performance.now());
if (pinnedT !== null) {
  stage.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
  stage.style.backgroundSize = '100% 100%';
}
requestAnimationFrame(loop);

LOGO_VARIANTS.forEach((v) => loadVariant(v).catch(() => {}));
