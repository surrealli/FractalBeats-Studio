import * as THREE from '../../vendor/three.module.js';
import { GUI } from '../../vendor/lil-gui.module.min.js';
import { createShaderScreen, addUniforms } from './shader-screen.js';

export default {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
  icon: '🔮',
  type: 'webgl',
  tagline: 'Mirror-symmetric kali bloom — every beat reshapes the mandala.',
  glow: 'rgba(255,107,107,0.20)',
  accent: 'rgba(255,107,107,0.65)',

  async create(ctx) {
    const s = await createShaderScreen({ renderer: ctx.renderer, fragmentUrl: './src/screens/kaleido.glsl' });
    addUniforms(s, {
      u_time: Math.random() * 100,
      u_resolution: new THREE.Vector2(s.initialSize.width, s.initialSize.height),
      u_rot: 0,
      u_segments: 8,
      u_bass: 0, u_mid: 0, u_high: 0, u_beat: 0, u_energy: 0,
      u_warp: 1.0,
      u_iterations: 9,
      u_palette: 3,
      u_brightness: 1.1,
    });

    const params = {
      segments: 8,
      iterations: 9,
      warp: 1.0,
      palette: 3,
      brightness: 1.1,
    };

    const st = ctx.persist;
    let time = st.time ?? s.uniforms.u_time.value;
    let rotAngle = st.rotAngle ?? 0;
    let smoothMid = st.smoothMid ?? 0;
    let lastRate = 0;

    const gui = new GUI({ container: ctx.guiHost, title: '🔮 Kaleidoscope' });
    gui.add(params, 'segments', 3, 16, 1).name('Mirror Segments');
    gui.add(params, 'iterations', 4, 12, 1).name('Iterations');
    gui.add(params, 'warp', 0.4, 1.6, 0.01).name('Warp');
    gui.add(params, 'palette', 0, 3, 1).name('Palette');
    gui.add(params, 'brightness', 0.4, 2.2, 0.01).name('Brightness');

    return {
      uniforms: s.uniforms,
      debug: () => ({ rotAngle, rate: lastRate, smoothMid }),
      update(dt, audio) {
        time += dt;
        const u = s.uniforms;
        // Integrate rotation from a heavily smoothed rate (≈1.5s time constant)
        // with a hard cap — the spin eases with the music, never kicks.
        smoothMid += (audio.mid - smoothMid) * Math.min(1, dt * 0.7);
        const rate = Math.min(0.22, 0.045 + 0.16 * smoothMid);
        lastRate = rate;
        rotAngle += dt * rate;

        u.u_time.value = time;
        u.u_rot.value = rotAngle;
        u.u_segments.value = params.segments;
        u.u_bass.value = audio.low;
        u.u_mid.value = audio.mid;
        u.u_high.value = audio.high;
        u.u_beat.value = audio.beatIntensity;
        u.u_energy.value = audio.energy;
        u.u_warp.value = params.warp + audio.mid * 0.15;
        u.u_iterations.value = params.iterations;
        u.u_palette.value = params.palette;
        u.u_brightness.value = params.brightness;

        st.time = time;
        st.rotAngle = rotAngle;
        st.smoothMid = smoothMid;
      },
      render() { s.render(); },
      resize(w, h) { s.resize(w, h); },
      dispose() { gui.destroy(); s.dispose(); },
    };
  },
};
