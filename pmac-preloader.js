/**
 * ============================================================================
 * PMAC PRELOADER - WEB COMPONENT OFICIAL (PREFEITURA DE ARRAIAL DO CABO)
 * ============================================================================
 * 
 * Uso em qualquer página HTML / WordPress / PHP / React / Vue:
 * 
 *   <script type="module" src="https://cdn.arraial.rj.gov.br/pmac-preloader.js"></script>
 *   <pmac-preloader 
 *      logo="brasao" 
 *      min-duration="2200" 
 *      status-text="Carregando serviços municipais..." 
 *      auto-dismiss="true">
 *   </pmac-preloader>
 * 
 * Atributos suportados:
 *   - logo: 'brasao' | 'brasao-jpg' | 'vertical' | 'horizontal' | 'heraldico'
 *   - min-duration: tempo mínimo em ms antes do dismiss (padrão: 2200)
 *   - auto-dismiss: 'true' | 'false' (se 'false', chame el.dismiss() via JavaScript)
 *   - status-text: mensagem institucional no rodapé
 *   - asset-base: URL base dos assets (padrão: relativo ao próprio script)foi 
 * 
 * Eventos disparados:
 *   - 'complete': disparado quando a animação atinge 100% e o preloader fecha.
 * 
 * Métodos públicos:
 *   - element.dismiss(): fecha o preloader com transição suave a qualquer momento.
 *   - element.restart(logoId): reinicia a animação imediatamente.
 */

import * as THREE from './vendor/three.module.min.js';

const SCRIPT_DIR = new URL('.', import.meta.url).href;

const LOGO_CONFIGS = {
  'brasao':       { label: 'Brasão Oficial',       path: 'assets/variants/brasao.png' },
  'brasao-jpg':   { label: 'Brasão (JPG)',         path: 'assets/variants/brasao-jpg.png' },
  'vertical':     { label: 'Logo Vertical',        path: 'assets/Logo_PMAC_Vertical(1).png' },
  'horizontal':   { label: 'Logo Horizontal',      path: 'assets/Logo_PMAC_Horizontal(1).png' },
  'heraldico':    { label: 'Brasão Heráldico',     path: 'assets/variants/brasao-heraldico.png' },
};

const PARTICLE_COUNT = 70000;
const MAX_HALF_W = 1.75;

