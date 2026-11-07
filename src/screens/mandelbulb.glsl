precision highp float;

// ── Mandelbulb Nebula v2 ─────────────────────────────────────────────────────
// All time/audio-dependent math (rotations, offsets, wobble) depends only on
// frame uniforms, so it is computed ONCE per pixel in main() and stored in
// globals — the per-step march loop stays cheap. Structure parameters (power,
// scale) are eased on the CPU every frame, so the distance estimator never
// jumps and the surface never pops.

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_camYaw;
uniform float u_camPitch;
uniform float u_camDist;
uniform float u_power;      // eased exponent (CPU-smoothed)
uniform float u_maxIter;    // fractal iterations
uniform float u_size;       // scale
uniform float u_morph;      // structural morph amount
uniform float u_beatPunch;  // beat strength
uniform float u_kick;       // beat envelope (fast attack / slow release)
uniform float u_energy;     // smoothed energy envelope
uniform float u_low;        // band envelopes (pre-scaled on CPU by sliders)
uniform float u_mid;
uniform float u_high;
uniform float u_hueDrift;   // integrated hue drift (mids push it forward)
uniform float u_palette;    // 0..3
uniform float u_hueShift;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_glow;
uniform float u_maxSteps;
// ── cyclic shape-evolution system (ported from the original Mandelbulb
//    Nebula: aggressive time+audio cycles that constantly reshape the bulb)
uniform float u_rotSpeed;     // base multi-axis rotation speed (rad/s)
uniform float u_shapeRegen;   // cyclic shape regeneration amount
uniform float u_structChange; // structural change amount
uniform float u_beatSync;     // music-synced regeneration speed
uniform float u_chaos;        // chaotic surface modulation
uniform float u_distortion;   // surface distortion amount
uniform float u_shapeMod;     // master mix for distortion/chaos layers

#define MAX_DIST 12.0
#define HIT_EPS  0.0006

// Per-frame constants (set in main, read in de/map)
mat3  g_rot;
vec3  g_offset;
vec3  g_wob;
float g_power;
float g_phase;
float g_scale;      // cyclic scale (music-breathing object size)
float g_maxIterF;   // cyclic iteration count
float g_distAmp;    // distortion layer amplitude
float g_chaosAmp;   // chaos layer amplitude
float g_morphAmp;   // organic morph layer amplitude
float g_bass, g_mid, g_high; // raw band envelopes for positional layers
float g_t;

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

vec3 pal(float t){
  t = fract(t);
  vec3 a, b, c, d;
  if (u_palette < 0.5) {       // rainbow
    a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.00, 0.33, 0.67);
  } else if (u_palette < 1.5) { // ocean
    a = vec3(0.10, 0.30, 0.42); b = vec3(0.12, 0.22, 0.28); c = vec3(1.0); d = vec3(0.45, 0.25, 0.10);
  } else if (u_palette < 2.5) { // fire
    a = vec3(0.52, 0.28, 0.16); b = vec3(0.38, 0.24, 0.14); c = vec3(1.0); d = vec3(0.00, 0.15, 0.25);
  } else {                      // cosmic
    a = vec3(0.42, 0.28, 0.52); b = vec3(0.32, 0.22, 0.38); c = vec3(1.0); d = vec3(0.70, 0.45, 0.20);
  }
  return a + b * cos(6.28318 * (c * t + d));
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.1 + vec2(17.3); a *= 0.5; }
  return v;
}

// Mandelbulb distance estimator with orbit trap.
float de(vec3 p, out vec4 trap){
  float sc = u_size * g_scale;
  vec3 q = g_rot * (p / sc) - g_offset;
  // Audio-reactive positional layers (ported from the original nebula):
  // distortion → chaos → organic morph, all driven by raw band envelopes.
  vec3 d1 = vec3(sin(q.x * 1.5 + g_t * 0.3 + g_bass * 1.5),
                 cos(q.y * 1.2 + g_t * 0.4 + g_mid * 1.2),
                 sin(q.z * 1.8 + g_t * 0.5 + g_high * 1.0))
            * g_distAmp * vec3(g_bass, g_mid, g_high) * 0.3;
  vec3 d2 = vec3(cos(q.x * 2.0 + g_t * 0.2) * sin(q.y * 1.5 + g_t * 0.3),
                 sin(q.y * 1.8 + g_t * 0.4) * cos(q.z * 2.2 + g_t * 0.2),
                 cos(q.z * 2.1 + g_t * 0.3) * sin(q.x * 1.7 + g_t * 0.4))
            * g_chaosAmp * vec3(g_bass, g_mid, g_high) * 0.2;
  vec3 d3 = vec3(sin(q.x * q.y * 0.2 + g_t * 0.6) * cos(q.z * 0.1 + g_t * 0.7),
                 cos(q.y * q.z * 0.15 + g_t * 0.8) * sin(q.x * 0.1 + g_t * 0.5),
                 sin(q.z * q.x * 0.25 + g_t * 0.7) * cos(q.y * 0.2 + g_t * 0.9))
            * g_morphAmp * vec3(g_bass + g_mid, g_mid + g_high, g_high + g_bass) * 0.15;
  q += d1 + d2 + d3;
  vec3 z = q;
  float dr = 1.0;
  float r = max(length(z), 1e-6);
  trap = vec4(abs(z), dot(z, z));
  int maxi = int(min(g_maxIterF, u_maxIter));
  for (int i = 0; i < 30; i++) {
    if (i >= maxi) break;
    r = max(length(z), 1e-6);
    if (r > 2.5) break;
    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi = atan(z.y, z.x);
    dr = pow(r, g_power - 1.0) * g_power * dr + 1.0;
    float zr = pow(r, g_power);
    theta *= g_power;
    phi *= g_power;
    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + q;
    // small bounded per-iteration wobble → organic breathing, DE stays stable
    z += g_wob * sin(float(i) * 1.7 + g_phase + z.y * 2.0);
    trap = min(trap, vec4(abs(z), dot(z, z)));
  }
  return 0.5 * log(r) * r / dr * sc;
}

