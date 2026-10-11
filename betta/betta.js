// betta.js — a procedural, physically animated halfmoon betta for a live wallpaper.
//
// Nothing is pre-made: the body is a lofted tube around a follow-the-leader spine, every
// fin is a fan of spring-driven rays, and pigment, scales and fin rays are shaded
// procedurally in WebGL2.
//
// URL parameters:
//   size=1       fish scale
//   fps=0        frame-rate cap (0 = display rate)
//   stats        log the frame rate to the console every 5 s
//   dust=1       floating particle density
//   seed=<str>   pattern / behaviour seed
//
// Test / tuning parameters:
//   still=<sec>  simulate this long, draw one frame and stop (deterministic)
//   pose=ref     with still: hold the reference pose (facing left, nose down) mid-screen
//   png          with still: put the frame into #err as a PNG data URL (headless screenshots
//                do not capture the WebGL canvas)
//   bench        print the per-frame simulation and render cost into #err
//   dbg          expose the state as window.betta; with manual, frames advance only through
//                betta.step(dt) (used by the scripted pointer/feeding test)
'use strict';
(() => {
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);

  const Q = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(Q.get(k)); return Number.isFinite(v) ? v : d; };
  const STILL = Q.has('still') ? num('still', 4) : null;
  const OPT = {
    seed: Q.get('seed') || (STILL !== null ? 'betta' : String(Math.random())),
    size: num('size', 1),
    fps: num('fps', 0),
    dust: num('dust', 1),
    pose: Q.get('pose') || '',
  };

  const errBox = document.getElementById('err');
  addEventListener('error', e => { errBox.textContent += (e.message || e) + '\n'; });

  // ------------------------------------------------------------------ randomness
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(hashStr(OPT.seed));
  const SEED_F = (hashStr(OPT.seed) % 1000) / 37;
  const rr = (a, b) => a + (b - a) * rand();
  const PERM = new Uint8Array(512), GRAD = new Float32Array(256);
  {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
    for (let i = 0; i < 256; i++) GRAD[i] = rand() * 2 - 1;
  }
  // smooth 1D gradient noise in [-1, 1], used for organic behaviour
  function noise1(x) {
    const i = Math.floor(x), f = x - i;
    const a = GRAD[PERM[i & 255]] * f, b = GRAD[PERM[(i + 1) & 255]] * (f - 1);
    return (a + (b - a) * f * f * (3 - 2 * f)) * 2;
  }

  // ------------------------------------------------------------------ anatomy
  // Side profile in units of body length L; s runs from the snout (0) to the caudal
  // peduncle (1) and on to a short closing cap.
  const PROF = {
    s:   [0, 0.015, 0.04, 0.08, 0.13, 0.19, 0.27, 0.37, 0.50, 0.63, 0.76, 0.88, 1.00, 1.02, 1.035],
    top: [0.012, 0.052, 0.088, 0.126, 0.158, 0.182, 0.196, 0.198, 0.182, 0.155, 0.124, 0.096, 0.076, 0.052, 0.0],
    bot: [0.000, -0.036, -0.074, -0.122, -0.165, -0.200, -0.218, -0.218, -0.198, -0.160, -0.122, -0.094, -0.074, -0.050, 0.0],
    wid: [0.0, 0.040, 0.064, 0.084, 0.097, 0.104, 0.106, 0.102, 0.090, 0.072, 0.054, 0.040, 0.032, 0.022, 0.0],
  };
  function prof(arr, x) {
    const S = PROF.s;
    let k = 0;
    while (k < S.length - 2 && x > S[k + 1]) k++;
    const t = clamp((x - S[k]) / (S[k + 1] - S[k]), 0, 1), t2 = t * t, t3 = t2 * t;
    const p0 = arr[Math.max(k - 1, 0)], p1 = arr[k], p2 = arr[k + 1], p3 = arr[Math.min(k + 2, arr.length - 1)];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // Fin rays are angled in the fish's sagittal plane: 0° forward, 90° up, 180° back, 270° down.
  // ang0 is the relaxed fan, ang1 the fully flared one, each given for [first ray, last ray].
  // k is the ray spring stiffness [base, tip]; ripple the travelling-wave amplitude (in L).
  const FIN_DEFS = [
    { id: 0, name: 'caudal', rays: 46, segs: 14, s: [0.965, 0.965], y: [0.07, -0.07],
      ang0: [128, 232], ang1: [88, 272], len: u => 0.82 + 0.08 * Math.sin(Math.PI * u), curv: u => (0.5 - u) * 0.55,
      k: [45, 12], ripple: 0.07, pleats: 6 },
    { id: 1, name: 'dorsal', rays: 32, segs: 13, s: [0.40, 0.975], y: 'top',
      ang0: [108, 152], ang1: [80, 122], len: u => lerp(0.34, 0.92, Math.pow(u, 0.7)), curv: () => 0.35,
      k: [70, 20], ripple: 0.06, pleats: 4 },
    { id: 2, name: 'anal', rays: 34, segs: 12, s: [0.30, 0.975], y: 'bot',
      ang0: [240, 205], ang1: [262, 222], len: u => lerp(0.30, 0.78, Math.pow(u, 0.7)), curv: () => -0.35,
      k: [70, 20], ripple: 0.06, pleats: 5 },
    { id: 3, name: 'ventral', rays: 6, segs: 10, s: [0.29, 0.31], y: 'bot', z: 0.03, tilt: 14,
      ang0: [236, 228], ang1: [248, 238], len: u => lerp(0.48, 0.30, u), curv: () => -0.3,
      k: [55, 16], ripple: 0.02, pleats: 0, paired: true },
    { id: 4, name: 'pectoral', rays: 12, segs: 7, s: [0.27, 0.28], y: [0.0, -0.10], z: 'surface', tilt: 30,
      ang0: [150, 214], ang1: [140, 224], len: u => 0.24 + 0.09 * Math.sin(Math.PI * u), curv: () => 0.15,
      k: [140, 70], ripple: 0.012, pleats: 0, paired: true, beat: true },
  ];

  const NODES = 20, PIVOT = 6;   // spine nodes; everything in front of PIVOT is the rigid head
  const WATER_DRAG = 4, FIN_SAG = 0.6;

  // ------------------------------------------------------------------ WebGL
  const canvas = document.getElementById('c');
  // no MSAA on the full screen: only the fish's own rectangle is multisampled (see render)
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, premultipliedAlpha: true,
    preserveDrawingBuffer: STILL !== null, powerPreference: 'high-performance',
  });
  if (!gl) { errBox.textContent = 'WebGL2 is not available'; return; }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  const GLSL_NOISE = `
    float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float vn(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(5.3, 1.7); a *= .5; } return s / .9375; }
  `;

  const VS_MESH = `#version 300 es
    layout(location=0) in vec3 aPos;
    layout(location=1) in vec3 aNrm;
    layout(location=2) in vec4 aAttr;
    uniform mat4 uVP; uniform vec3 uCam; uniform float uRootBias;
    out vec3 vPos; out vec3 vNrm; out vec4 vAttr;
    void main() {
      vPos = aPos; vNrm = aNrm; vAttr = aAttr;
      // fins: draw the root of the median fins slightly in front of the body so it overlaps the outline
      float root = uRootBias * step(aAttr.z, 2.5) * (1. - smoothstep(0., .18, aAttr.y));
      gl_Position = uVP * vec4(aPos + normalize(uCam - aPos) * root, 1.);
    }`;

  // Pigment never changes, so it is baked once into textures (body: side-profile space,
  // fins: u/v space); per frame the shaders only add lighting, glints and the eye.
  const BODY_BOX = [1.04, -0.23, 0.21];  // body texture spans x 0..1.04, y -0.23..0.21 (in L)

  const FS_BAKE_BODY = `#version 300 es
    precision highp float;
    in vec2 vUV; uniform float uSeed;
    out vec4 o;
    ${GLSL_NOISE}
    void main() {
      vec2 p = vec2(vUV.x * ${BODY_BOX[0]}, mix(${BODY_BOX[1]}, ${BODY_BOX[2]}, vUV.y));
      float s = p.x;
      // red-orange face, smooth deep indigo body, a few red patches low on the flank
      float marble = fbm(p * 7. + uSeed);
      float headM = 1. - smoothstep(.20, .34, s + (marble - .5) * .22);
      vec3 col = mix(vec3(.15, .17, .48), vec3(.21, .18, .50), smoothstep(.3, .75, fbm(p * 4. + 3.)));
      col = mix(col, vec3(.26, .34, .70), smoothstep(.6, .85, fbm(p * 9. + 21.)) * .5);   // soft lighter mottling
      col = mix(col, vec3(.62, .14, .18), smoothstep(.64, .80, fbm(p * 5. + 11.)) * smoothstep(-.03, -.16, p.y) * .65);
      vec3 head = mix(vec3(.85, .20, .24), vec3(.64, .09, .13), smoothstep(.45, .8, fbm(p * 22. + 7.)));
      col = mix(col, head, headM);
      // gill plate and cheek (pale grey-blue), lips, operculum edge
      float gillR = length((p - vec2(.09, -.03)) * vec2(1., .78));
      float cheek = (1. - smoothstep(.10, .14, gillR)) * smoothstep(.0, -.07, p.y + (p.x - .12) * .3);
      col = mix(col, vec3(.44, .48, .70), cheek * .7);
      col = mix(col, vec3(.50, .50, .72), (1. - smoothstep(.02, .045, p.x)) * .8);
      float gLine = (1. - smoothstep(.0, .01, abs(gillR - .148))) * step(.11, p.x) * smoothstep(.1, .0, p.y);
      col *= 1. - gLine * .35;
      // alpha: sparse iridescent flecks, lit at runtime
      float spk = smoothstep(.84, .95, vn(p * vec2(60., 70.) + uSeed)) * smoothstep(.5, .78, fbm(p * 6. + 2.));
      o = vec4(col, spk * (1. - headM * .7));
    }`;

  // attr: cos(a), sin(a) around the body; zw: position on the flat side profile (in L)
  const FS_BODY = `#version 300 es
    precision highp float;
    in vec3 vPos; in vec3 vNrm; in vec4 vAttr;
    uniform vec3 uCam, uLight; uniform float uSeed, uGulp; uniform sampler2D uTex;
    out vec4 o;
    ${GLSL_NOISE}
    void main() {
      vec2 p = vAttr.zw; float s = p.x, side = vAttr.y;
      vec3 N = normalize(vNrm), V = normalize(uCam - vPos);
      vec4 pig = texture(uTex, vec2(p.x / ${BODY_BOX[0]}, (p.y - ${BODY_BOX[1]}) / ${BODY_BOX[2] - BODY_BOX[1]}));
      vec3 col = pig.rgb;

      // scales: barely-there overlapping rims
      vec2 sc = p * vec2(44., 50.);
      sc.x += .5 * mod(floor(sc.y), 2.);
      vec2 cell = floor(sc), f = fract(sc) - .5;
      float rnd = h21(cell + uSeed), d = length(f);
      float scaleM = smoothstep(.24, .38, s);
      col *= 1. + (.04 - smoothstep(.3, .55, d) * .1) * scaleM;

      // lighting
      float ndl = dot(N, uLight);
      vec3 H = normalize(uLight + V);
      vec3 c = col * (max(ndl, 0.) * .75 + .28);
      c += pow(max(dot(N, H), 0.), 36.) * .35 * vec3(.9, .92, 1.);
      // every scale is a tilted mirror: glints shift as the fish moves
      vec3 Np = normalize(N + (vec3(h21(cell + 1.7), h21(cell + 5.1), h21(cell + 9.3)) - .5) * .9);
      float glint = pow(max(dot(Np, H), 0.), 24.) * scaleM * (1. - smoothstep(.1, .35, d)) * step(.55, rnd);
      vec3 iri = .5 + .5 * cos(6.2832 * (vec3(0., .12, .30) + rnd * .4 + dot(N, V) * .6 + .55));
      c += glint * mix(vec3(.40, .62, 1.), iri, .35) * .35;
      c += pig.a * scaleM * vec3(.30, .45, .85) * (.3 + .5 * max(ndl, 0.));
      c += pow(1. - max(dot(N, V), 0.), 2.5) * vec3(.12, .17, .42);

      // eye
      if (abs(side) > .3) {
        vec2 ec = vec2(.085, .045);
        float ed = length(p - ec) / .04;
        if (ed < 1.15) {
          vec3 iris = mix(vec3(.30, .12, .06), vec3(.66, .48, .20), smoothstep(.8, .97, ed));
          vec3 e = mix(vec3(.01, .01, .015), iris, smoothstep(.78, .86, ed));
          e = mix(e, col * .55, smoothstep(.95, 1.1, ed));
          e += (1. - smoothstep(0., .25, length(p - ec - vec2(-.011, .013)) / .04)) * .8;
          c = mix(c, e, 1. - smoothstep(1., 1.15, ed));
        }
      }
      // mouth
      float mouth = (1. - smoothstep(0., .004 * (1. + uGulp * 2.), abs(p.y - .006 + p.x * .25))) * (1. - smoothstep(.02, .03, p.x));
      c *= 1. - mouth * .6;
      o = vec4(c, 1.);
    }`;

  // fin pigment in u (across the fin) / v (base to edge): rgb colour, a opacity
  const FS_BAKE_FIN = `#version 300 es
    precision highp float;
    in vec2 vUV; uniform float uFid, uSeed;
    out vec4 o;
    ${GLSL_NOISE}
    float rayLine(float x, float w) { float d = abs(fract(x + .5) - .5); return 1. - smoothstep(w, w + fwidth(x) * 1.5 + .03, d); }
    void main() {
      float u = vUV.x, v = vUV.y, fid = uFid, seed = uSeed;
      bool ven = fid > 2.5 && fid < 3.5, pec = fid > 3.5;

      // fin rays branch once on the way out
      float nr = fid < .5 ? 30. : fid < 1.5 ? 17. : fid < 2.5 ? 21. : ven ? 5. : 10.;
      float x = u * nr;
      float ray = mix(rayLine(x, .035), rayLine(x * 2., .045), smoothstep(.35, .55, v));

      // blue streaks run out along the rays, red beyond, pale frayed margin
      float m = fbm(vec2(x * .4, v * .8) + seed * 7.3);
      float m2 = fbm(vec2(x * 1.6, v * 2.) + seed * 3.1);
      float thr = mix(.40, .84, smoothstep(0., .9, v));
      float blue = smoothstep(thr - .035, thr + .035, m * .75 + m2 * .35);
      vec3 RED = vec3(.85, .16, .22), RED2 = vec3(.97, .36, .36), BLUE = vec3(.18, .34, .74), BLUE2 = vec3(.40, .62, .90), PALE = vec3(.80, .90, .97);
      vec3 col = mix(mix(RED, RED2, m2 * .6), mix(BLUE, BLUE2, m2 * .8), blue);
      float rag = (vn(vec2(x * .7, seed * 3.)) - .5) * .26 + (vn(vec2(x * 3., seed)) - .5) * .06;
      float pale = smoothstep(.80, .94, v + rag);
      col = mix(col, PALE, pale * .85);
      ray *= 1. - pale * .8;
      if (!ven && !pec) col = mix(vec3(.15, .19, .58), col, smoothstep(.02, .16, v));   // fin base takes the body colour
      if (ven) col = mix(mix(RED, BLUE, smoothstep(.3, .05, v)), PALE, smoothstep(.72, .95, v));
      if (pec) col = mix(vec3(.80, .80, .93), vec3(.86, .90, 1.), v);
      col *= mix(.9, 1.07, ray * (.6 + .4 * vn(vec2(x * 3., v * 4.))));

      float a = pec ? .06 + .3 * ray : mix(.80, .92, ray) * mix(1., .7, smoothstep(.62, 1., v));
      a *= mix(1., .9, pale);
      if (!ven && !pec) a *= smoothstep(.0, .09, v);   // root fades into the body
      // wavy margin with a few shallow tears
      float tear = smoothstep(.65, .92, vn(vec2(x * .8, seed * 5.)));
      float notch = abs(fract(x + .5) - .5) * 2.;
      float e = v + (vn(vec2(x * .35, seed * 9.)) - .5) * .07 + (vn(vec2(x * 1.6, seed * 2.)) - .5) * .025 + tear * notch * .05;
      a *= 1. - smoothstep(.95, .985, e);
      // alpha below 1 marks thin tissue, which glows a little when lit from behind
      o = vec4(col, a);
    }`;

  // attr: u across the fin, v from base to edge, fin id, per-fin seed
  const FS_FIN = `#version 300 es
    precision highp float;
    in vec3 vPos; in vec3 vNrm; in vec4 vAttr;
    uniform vec3 uCam, uLight; uniform sampler2D uTex;
    out vec4 o;
    void main() {
      vec3 V = normalize(uCam - vPos), N = normalize(vNrm);
      float nv = dot(N, V);
      if (nv < 0.) { N = -N; nv = -nv; }
      vec4 pig = texture(uTex, vAttr.xy);
      // folds turned away from the viewer read darker and denser
      vec3 col = pig.rgb * mix(.72, 1., nv);
      float a = min(1., pig.a * (1. + (1. - nv) * .3));
      float ndl = dot(N, uLight);
      vec3 c = col * (.42 + .62 * max(ndl, 0.)) + col * max(-ndl, 0.) * .4;
      c += col * smoothstep(.6, 1., vAttr.y) * .32;   // thin outer tissue glows
      c += pow(max(dot(N, normalize(uLight + V)), 0.), 30.) * .25 * vec3(.85, .9, 1.);
      // the thin pectoral membrane tints what is behind it rather than covering it
      o = vec4(c * a, vAttr.z > 3.5 ? a * .45 : a);
    }`;

  const VS_BG = `#version 300 es
    out vec2 vUV;
    void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUV = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
  const FS_BG = `#version 300 es
    precision highp float;
    in vec2 vUV; uniform vec2 uAspect; uniform vec4 uRect;
    out vec4 o;
    ${GLSL_NOISE}
    void main() {
      vec2 q = (uRect.xy + vUV * uRect.zw - vec2(.5, .62)) * uAspect * vec2(1.2, 1.6);
      vec3 c = vec3(.004, .006, .011) + vec3(.010, .017, .034) * exp(-3. * dot(q, q));
      c += (h21(gl_FragCoord.xy) - .5) / 255.;
      o = vec4(c, 1.);
    }`;

  // copies the resolved fish rectangle into the screen pixel for pixel
  const VS_QUAD = `#version 300 es
    uniform vec4 uDst;
    void main() { vec2 c = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1); gl_Position = vec4(mix(uDst.xy, uDst.zw, c), 0., 1.); }`;
  const FS_QUAD = `#version 300 es
    precision highp float;
    uniform sampler2D uTex; uniform ivec2 uOff;
    out vec4 o;
    void main() { o = texelFetch(uTex, ivec2(gl_FragCoord.xy) - uOff, 0); }`;

  // points: dust motes (type 0) and food pellets (type 1)
  const VS_PT = `#version 300 es
    layout(location=0) in vec3 aPos;
    layout(location=1) in vec4 aP;
    uniform mat4 uVP; uniform float uPx;
    out float vA, vSoft, vType;
    void main() {
      gl_Position = uVP * vec4(aPos, 1.);
      gl_PointSize = max(aP.x * uPx / gl_Position.w, 1.);
      vA = aP.y; vSoft = aP.z; vType = aP.w;
    }`;
  const FS_PT = `#version 300 es
    precision highp float;
    in float vA, vSoft, vType;
    out vec4 o;
    void main() {
      vec2 c = gl_PointCoord * 2. - 1.;
      float r = length(c);
      if (r > 1.) discard;
      if (vType < .5) {
        float a = vA * (1. - smoothstep(1. - vSoft, 1., r));
        o = vec4(vec3(.62, .72, .85) * a, a);
      } else {
        vec3 n = vec3(c.x, -c.y, sqrt(max(0., 1. - r * r)));
        float l = max(dot(n, normalize(vec3(-.4, .7, .6))), 0.);
        vec3 col = vec3(.50, .26, .10) * (.3 + .8 * l) + vec3(1., .85, .6) * pow(l, 24.) * .5;
        float a = vA * (1. - smoothstep(.8, 1., r));
        o = vec4(col * a, a);
      }
    }`;

  const progBody = program(VS_MESH, FS_BODY);
  const progFin = program(VS_MESH, FS_FIN);
  const progBg = program(VS_BG, FS_BG);
  const progPt = program(VS_PT, FS_PT);
  const progBakeBody = program(VS_BG, FS_BAKE_BODY);
  const progBakeFin = program(VS_BG, FS_BAKE_FIN);
  const progQuad = program(VS_QUAD, FS_QUAD);
  const bgVao = gl.createVertexArray();
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

  // render a pattern shader once into a mipmapped texture
  function bake(prog, w, h, uniforms) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(prog.p);
    uniforms(prog.u);
    gl.bindVertexArray(bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return tex;
  }

  function gridIndex(cols, rows) {
    const idx = new Uint16Array((cols - 1) * (rows - 1) * 6);
    let n = 0;
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = a + rows;
      idx[n++] = a; idx[n++] = b; idx[n++] = a + 1;
      idx[n++] = b; idx[n++] = b + 1; idx[n++] = a + 1;
    }
    return idx;
  }
  // dyn: interleaved position + normal, rewritten every frame; attr: static per-vertex data
  function makeMesh(nv, attr, idx) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const dyn = new Float32Array(nv * 6), dynBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, dyn.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, attr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, dyn, dynBuf, count: idx.length };
  }
  function drawMesh(m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.dynBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.dyn);
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
  }
  // per-vertex normals from central differences over a (cols x rows) grid
  function gridNormals(d, cols, rows, wrapRows) {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, cols - 1);
      let j0 = j - 1, j1 = j + 1;
      if (wrapRows) { if (j0 < 0) j0 = rows - 2; if (j1 > rows - 1) j1 = 1; }
      else { j0 = Math.max(j0, 0); j1 = Math.min(j1, rows - 1); }
      const a0 = (i0 * rows + j) * 6, a1 = (i1 * rows + j) * 6, b0 = (i * rows + j0) * 6, b1 = (i * rows + j1) * 6;
      const ax = d[a1] - d[a0], ay = d[a1 + 1] - d[a0 + 1], az = d[a1 + 2] - d[a0 + 2];
      const bx = d[b1] - d[b0], by = d[b1 + 1] - d[b0 + 1], bz = d[b1 + 2] - d[b0 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      let l = len3(nx, ny, nz);
      if (l < 1e-9) { const s = i === 0 ? -1 : 1; nx = ax * s; ny = ay * s; nz = az * s; l = len3(nx, ny, nz) || 1; }
      const o = (i * rows + j) * 6 + 3;
      d[o] = nx / l; d[o + 1] = ny / l; d[o + 2] = nz / l;
    }
  }

  // ------------------------------------------------------------------ fish
  // Scratch frame filled by Fish.frameAt: position, forward, up, side.
  const FP = new Float64Array(3), FD = new Float64Array(3), FU = new Float64Array(3), FW = new Float64Array(3);

  const NS = 64, NA = 30;
  class Body {
    constructor() {
      this.rings = [];
      for (let k = 0; k < NS; k++) {
        const s = 1.035 * Math.pow(k / (NS - 1), 1.3);
        const top = prof(PROF.top, s), bot = prof(PROF.bot, s);
        this.rings.push({ s, yc: (top + bot) / 2, hy: Math.max((top - bot) / 2, 0), hz: Math.max(prof(PROF.wid, s), 0) });
      }
      const rows = NA + 1;
      this.cos = new Float64Array(rows); this.sin = new Float64Array(rows);
      for (let j = 0; j < rows; j++) { this.cos[j] = Math.cos(j / NA * TAU); this.sin[j] = Math.sin(j / NA * TAU); }
      const attr = new Float32Array(NS * rows * 4);
      for (let k = 0; k < NS; k++) for (let j = 0; j < rows; j++) {
        const r = this.rings[k], o = (k * rows + j) * 4;
        attr[o] = this.cos[j]; attr[o + 1] = this.sin[j]; attr[o + 2] = r.s; attr[o + 3] = r.yc + this.cos[j] * r.hy;
      }
      this.mesh = makeMesh(NS * rows, attr, gridIndex(NS, rows));
      this.tex = bake(progBakeBody, 1024, 512, u => gl.uniform1f(u.uSeed, SEED_F));
    }
    update(f) {
      const L = f.L, d = this.mesh.dyn, rows = NA + 1;
      for (let k = 0; k < NS; k++) {
        const r = this.rings[k];
        f.frameAt(r.s);
        for (let j = 0; j < rows; j++) {
          const y = (r.yc + this.cos[j] * r.hy) * L, z = this.sin[j] * r.hz * L, o = (k * rows + j) * 6;
          d[o] = FP[0] + FU[0] * y + FW[0] * z;
          d[o + 1] = FP[1] + FU[1] * y + FW[1] * z;
          d[o + 2] = FP[2] + FU[2] * y + FW[2] * z;
        }
      }
      gridNormals(d, NS, rows, true);
    }
  }

  class Fin {
    constructor(def, side) {
      this.def = def; this.side = side;
      const R = def.rays, S = def.segs, rows = S + 1;
      this.R = R; this.S = S;
      this.pos = new Float64Array(R * rows * 3);
      this.prev = new Float64Array(R * rows * 3);
      this.rays = [];
      const o1 = rand() * 100, o2 = rand() * 100, o3 = rand() * 100, lobes = Math.max(2, R / 9);
      for (let i = 0; i < R; i++) {
        const u = R > 1 ? i / (R - 1) : 0, s = lerp(def.s[0], def.s[1], u);
        let ay, az = 0;
        if (def.y === 'top') ay = prof(PROF.top, s) - 0.03;
        else if (def.y === 'bot') ay = prof(PROF.bot, s) + 0.03;
        else ay = lerp(def.y[0], def.y[1], u);
        if (def.z === 'surface') {
          const top = prof(PROF.top, s), bot = prof(PROF.bot, s), c = (ay - (top + bot) / 2) / ((top - bot) / 2);
          az = side * prof(PROF.wid, s) * Math.sqrt(Math.max(0, 1 - c * c));
        } else if (def.z) az = side * def.z;
        // lobes: neighbouring rays share smooth variations of length, angle and bend
        const jit = R > 8 ? 1 : 0.3, da = 3.5 * jit * noise1(u * lobes * 1.6 + o2) * DEG;
        this.rays.push({
          u, s, ay, az, seed: rand() * 100, curv: def.curv(u) + 0.14 * jit * noise1(u * lobes + o3),
          len: def.len(u) * (1 + 0.10 * jit * noise1(u * lobes + o1) + (rand() - 0.5) * 0.04),
          a0: lerp(def.ang0[0], def.ang0[1], u) * DEG + da, a1: lerp(def.ang1[0], def.ang1[1], u) * DEG + da,
        });
      }
      const attr = new Float32Array(R * rows * 4), seed = rand() * 10;
      for (let i = 0; i < R; i++) for (let j = 0; j < rows; j++) {
        const o = (i * rows + j) * 4;
        attr[o] = this.rays[i].u; attr[o + 1] = j / S; attr[o + 2] = def.id; attr[o + 3] = seed;
      }
      this.mesh = makeMesh(R * rows, attr, gridIndex(R, rows));
      const big = def.rays > 20;
      this.tex = bake(progBakeFin, big ? 1024 : 256, big ? 512 : 256, u => { gl.uniform1f(u.uFid, def.id); gl.uniform1f(u.uSeed, seed); });
      this.fresh = true;
    }

    // One physics substep: every ray point is pulled by a spring toward its rest pose
    // (carried by the body, with travelling ripples), dragged by the water and kept at
    // constant length along the ray.
    step(f, h, hRatio) {
      const def = this.def, S = this.S, rows = S + 1, L = f.L, t = f.t, pos = this.pos, prev = this.prev;
      const damp = Math.exp(-WATER_DRAG * h), h2 = h * h, init = this.fresh;
      const fold = def.pleats ? 0.04 + 0.07 * (1 - f.spread) : 0;
      for (let i = 0; i < this.R; i++) {
        const r = this.rays[i], u = r.u, base = i * rows * 3;
        f.frameAt(r.s);
        const ax = FP[0] + (FU[0] * r.ay + FW[0] * r.az) * L;
        const ay = FP[1] + (FU[1] * r.ay + FW[1] * r.az) * L;
        const az = FP[2] + (FU[2] * r.ay + FW[2] * r.az) * L;
        pos[base] = prev[base] = ax; pos[base + 1] = prev[base + 1] = ay; pos[base + 2] = prev[base + 2] = az;

        let ang = lerp(r.a0, r.a1, f.spread) + 0.035 * Math.sin(t * 0.8 + u * 3 + r.seed);
        let tilt = def.tilt ? def.tilt * DEG * this.side : 0;
        if (def.beat) {
          const ph = TAU * f.pecHz * t - u * 1.8 + (this.side > 0 ? 0 : 0.6);
          tilt = this.side * (def.tilt + 22 * Math.sin(ph)) * DEG;
          ang += 0.18 * Math.sin(ph + 0.9);
        }
        const ct = Math.cos(tilt), st = Math.sin(tilt), seg = r.len / S, segPx = seg * L;
        let lx = 0, ly = 0, lz = 0;
        for (let j = 1; j <= S; j++) {
          const v = j / S;
          const a = ang + r.curv * v + def.ripple * 0.8 * v * Math.sin(TAU * (v * 0.9 - t * 0.55) + u * 5 + r.seed * 0.1);
          lx += Math.cos(a) * ct * seg; ly += Math.sin(a) * ct * seg; lz += st * seg;
          const wave = Math.pow(v, 1.5) * def.ripple * (
            0.65 * Math.sin(TAU * (v * 1.2 - t * f.rippleHz) + u * TAU * 1.3 + r.seed * 0.02) +
            0.35 * Math.sin(TAU * (v * 0.7 - t * f.rippleHz * 0.7) - u * TAU * 0.9 + 1.7));
          const zz = lz + wave + fold * v * Math.sin(u * Math.PI * 2 * def.pleats);
          const tx = ax + (FD[0] * lx + FU[0] * ly + FW[0] * zz) * L;
          const ty = ay + (FD[1] * lx + FU[1] * ly + FW[1] * zz) * L - FIN_SAG * v * L / def.k[1];
          const tz = az + (FD[2] * lx + FU[2] * ly + FW[2] * zz) * L;
          const o = base + j * 3;
          if (init) {
            pos[o] = prev[o] = tx; pos[o + 1] = prev[o + 1] = ty; pos[o + 2] = prev[o + 2] = tz;
            continue;
          }
          const k = lerp(def.k[0], def.k[1], v) * h2, vd = hRatio * damp;
          for (let c = 0; c < 3; c++) {
            const p = pos[o + c], T = c === 0 ? tx : c === 1 ? ty : tz;
            pos[o + c] = p + (p - prev[o + c]) * vd + (T - p) * k;
            prev[o + c] = p;
          }
        }
        // inextensible ray: walk out from the base; the correction carries no velocity
        for (let j = 1; j <= S; j++) {
          const o = base + j * 3, q = o - 3;
          const dx = pos[o] - pos[q], dy = pos[o + 1] - pos[q + 1], dz = pos[o + 2] - pos[q + 2];
          const l = len3(dx, dy, dz) || 1, s = segPx / l;
          for (let c = 0; c < 3; c++) {
            const np = pos[q + c] + (c === 0 ? dx : c === 1 ? dy : dz) * s;
            prev[o + c] += np - pos[o + c];
            pos[o + c] = np;
          }
        }
      }
      this.fresh = false;
    }

    update() {
      const d = this.mesh.dyn, p = this.pos, n = p.length / 3;
      for (let i = 0; i < n; i++) { d[i * 6] = p[i * 3]; d[i * 6 + 1] = p[i * 3 + 1]; d[i * 6 + 2] = p[i * 3 + 2]; }
      gridNormals(d, this.R, this.S + 1, false);
    }
  }

  class Fish {
    constructor() {
      this.nodes = new Float64Array(NODES * 3);  // physics spine, snout first
      this.rn = new Float64Array(NODES * 3);     // rendered spine (with the swimming wave)
      this.D = new Float64Array(NODES * 3);
      this.U = new Float64Array(NODES * 3);
      this.W = new Float64Array(NODES * 3);
      this.C = new Float64Array(3);              // pivot, roughly at the pectoral fins
      this.F = new Float64Array(3);
      this.body = new Body();
      this.fins = [];
      for (const def of FIN_DEFS) {
        if (def.paired) this.fins.push(new Fin(def, 1), new Fin(def, -1));
        else this.fins.push(new Fin(def, 0));
      }
      this.L = 100; this.t = 0; this.hPrev = 1 / 120;
    }

    reset(L, x, y, z, yaw, pitch) {
      this.L = L; this.yaw = yaw; this.pitch = pitch; this.yawRate = 0; this.pitchRate = 0;
      this.speed = 0; this.spread = 0.6; this.roll = 0; this.phase = 0; this.gulp = 0;
      this.pecHz = 2.6; this.rippleHz = 0.45;
      this.C[0] = x; this.C[1] = y; this.C[2] = z;
      this.heading();
      const seg = L / (NODES - 1);
      for (let i = 0; i < NODES; i++) for (let c = 0; c < 3; c++) this.nodes[i * 3 + c] = this.C[c] + this.F[c] * (PIVOT - i) * seg;
      this.spine(0);
      for (const fin of this.fins) fin.fresh = true;
    }

    heading() {
      const cp = Math.cos(this.pitch);
      this.F[0] = cp * Math.cos(this.yaw); this.F[1] = Math.sin(this.pitch); this.F[2] = cp * Math.sin(this.yaw);
    }

    // Steer toward goal g, move the pivot, let the body follow, then step the fins.
    step(h, g) {
      const L = this.L, C = this.C;
      this.t += h;

      const dx = g.x - C[0], dy = g.y - C[1], dz = g.z - C[2], dl = len3(dx, dy, dz);
      let yawT = this.yaw, pitchT = this.pitch;
      if (g.face) { yawT = g.yaw; pitchT = g.pitch; }
      else if (dl > 0.25 * L) { yawT = Math.atan2(dz, dx); pitchT = Math.asin(clamp(dy / dl, -1, 1)); }
      pitchT = clamp(pitchT, -0.85, 0.85);
      let dYaw = wrapPi(yawT - this.yaw);
      // a U-turn swings the head toward the viewer rather than away
      if (Math.abs(dYaw) > 0.85 * Math.PI && Math.sin(this.yaw + dYaw / 2) < 0) dYaw -= Math.sign(dYaw) * TAU;
      const ease = 1 - Math.exp(-6 * h);
      this.yawRate += (clamp(dYaw * 3, -g.turn, g.turn) - this.yawRate) * ease;
      this.pitchRate += (clamp((pitchT - this.pitch) * 3, -1.2, 1.2) - this.pitchRate) * ease;
      this.yaw += this.yawRate * h;
      this.pitch = clamp(this.pitch + this.pitchRate * h, -0.9, 0.9);
      this.heading();

      const F = this.F;
      const align = dl > 0.25 * L && !g.face ? (F[0] * dx + F[1] * dy + F[2] * dz) / dl : 1;
      let want = g.speed * smooth(-0.2, 0.9, align);
      if (g.speed > 0 && align < 0.8) want = Math.max(want, 0.2 * L);
      const accel = (want - this.speed) * (1 - Math.exp(-2 * h));
      this.speed += accel;
      for (let c = 0; c < 3; c++) C[c] += F[c] * this.speed * h;
      // the slow hover bob moves the whole fish; only forward motion is path-following
      const bob = Math.sin(this.t * 0.6) * 0.03 * L * h;
      C[1] += bob;
      for (let i = PIVOT + 1; i < NODES; i++) this.nodes[i * 3 + 1] += bob;

      this.roll += (clamp(this.yawRate * 0.22, -0.35, 0.35) - this.roll) * (1 - Math.exp(-3 * h));
      const swim = clamp(this.speed / (0.9 * L) + Math.max(accel / h, 0) / L * 0.3, 0, 1.4);
      this.swim = swim;
      this.phase += TAU * (0.9 + 1.4 * swim) * h;
      this.pecHz = 2.4 + swim * 1.4;
      this.rippleHz = 0.4 + swim * 0.5;
      this.spread += (g.spread - this.spread) * (1 - Math.exp(-(g.spread > this.spread ? 3 : 0.9) * h));
      this.gulp = Math.max(0, this.gulp - h * 4);

      this.spine(h);
      const hRatio = h / this.hPrev;
      for (const fin of this.fins) fin.step(this, h, hRatio);
      this.hPrev = h;
    }

    spine(h) {
      const n = this.nodes, C = this.C, F = this.F, seg = this.L / (NODES - 1);
      for (let i = 0; i <= PIVOT; i++) for (let c = 0; c < 3; c++) n[i * 3 + c] = C[c] + F[c] * (PIVOT - i) * seg;
      // the rest of the body trails its own path and slowly straightens out
      const stiff = h > 0 ? 1 - Math.exp(-6 * h) : 1;
      for (let i = PIVOT + 1; i < NODES; i++) {
        const o = i * 3, q = o - 3;
        let px, py, pz;
        if (i === PIVOT + 1) { px = -F[0]; py = -F[1]; pz = -F[2]; }
        else { px = n[q] - n[q - 3]; py = n[q + 1] - n[q - 2]; pz = n[q + 2] - n[q - 1]; const l = len3(px, py, pz) || 1; px /= l; py /= l; pz /= l; }
        let cx = n[o] - n[q], cy = n[o + 1] - n[q + 1], cz = n[o + 2] - n[q + 2];
        let l = len3(cx, cy, cz) || 1;
        cx = cx / l * (1 - stiff) + px * stiff; cy = cy / l * (1 - stiff) + py * stiff; cz = cz / l * (1 - stiff) + pz * stiff;
        l = len3(cx, cy, cz) || 1;
        n[o] = n[q] + cx / l * seg; n[o + 1] = n[q + 1] + cy / l * seg; n[o + 2] = n[q + 2] + cz / l * seg;
      }
      // swimming wave: lateral, growing toward the tail
      this.frames(n);
      const amp = this.L * (0.25 + 0.9 * (this.swim || 0)), rn = this.rn;
      for (let i = 0; i < NODES; i++) {
        const s = i / (NODES - 1), off = amp * (0.006 + 0.05 * s * s) * Math.sin(this.phase - s * TAU * 0.85), o = i * 3;
        for (let c = 0; c < 3; c++) rn[o + c] = n[o + c] + this.W[o + c] * off;
      }
      this.frames(rn);
    }

    frames(n) {
      const D = this.D, U = this.U, W = this.W, cr = Math.cos(this.roll), sr = Math.sin(this.roll);
      for (let i = 0; i < NODES; i++) {
        const a = Math.max(i - 1, 0) * 3, b = Math.min(i + 1, NODES - 1) * 3, o = i * 3;
        let dx = n[a] - n[b], dy = n[a + 1] - n[b + 1], dz = n[a + 2] - n[b + 2];
        let l = len3(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        let ux = -dy * dx, uy = 1 - dy * dy, uz = -dy * dz;
        l = len3(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
        let wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
        const vx = ux * cr + wx * sr, vy = uy * cr + wy * sr, vz = uz * cr + wz * sr;
        wx = dy * vz - dz * vy; wy = dz * vx - dx * vz; wz = dx * vy - dy * vx;
        D[o] = dx; D[o + 1] = dy; D[o + 2] = dz;
        U[o] = vx; U[o + 1] = vy; U[o + 2] = vz;
        W[o] = wx; W[o + 1] = wy; W[o + 2] = wz;
      }
    }

    // Interpolated body frame at spine position s (beyond 1 it extrapolates backward).
    frameAt(s) {
      const x = clamp(s, 0, 1) * (NODES - 1), i = Math.min(Math.floor(x), NODES - 2), t = x - i, a = i * 3, b = a + 3;
      const rn = this.rn, D = this.D, U = this.U;
      for (let c = 0; c < 3; c++) {
        FP[c] = lerp(rn[a + c], rn[b + c], t); FD[c] = lerp(D[a + c], D[b + c], t); FU[c] = lerp(U[a + c], U[b + c], t);
      }
      let l = len3(FD[0], FD[1], FD[2]) || 1;
      FD[0] /= l; FD[1] /= l; FD[2] /= l;
      const du = FU[0] * FD[0] + FU[1] * FD[1] + FU[2] * FD[2];
      FU[0] -= FD[0] * du; FU[1] -= FD[1] * du; FU[2] -= FD[2] * du;
      l = len3(FU[0], FU[1], FU[2]) || 1;
      FU[0] /= l; FU[1] /= l; FU[2] /= l;
      FW[0] = FD[1] * FU[2] - FD[2] * FU[1]; FW[1] = FD[2] * FU[0] - FD[0] * FU[2]; FW[2] = FD[0] * FU[1] - FD[1] * FU[0];
      if (s > 1) for (let c = 0; c < 3; c++) FP[c] -= FD[c] * (s - 1) * this.L;
    }

    snout(out) { for (let c = 0; c < 3; c++) out[c] = this.rn[c]; return out; }
  }

  // ------------------------------------------------------------------ world
  let W = 1, H = 1, dpr = 1, camZ = 1;
  const VP = new Float32Array(16), CAM = new Float32Array(3);
  const LIGHT = (() => { const l = len3(-0.35, 0.8, 0.5); return new Float32Array([-0.35 / l, 0.8 / l, 0.5 / l]); })();
  const fish = new Fish();
  const pellets = [];
  const ptr = { x: 0, y: 0, last: -1e9, inside: false, speed: 0, t: 0 };
  const brain = { T: [0, 0, 0], hold: 1.5, yaw: Math.PI, pitch: 0, flare: 0, flareCool: 0 };
  const goal = { x: 0, y: 0, z: 0, speed: 0, turn: 1.6, face: false, yaw: 0, pitch: 0, spread: 0.6 };

  const fishLength = () => 0.17 * Math.min(W, H * 1.7) * OPT.size;

  function resize() {
    const oldW = W, oldH = H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(innerWidth, 1); H = Math.max(innerHeight, 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // perspective camera looking down -z; the z = 0 plane maps 1:1 onto CSS pixels
    const f = 1 / Math.tan(16 * DEG);
    camZ = (H / 2) * f;
    const near = camZ * 0.2, far = camZ * 4, nf = 1 / (near - far), A = (far + near) * nf, B = 2 * far * near * nf;
    VP.fill(0);
    VP[0] = f / (W / H); VP[5] = f; VP[10] = A; VP[11] = -1;
    VP[12] = -W / 2 * f / (W / H); VP[13] = -H / 2 * f; VP[14] = A * -camZ + B; VP[15] = camZ;
    CAM[0] = W / 2; CAM[1] = H / 2; CAM[2] = camZ;
    if (fish.L !== fishLength()) {
      const C = fish.C, fx = oldW > 1 ? C[0] / oldW * W : W * 0.5, fy = oldH > 1 ? C[1] / oldH * H : H * 0.55;
      fish.reset(fishLength(), fx, fy, fish.C[2] || -0.1 * H, fish.yaw ?? Math.PI, fish.pitch || 0);
      initDust();
    }
  }

  // ------------------------------------------------------------------ behaviour
  const SN = [0, 0, 0];
  function pickWanderTarget() {
    const L = fish.L, C = fish.C;
    const x0 = 1.0 * L, x1 = W - 1.0 * L, y0 = 0.75 * L, y1 = H - 0.8 * L;
    let best = null;
    for (let k = 0; k < 12; k++) {
      const x = rr(x0, Math.max(x0, x1)), y = rr(y0, Math.max(y0, y1));
      const d = Math.hypot(x - C[0], y - C[1]);
      if (!best || (d > 2 * L && d < 6 * L) || d > best.d) best = { x, y, d };
      if (d > 2 * L && d < 6 * L) break;
    }
    const zr = Math.min(0.35 * H, 0.3 * best.d);
    brain.T[0] = best.x; brain.T[1] = best.y; brain.T[2] = clamp(C[2] + rr(-zr, zr), -0.35 * H, 0.05 * H);
  }

  function think(h) {
    const L = fish.L, C = fish.C, now = performance.now();
    brain.flare = Math.max(0, brain.flare - h);
    brain.flareCool = Math.max(0, brain.flareCool - h);
    goal.face = false;
    goal.spread = clamp(0.55 + 0.12 * noise1(fish.t * 0.13) - 0.2 * clamp(fish.speed / L, 0, 1), 0.3, 0.75);

    if (OPT.pose === 'ref') {
      goal.x = C[0]; goal.y = C[1]; goal.z = C[2]; goal.speed = 0; goal.turn = 1;
      goal.face = true; goal.yaw = Math.PI; goal.pitch = -30 * DEG; goal.spread = 0.8;
      return goal;
    }

    // food beats everything
    fish.snout(SN);
    let food = null, best = Infinity;
    for (const p of pellets) {
      if (p.age < 0.25) continue;
      const d = len3(p.x - SN[0], p.y - SN[1], p.z - SN[2]);
      if (d < best) { best = d; food = p; }
    }
    if (food) {
      goal.x = food.x; goal.y = food.y; goal.z = food.z;
      goal.speed = Math.min(1.6 * L, 0.5 * L + best * 1.5); goal.turn = 2.6;
      if (best < food.r + 0.07 * L) eat(food);
      brain.hold = 0;
      return goal;
    }

    // the cursor, while it hovers over the wallpaper
    if (now - ptr.last < (ptr.inside ? 5000 : 1500)) {
      goal.x = clamp(ptr.x, 0.4 * L, W - 0.4 * L); goal.y = clamp(ptr.y, 0.4 * L, H - 0.4 * L); goal.z = 0;
      const d = len3(goal.x - SN[0], goal.y - SN[1], goal.z - SN[2]), stand = 0.35 * L;
      goal.speed = d > stand ? Math.min(1.1 * L, (d - stand) * 1.4) : 0; goal.turn = 1.9;
      // a fast flick close by is a rival: flare
      if (ptr.speed > 2.5 * L && Math.hypot(ptr.x - C[0], ptr.y - C[1]) < 1.4 * L && brain.flareCool <= 0) {
        brain.flare = 2.5; brain.flareCool = 7;
      }
      if (brain.flare > 0) goal.spread = 1;
      brain.hold = 0.5;
      return goal;
    }

    // wander: cruise to a spot, then hover there for a while, side-on
    if (brain.flare > 0) goal.spread = 1;
    if (brain.hold > 0) {
      brain.hold -= h;
      goal.x = C[0]; goal.y = C[1]; goal.z = C[2]; goal.speed = 0; goal.turn = 1;
      goal.face = true; goal.yaw = brain.yaw; goal.pitch = brain.pitch + 0.12 * noise1(fish.t * 0.3 + 40);
      if (brain.hold <= 0) pickWanderTarget();
      return goal;
    }
    const T = brain.T, d = len3(T[0] - C[0], T[1] - C[1], T[2] - C[2]);
    if (d < 0.45 * L) {
      brain.hold = rr(2.5, 8);
      brain.yaw = (Math.cos(fish.yaw) >= 0 ? 0 : Math.PI) + rr(-0.35, 0.35);
      brain.pitch = rr(-0.25, 0.4);
      if (rand() < 0.2 && brain.flareCool <= 0) { brain.flare = rr(2, 3.5); brain.flareCool = 15; }
    }
    goal.x = T[0]; goal.y = T[1]; goal.z = T[2];
    goal.speed = Math.min(0.85 * L, 0.2 * L + d * 0.8); goal.turn = 1.5;
    return goal;
  }

  // ------------------------------------------------------------------ dust & food
  const NDUST = Math.round(110 * clamp(OPT.dust, 0, 4));
  const MAXPEL = 16;
  const ptData = new Float32Array((NDUST + MAXPEL) * 7);
  const dust = [];
  function initDust() {
    dust.length = 0;
    for (let i = 0; i < NDUST; i++) {
      const bokeh = rand() < 0.08;
      dust.push({
        x: rr(0, W), y: rr(0, H), z: bokeh ? rr(0.15 * H, 0.45 * H) : rr(-0.6 * H, 0.2 * H),
        vx: 0, vy: 0, vz: 0, ph: rr(0, 100),
        size: bokeh ? rr(10, 24) : rr(1.2, 3.2), a: bokeh ? rr(0.03, 0.07) : rr(0.12, 0.45), soft: bokeh ? 0.8 : 0.6,
      });
    }
  }
  function stepDust(h) {
    const L = fish.L, n = fish.rn, F = fish.F, sp = fish.speed;
    for (const p of dust) {
      // slow drift with a gentle, varying current
      const tx = 3 * noise1(fish.t * 0.05 + p.ph), ty = -1.5 + 2 * noise1(fish.t * 0.04 + p.ph + 50);
      p.vx += (tx - p.vx) * h * 0.5; p.vy += (ty - p.vy) * h * 0.5; p.vz *= 1 - h * 0.5;
      // the fish pushes the water it swims through
      for (let i = 0; i < NODES; i += 4) {
        const dx = p.x - n[i * 3], dy = p.y - n[i * 3 + 1], dz = p.z - n[i * 3 + 2];
        const d = len3(dx, dy, dz);
        if (d < 0.45 * L) {
          const w = (1 - d / (0.45 * L)) * h * 2;
          p.vx += (F[0] * sp * 0.6 + dx / (d + 1) * 30) * w;
          p.vy += (F[1] * sp * 0.6 + dy / (d + 1) * 30) * w;
          p.vz += (F[2] * sp * 0.6) * w;
        }
      }
      p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      if (p.x < -20) p.x += W + 40; else if (p.x > W + 20) p.x -= W + 40;
      if (p.y < -20) p.y += H + 40; else if (p.y > H + 20) p.y -= H + 40;
    }
  }

  function dropFood(x, y) {
    const L = fish.L;
    for (let k = 0, n = 2 + (rand() < 0.5 ? 1 : 0); k < n && pellets.length < MAXPEL; k++) {
      pellets.push({ x: x + rr(-0.05, 0.05) * L, y: y + rr(-0.03, 0.03) * L, z: 0, vy: -0.1 * L, r: 0.022 * L, age: 0, ph: rr(0, TAU), a: 0 });
    }
  }
  function eat(p) {
    pellets.splice(pellets.indexOf(p), 1);
    fish.gulp = 1;
    fish.speed *= 0.6;
    for (let k = 0; k < 6 && dust.length; k++) {
      const d = dust[(rand() * dust.length) | 0];
      if (d.size > 6) continue;
      d.x = p.x; d.y = p.y; d.z = p.z;
      d.vx = rr(-40, 40); d.vy = rr(-30, 40); d.vz = rr(-20, 20);
    }
  }
  function stepPellets(h) {
    const L = fish.L, floor = 0.5 * L;
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      p.age += h;
      p.vy += (-0.12 * L - p.vy) * h * 1.5;
      p.x += Math.sin(p.age * 1.7 + p.ph) * 0.03 * L * h;
      p.y = Math.max(floor, p.y + p.vy * h);
      p.a = Math.min(1, p.age * 4) * (1 - smooth(40, 45, p.age));
      if (p.age > 45) pellets.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ input
  addEventListener('pointermove', e => {
    const now = performance.now(), x = e.clientX, y = H - e.clientY;
    const dt = Math.max(now - ptr.t, 1) / 1000, v = Math.hypot(x - ptr.x, y - ptr.y) / dt;
    ptr.speed = ptr.speed * 0.7 + Math.min(v, 1e4) * 0.3;
    ptr.x = x; ptr.y = y; ptr.t = now; ptr.last = now; ptr.inside = true;
  });
  document.addEventListener('pointerleave', () => { ptr.inside = false; });
  addEventListener('pointerdown', e => { if (e.button === 0) dropFood(e.clientX, H - e.clientY); });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('resize', resize);

  // ------------------------------------------------------------------ frame
  function simulate(dt) {
    // equal substeps of at most 1/90 s keep the ray springs stable at any refresh rate
    const n = Math.max(1, Math.ceil(dt * 90)), h = dt / n;
    for (let k = 0; k < n; k++) {
      ptr.speed *= Math.exp(-h * 6);
      stepPellets(h);
      fish.step(h, think(h));
      stepDust(h);
    }
  }

  // Multisampled offscreen target for the fish; grows when the fish needs more room.
  const MSAA = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  const fbo = { w: 0, h: 0 };
  function fishTarget(w, h) {
    if (w <= fbo.w && h <= fbo.h) return;
    w = Math.max(w, fbo.w); h = Math.max(h, fbo.h);
    if (fbo.fb) { gl.deleteFramebuffer(fbo.fb); gl.deleteFramebuffer(fbo.rfb); gl.deleteRenderbuffer(fbo.color); gl.deleteRenderbuffer(fbo.depth); gl.deleteTexture(fbo.tex); }
    fbo.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    fbo.color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, fbo.color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, MSAA, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, fbo.color);
    fbo.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, fbo.depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, MSAA, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fbo.depth);
    fbo.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    fbo.rfb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.rfb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbo.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fbo.w = w; fbo.h = h;
  }

  // Screen rectangle (device pixels) that holds the whole fish this frame.
  const rect = { x: 0, y: 0, w: 0, h: 0 };
  function fishRect() {
    const cw = canvas.width, ch = canvas.height;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, z, m) => {
      const w = camZ - z, sx = (VP[0] * x + VP[12]) / w, sy = (VP[5] * y + VP[13]) / w, r = m * camZ / w * dpr;
      const px = (sx * 0.5 + 0.5) * cw, py = (sy * 0.5 + 0.5) * ch;
      if (px - r < x0) x0 = px - r; if (px + r > x1) x1 = px + r;
      if (py - r < y0) y0 = py - r; if (py + r > y1) y1 = py + r;
    };
    const rn = fish.rn, body = 0.26 * fish.L;
    for (let i = 0; i < NODES; i++) add(rn[i * 3], rn[i * 3 + 1], rn[i * 3 + 2], body);
    for (const fin of fish.fins) {
      const p = fin.pos;
      for (let i = 0; i < p.length; i += 3) add(p[i], p[i + 1], p[i + 2], 3);
    }
    rect.x = clamp(Math.floor(x0) - 2, 0, cw); rect.y = clamp(Math.floor(y0) - 2, 0, ch);
    rect.w = clamp(Math.ceil(x1) + 2, 0, cw) - rect.x; rect.h = clamp(Math.ceil(y1) + 2, 0, ch) - rect.y;
    return rect.w > 0 && rect.h > 0;
  }

  // VP followed by a zoom that maps the given screen rectangle onto the whole viewport
  const VPS = new Float32Array(16);
  function subViewProj(r) {
    const cw = canvas.width, ch = canvas.height;
    const nx0 = r.x / cw * 2 - 1, nx1 = (r.x + r.w) / cw * 2 - 1, ny0 = r.y / ch * 2 - 1, ny1 = (r.y + r.h) / ch * 2 - 1;
    const kx = 2 / (nx1 - nx0), ky = 2 / (ny1 - ny0), cx = (nx0 + nx1) / 2, cy = (ny0 + ny1) / 2;
    for (let c = 0; c < 4; c++) {
      VPS[c * 4] = kx * (VP[c * 4] - cx * VP[c * 4 + 3]);
      VPS[c * 4 + 1] = ky * (VP[c * 4 + 1] - cy * VP[c * 4 + 3]);
      VPS[c * 4 + 2] = VP[c * 4 + 2];
      VPS[c * 4 + 3] = VP[c * 4 + 3];
    }
    return VPS;
  }

  let nDust = 0, nPts = 0;
  function drawWater(vp, rx, ry, rw, rh) {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(progBg.p);
    gl.uniform2f(progBg.u.uAspect, W / H, 1);
    gl.uniform4f(progBg.u.uRect, rx, ry, rw, rh);
    gl.bindVertexArray(bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progPt.p);
    gl.uniformMatrix4fv(progPt.u.uVP, false, vp);
    gl.uniform1f(progPt.u.uPx, camZ * dpr);
    gl.bindVertexArray(ptVao);
    gl.drawArrays(gl.POINTS, 0, nDust);
  }

  function drawFish(vp) {
    // body: opaque, writes depth so the fins tuck in behind it
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.useProgram(progBody.p);
    gl.uniformMatrix4fv(progBody.u.uVP, false, vp);
    gl.uniform3fv(progBody.u.uCam, CAM);
    gl.uniform1f(progBody.u.uRootBias, 0);
    gl.uniform3fv(progBody.u.uLight, LIGHT);
    gl.uniform1f(progBody.u.uSeed, SEED_F);
    gl.uniform1f(progBody.u.uGulp, fish.gulp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fish.body.tex);
    drawMesh(fish.body.mesh);

    // fins: translucent, far-side pair first, near-side pair last
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(progFin.p);
    gl.uniformMatrix4fv(progFin.u.uVP, false, vp);
    gl.uniform3fv(progFin.u.uCam, CAM);
    gl.uniform3fv(progFin.u.uLight, LIGHT);
    gl.uniform1f(progFin.u.uRootBias, 0.14 * fish.L);
    const m = PIVOT * 3, Wm = fish.W, rn = fish.rn;
    const nearSide = Math.sign(Wm[m] * (CAM[0] - rn[m]) + Wm[m + 1] * (CAM[1] - rn[m + 1]) + Wm[m + 2] * (CAM[2] - rn[m + 2])) || 1;
    const order = (fin) => (fin.side === 0 ? 1 : fin.side === nearSide ? 2 : 0);
    for (const pass of [0, 1, 2]) for (const fin of fish.fins) {
      if (order(fin) !== pass) continue;
      gl.bindTexture(gl.TEXTURE_2D, fin.tex);
      drawMesh(fin.mesh);
    }
    gl.depthMask(true);
  }

  function render() {
    const cw = canvas.width, ch = canvas.height;
    nPts = 0;
    for (const p of dust) ptData.set([p.x, p.y, p.z, p.size, p.a, p.soft, 0], 7 * nPts++);
    nDust = nPts;
    for (const p of pellets) ptData.set([p.x, p.y, p.z, p.r * 2, p.a, 0.2, 1], 7 * nPts++);
    gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ptData, 0, nPts * 7);
    fish.body.update(fish);
    for (const fin of fish.fins) fin.update();

    // 1. water and dust over the whole screen, single-sampled
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    drawWater(VP, 0, 0, 1, 1);

    // 2. the fish, multisampled, in its own rectangle (with the same water behind it)
    if (fishRect()) {
      const r = rect;
      fishTarget(r.w, r.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
      gl.viewport(0, 0, r.w, r.h);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const vp = subViewProj(r);
      drawWater(vp, r.x / cw, r.y / ch, r.w / cw, r.h / ch);
      drawFish(vp);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo.rfb);
      gl.blitFramebuffer(0, 0, r.w, r.h, 0, 0, r.w, r.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      gl.useProgram(progQuad.p);
      gl.uniform4f(progQuad.u.uDst, r.x / cw * 2 - 1, r.y / ch * 2 - 1, (r.x + r.w) / cw * 2 - 1, (r.y + r.h) / ch * 2 - 1);
      gl.uniform2i(progQuad.u.uOff, r.x, r.y);
      gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
      gl.bindVertexArray(bgVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 3. food on top
    if (nPts > nDust) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progPt.p);
      gl.uniformMatrix4fv(progPt.u.uVP, false, VP);
      gl.uniform1f(progPt.u.uPx, camZ * dpr);
      gl.bindVertexArray(ptVao);
      gl.drawArrays(gl.POINTS, nDust, nPts - nDust);
    }
  }

  const ptVao = gl.createVertexArray();
  const ptBuf = gl.createBuffer();
  gl.bindVertexArray(ptVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
  gl.bufferData(gl.ARRAY_BUFFER, ptData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);

  // test hook: ?dbg exposes the state; with &manual the page only advances through betta.step()
  if (Q.has('dbg')) window.betta = { fish, pellets, ptr, brain, step: dt => { simulate(dt); render(); } };
  resize();
  if (OPT.pose === 'ref') {
    const L = fish.L, p = -30 * DEG;
    fish.reset(L, W / 2 - Math.cos(p) * 0.55 * L, H / 2 + Math.sin(p) * 0.55 * L, 0, Math.PI, p);
  } else {
    fish.reset(fish.L, W * rr(0.35, 0.65), H * rr(0.4, 0.6), -0.1 * H, rand() < 0.5 ? 0 : Math.PI, 0);
  }

  if (Q.has('bench')) {
    // GPU+CPU cost per frame, synchronised with a 1-pixel readback
    const px = new Uint8Array(4), n = 240, ext = gl.getExtension('WEBGL_debug_renderer_info');
    for (let i = 0; i < 30; i++) { simulate(1 / 60); render(); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let t0 = performance.now();
    for (let i = 0; i < n; i++) simulate(1 / 60);
    const sim = (performance.now() - t0) / n;
    t0 = performance.now();
    for (let i = 0; i < n; i++) { simulate(1 / 60); render(); gl.flush(); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const all = (performance.now() - t0) / n;
    errBox.textContent = `bench ${canvas.width}x${canvas.height}: sim ${sim.toFixed(2)} ms, sim+render ${all.toFixed(2)} ms/frame on ${ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?'}`;
    document.title = 'ready';
    return;
  }
  if (STILL !== null) {
    for (let t = 0; t < STILL; t += 1 / 60) simulate(1 / 60);
    render();
    // tests read the frame back from the DOM (headless screenshots miss the WebGL canvas)
    if (Q.has('png')) errBox.textContent = canvas.toDataURL('image/png');
    if (Q.has('dbg')) errBox.textContent = JSON.stringify({ pitch: fish.pitch, yaw: fish.yaw, nodes: Array.from(fish.rn).map(Math.round) });
    document.title = 'ready';
    return;
  }

  let last = performance.now(), lastDraw = 0, frames = 0, statT = last;
  function loop(now) {
    requestAnimationFrame(loop);
    if (OPT.fps > 0 && now - lastDraw < 1000 / OPT.fps - 2) return;
    lastDraw = now;
    if (Q.has('stats') && ++frames && now - statT > 5000) {
      console.log(`betta: ${(frames * 1000 / (now - statT)).toFixed(1)} fps, ${canvas.width}x${canvas.height}`);
      frames = 0; statT = now;
    }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (dt <= 0) return;
    simulate(dt);
    render();
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  if (!Q.has('manual')) requestAnimationFrame(loop);
})();
