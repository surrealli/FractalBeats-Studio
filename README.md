# 🌌 FractalBeats Studio

**Real-time audio-reactive fractal visualizer with 6 switchable screens.** Load any music file (or use your microphone) and pick a fractal universe to fly through. Runs 100% in your browser — no install, no server.

**Independent repository:** [surrealli/FractalBeats-Studio](https://github.com/surrealli/FractalBeats-Studio)

Open `FractalBeats-Standalone.html` directly, or serve `index.html` locally.

Based on [FractalBeats by Navid Moradimehr](https://github.com/Navid-Moradimehr/FractalBeats). Original source and bundled library attribution are retained. This version adds Mandelbrot exploration, music analysis, and Automatic/Manual response controls.

## 🖥️ The Screens

Press `1`–`6` (or the ⊞ button) to switch anytime — the music keeps playing:

| # | Screen | What it does |
|---|--------|--------------|
| 1 | 🕳️ **Fractal Tunnel** | One continuous fly-through of kali-set blossoms for the whole song — velocity follows a smoothed energy envelope, and your position survives screen switches. |
| 2 | 📊 **Spectrum Bloom** | Lightweight 2D radial spectrum with waveform ring and beat-triggered particle bursts — perfect for weak GPUs. |
| 3 | 🪐 **Mandelbulb Nebula** | Ray-marched 3D Mandelbulb with orbit-trap coloring, real lighting (specular/AO/fresnel) and ACES tonemapping. Structure breathes with beats; drag to orbit, wheel/pinch to zoom. ~14 sliders in folders. *⚠ Heavy — its card warns it needs a decent GPU and may be slow on some setups, so it's listed third.* |
| 4 | 🔮 **Kaleidoscope** | Mirror-symmetric kali mandala with a smoothed, capped spin rate that eases with the music. |

| 6 | 🗺️ **Mandelbrot Map Flight** | Choose a region on a corner map: click a center, drag a crop, zoom the map or adjust Crop zoom. Keeps tempo-synchronized flight and independent saved settings. |
| 5 | 🌀 **Mandelbrot Spiral Tunnel** | Continuous forward flight through translucent light-blue Mandelbrot boundary spirals. Uses the original tunnel’s smoothed audio-driven velocity, layered depth and near-plane dissolves. Flight position and settings survive screen switches. |

> An experimental screen, **Julia Explorer** (Mandelbrot coordinate tours + Julia morphing), ships **disabled** — its code lives in `src/screens/julia.js`; re-enable it by uncommenting its import in `src/main.js`.

## 🎧 Audio Sources

- **File**: click 🎵 Load, or just **drag & drop** an audio file anywhere on the page (mp3/wav/ogg/m4a/flac)
- **Microphone**: pick *Source: Mic* — visualize Spotify, concerts, your voice, anything
- Full transport: play/pause, **seek bar**, track name, time display

## ⌨️ Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `1`–`6` | Switch screen |
| `S` | Open/close the screen picker |
| `Esc` | Close the picker |
| `F` | Fullscreen |

**Touch (mobile):** swipe ←/→ to switch screens · swipe ↑ to open the picker · pull down from the top edge to refresh · ⚙ opens the settings drawer.

## 🎞️ Regenerating the screen previews

The looping clips on the landing page are generated automatically — no manual recording:

```bash
node tools/gen-demo-audio.js      # synthesize the demo track (tools/demo-track.wav)
node tools/record-previews.js     # drive the app in Chromium, record each screen (tools/raw/)
# then encode with ffmpeg:
# ffmpeg -i tools/raw/<id>.webm -t 3.0 -vf scale=480:270 -an -c:v libvpx-vp9 -b:v 350k assets/previews/<id>.webm
# ffmpeg -ss 1.6 -i tools/raw/<id>.webm -frames:v 1 -vf scale=480:270 -q:v 4 assets/previews/<id>.jpg
node tools/smoke-test.js          # end-to-end checks (desktop + mobile emulation)
```

## ✨ Features

- **Landing-page previews** — every screen card plays a short looping clip of the actual visualizer (`assets/previews/`, recorded automatically, see `tools/`)
- **Mobile support** — responsive touch layout (bottom-docked transport, safe-area aware), swipe ←/→ to switch screens, swipe ↑ for the picker, ⚙ settings drawer, pull-down from the top edge to refresh
- 7-band FFT analysis (sub-bass → air) with attack/release envelopes
- Multi-level spectral-flux **beat detection** with dynamic threshold
- **Runtime adaptive quality**: measures real FPS and scales render resolution to hold 60fps (no more one-time hardware guesses)
- Per-screen control panels (lil-gui) with reset
- High-DPI aware rendering
- Self-contained: Three.js + lil-gui vendored locally — works offline, no CDN dependency
- Zero build step — plain ES modules, served statically

## Open without a server

Extract the ZIP, then double-click **FractalBeats-Standalone.html**. This version embeds all scripts, shaders, styles and preview assets, so it works directly from your computer. Load an audio file with the Load button. Microphone availability depends on your browser's permissions for local files.

The development `index.html` still requires a local server. To rebuild the standalone file after source changes, run `npm install --no-save esbuild` followed by `node tools/build-standalone.cjs`.

## 🚀 Run Locally

```bash
git clone https://github.com/surrealli/FractalBeats-Studio.git
cd FractalBeats-Studio
python -m http.server 8000
# open http://localhost:8000
```

(Any static file server works. Opening `index.html` via `file://` will not work due to ES module + fetch restrictions.)

## 🧱 Architecture

```
index.html                  app shell: header, transport, screen-picker overlay
assets/previews/            looping preview clips + posters for the picker cards
src/
  main.js                   bootstrap, ScreenManager, render loop, adaptive quality
  audio-engine.js           file/mic sources, FFT bands, beat detection
  ui.js                     cards + previews, transport, drag&drop, shortcuts, touch gestures, toasts
  style.css
  screens/
    shader-screen.js        shared fullscreen-quad shader helper
    mandelbulb.js/.glsl
    mandelbrot.js/.glsl
    julia.js/.glsl
    tunnel.js/.glsl
    kaleidoscope.js/.glsl (kaleido.glsl)
    spectrum.js             2D canvas screen
tools/                      preview-generation + smoke-test scripts (dev only)
vendor/                     vendored three.module.js + lil-gui (no CDN needed)
```

Every screen implements `{ create(ctx), update(dt, audio), render(), resize(), dispose() }` and is lazily initialized — only the active screen's shader is compiled. Adding a new screen = drop a module in `src/screens/`, register it in `main.js`, and a card appears automatically.

## 🌐 Hosting

Static hosting only (GitHub Pages works as-is). Microphone access requires HTTPS or `localhost`.

## License

MIT

## Music synchronization in Mandelbrot Spiral Tunnel

Screen 5 automatically estimates tempo from low-frequency attacks. At Flight Speed 1, forward travel advances 0.12 depth units per detected beat, so 150 BPM flies 25% faster than 120 BPM regardless of volume. Flight waits for a tempo estimate and stops on pause or silence. Kick-like attacks pulse the zoom, midrange percussion adds color/glow accents, and high-frequency percussion lights the edges. A chroma-based tonal-center estimate smoothly moves the light-blue palette through cyan, blue and violet; changes in harmony or energy add short accents.

Tempo synchronization is always enabled. Flight Speed adjusts distance per beat while music tempo continues to control zoom speed; there is no manual BPM override. Give automatic tempo estimation several beats to settle. Harmony Color and Drum Accents control appearance. Tempo estimation can follow half/double time in ambiguous mixes. Tonal-center and percussion labels are real-time estimates from the full mix, not exact chord transcription or separated drum stems. The other four screens keep their original visual mappings.

Analysis tests: `node tools/test-music-features.mjs`.

### Faster tempo tracking

A separate 2048-sample unsmoothed FFT measures drum timing; the existing 8192-sample FFT retains pitch detail for harmony. Tempo uses recent multi-beat interval consensus, missed-beat matching and recency weighting. It can lock after three consistent attacks and adapts to a changed pulse without waiting for the previous long history to clear. This remains an estimate: syncopation and half/double-time interpretations can still be ambiguous.

Run `node tools/test-tempo.mjs` for tempo range, startup, timing jitter, missed/duplicate beat and tempo-change checks. No visual settings or flight-speed controls changed.

## Mandelbrot Map Flight (screen 6)

Click the corner map to aim the flight at a coordinate, or drag a box to crop a region. Use the mouse wheel or +/- buttons to explore the map, Crop zoom to adjust the selected area's size, and Map to selection to center the map on it. Whole set resets both views. Hide map collapses the panel. Touch users can drag a crop and use the same buttons.

The crop box represents the selected area at unit tunnel depth; the flight applies perspective, rotation and audio deformation to it. Select boundaries to reveal spirals; set interiors are intentionally dark. Map and crop zoom are limited to avoid excessive floating-point artifacts. Selections and settings persist while switching screens during the session. Screen 5 remains the original fixed-location spiral tunnel.

### Map panning and full color selection

In screen 6, press **Map Scroll** to turn on horizontal/vertical drag panning; press it again to return to crop selection. Panning moves only the map, preserving the chosen flight region. The mode survives screen switches.

The map panel includes full browser color pickers for **Spirals** and **Edges**. Picking either color enables Custom colors. Choose Music colors to restore harmony-driven palette changes. Custom colors retain drum brightness and rhythm/tempo motion. Palette choices survive screen switches; the original screen 5 keeps its existing colors.

## Musical layer controls across all six screens

In Manual mode, every screen has a Music Response panel with independent Vocal, Drum, Percussion, Bass, Guitar and Keyboard sensitivity controls, plus Note Articulation, Sustain Response and Timbre Response. These settings carry across screen switches. Six live meters show the estimated contributions.

The analyzer tracks harmonic pitch changes, attack and release envelopes, note duration, short-note offsets, silence and repeated attacks near one-third-beat spacing. Sustained tonal content produces smoother flow and halos; short notes produce crisp accents; bass expands the form; low/mid percussion drives pulses; higher percussion adds edge sparkle. Spectrum Bloom adds six differently colored layer arcs. Both Mandelbrot screens preserve automatic tempo-driven forward flight, the 0.01–20 Flight Speed control, custom palettes and map controls.

**Analysis limits:** these are overlapping frequency/timbre estimates from a single mixed track, not isolated vocal/instrument stems, guaranteed instrument recognition, or per-instrument note transcription. Guitar, keyboard and voice share frequency content, and their estimated meters can overlap. Pitch tracks the dominant harmonic content of the mix. Triplet-like patterns are estimated relative to the detected beat and can be rhythmically ambiguous.

Menu cards 5 and 6 now contain actual rendered poster images and looping WebM previews, embedded in the standalone version.

Run `node tools/test-musical-lines.mjs`, `node tools/test-tempo.mjs` and `node tools/test-music-features.mjs` for analysis checks.

### Automatic and Manual response modes

All six screens start in **Automatic** with a balanced, active response profile. Individual sensitivity controls and the layer meters stay hidden. Press **Manual** to reveal the vocal, drum, percussion, bass, guitar, keyboard and articulation controls. Manual values are retained when returning to Automatic and when switching screens; Automatic uses its own balanced profile; the master Audio Response and Reaction Dynamics controls remain available in either mode.

Visual envelopes now use slower attack/release smoothing, smaller transient boosts and softer brightness changes. Mandelbrot beat-driven zoom pulses, contour shifts and bright edge accents are reduced. Tempo estimation, automatic flight synchronization, the 0.01–20 Flight Speed slider, map panning/cropping and custom colors remain available. Screens 5 and 6 have refreshed previews reflecting the gentler response.

### Wider intensity and dynamics control

The Music Response panel now has two always-visible controls across all six screens:

- **Audio Response: 0–10**, default 1.25. This is the master gain for layer contributions, beat accents, spectrum bars/waveform and musical brightness/shape reactions. Zero fades musical reactions out; forward flight still follows detected tempo.
- **Reaction Dynamics: 0–1**, default 0.65. Low values use a softer attack and longer release; high values use quicker attacks, shorter releases and more pronounced articulation. This changes timing and punch independently from overall intensity.

The default response is more active than the previous gentle version. Individual sensitivity controls stay hidden in Automatic and appear in Manual. Manual gains, custom palettes, map interaction and the 0.01–20 Flight Speed slider are retained. A useful energetic starting point is Audio Response 2–3 and Reaction Dynamics 0.7–0.9; lower either for calmer motion.