float map(vec3 p){ vec4 t; return de(p, t); }

vec3 calcNormal(vec3 p){
  const float e = 0.0012;
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e) +
                   k.yyx * map(p + k.yyx * e) +
                   k.yxy * map(p + k.yxy * e) +
                   k.xxx * map(p + k.xxx * e));
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.01 + 0.11 * float(i) / 5.0;
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main(){
  // ── per-frame setup (hoisted out of the march loop) ──
  // Cyclic shape-evolution system ported from the original Mandelbulb
  // Nebula: multiple time+audio cycles constantly reshape power, scale,
  // iterations, position and orientation, with raw band envelopes injected
  // directly so motion is unmistakably in sync with the music.
  float t = u_time;
  float bass = u_low, mid = u_mid, high = u_high;
  g_t = t;
  g_bass = bass; g_mid = mid; g_high = high;

  // 1. cyclic power — fractal complexity evolves in cycles + beat punch
  float powerCycle = t * 0.5 + bass * 2.0 + mid * 1.5 + high;
  g_power = u_power
    + sin(powerCycle) * 2.6 * u_shapeRegen
    + cos(powerCycle * 0.7) * 2.0 * u_structChange
    + bass * 1.2 + mid * 0.8 + high * 0.6
    + sin(t * 0.8 + bass * 2.0) * 0.22 * 0.8 // frequency response (fixed 0.8)
    + (bass + mid + high) * u_shapeRegen * 1.1
    + u_kick * 1.4;
  g_power = max(g_power, 2.0);

  // 2. cyclic scale — the object breathes with the music
  float scaleCycle = t * 0.62 + bass * 1.8 + mid * 1.2 + high * 0.8;
  g_scale = 1.0 + sin(scaleCycle) * 0.20 * u_shapeRegen
              + cos(scaleCycle * 0.6) * 0.14 * u_structChange;

  // 3. cyclic iterations — detail level evolves
  float iterCycle = t * 0.42 + bass * 1.5 + mid + high * 0.7;
  g_maxIterF = clamp(u_maxIter + sin(iterCycle) * 2.4 * u_shapeRegen
                               + cos(iterCycle * 0.8) * 1.8 * u_structChange,
                     5.0, u_maxIter);

  // 4. spatial + regen + structure offsets
  float spatialCycle = t * 0.55 + bass * 2.2 + mid * 1.6 + high * 1.1;
  vec3 off = vec3(sin(spatialCycle * 1.1), cos(spatialCycle * 0.9), sin(spatialCycle * 1.3))
             * (0.4 * u_shapeRegen) * vec3(bass, mid, high);
  float regenPhase = t * u_beatSync + bass * 6.0 + mid * 4.0 + high * 2.0;
  off += vec3(sin(regenPhase * 1.2 + bass * 3.0) * u_shapeRegen * bass,
              cos(regenPhase * 0.8 + mid * 2.5) * u_shapeRegen * mid,
              sin(regenPhase * 1.5 + high * 2.0) * u_shapeRegen * high);
  float structPhase = t * u_structChange + bass * 4.0 + mid * 3.0 + high * 2.0;
  off += vec3(sin(structPhase * 0.7 + bass * 2.0) * 0.3 * u_structChange * bass,
              cos(structPhase * 1.1 + mid * 1.5) * 0.3 * u_structChange * mid,
              sin(structPhase * 0.9 + high * 1.8) * 0.3 * u_structChange * high);
  // breathing + pulse + beat kick (small, from the original)
  off += vec3(sin(t * 0.3), cos(t * 0.21), sin(t * 0.39)) * (u_morph * 0.05);
  off += vec3(sin(t * 1.2) * (u_morph * 0.08), cos(t * 0.96) * (u_morph * 0.06), 0.0);
  off += vec3(u_kick * 0.15);
  g_offset = off;

  // 5. multi-axis rotation — base spin with direct audio angle kicks
  float ax = t * u_rotSpeed + bass * 2.6 + sin(t * 0.3) * 0.3 + u_kick * 0.35;
  float ay = t * u_rotSpeed * 0.8 + mid * 2.0 + cos(t * 0.4) * 0.2 + u_kick * 0.25;
  float az = t * u_rotSpeed * 1.1 + high * 1.6 + sin(t * 0.5) * 0.25 + u_kick * 0.3;
  g_rot = rotZ(az) * rotY(ay) * rotX(ax);

  // 6. distortion / chaos / morph layer amplitudes (cyclic, like the original)
  g_distAmp = (u_distortion + sin(t * 0.7 + bass * 2.5) * 0.3 * u_shapeRegen
                            + cos(t * 0.49) * 0.2 * u_structChange) * u_shapeMod;
  g_chaosAmp = (u_chaos + sin(t * 0.6 + bass * 2.1) * 0.4 * u_shapeRegen
                       + cos(t * 0.36) * 0.3 * u_structChange) * u_shapeMod;
  g_morphAmp = (0.6 + sin(t * 0.65 + bass * 2.3) * 0.5 * u_shapeRegen
                         + cos(t * 0.52) * 0.4 * u_structChange) * u_shapeMod * u_morph;

  g_wob = vec3(sin(t * 0.7), cos(t * 0.9), sin(t * 1.3)) * (0.03 * u_morph * (0.5 + mid));
  g_phase = t * 0.9 + bass * 2.0;

  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  // ── camera (orbit around origin; drag/auto-spin driven from CPU) ──
  float cp = cos(u_camPitch), sp = sin(u_camPitch);
  vec3 ro = u_camDist * vec3(cp * sin(u_camYaw), sp, cp * cos(u_camYaw));
  vec3 fwd = normalize(-ro);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(rgt, fwd);
  float fov = 1.8 - u_kick * 0.22 * u_beatPunch; // punch-in on beats
  vec3 rd = normalize(fwd * fov + uv.x * rgt + uv.y * upv);

  // ── march ──
  float total = 0.0;
  float glow = 0.0;
  vec3 p = ro;
  float d = 0.0;
  bool hit = false;
  int steps = int(u_maxSteps);
  for (int i = 0; i < 400; i++) {
    if (i >= steps) break;
    p = ro + rd * total;
    d = map(p);
    glow += exp(-d * 18.0);
    if (d < HIT_EPS * max(1.0, total)) { hit = true; break; }
    total += d * 0.9; // slightly relaxed step for stability
    if (total > MAX_DIST) break;
  }

  // ── shading ──
  vec3 col;
  if (hit) {
    vec4 tr;
    de(p, tr);
    vec3 n = calcNormal(p);
    float ao = calcAO(p, n);

    // orbit-trap palette: sqrt(min dot(z,z)) varies smoothly across the
    // surface, so color follows structure instead of turning into noise
    float ct = sqrt(max(tr.w, 0.0)) * 1.1 + tr.x * 0.25 + u_hueDrift + u_hueShift;
    vec3 alb = pal(ct);
    float lum = dot(alb, vec3(0.299, 0.587, 0.114));
    alb = mix(vec3(lum), alb, u_saturation);
    alb *= 1.0 + u_high * 0.25 * sin(ct * 30.0); // highs add surface sparkle

    vec3 lkey = normalize(vec3(0.7, 0.9, 0.4));
    float diff = clamp(dot(n, lkey), 0.0, 1.0);
    float back = clamp(dot(n, normalize(vec3(-0.6, -0.2, -0.7))), 0.0, 1.0);
    vec3 hv = normalize(lkey - rd);
    float spec = pow(clamp(dot(n, hv), 0.0, 1.0), 28.0) * (0.25 + u_high * 1.2);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);

    col = alb * (0.10 + diff * 0.9 + back * 0.18) * ao;
    col += vec3(1.0, 0.95, 0.9) * spec * ao;
    col += alb * fres * (0.35 + u_kick * 0.9 * u_beatPunch);
  } else {
    // deep-space gradient + soft nebula tint
    float v = uv.y * 0.5 + 0.5;
    col = mix(vec3(0.012, 0.014, 0.028), vec3(0.03, 0.035, 0.06), v);
    vec3 tint = pal(0.15 + u_hueDrift + u_hueShift);
    float neb = fbm(uv * 2.0 + vec2(t * 0.02, -t * 0.013));
    col += tint * neb * neb * (0.08 + u_energy * 0.06 + u_kick * 0.05 * u_beatPunch);
  }

  // halo around the bulb + vignette
  vec3 gcol = pal(0.35 + u_hueDrift + u_hueShift);
  col += gcol * min(glow, 60.0) * 0.010 * u_glow * (0.4 + u_low * 1.5);
  col *= 1.0 - 0.25 * dot(uv, uv);

  // tonemap + gamma
  col = aces(col * u_brightness);
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}