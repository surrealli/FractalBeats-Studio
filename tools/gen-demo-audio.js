// Generates a short synthesized demo track (tools/demo-track.wav) used to
// drive audio-reactive visuals while recording the landing-page previews.
// Kick every 500ms (120 BPM), bass sweep, hats, and a soft chord pad.
// No dependencies — writes raw PCM WAV directly.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const DUR = 8; // seconds
const N = SR * DUR;
const dir = dirname(fileURLToPath(import.meta.url));
const outPath = join(dir, 'demo-track.wav');

const data = new Float32Array(N);

// --- Kick: sine with exponential pitch drop + amplitude decay ---
function kick(t) {
  const env = Math.exp(-t * 9);
  const freq = 42 + 110 * Math.exp(-t * 22);
  return Math.sin(2 * Math.PI * freq * t) * env * 0.9;
}

// --- Hat: band-ish shaped noise burst ---
function hat(t) {
  const env = Math.exp(-t * 55);
  return (Math.random() * 2 - 1) * env * 0.16;
}

// --- Bass: smooth saw at a slowly sweeping frequency ---
const bass = (() => {
  let phase = 0;
  return (t) => {
    const f = 55 + 18 * Math.sin(2 * Math.PI * 0.25 * t);
    phase += f / SR;
    const saw = 2 * (phase % 1) - 1;
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t);
    return saw * 0.22 * env;
  };
})();

// --- Pad: soft triad with slow tremolo ---
function pad(t) {
  const trem = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.35 * t);
  const fade = Math.min(1, t / 1.2) * Math.min(1, (DUR - t) / 1.2);
  return (
    (Math.sin(2 * Math.PI * 220 * t) +
      Math.sin(2 * Math.PI * 277.18 * t) * 0.8 +
      Math.sin(2 * Math.PI * 329.63 * t) * 0.7) *
    0.08 *
    trem *
    fade
  );
}

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const kt = t % 0.5; // kick phase (120 BPM)
  const ht = t % 0.25; // hat phase
  data[i] = kick(kt) + bass(t) + pad(t) + hat(ht);
  // gentle soft clip
  data[i] = Math.tanh(data[i] * 1.1) * 0.85;
}

// --- Encode 16-bit mono WAV ---
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const s = Math.max(-1, Math.min(1, data[i]));
  pcm.writeInt16LE(Math.round(s * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${outPath} (${(pcm.length + 44) / 1024 | 0} KB, ${DUR}s)`);
