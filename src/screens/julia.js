import * as THREE from '../../vendor/three.module.js';
import { GUI } from '../../vendor/lil-gui.module.min.js';
import { createShaderScreen, addUniforms } from './shader-screen.js';

// Famous boundary locations. `deep` = how far the dive into each one goes.
// Every point sits ON the set boundary, so a straight zoom into it is always
// content-full. The camera only travels between points while zoomed OUT far
// enough to see the whole set, so the tour never crosses empty space.
const TOUR = [
  { x: -0.5, y: 0.0, deep: 0.55 },
  { x: -0.7, y: 0.0, deep: 0.30 },
  { x: -0.74543, y: 0.11301, deep: 0.0035 },
  { x: -0.16, y: 1.0405, deep: 0.06 },
  { x: -0.7269, y: 0.1889, deep: 0.0018 },
  { x: 0.28693, y: 0.01449, deep: 0.00035 },
  { x: -0.748, y: 0.1, deep: 0.0012 },
];

const OVERVIEW = 1.6;
const OUT_TIME = 7.5;
const IN_BASE_TIME = 8.0;
const IN_LOG_TIME = 0.9;

const easeInOut = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default {
  id: 'julia',
  name: 'Julia Explorer',
  icon: '🌀',
  type: 'webgl',
  tagline: 'Dive into famous Mandelbrot coordinates or morph a musical Julia set.',
  glow: 'rgba(69,183,209,0.20)',
  accent: 'rgba(69,183,209,0.65)',

  async create(ctx) {
    const s = await createShaderScreen({ renderer: ctx.renderer, fragmentUrl: './src/screens/julia.glsl' });
    addUniforms(s, {
      u_time: 0,
      u_resolution: new THREE.Vector2(s.initialSize.width, s.initialSize.height),
      u_center: new THREE.Vector2(-0.5, 0),
      u_scale: OVERVIEW,
      u_juliaMix: 0,
      u_juliaC: new THREE.Vector2(0.355, 0.355),
      u_maxIter: 160,
      u_palette: 0,
      u_saturation: 1.0,
      u_brightness: 1.0,
      u_bass: 0, u_mid: 0, u_high: 0, u_beat: 0,
    });

    const params = {
      mode: 'Mandelbrot Tour',
      autoTour: true,
      tourSpeed: 1.0,
      iterations: 160,
      palette: 0,
      saturation: 1.0,
      brightness: 1.0,
    };

    let time = 0;
    let pulseScale = 1;
    let juliaAngle = Math.random() * Math.PI * 2;

    // --- Tour state machine ---
    // OUT: pull back from deep-at-A to overview; center may only travel toward
    //      B in proportion to how far zoomed out we are.
    // IN:  continuous exponential dive straight into boundary point B.
    let segIndex = Math.floor(Math.random() * TOUR.length);
    let phase = 'in';
    let phaseT = 0;
    let outFrom = { ...TOUR[segIndex] };
    const curCenter = new THREE.Vector2(TOUR[segIndex].x, TOUR[segIndex].y);
    let curScale = OVERVIEW;

    function inDuration(point) {
      return IN_BASE_TIME + Math.abs(Math.log(OVERVIEW / point.deep)) * IN_LOG_TIME;
    }

    function tourStep(dt) {
      phaseT += dt * params.tourSpeed;
      const A = outFrom;
      const B = TOUR[(segIndex + 1) % TOUR.length];

      if (phase === 'out') {
        const t = Math.min(1, phaseT / OUT_TIME);
        const e = easeInOut(t);
        curScale = Math.exp(Math.log(A.deep) + (Math.log(OVERVIEW) - Math.log(A.deep)) * e);
        const gate = easeInOut(smoothstep(0.10, 0.85, curScale / OVERVIEW));
        curCenter.set(A.x + (B.x - A.x) * gate, A.y + (B.y - A.y) * gate);
        if (t >= 1) { phase = 'in'; phaseT = 0; }
      } else {
        const dur = inDuration(B);
        const t = Math.min(1, phaseT / dur);
        const e = easeInOut(t);
        curScale = Math.exp(Math.log(OVERVIEW) + (Math.log(B.deep) - Math.log(OVERVIEW)) * e);
        curCenter.set(B.x, B.y);
        if (t >= 1) {
          segIndex = (segIndex + 1) % TOUR.length;
          outFrom = { ...TOUR[segIndex] };
          phase = 'out';
          phaseT = 0;
        }
      }
    }

    // --- Interaction: wheel zoom + drag pan (turns off auto tour) ---
    const canvas = ctx.renderer.domElement;
    let dragging = false;
    let lastX = 0, lastY = 0;
    function userTookControl() {
      params.autoTour = false;
      guiControllers.autoTour.updateDisplay();
    }
    function onWheel(e) {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0012);
      params._scaleTarget = (params._scaleTarget || curScale) * f;
      userTookControl();
    }
    function onDown(e) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
    function onMove(e) {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const sx = curScale * (e.clientX - lastX) / rect.height;
      const sy = curScale * (e.clientY - lastY) / rect.height;
      if (params.mode === 'Mandelbrot Tour') {
        curCenter.x -= sx;
        curCenter.y += sy;
        userTookControl();
      }
      lastX = e.clientX; lastY = e.clientY;
    }
    function onUp() { dragging = false; }
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const gui = new GUI({ container: ctx.guiHost, title: '🌀 Julia Explorer' });
    const guiControllers = {};
    guiControllers.mode = gui.add(params, 'mode', ['Mandelbrot Tour', 'Julia Morph']).name('Mode');
    guiControllers.autoTour = gui.add(params, 'autoTour').name('Auto Tour');
    gui.add(params, 'tourSpeed', 0.25, 4, 0.25).name('Tour Speed');
    gui.add(params, 'iterations', 40, 600, 10).name('Iterations');
    gui.add(params, 'palette', 0, 3, 1).name('Palette');
    gui.add(params, 'saturation', 0, 2, 0.01).name('Saturation');
    gui.add(params, 'brightness', 0.4, 2, 0.01).name('Brightness');

    return {
      uniforms: s.uniforms,
      debug: () => ({ phase, phaseT, segIndex, scale: curScale, cx: curCenter.x, cy: curCenter.y }),
      update(dt, audio) {
        time += dt;
        const u = s.uniforms;

        const targetMix = params.mode === 'Julia Morph' ? 1 : 0;
        u.u_juliaMix.value += (targetMix - u.u_juliaMix.value) * Math.min(1, dt * 3);
        const mix = u.u_juliaMix.value;

        // Bass-driven zoom pulse (gentle, smoothed)
        const pulseTarget = 1 - audio.low * 0.10 - audio.beatIntensity * 0.04;
        pulseScale += (pulseTarget - pulseScale) * Math.min(1, dt * 5);

        if (mix < 0.98) {
          if (params.autoTour) {
            tourStep(dt);
          } else {
            curScale = THREE.MathUtils.clamp(params._scaleTarget || curScale, 1e-6, 4);
          }
          u.u_center.value.copy(curCenter);
          u.u_scale.value = curScale * pulseScale;
        } else {
          // Julia morph: c orbits smoothly; wobble from highs
          juliaAngle += dt * (0.12 + audio.mid * 0.5 + audio.energy * 0.25) * params.tourSpeed;
          const r = 0.7885 + Math.sin(time * 0.11) * 0.08;
          u.u_juliaC.value.set(
            r * Math.cos(juliaAngle),
            r * Math.sin(juliaAngle) + audio.high * 0.12
          );
          u.u_center.value.lerp(new THREE.Vector2(0, 0), Math.min(1, dt * 2));
          u.u_scale.value += ((params._baseScale || 1.6) * pulseScale - u.u_scale.value) * Math.min(1, dt * 4);
        }

        u.u_time.value = time;
        u.u_maxIter.value = params.iterations + audio.high * 120;
        u.u_palette.value = params.palette;
        u.u_saturation.value = params.saturation;
        u.u_brightness.value = params.brightness;
        u.u_bass.value = audio.low;
        u.u_mid.value = audio.mid;
        u.u_high.value = audio.high;
        u.u_beat.value = audio.beatIntensity;
      },
      render() { s.render(); },
      resize(w, h) { s.resize(w, h); },
      dispose() {
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        gui.destroy();
        s.dispose();
      },
    };
  },
};