// Shaders GLSL de Ondas Oceânicas -> Espiral -> Logo de Partículas -> Explosão
const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aPosEmblem;
  attribute vec3 aPosWave;
  attribute vec3 aRandom;
  attribute vec3 aMeta;
  attribute vec3 aColor;

  uniform float uCycle;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2  uPointer;

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

    // 1. Ondas Oceânicas (Ondas Naturais de antes)
    float waveTime = uTime * 2.3;
    float k1 = aPosWave.x * 2.1 + aPosWave.y * 0.7 + waveTime + aRandom.z * 0.4;
    float wSin1 = sin(k1);
    float wCos1 = cos(k1);
    float k2 = aPosWave.x * 3.4 - aPosWave.y * 1.8 + waveTime * 1.3;
    float wSin2 = sin(k2);

    vec3 currentWave = aPosWave;
    currentWave.z += wCos1 * 0.40 + wSin2 * 0.15;
    currentWave.y += wSin1 * 0.26;
    currentWave.x += -wCos1 * 0.16;

    // 2. Convergência em Espiral (SOMENTE ao formar a logo)
    float inwardDelay = clamp(radialDist / 1.5, 0.0, 1.0) * 0.08;
    float gather = smoothstep(0.30 + pDelay + inwardDelay * 0.5, 0.70 + pDelay, t);
    float gatherEased = easeInOutCubic(gather);

    float spiralEnvelope = sin(gatherEased * 3.14159265);

    float spiralTurns = 3.6;
    float spiralDir = (aPosWave.x >= 0.0 ? 1.0 : -1.0);
    float spiralAngle = (1.0 - gatherEased) * (spiralTurns * 6.28318) * spiralDir * spiralEnvelope
                        + (radialDist * 2.8 * spiralEnvelope);

    float cosS = cos(spiralAngle);
    float sinS = sin(spiralAngle);
    mat2 rotSpiral = mat2(cosS, -sinS, sinS, cosS);

    vec3 interPos = mix(currentWave, aPosEmblem, gatherEased);

    vec2 spunXY = rotSpiral * interPos.xy;
    interPos.xy = mix(interPos.xy, spunXY, spiralEnvelope);

    interPos.z += spiralEnvelope * (0.32 * (1.0 - clamp(radialDist, 0.0, 1.0)));

    vec3 pos = interPos;

    float rippleDecay = smoothstep(0.52, 0.68, t) * (1.0 - smoothstep(0.74, 0.84, t));
    float ripple = sin(radialDist * 10.0 - uTime * 7.0 + aRandom.z * 3.14) * 0.038 * rippleDecay;
    pos.z += ripple;

    float activeSpray = (1.0 - smoothstep(0.74, 0.84, t));
    float spray = activeSpray * (0.010 + 0.022 * (1.0 - gatherEased));
    float a = uTime * 0.85 + aRandom.z * 6.28318;
    vec2 turb = vec2(aRandom.x * cos(a) - aRandom.y * sin(a), aRandom.x * sin(a) + aRandom.y * cos(a));
    pos.xy += turb * spray;
    pos.z  += aRandom.y * spray * 0.6;

    // 3. Logo de Partículas
    float inLogoWindow = smoothstep(0.68, 0.74, t) * (1.0 - smoothstep(0.84, 0.88, t));
    float particlePulse = sin(uTime * 3.5 + radialDist * 5.0) * 0.007 * inLogoWindow;
    pos.xy += (length(aPosEmblem.xy) < 0.001 ? vec2(0.0) : normalize(aPosEmblem.xy)) * particlePulse;

    // 4. Explosão Radial
    float blast = smoothstep(0.85, 0.99, t);
    float blastFlash = 0.0;

    if (t >= 0.85) {
      float blastPow = pow(blast, 1.6);
      vec3 blastDir = normalize(vec3(aPosEmblem.xy * 1.5, (aRandom.z - 0.5) * 2.4) + aRandom * 0.35);
      float blastVelocity = 5.2 + aRandom.y * 4.2;
      pos += blastDir * (blastPow * blastVelocity);

      float blastSpin = blastPow * 2.8 * (aRandom.x > 0.0 ? 1.0 : -1.0);
      mat2 rotBlast = mat2(cos(blastSpin), -sin(blastSpin), sin(blastSpin), cos(blastSpin));
      pos.xy = rotBlast * pos.xy;

      blastFlash = smoothstep(0.85, 0.88, t) * (1.0 - smoothstep(0.89, 0.95, t));
    }

    float parallax = (0.10 * (1.0 - gatherEased) + 0.04 * gatherEased) * (1.0 - blast);
    pos.xy += uPointer * parallax * (0.35 + pos.z * 0.65);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float baseSize = mix(3.2, 4.6, aRandom.z);
    float sizeMod = mix(1.15, 1.0, gatherEased);
    float blastSize = 1.0 + blast * 1.8;
    gl_PointSize = baseSize * sizeMod * blastSize * uPixelRatio * (4.0 / -mv.z);

    vDepthMix = clamp((pos.z + 0.5) / 1.0, 0.0, 1.0);
    vWaveState = 1.0 - gatherEased;
    vCrestGlow = smoothstep(0.15, 0.55, currentWave.z) * (1.0 - gatherEased);
    vBlastFlash = blastFlash;
    vColor = aColor;

    float blastFade = smoothstep(0.92, 1.0, t);
    vAlpha = 1.0 - blastFade;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
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

    vec3 oceanNavy   = vec3(0.08, 0.16, 0.28);
    vec3 arraialTurq = vec3(0.06, 0.56, 0.81);
    vec3 waveFoam    = vec3(0.92, 0.98, 1.00);

    vec3 waveColor = mix(oceanNavy, arraialTurq, vDepthMix);
    waveColor = mix(waveColor, waveFoam, vCrestGlow * 0.85);

    vec3 finalColor = mix(vColor, waveColor, vWaveState);
    vec3 flashEnergy = vec3(1.0, 0.96, 0.86);
    finalColor = mix(finalColor, flashEnergy, vBlastFlash * 0.75);

    float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    finalColor = mix(finalColor, finalColor * 0.85, smoothstep(0.85, 0.96, lum));

    gl_FragColor = vec4(finalColor, vAlpha * soft);
  }
