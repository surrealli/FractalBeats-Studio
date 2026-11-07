import * as THREE from '../vendor/three.module.js';
import { AudioEngine } from './audio-engine.js';
import { LayerReactivity } from './layer-reactivity.js';
import { initUI } from './ui.js';
import mandelbulbScreen from './screens/mandelbulb.js';
// Disabled for now — code kept in src/screens/julia.js
// import juliaScreen from './screens/julia.js';
import tunnelScreen from './screens/tunnel.js';
import spectrumScreen from './screens/spectrum.js';
import kaleidoscopeScreen from './screens/kaleidoscope.js';
import mandelbrotScreen from './screens/mandelbrot.js';
import mandelbrotMapScreen from './screens/mandelbrot-map.js';

const SCREENS = [tunnelScreen, spectrumScreen, mandelbulbScreen, kaleidoscopeScreen, mandelbrotScreen, mandelbrotMapScreen];
const MIN_QUALITY = 0.5;
const MAX_QUALITY = 1.0;

class App {
  constructor() {
    this.canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.qualityScale = 1.0;
    this._applySize();

    this.engine = new AudioEngine();
    this.reactivity = new LayerReactivity();
    this.guiHost = document.getElementById('gui-host');
    this.stage = document.getElementById('stage');
    this.screens = new Map(SCREENS.map((s) => [s.id, s]));
    this.current = null;
    this.currentDef = null;
    // Per-screen state that survives switching (e.g. tunnel camera position)
    this.persist = {};

    this.lastFrame = performance.now();
    this.fpsSamples = [];
    this._lastQualityCheck = performance.now();
    this._badStreak = 0;
    this._goodStreak = 0;

    window.addEventListener('resize', () => this._onResize());

    initUI({
      engine: this.engine,
      app: this,
      screenDefs: SCREENS,
      onSwitch: (id) => this.switchTo(id),
      getCurrentDef: () => this.currentDef,
      onFrame: () => this.current,
    });

    this.loop();
  }

  _applySize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.basePixelRatio * this.qualityScale);
    this.renderer.setSize(w, h, false);
    this.renderSize = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(this.renderSize);
  }

  _onResize() {
    this._applySize();
    if (this.current && this.current.resize) {
      this.current.resize(this.renderSize.x, this.renderSize.y);
    }
  }

  async switchTo(id) {
    const def = this.screens.get(id);
    if (!def || this.currentDef === def) return;

    if (this.current) {
      try { this.current.dispose(); } catch (e) { /* noop */ }
      this.current = null;
    }
    this.reactivity.detach();
    this.guiHost.innerHTML = '';
    this.currentDef = def;

    this.canvas.style.display = def.type === 'webgl' ? '' : 'none';
    this._applySize();

    try {
      this.current = await def.create({
        renderer: this.renderer,
        audio: this.engine,
        guiHost: this.guiHost,
        stage: this.stage,
        persist: this.persist[def.id] || (this.persist[def.id] = {}),
        width: this.renderSize.x,
        height: this.renderSize.y,
      });
      this.reactivity.attach(this.guiHost);
    } catch (err) {
      console.error(`Failed to start screen "${id}"`, err);
      this.showToast(`Could not start "${def.name}"`);
    }
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.getElementById('toasts').appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  _adaptQuality(now) {
    if (now - this._lastQualityCheck < 3000) return;
    this._lastQualityCheck = now;
    if (this.fpsSamples.length < 30) { this.fpsSamples.length = 0; return; }
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;

    // Hysteresis: only step after sustained bad/good windows, so resolution
    // changes (visible as a subtle sharpness pop) are rare.
    if (avg < 36) { this._badStreak++; this._goodStreak = 0; }
    else if (avg > 55) { this._goodStreak++; this._badStreak = 0; }
    else { this._badStreak = 0; this._goodStreak = 0; }

    const prevScale = this.qualityScale;
    if (this._badStreak >= 2 && this.qualityScale > MIN_QUALITY) {
      this.qualityScale = Math.max(MIN_QUALITY, this.qualityScale * 0.85);
      this._badStreak = 0;
    } else if (this._goodStreak >= 3 && this.qualityScale < MAX_QUALITY) {
      this.qualityScale = Math.min(MAX_QUALITY, this.qualityScale * 1.08);
      this._goodStreak = 0;
    }
    if (prevScale !== this.qualityScale) {
      this._applySize();
      if (this.current && this.current.resize) {
        this.current.resize(this.renderSize.x, this.renderSize.y);
      }
    }
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (dt > 0) this.fpsSamples.push(1 / dt);

    this.engine.update();

    if (this.current) {
      const routed=this.reactivity.route(this.engine,dt);
      this.current.update(dt, routed);
      this.reactivity.apply(this.current,this.currentDef.id,this.engine);
      this.current.render();
    }

    this._adaptQuality(now);
  }
}

const app = new App();
window.__fractalApp = app;
