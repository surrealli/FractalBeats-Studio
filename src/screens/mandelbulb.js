import * as THREE from '../../vendor/three.module.js';
import { GUI } from '../../vendor/lil-gui.module.min.js';
import { createShaderScreen, addUniforms } from './shader-screen.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Focused, human-named parameter set. The cyclic shape-evolution system lives
// in the shader (ported from the original Mandelbulb Nebula); these sliders
// set its intensity. Defaults mirror the original's proven values.
const defaults = {
  power: 8, detail: 12, size: 1.0,
  spin: 0.8, rotSpeed: 0.65, shapeRegen: 0.6, structChange: 0.5, beatSync: 0.8,
  morph: 0.7, beatPunch: 1.0,
  distortion: 0.3, chaos: 0.4, shapeMod: 0.5,
  bass: 0.8, shimmer: 0.6,
  palette: 0, hue: 0.0, saturation: 0.85, brightness: 1.0, glow: 0.6,
  maxSteps: 220,
};

export default {
  id: 'mandelbulb',
  name: 'Mandelbulb Nebula',
  icon: '🪐',
  type: 'webgl',
  tagline: 'The classic — a ray-marched 3D fractal that breathes with your music.',
  note: '⚠ Heavy on some setups — ray-marching 3D needs a decent GPU; run it if your device keeps up smoothly.',
  glow: 'rgba(78,205,196,0.20)',
  accent: 'rgba(78,205,196,0.65)',

  async create(ctx) {
    const s = await createShaderScreen({ renderer: ctx.renderer, fragmentUrl: './src/screens/mandelbulb.glsl' });
    const st = ctx.persist;
    const params = Object.assign({}, defaults, st.params || {});
    st.params = params;

    addUniforms(s, {
      u_time: 0,
      u_resolution: new THREE.Vector2(s.initialSize.width, s.initialSize.height),
      u_camYaw: 0.7, u_camPitch: 0.25, u_camDist: 3.4,
      u_power: params.power, u_maxIter: params.detail, u_size: params.size,
      u_morph: params.morph, u_beatPunch: params.beatPunch,
      u_kick: 0, u_energy: 0, u_low: 0, u_mid: 0, u_high: 0,
      u_hueDrift: 0,
      u_palette: params.palette, u_hueShift: params.hue,
      u_saturation: params.saturation, u_brightness: params.brightness,
      u_glow: params.glow, u_maxSteps: params.maxSteps,
      u_rotSpeed: params.rotSpeed, u_shapeRegen: params.shapeRegen,
      u_structChange: params.structChange, u_beatSync: params.beatSync,
      u_chaos: params.chaos, u_distortion: params.distortion,
      u_shapeMod: params.shapeMod,
    });

    // ── GUI: folders with human-readable names ──
    const gui = new GUI({ container: ctx.guiHost, title: '🪐 Mandelbulb' });
    const controllers = [];
    const add = (folder, key, name, ...range) =>
      controllers.push(folder.add(params, key, ...range).name(name));

    const fShape = gui.addFolder('Shape');
    add(fShape, 'power', 'Power', 3, 12, 0.1);
    add(fShape, 'detail', 'Detail', 6, 24, 1);
    add(fShape, 'size', 'Size', 0.6, 1.6, 0.01);
    fShape.open();

    const fMotion = gui.addFolder('Motion');
    add(fMotion, 'spin', 'Auto-spin', 0, 2, 0.05);
    add(fMotion, 'rotSpeed', 'Rotation speed', 0, 1.5, 0.05);
    add(fMotion, 'shapeRegen', 'Shape evolution', 0, 1.5, 0.05);
    add(fMotion, 'structChange', 'Structure change', 0, 1.5, 0.05);
    add(fMotion, 'beatSync', 'Beat sync', 0, 1.5, 0.05);
    add(fMotion, 'morph', 'Morph', 0, 1, 0.01);
    add(fMotion, 'beatPunch', 'Beat punch', 0, 1.5, 0.05);
    fMotion.open();

    const fAudio = gui.addFolder('Audio');
    add(fAudio, 'bass', 'Bass response', 0, 1.5, 0.05);
    add(fAudio, 'shimmer', 'Highs shimmer', 0, 1.5, 0.05);
    add(fAudio, 'distortion', 'Distortion', 0, 1, 0.01);
    add(fAudio, 'chaos', 'Chaos', 0, 1, 0.01);
    add(fAudio, 'shapeMod', 'Shape mix', 0, 1, 0.01);
    fAudio.open();

    const fLook = gui.addFolder('Look');
    add(fLook, 'palette', 'Palette', 0, 3, 1);
    add(fLook, 'hue', 'Hue shift', 0, 1, 0.01);
    add(fLook, 'saturation', 'Saturation', 0, 1, 0.01);
    add(fLook, 'brightness', 'Brightness', 0.3, 2, 0.01);
    add(fLook, 'glow', 'Glow', 0, 1.5, 0.05);
    fLook.close();

    const fPerf = gui.addFolder('Performance');
    add(fPerf, 'maxSteps', 'Max steps', 80, 400, 10);
    fPerf.close();

    gui.add({
      reset: () => {
        Object.assign(params, defaults);
        controllers.forEach((c) => c.updateDisplay());
      },
    }, 'reset').name('🔄 RESET ALL');

    // ── Interaction: drag to orbit, wheel/pinch to zoom, auto-spin when idle ──
    const dom = ctx.stage;
    const cam = st.cam ?? (st.cam = { yaw: 0.7, pitch: 0.25, dist: 3.4 });
    let velYaw = 0, velPitch = 0;
    let distT = cam.dist;
    let autoBlend = 1;
    let dragging = false, lastX = 0, lastY = 0, pinchD = 0;
    let lastInteract = 0;
    const pointers = new Map();

    const onDown = (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) {
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        velYaw = velPitch = 0;
      } else if (pointers.size === 2) {
        const p = [...pointers.values()];
        pinchD = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      }
      lastInteract = performance.now();
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1 && dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        cam.yaw -= dx * 0.005;
        cam.pitch = clamp(cam.pitch + dy * 0.004, -1.35, 1.35);
        velYaw = -dx * 0.25;
        velPitch = dy * 0.2;
        lastInteract = performance.now();
      } else if (pointers.size === 2) {
        const p = [...pointers.values()];
        const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        if (pinchD > 0 && d > 0) distT = clamp((distT * pinchD) / d, 1.8, 7.5);
        pinchD = d;
        lastInteract = performance.now();
      }
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 1) dragging = false;
      lastInteract = performance.now();
    };
    const onWheel = (e) => {
      e.preventDefault();
      distT = clamp(distT * Math.exp(e.deltaY * 0.0012), 1.8, 7.5);
      lastInteract = performance.now();
    };
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // ── per-frame musical state ──
    let time = st.time ?? Math.random() * 100;
    let energyS = 0, beatCount = 0;
    let hueDrift = 0;

    return {
      uniforms: s.uniforms,
      debug: () => ({ power: s.uniforms.u_power.value, energyS, hueDrift, rotSpeed: params.rotSpeed }),
      update(dt, audio) {
        time += dt;
        st.time = time;

        // Slow energy envelope for glow/breathing. Band envelopes go in raw —
        // the audio engine already applies fast attack / slow release, and the
        // shader injects them directly into rotation angles, power, offsets and
        // distortion so shape + motion are unmistakably synced to the music.
        energyS += (audio.energy - energyS) * Math.min(1, dt * 1.5);

        if (audio.beat) {
          beatCount++;
          hueDrift += 0.06 * params.beatPunch; // palette jumps on strong hits
        }
        hueDrift += dt * (0.02 + audio.mid * 0.12); // mids push the palette forward

        // Camera physics: inertia → decay; auto-spin fades in when idle.
        cam.dist += (distT - cam.dist) * Math.min(1, dt * 6);
        if (!dragging) {
          cam.yaw += velYaw * dt;
          cam.pitch = clamp(cam.pitch + velPitch * dt, -1.35, 1.35);
          const decay = Math.exp(-dt * 2.5);
          velYaw *= decay;
          velPitch *= decay;
          autoBlend = (performance.now() - lastInteract > 1500)
            ? Math.min(1, autoBlend + dt * 0.8)
            : Math.max(0, autoBlend - dt * 3);
          cam.yaw += dt * params.spin * 0.4 * (0.4 + energyS) * autoBlend;
        }

        const u = s.uniforms;
        u.u_time.value = time;
        u.u_camYaw.value = cam.yaw;
        u.u_camPitch.value = cam.pitch;
        u.u_camDist.value = cam.dist;
        u.u_power.value = params.power;
        u.u_maxIter.value = params.detail;
        u.u_size.value = params.size * (1 - 0.18 * params.beatPunch * audio.beatIntensity); // kick pulse
        u.u_morph.value = params.morph;
        u.u_beatPunch.value = params.beatPunch;
        u.u_kick.value = audio.beatIntensity;
        u.u_energy.value = energyS;
        // Mild expansion so even a flat mix visibly drives the shader's cyclic
        // system (raw unison bands here; the audio engine already attack/release-smooths).
        u.u_low.value = Math.min(1, audio.low * 1.5) * params.bass;
        u.u_mid.value = Math.min(1, audio.mid * 1.5);
        u.u_high.value = Math.min(1, audio.high * 1.5) * params.shimmer * 1.6;
        u.u_rotSpeed.value = params.rotSpeed;
        u.u_shapeRegen.value = params.shapeRegen;
        u.u_structChange.value = params.structChange;
        u.u_beatSync.value = params.beatSync;
        u.u_chaos.value = params.chaos;
        u.u_distortion.value = params.distortion;
        u.u_shapeMod.value = params.shapeMod;
        u.u_hueDrift.value = hueDrift;
        u.u_palette.value = params.palette;
        u.u_hueShift.value = params.hue;
        u.u_saturation.value = params.saturation;
        u.u_brightness.value = params.brightness;
        u.u_glow.value = params.glow * (0.55 + 0.8 * energyS + 0.5 * audio.beatIntensity);
        u.u_maxSteps.value = params.maxSteps;
      },
      render() { s.render(); },
      resize(w, h) { s.resize(w, h); },
      dispose() {
        dom.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        dom.removeEventListener('wheel', onWheel);
        gui.destroy();
        s.dispose();
      },
    };
  },
};