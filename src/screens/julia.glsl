precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_juliaMix;
uniform vec2 u_juliaC;
uniform float u_maxIter;
uniform float u_palette;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;

#define MAX_LOOP 700

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette(float t) {
  if (u_palette < 1.0) {
    return pal(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.33, 0.67));
  } else if (u_palette < 2.0) {
    return pal(t, vec3(0.25, 0.45, 0.55), vec3(0.35, 0.35, 0.35), vec3(1.0), vec3(0.00, 0.10, 0.20));
  } else if (u_palette < 3.0) {
    return pal(t, vec3(0.6, 0.35, 0.2), vec3(0.45, 0.3, 0.2), vec3(1.0, 1.0, 0.8), vec3(0.10, 0.20, 0.05));
  }
  return pal(t, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.50, 0.20, 0.25));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  float rot = sin(u_time * 0.05) * 0.2 + u_mid * 0.4;
  mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
  uv = R * uv;

  vec2 p = u_center + uv * u_scale;

  vec2 z = mix(p, vec2(0.0), u_juliaMix);
  vec2 c = mix(p, u_juliaC, u_juliaMix);

  float iterations = 0.0;
  int iters = int(u_maxIter);
  bool inside = true;
  for (int i = 0; i < MAX_LOOP; i++) {
    if (i >= iters) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) {
      inside = false;
      break;
    }
    iterations += 1.0;
  }

  vec3 col;
  if (inside) {
    col = vec3(0.0);
  } else {
    float sn = iterations - log2(log2(dot(z, z))) + 4.0;
    float t = sn * 0.015 + u_time * 0.02 + u_high * 0.08;
    col = palette(fract(t));
    col *= u_saturation > 0.0 ? 1.0 : 0.0;
    float lum = pow(sn / float(iters), 0.65);
    lum *= 0.75 + u_bass * 0.9 + u_beat * 0.35 + u_mid * 0.25;
    col *= lum * u_brightness;
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, clamp(u_saturation, 0.0, 2.0) * 0.5 + 0.3);
  }

  // subtle vignette + bass glow
  float vig = 1.0 - 0.35 * dot(uv, uv);
  col *= vig;
  col += palette(0.9) * exp(-dot(uv, uv) * 3.0) * u_bass * 0.12 * u_brightness;

  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
