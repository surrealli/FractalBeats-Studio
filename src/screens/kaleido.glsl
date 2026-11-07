precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rot;
uniform float u_segments;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_energy;
uniform float u_warp;
uniform float u_iterations;
uniform float u_palette;
uniform float u_brightness;

#define MAX_LOOP 12

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette(float t) {
  if (u_palette < 1.0) {
    return pal(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.33, 0.67));
  } else if (u_palette < 2.0) {
    return pal(t, vec3(0.24, 0.50, 0.52), vec3(0.32, 0.38, 0.34), vec3(1.0), vec3(0.10, 0.20, 0.25));
  } else if (u_palette < 3.0) {
    return pal(t, vec3(0.60, 0.42, 0.26), vec3(0.45, 0.35, 0.20), vec3(1.0, 0.9, 0.7), vec3(0.05, 0.12, 0.02));
  }
  return pal(t, vec3(0.55), vec3(0.45), vec3(1.2, 1.3, 1.1), vec3(0.85, 0.60, 0.40));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Bass zoom punch
  uv *= 1.0 + clamp(u_bass, 0.0, 1.2) * 0.22;

  // Rotation angle is integrated on the CPU from a smoothed rate, so tempo
  // changes never retroactively jerk the phase.
  uv = mat2(cos(u_rot), -sin(u_rot), sin(u_rot), cos(u_rot)) * uv;

  // N-fold mirror fold
  float seg = max(3.0, floor(u_segments));
  float r = length(uv);
  float ang = atan(uv.y, uv.x) + u_rot * 0.6;
  float sector = 6.28318530718 / seg;
  ang = abs(mod(ang, sector) - sector * 0.5);
  vec2 p = vec2(cos(ang), sin(ang)) * r;

  // Kali-set bloom inside each wedge
  vec2 w = p * (1.5 + 0.25 * sin(u_time * 0.09));
  vec2 cst = vec2(
    0.86 + 0.10 * sin(u_time * 0.07) + u_mid * 0.22,
    0.62 + 0.14 * cos(u_time * 0.06) + u_high * 0.26
  ) * u_warp;

  for (int i = 0; i < MAX_LOOP; i++) {
    if (float(i) >= u_iterations) break;
    w = abs(w) / dot(w, w) - cst;
  }

  float d = length(w);

  // Base bloom color
  vec3 col = palette(fract(d * 0.8 - u_time * 0.02 + r * 0.5));

  // Petal shading toward wedge edges
  col *= 0.75 + 0.45 * cos(ang * seg * 0.5);

  // Radial energy rings that flash on beats
  float rings = smoothstep(0.10, 0.0, abs(fract(r * 2.5 - u_time * 0.15) - 0.5) - 0.40);
  col += palette(fract(d * 0.8 + 0.45)) * rings * (0.25 + u_beat * 1.1);

  // Center heart glow
  col += palette(0.92) * exp(-r * 7.0) * (0.5 + u_beat * 0.9);

  // Edge vignette
  col *= smoothstep(1.35, 0.35, r);

  col *= u_brightness * (0.85 + u_energy * 0.45);
  col += vec3(0.02, 0.03, 0.05);

  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
