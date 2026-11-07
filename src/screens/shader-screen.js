import * as THREE from '../../vendor/three.module.js';

const VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

export async function createShaderScreen({ renderer, fragmentUrl, fragmentSource }) {
  const frag = fragmentSource || await (await fetch(fragmentUrl)).text();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
  });
  const scene = new THREE.Scene();
  // Identity camera + fullscreen quad: vertex shader bypasses matrices.
  const camera = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));

  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);

  return {
    uniforms: material.uniforms,
    render() { renderer.render(scene, camera); },
    resize(w, h) {
      if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(w, h);
    },
    initialSize: { width: size.x, height: size.y },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function addUniforms(shaderScreen, defs) {
  for (const [name, value] of Object.entries(defs)) {
    shaderScreen.uniforms[name] = { value };
  }
}
