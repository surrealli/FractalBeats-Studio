precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_regionScale;
uniform float u_vocal;
uniform float u_guitar;
uniform float u_keys;
uniform float u_sustain;
uniform float u_noteChange;
uniform float u_staccato;
uniform float u_triplet;
uniform float u_customPalette;
uniform vec3 u_customBase;
uniform vec3 u_customEdge;
uniform float u_time;
uniform float u_camZ;
uniform float u_iterations;
uniform float u_twist;
uniform float u_opacity;
uniform float u_brightness;
uniform float u_bass;
uniform float u_beat;
uniform float u_mid;
uniform float u_high;
uniform float u_rot;
uniform float u_hue;
uniform float u_snare;
uniform float u_hat;
uniform float u_change;
vec3 hueColor(float hue) {
  return clamp(abs(fract(vec3(hue)+vec3(0.0,0.666667,0.333333))*6.0-3.0)-1.0,0.0,1.0);
}

// Escape-time evaluation of z = z² + c: these contours are Mandelbrot geometry.
float mandelbrot(vec2 c) {
  // Skip known solid interiors, especially important for the overview crop.
  float q = (c.x-0.25)*(c.x-0.25)+c.y*c.y;
  if(q*(q+c.x-0.25)<0.25*c.y*c.y || (c.x+1.0)*(c.x+1.0)+c.y*c.y<0.0625) return -1.0;
  vec2 z = vec2(0.0);
  for (int i = 0; i < 240; i++) {
    if (float(i) >= u_iterations) break;
    z = vec2(z.x*z.x-z.y*z.y, 2.0*z.x*z.y) + c;
    if (dot(z,z) > 256.0)
      return float(i) + 2.0 - log2(log2(length(z)));
  }
  return -1.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x,u_resolution.y);
  uv *= max(0.45, 1.0 - u_bass*0.10 - u_beat*0.065);
  float radius = length(uv);
  vec3 color = vec3(0.003,0.009,0.023);
  // The tunnel's depth-stack and near-plane dissolve produce continuous forward
  // travel; replacing kali folding with Mandelbrot boundary contours gives the
  // corridor its seahorse spirals. No zoom-out or camera reset is needed.
  float fr = fract(u_camZ);
  for (int layer = 0; layer < 7; layer++) {
    float zi = float(layer) + 1.0 - fr;
    float depth = zi*0.50 + 0.10;
    float angle = u_camZ*0.06 + u_rot + zi*(u_twist + u_mid*0.06 + u_vocal*0.06 + u_guitar*0.045);
    mat2 rotation = mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
    vec2 q = rotation*uv*depth;
    // A spiral-rich boundary in Seahorse Valley, away from the solid cardioid.
    vec2 c = u_center + q*u_regionScale*(1.0 + u_mid*0.10);
    float n = mandelbrot(c);
    if (n > 0.0) {
      float contour = pow(0.5+0.5*cos(n*0.32 + u_mid*0.8 + u_keys*0.6 + u_noteChange*0.3), 5.0);
      float veil = 0.07 + contour*(0.70 + u_high*0.35 + u_hat*0.35 + u_sustain*0.15 + u_staccato*0.22 + u_triplet*0.15);
      float nearFade = smoothstep(0.10,0.55,depth);
      float farFade = 1.0-smoothstep(5.7,7.0,zi);
      float fade = exp(-zi*0.22)*nearFade*farFade;
      float alpha = clamp(veil*fade*u_opacity,0.0,0.8);
      float hue = u_hue + u_snare*0.025 + u_change*0.035 + zi*0.008;
      vec3 tint = hueColor(hue);
      vec3 ice = mix(tint*0.72+vec3(0.10),mix(tint,vec3(1.0),0.65),contour);
      ice = mix(ice,mix(u_customBase,u_customEdge,contour),u_customPalette);
      // Thin luminous sheets accumulate without opaque set interiors.
      color += ice*alpha*(1.0 + u_bass*0.35 + u_beat*0.35 + u_snare*0.22 + u_vocal*0.12);
    }
  }
  // Keep a dark vanishing point so the flight reads as going inward.
  color *= 0.25+0.75*smoothstep(0.015,0.23,radius);
  color *= 1.0-smoothstep(0.55,1.15,radius)*0.55;
  color = vec3(1.0)-exp(-color*u_brightness*2.2);
  color = pow(color,vec3(0.75));
  gl_FragColor = vec4(color,1.0);
}
