import { GUI } from '../../vendor/lil-gui.module.min.js';

function hsv(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
const rgb = (h, s, v, a = 1) => {
  const [r, g, b] = hsv(((h % 1) + 1) % 1, s, v);
  return `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`;
};

export default {
  id: 'spectrum',
  name: 'Spectrum Bloom',
  icon: '📊',
  type: 'canvas',
  tagline: 'Lightweight radial spectrum with beat-driven particle bursts — easy on any GPU.',
  glow: 'rgba(255,159,67,0.20)',
  accent: 'rgba(255,159,67,0.65)',

  async create(ctx) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    ctx.stage.appendChild(canvas);
    const c = canvas.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const params = {
      barCount: 96,
      hueBase: 0.52,
      paletteDrift: 0.5,
      particles: true,
      trail: 0.25,
      glow: 14,
    };

    const gui = new GUI({ container: ctx.guiHost, title: '📊 Spectrum Bloom' });
    gui.add(params, 'barCount', 32, 192, 8).name('Bars');
    gui.add(params, 'hueBase', 0, 1, 0.01).name('Hue');
    gui.add(params, 'paletteDrift', 0, 2, 0.01).name('Hue Drift');
    gui.add(params, 'trail', 0.05, 0.9, 0.01).name('Trails');
    gui.add(params, 'glow', 0, 30, 1).name('Glow');
    gui.add(params, 'particles').name('Particles');

    const parts = [];
    function spawnBurst(audio) {
      if (!params.particles) return;
      const n = 26 + audio.beatIntensity * 40;
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 260 * (0.4 + audio.low + 0.3);
        parts.push({
          x: W / 2, y: H / 2,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 1,
          size: 1.5 + Math.random() * 3,
          hue: params.hueBase + params.paletteDrift * (audio.high + 0.15) + Math.random() * 0.12,
        });
      }
      if (parts.length > 900) parts.splice(0, parts.length - 900);
    }

    let time = 0;

    return {
      update(dt, audio) {
        time += dt;
        if (audio.beat) spawnBurst(audio);

        // fade previous frame -> trails
        c.fillStyle = `rgba(3,5,10,${params.trail})`;
        c.fillRect(0, 0, W, H);

        const cx = W / 2, cy = H / 2;
        const baseR = Math.min(W, H) * (0.16 + audio.energy * 0.05);
        const freq = audio.freqData;
        const bars = params.barCount | 0;

        // --- Radial spectrum bars ---
        c.save();
        c.translate(cx, cy);
        c.rotate(time * 0.05);
        for (let i = 0; i < bars; i++) {
          // log-ish frequency mapping so bass doesn't dominate half the circle
          const t = i / bars;
          const idx = Math.floor(Math.pow(t, 1.6) * (freq.length * 0.72));
          const v = freq[idx] / 255;
          const len = v * Math.min(W, H) * 0.24 * (0.6 + audio.beatIntensity * 0.35);
          const ang = (i / bars) * Math.PI * 2;
          const hue = params.hueBase + t * 0.33 * params.paletteDrift + time * 0.02 + audio.mid * 0.08;

          c.strokeStyle = rgb(hue, 0.85, 0.55 + v * 0.45, 0.92);
          c.lineWidth = Math.max(1.5, (Math.PI * 2 * baseR) / bars * 0.55);
          c.shadowBlur = params.glow * (0.3 + v);
          c.shadowColor = rgb(hue, 0.9, 0.8, 0.9);
          c.beginPath();
          c.moveTo(Math.cos(ang) * baseR, Math.sin(ang) * baseR);
          c.lineTo(Math.cos(ang) * (baseR + len), Math.sin(ang) * (baseR + len));
          c.stroke();
        }
        c.restore();

        // --- Waveform ring ---
        const wave = audio.waveData;
        c.beginPath();
        for (let i = 0; i <= wave.length; i += 4) {
          const wv = (wave[i % wave.length] - 128) / 128;
          const ang = (i / wave.length) * Math.PI * 2 - Math.PI / 2;
          const rr = baseR * 0.82 + wv * 16 * (0.5 + audio.energy);
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr;
          i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.closePath();
        c.strokeStyle = rgb(params.hueBase + 0.5, 0.7, 0.95, 0.85);
        c.shadowBlur = params.glow;
        c.shadowColor = rgb(params.hueBase + 0.5, 0.9, 1, 0.9);
        c.lineWidth = 1.6;
        c.stroke();
        c.shadowBlur = 0;

        // --- Core pulse ---
        const coreR = baseR * 0.34 * (0.85 + audio.low * 0.7 + audio.beatIntensity * 0.45);
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8);
        grad.addColorStop(0, rgb(params.hueBase + 0.1, 0.6, 1, 0.75 + audio.beatIntensity * 0.25));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = grad;
        c.beginPath();
        c.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2);
        c.fill();

        // --- Particles ---
        c.save();
        c.shadowBlur = 8;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life -= dt * 0.55;
          if (p.life <= 0) { parts.splice(i, 1); continue; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.985; p.vy *= 0.985;
          c.fillStyle = rgb(p.hue + time * 0.03, 0.85, 0.95, p.life);
          c.shadowColor = c.fillStyle;
          c.beginPath();
          c.arc(p.x, p.y, p.size * p.life + 0.4, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      },
      render() { /* drawn directly in update */ },
      resize() { resize(); },
      dispose() {
        canvas.remove();
        gui.destroy();
      },
    };
  },
};