`;

function checkWebGL() {
  try {
    const cvs = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (cvs.getContext('webgl') || cvs.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

export class PmacPreloader extends HTMLElement {
  static get observedAttributes() {
    return ['logo', 'min-duration', 'auto-dismiss', 'status-text'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._rafId = null;
    this._startTime = null;
    this._isDismissed = false;
  }

  get logo() {
    return this.getAttribute('logo') || 'brasao';
  }

  get minDuration() {
    return Math.max(800, parseInt(this.getAttribute('min-duration') || '2200', 10));
  }

  get autoDismiss() {
    return this.getAttribute('auto-dismiss') !== 'false';
  }

  get statusText() {
    return this.getAttribute('status-text') || 'Carregando serviços da Prefeitura de Arraial do Cabo...';
  }

  get assetBase() {
    return this.getAttribute('asset-base') || SCRIPT_DIR;
  }

  connectedCallback() {
    this.renderSkeleton();
    const closeBtn = this.shadowRoot.getElementById('btn-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.dismiss());

    if (!checkWebGL() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.initFallbackMode();
    } else {
      this.initThreePreloader();
    }
  }

  disconnectedCallback() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._renderer) this._renderer.dispose();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'status-text' && this.shadowRoot) {
      const el = this.shadowRoot.querySelector('#status-label');
      if (el) el.textContent = newVal;
    }
  }

  renderSkeleton() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          background: #F7F5EE;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          color: #2F4469;
          user-select: none;
          opacity: 1;
          transition: opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.45s;
        }

        :host(.is-closing) {
          opacity: 0;
          pointer-events: none;
        }

        .ambient-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 55% at 50% 48%, rgba(255, 255, 255, 0.88) 0%, rgba(247, 245, 238, 0.72) 65%, #F7F5EE 100%),
            radial-gradient(circle 420px at 15% 20%, rgba(16, 143, 206, 0.08) 0%, transparent 70%),
            radial-gradient(circle 380px at 85% 80%, rgba(223, 214, 189, 0.40) 0%, transparent 70%);
          pointer-events: none;
        }

        .header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 10;
        }

        .header img {
          height: 38px;
          width: auto;
          object-fit: contain;
        }

        .close-btn {
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(47, 68, 105, 0.18);
          color: #2F4469;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
          backdrop-filter: blur(8px);
        }
        .close-btn:hover {
          background: #2F4469;
          color: #FFFFFF;
        }

        .stage-container {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        canvas {
          display: block;
          width: 100%;
          height: 100%;
          touch-action: none;
        }

        .footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 20px 24px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          z-index: 10;
        }

        .status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          max-width: 440px;
          font-size: 13px;
          font-weight: 500;
          color: #4A5B78;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #108FCE;
          box-shadow: 0 0 0 3px rgba(16, 143, 206, 0.2);
          display: inline-block;
          margin-right: 8px;
          animation: pulse 1.6s ease-in-out infinite;
        }

        .progress-track {
          width: 100%;
          max-width: 440px;
          height: 5px;
          background: rgba(47, 68, 105, 0.1);
          border-radius: 999px;
          overflow: hidden;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #108FCE 0%, #108FCE 60%, #DFD6BD 60%, #DFD6BD 80%, #ED3237 80%, #ED3237 100%);
          border-radius: 999px;
          transition: width 0.08s linear;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }

        /* Fallback 2D mode */
        .fallback-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .fallback-box img {
          max-height: 140px;
          animation: float 2.4s ease-in-out infinite alternate;
        }
        @keyframes float {
          from { transform: translateY(0); }
          to { transform: translateY(-6px); }
        }
      </style>

      <div class="ambient-bg"></div>

      <header class="header">
        <img src="${new URL('assets/Logo_PMAC_Horizontal(1).png', this.assetBase).href}" alt="Prefeitura de Arraial do Cabo" />
        <button type="button" id="btn-close" class="close-btn" title="Fechar preloader">✕ Fechar</button>
      </header>

      <div class="stage-container" id="stage">
        <canvas id="webgl-canvas"></canvas>
      </div>

      <footer class="footer">
        <div class="status-row">
          <div><span class="status-dot"></span><span id="status-label">${this.statusText}</span></div>
          <span id="pct-label">00%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="progress-bar"></div>
        </div>
      </footer>
    `;
  }

  initFallbackMode() {
    const stage = this.shadowRoot.getElementById('stage');
    const canvas = this.shadowRoot.getElementById('webgl-canvas');
    if (canvas) canvas.remove();

    const logoCfg = LOGO_CONFIGS[this.logo] || LOGO_CONFIGS['brasao'];
    const logoUrl = new URL(logoCfg.path, this.assetBase).href;

    stage.innerHTML = `
      <div class="fallback-box">
        <img src="${logoUrl}" alt="${logoCfg.label}" />
      </div>
    `;

    const start = performance.now();
    const duration = this.minDuration;
    const bar = this.shadowRoot.getElementById('progress-bar');
    const pct = this.shadowRoot.getElementById('pct-label');

    const update = (now) => {
      const p = Math.min(1, (now - start) / duration);
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      if (pct) pct.textContent = `${String(Math.round(p * 100)).padStart(2, '0')}%`;
      if (p < 1) {
        requestAnimationFrame(update);
      } else if (this.autoDismiss) {
        this.dismiss();
      }
    };
    requestAnimationFrame(update);
  }

  async initThreePreloader() {
    const stage = this.shadowRoot.getElementById('stage');
    const canvas = this.shadowRoot.getElementById('webgl-canvas');
    const progressBar = this.shadowRoot.getElementById('progress-bar');
    const pctLabel = this.shadowRoot.getElementById('pct-label');

    const scene = new THREE.Scene();
    const w = stage.clientWidth || window.innerWidth || 800;
    const h = stage.clientHeight || window.innerHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    this._renderer = renderer;

    const pointer = new THREE.Vector2(0, 0);
    const targetPointer = new THREE.Vector2(0, 0);

    const onPointerMove = (e) => {
      const rect = stage.getBoundingClientRect();
      const rw = rect.width || window.innerWidth || 800;
      const rh = rect.height || window.innerHeight || 600;
      const x = ((e.clientX - rect.left) / rw) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rh) * 2 - 1);
      targetPointer.set(x * 0.7, y * 0.7);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!this.isConnected) return;
      const rw = stage.clientWidth || window.innerWidth || 800;
      const rh = stage.clientHeight || window.innerHeight || 600;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    // Carrega a imagem da variante escolhida
    const logoCfg = LOGO_CONFIGS[this.logo] || LOGO_CONFIGS['brasao'];
    const logoUrl = new URL(logoCfg.path, this.assetBase).href;

    const img = await new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = logoUrl;
    });

    if (!img) {
      this.initFallbackMode();
      return;
    }

    // Amostragem das partículas
    const sampled = this.sampleImageToParticles(img);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sampled.pos, 3));
    geo.setAttribute('aPosEmblem', new THREE.BufferAttribute(sampled.pos, 3));
    geo.setAttribute('aPosWave', new THREE.BufferAttribute(sampled.wave, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(sampled.col, 3));
    geo.setAttribute('aMeta', new THREE.BufferAttribute(sampled.meta, 3));

    const rnd = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    geo.setAttribute('aRandom', new THREE.BufferAttribute(rnd, 3));

    const uniforms = {
      uCycle: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uPointer: { value: new THREE.Vector2(0, 0) },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    const startTime = performance.now();
    const duration = this.minDuration;

    const render = (now) => {
      if (!this.isConnected || this._isDismissed) return;
      this._rafId = requestAnimationFrame(render);

      const elapsed = now - startTime;
      let progress;
      if (this.autoDismiss) {
        progress = Math.min(1.0, elapsed / duration);
      } else {
        progress = (elapsed / duration) % 1.0;
      }

      uniforms.uCycle.value = progress;
      uniforms.uTime.value = now * 0.001;
      pointer.lerp(targetPointer, 0.08);
      uniforms.uPointer.value.copy(pointer);

      const pctNum = Math.round(progress * 100);
      if (progressBar) progressBar.style.width = `${pctNum}%`;
      if (pctLabel) pctLabel.textContent = `${String(pctNum).padStart(2, '0')}%`;

      renderer.render(scene, camera);

      if (progress >= 1.0 && this.autoDismiss) {
        this.dismiss();
      }
    };

    this._rafId = requestAnimationFrame(render);
  }

  sampleImageToParticles(img) {
    const maxDim = 520;
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

    const candidates = [];
    for (let i = 0; i < w * h; i++) {
      if (px[i * 4 + 3] > 110) candidates.push(i);
    }

    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const wave = new Float32Array(PARTICLE_COUNT * 3);
    const meta = new Float32Array(PARTICLE_COUNT * 3);

    let n = 0;
    while (n < PARTICLE_COUNT) {
      const ci = candidates[(Math.random() * candidates.length) | 0];
      const ix = ci % w;
      const iy = (ci / w) | 0;

      const x = (((ix + Math.random()) / w) * 2 - 1) * halfW;
      const y = (1 - ((iy + Math.random()) / h) * 2) * halfH;
      const i3 = n * 3;

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = (Math.random() - 0.5) * 0.012;

      col[i3] = px[ci * 4] / 255;
      col[i3 + 1] = px[ci * 4 + 1] / 255;
      col[i3 + 2] = px[ci * 4 + 2] / 255;

      wave[i3] = (Math.random() * 2 - 1) * Math.max(2.4, halfW * 1.5);
      wave[i3 + 1] = (Math.random() * 2 - 1) * Math.max(1.5, halfH * 1.4);
      wave[i3 + 2] = (Math.random() - 0.5) * 0.7;

      meta[i3] = 1.0;
      meta[i3 + 1] = Math.hypot(x / halfW, y / halfH);
      meta[i3 + 2] = Math.random();
      n++;
    }

    return { pos, col, wave, meta };
  }

  /**
   * Fecha o preloader com uma transição suave de fade out
   */
  dismiss() {
    if (this._isDismissed) return;
    this._isDismissed = true;
    this.classList.add('is-closing');

    this.dispatchEvent(new CustomEvent('complete', { bubbles: true, composed: true }));

    setTimeout(() => {
      this.remove();
    }, 460);
  }

  /**
   * Reinicia a animação imediatamente
   */
  restart(newLogo = null) {
    if (newLogo) this.setAttribute('logo', newLogo);
    this.classList.remove('is-closing');
    this._isDismissed = false;
    this.connectedCallback();
  }
}

// Registra o Custom Element nativo no navegador
if (!customElements.get('pmac-preloader')) {
  customElements.define('pmac-preloader', PmacPreloader);
}
