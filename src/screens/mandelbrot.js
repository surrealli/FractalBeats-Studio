import * as THREE from '../../vendor/three.module.js';
import { GUI } from '../../vendor/lil-gui.module.min.js';
import { createShaderScreen, addUniforms } from './shader-screen.js';

// Tempo always controls travel; the speed slider adjusts distance per beat.
const defaults = () => ({ baseSpeed: 1, twist: 0.65, iterations: 180,
  opacity: 0.32, brightness: 1.2, response: 1, colorSync: 0.8, drumPunch: 1 });

export default {
  id: 'mandelbrot', name: 'Mandelbrot Spiral Tunnel', icon: '🌀', type: 'webgl',
  tagline: 'Dive through translucent ice-blue Mandelbrot spirals — the music guides your flight.',
  glow: 'rgba(130,210,255,0.20)', accent: 'rgba(130,210,255,0.65)',
  async create(ctx) {
    const s = await createShaderScreen({ renderer: ctx.renderer, fragmentUrl: './src/screens/mandelbrot.glsl' });
    const st = ctx.persist;
    const params = Object.assign(defaults(), st.spiralParams);
    params.response=1; // Master Audio Response lives in the shared Music Response panel.
    let time = st.time ?? 0;
    let camZ = st.camZ ?? 0;
    let smoothEnergy = st.smoothEnergy ?? 0;
    let rotAngle = st.rotAngle ?? 0;
    let speed = 0;
    let paletteHue = st.paletteHue ?? 0.56;
    let tempo = 0;
    let rhythmPulse = 0;
    addUniforms(s, {
      u_resolution: new THREE.Vector2(ctx.width, ctx.height),
      u_center: new THREE.Vector2(-0.74543, 0.11301), u_regionScale: 0.018,
      u_customPalette: 0, u_customBase: new THREE.Color('#67bfff'), u_customEdge: new THREE.Color('#d6f4ff'),
      u_vocal:0,u_guitar:0,u_keys:0,u_sustain:0,u_noteChange:0,u_staccato:0,u_triplet:0,
      u_time: time, u_camZ: camZ, u_iterations: params.iterations,
      u_twist: params.twist, u_opacity: params.opacity,
      u_brightness: params.brightness, u_bass: 0, u_mid: 0, u_high: 0, u_beat: 0, u_rot: rotAngle, u_hue: paletteHue, u_snare: 0, u_hat: 0, u_change: 0,
    });
    const gui = new GUI({ container: ctx.guiHost, title: ctx.screenTitle || '🌀 Mandelbrot Spiral Tunnel' });
    gui.add(params, 'baseSpeed', 0.01, 20, 0.01).name('Flight Speed');
    gui.add(params, 'twist', 0, 1.5, 0.01).name('Spiral Twist');
    gui.add(params, 'iterations', 80, 240, 1).name('Fractal Detail');
    gui.add(params, 'opacity', 0.08, 0.75, 0.01).name('Spiral Opacity');
    gui.add(params, 'brightness', 0.4, 2, 0.01).name('Brightness');
    gui.add(params, 'colorSync', 0, 1, 0.01).name('Harmony Color');
    gui.add(params, 'drumPunch', 0, 2, 0.01).name('Drum Accents');
    const status = { tempo: 'Listening', harmony: 'Listening' };
    gui.add(status, 'tempo').name('Tempo Estimate').disable();
    gui.add(status, 'harmony').name('Tonal Center').disable();
    let lastStatus = 0;
    gui.add({ reset() {
      Object.assign(params, defaults());
      gui.controllersRecursive().forEach(c => c.updateDisplay());
    } }, 'reset').name('Reset Settings');
    return {
      uniforms: s.uniforms,
      debug: () => ({ camZ, speed, smoothEnergy, rotAngle, tempo, paletteHue, rhythmPulse }),
      update(dt, audio) {
        time += dt;
        smoothEnergy += (Math.sqrt(Math.max(0, audio.energy)) * params.response - smoothEnergy) * Math.min(1, dt * 1.2);
        // Like Mandelbulb: bands already have attack/release in AudioEngine.
        // Feed them directly to geometry and lighting; extra smoothing hid hits.
        // Expand quiet FFT averages so ordinary tracks visibly move the scene.
        const bass = Math.min(1, Math.sqrt(Math.max(0, audio.low)) * 1.5) * params.response;
        const mid = Math.min(1, Math.sqrt(Math.max(0, audio.mid)) * 1.5) * params.response;
        const high = Math.min(1, Math.sqrt(Math.max(0, audio.high)) * 1.5) * params.response;
        const music = audio.music;
        const drum = (music?.kick ?? 0) * params.drumPunch * params.response;
        const kick = Math.max(audio.beatIntensity * params.response, drum);
        const snare = (music?.snare ?? 0) * params.drumPunch * params.response;
        const hat = (music?.hat ?? 0) * params.drumPunch * params.response;
        const confidence = music?.tempoConfidence ?? 0;
        // Always follow measured tempo: no manual BPM or invented tempo.
        // Wait for an estimate, retain it through brief breaks, reset on seek/new track.
        if (!music?.bpm) tempo = 0;
        else if (confidence > 0.35) {
          tempo = tempo === 0 ? music.bpm : tempo + (music.bpm-tempo) * (1-Math.exp(-dt*2));
        }
        rhythmPulse = Math.max(drum, snare*0.5);
        // Tonal roots choose cyan/blue/violet families; approach without jumps.
        const targetHue = 0.56 + ((music?.harmonyHue ?? 0.5)-0.5)*0.30*params.colorSync*params.response;
        paletteHue += (targetHue-paletteHue) * (1-Math.exp(-dt*2));
        const change = Math.max(music?.harmonyChange ?? 0, music?.energyChange ?? 0) * params.response;
        if (time-lastStatus > 0.5) {
          status.tempo = tempo > 0 ? `${Math.round(tempo)} BPM (automatic)` : 'Listening for tempo';
          const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
          status.harmony = music?.root >= 0 && music.harmonyConfidence > 0.08 ? `${notes[music.root]} (estimated)` : 'Listening';
          gui.controllersRecursive().filter(c=>c.object===status).forEach(c=>c.updateDisplay());
          lastStatus=time;
        }
        // Fixed distance per beat makes faster music fly faster, independently
        // of volume. Flight Speed scales distance per beat; pause stops travel.
        const active = audio.isPlaying || audio.sourceMode === 'mic';
        speed = active && (audio.inputEnergy ?? audio.energy) > 0.000001 ? params.baseSpeed*(tempo/60)*0.12 : 0;
        rotAngle += dt * (0.02 + mid * 0.24);
        camZ += dt * speed;
        const u = s.uniforms;
        u.u_time.value = time;
        u.u_camZ.value = camZ;
        u.u_iterations.value = params.iterations;
        u.u_twist.value = params.twist;
        u.u_opacity.value = params.opacity;
        u.u_brightness.value = params.brightness * (0.88 + 0.5 * Math.min(1.5,smoothEnergy) + 0.22 * Math.min(2,kick));
        u.u_bass.value = bass;
        u.u_mid.value = mid;
        u.u_high.value = high;
        u.u_beat.value = kick;
        u.u_rot.value = rotAngle;
        u.u_hue.value = paletteHue;
        u.u_snare.value = snare;
        u.u_hat.value = hat;
        u.u_change.value = change * params.colorSync;
      },
      render() { s.render(); },
      resize(w, h) { s.resize(w, h); },
      dispose() {
        Object.assign(st, { spiralParams: { ...params }, time, camZ, smoothEnergy, rotAngle, paletteHue });
        gui.destroy(); s.dispose();
      },
    };
  },
};
