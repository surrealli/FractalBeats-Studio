precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_camZ;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_warp;
uniform float u_iterations;
uniform float u_palette;
uniform float u_brightness;

#define LAYERS 20
#define MAX_IT 10

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette(float t) {
  if (u_palette < 1.0) {
    return pal(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.33, 0.67));
  } else if (u_palette < 2.0) {
    return pal(t, vec3(0.20, 0.50, 0.55), vec3(0.35, 0.40, 0.35), vec3(1.0), vec3(0.00, 0.15, 0.20));
  } else if (u_palette < 3.0) {
    return pal(t, vec3(0.62, 0.38, 0.22), vec3(0.48, 0.32, 0.18), vec3(1.0, 1.0, 0.7), vec3(0.05, 0.15, 0.05));
  }
  return pal(t, vec3(0.5), vec3(0.5), vec3(1.4, 1.0, 1.6), vec3(0.65, 0.45, 0.85));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Bass pulls the whole corridor toward you
  uv *= 1.0 - clamp(u_bass, 0.0, 1.2) * 0.10;

  vec3 col = vec3(0.0);
  float travel = u_camZ;
  float spacing = 0.45;
  float fr = fract(travel);

  // Constants drift slowly with time only — never with distance travelled,
  // so the pattern evolves at a constant pace regardless of speed.
  vec2 cst = vec2(
    0.82 + 0.10 * sin(u_time * 0.05) + u_mid * 0.20,
    0.60 + 0.15 * cos(u_time * 0.06) + u_high * 0.25
  ) * u_warp;

  for (int i = 0; i < LAYERS; i++) {
    float zi = float(i) + (1.0 - fr);
    float z = zi * spacing + 0.15;
    float persp = 0.9 / z;

    // Appearance must be a function of continuous depth (zi) ONLY — never of
    // the loop index — so the frame is identical when the layer stack wraps.
    float ang = travel * 0.06 + zi * 0.35 + u_time * 0.02;
    mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = R * uv * persp * 2.2;

    vec2 w = q;
    for (int k = 0; k < MAX_IT; k++) {
      if (float(k) >= u_iterations) break;
      w = abs(w) / dot(w, w) - cst;
    }
    float d = length(w);
    float glow = exp(-d * 2.2);

    float depthFade = exp(-zi * 0.22);
    // Dissolve layers as they approach the camera instead of letting them
    // engulf the frame and pop when they wrap around.
    float near = smoothstep(0.12, 0.60, z);
    vec3 layerCol = palette(fract(d * 0.75 + zi * 0.05 - travel * 0.02));

    // Beat rings illuminate the closest visible layers hardest
    float beatBoost = u_beat * 0.07 * exp(-zi * 0.35);
    col += layerCol * glow * depthFade * near * (0.15 + beatBoost);
  }

  // Beat flash in the heart of the tunnel
  col += palette(0.9) * exp(-dot(uv, uv) * 4.0) * u_beat * 0.16;

  // Corridor shading: keep the vanishing point dark so it reads as a tunnel
  col *= 0.30 + 0.70 * smoothstep(0.03, 0.42, length(uv));

  col *= u_brightness * (0.95 + u_bass * 0.2);
  col += vec3(0.01, 0.02, 0.04);

  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
