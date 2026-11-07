import { MusicalLines } from './musical-lines.js';
import { MusicFeatures } from './music-features.js';

const BAND_ATTACK = 0.15;
const BAND_RELEASE = 0.03;
const BEAT_REFRACTORY_MS = 200;
const ENERGY_HISTORY = 20;

export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.connect(this.ctx.destination);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.prevData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveData = new Uint8Array(this.analyser.frequencyBinCount);

    this.musicAnalyser = this.ctx.createAnalyser();
    this.musicAnalyser.fftSize = 8192;
    this.musicAnalyser.smoothingTimeConstant = 0.15;
    this.analyser.connect(this.musicAnalyser);
    this.musicData = new Float32Array(this.musicAnalyser.frequencyBinCount);
    // Short, unsmoothed window for drum timing; keep long FFT for pitch detail.
    this.rhythmAnalyser = this.ctx.createAnalyser();
    this.rhythmAnalyser.fftSize = 2048;
    this.rhythmAnalyser.smoothingTimeConstant = 0;
    this.analyser.connect(this.rhythmAnalyser);
    this.rhythmData = new Float32Array(this.rhythmAnalyser.frequencyBinCount);
    this.music = new MusicFeatures();
    this.musicalLines = new MusicalLines();

    this.audioEl = null;
    this.elSource = null;
    this.micStream = null;
    this.micSource = null;
    this.objectUrl = null;

    this.sourceMode = 'none';
    this.isPlaying = false;

    this.bands = {
      subBass: 0, bass: 0, lowMid: 0,
      midRange: 0, upperMid: 0, highFreq: 0, air: 0,
    };
    this.low = 0; this.mid = 0; this.high = 0;
    this.energy = 0;
    this.beatIntensity = 0;
    this.beat = false;

    this.energyHistory = [];
    this.lastBeatTime = 0;
    this._beatPulse = 0;
    this.trackName = '';
  }

  _ensureElement() {
    if (this.audioEl) return;
    const el = document.createElement('audio');
    el.crossOrigin = 'anonymous';
    el.addEventListener('play', () => { this.isPlaying = true; });
    el.addEventListener('pause', () => { this.isPlaying = false; });
    el.addEventListener('ended', () => {
      this.isPlaying = false;
      this._emit('ended');
    });
    document.body.appendChild(el);
    this.audioEl = el;
    this.elSource = this.ctx.createMediaElementSource(el);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get duration() { return this.audioEl ? this.audioEl.duration || 0 : 0; }
  get currentTime() { return this.audioEl ? this.audioEl.currentTime || 0 : 0; }

  async loadFile(file) {
    this._ensureElement();
    await this._disconnectMic();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.music.reset();
    this.musicalLines.reset();
    this.audioEl.src = this.objectUrl;
    this.trackName = file.name.replace(/\.[^.]+$/, '');
    this.sourceMode = 'file';
    this._connectActive();
    this._emit('trackloaded', { name: this.trackName });
  }

  async enableMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
      });
      if (this.isPlaying && this.audioEl) this.audioEl.pause();
      this.micStream = stream;
      this.micSource = this.ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.analyser);
      this.music.reset();
    this.musicalLines.reset();
      this.sourceMode = 'mic';
      this._emit('sourcechanged', { mode: 'mic' });
      return true;
    } catch (err) {
      this._emit('micerror', { message: err.message || 'Microphone access denied' });
      return false;
    }
  }

  async _disconnectMic() {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  async useFileSource() {
    await this._disconnectMic();
    this.sourceMode = this.audioEl ? 'file' : 'none';
    this._connectActive();
    this._emit('sourcechanged', { mode: this.sourceMode });
  }

  _connectActive() {
    try { this.elSource.disconnect(); } catch (e) { /* noop */ }
    if (this.sourceMode === 'file') this.elSource.connect(this.analyser);
  }

  async play() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.sourceMode === 'file' && this.audioEl) {
      await this.audioEl.play();
    } else if (this.sourceMode === 'none') {
      this._emit('nosource');
      return false;
    }
    return true;
  }

  pause() {
    if (this.sourceMode === 'file' && this.audioEl) this.audioEl.pause();
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  seek(t) {
    if (this.audioEl && isFinite(t)) {
      this.music.reset();
    this.musicalLines.reset();
      this.audioEl.currentTime = Math.max(0, Math.min(t, this.duration || t));
    }
  }

  update() {
    this.prevData.set(this.freqData);
    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.waveData);

    this.musicAnalyser.getFloatFrequencyData(this.musicData);
    this.rhythmAnalyser.getFloatFrequencyData(this.rhythmData);
    this.music.update(this.musicData, this.ctx.sampleRate, this.musicAnalyser.fftSize,
      this.ctx.currentTime, this.isPlaying || this.sourceMode === 'mic',
      this.rhythmData, this.rhythmAnalyser.fftSize);
    this.musicalLines.update(this.musicData,this.ctx.sampleRate,this.musicAnalyser.fftSize,
      this.ctx.currentTime,this.isPlaying || this.sourceMode==='mic',this.music);
    this.beat = false;

    if (!this.isPlaying && this.sourceMode !== 'mic') {
      this._decayAll();
      return;
    }

    const l = this.freqData.length;
    let subBass = 0, bass = 0, lowMid = 0, mid = 0, upperMid = 0, high = 0, air = 0;
    for (let i = 0; i < l; i++) {
      const v = this.freqData[i] / 255;
      if (i < l / 7) subBass += v;
      else if (i < 2 * l / 7) bass += v;
      else if (i < 3 * l / 7) lowMid += v;
      else if (i < 4 * l / 7) mid += v;
      else if (i < 5 * l / 7) upperMid += v;
      else if (i < 6 * l / 7) high += v;
      else air += v;
    }
    subBass /= l / 7; bass /= l / 7; lowMid /= l / 7;
    mid /= l / 7; upperMid /= l / 7; high /= l / 7; air /= l / 7;

    this._envelope('subBass', subBass);
    this._envelope('bass', bass);
    this._envelope('lowMid', lowMid);
    this._envelope('midRange', mid);
    this._envelope('upperMid', upperMid);
    this._envelope('highFreq', high);
    this._envelope('air', air);

    const legacyLow = (subBass + bass) / 2;
    const legacyMid = (lowMid + mid + upperMid) / 3;
    const legacyHigh = (high + air) / 2;

    this.low += (legacyLow - this.low) * (legacyLow > this.low ? BAND_ATTACK : BAND_RELEASE);
    this.mid += (legacyMid - this.mid) * (legacyMid > this.mid ? BAND_ATTACK : BAND_RELEASE);
    this.high += (legacyHigh - this.high) * (legacyHigh > this.high ? BAND_ATTACK : BAND_RELEASE);

    const totalEnergy = (legacyLow + legacyMid + legacyHigh) / 3;
    this.energyHistory.push(totalEnergy);
    if (this.energyHistory.length > ENERGY_HISTORY) this.energyHistory.shift();
    this.energy = totalEnergy;

    this._detectBeats(l);
  }

  _envelope(name, target) {
    const rate = target > this.bands[name] ? BAND_ATTACK : BAND_RELEASE;
    this.bands[name] += (target - this.bands[name]) * rate;
  }

  _decayAll() {
    for (const k of Object.keys(this.bands)) this.bands[k] *= 0.9;
    this.low *= 0.9; this.mid *= 0.9; this.high *= 0.9;
    this.energy *= 0.9;
    this.beatIntensity = Math.max(0, this.beatIntensity - 0.05);
  }

  _detectBeats(l) {
    let flux = 0;
    for (let i = 0; i < l; i++) {
      const diff = this.freqData[i] / 255 - this.prevData[i] / 255;
      if (diff > 0) flux += diff;
    }
    flux /= l;

    const avgEnergy =
      this.energyHistory.reduce((a, b) => a + b, 0) / Math.max(1, this.energyHistory.length);
    const threshold = avgEnergy * 1.3;

    const now = performance.now();
    const strong = flux > threshold && flux > 0.02;
    if (strong && now - this.lastBeatTime > BEAT_REFRACTORY_MS) {
      this.beat = true;
      this._beatPulse = 1.0;
      this.lastBeatTime = now;
      this._emit('beat', { intensity: 1.0 });
    }
    // Smooth envelope: fast (~40ms) attack instead of an instant strobe,
    // slow release — keeps reactive visuals punchy but never jumpy.
    this._beatPulse = Math.max(0, this._beatPulse - 0.07);
    const attack = this._beatPulse > this.beatIntensity ? 0.45 : 0.12;
    this.beatIntensity += (this._beatPulse - this.beatIntensity) * attack;
  }

  dispose() {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.remove();
    }
    this._disconnectMic();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.ctx.close();
  }
}
