/**
 * AbstractShaderScene.js
 * 
 * Fullscreen shader-based visualization with:
 * - Psychedelic kaleidoscope fractal patterns
 * - Audio-reactive distortions and color cycling
 * - Time-based animations
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform vec2 uResolution;

varying vec2 vUv;

// Simplex noise helper functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Kaleidoscope effect
vec2 kaleidoscope(vec2 uv, float segments) {
  vec2 centered = uv - 0.5;
  float angle = atan(centered.y, centered.x);
  float radius = length(centered);
  
  float segmentAngle = 6.28318530718 / segments;
  angle = mod(angle, segmentAngle);
  angle = abs(angle - segmentAngle * 0.5);
  
  return vec2(cos(angle), sin(angle)) * radius;
}

void main() {
  vec2 uv = vUv;
  vec2 centeredUv = (uv - 0.5) * 2.0;
  
  // Apply bass-driven kaleidoscope segments (4-12 segments)
  float segments = 6.0 + uBass * 6.0;
  vec2 kaleido = kaleidoscope(uv, segments);
  
  // Bass-driven distortion intensity
  float distortionStrength = 0.3 + uBass * 0.7;
  
  // Mid-driven rotation speed
  float rotationSpeed = 0.2 + uMid * 0.8;
  float rotation = uTime * rotationSpeed;
  
  // Create rotating distortion field
  vec2 noiseUv = kaleido + vec2(
    cos(rotation) * 0.5,
    sin(rotation) * 0.5
  );
  
  // Reduced octave fractal noise for better performance
  float noise1 = snoise(noiseUv * 3.0 + uTime * 0.3);
  float noise2 = snoise(noiseUv * 6.0 - uTime * 0.2) * 0.5;
  
  float fractalNoise = (noise1 + noise2) * distortionStrength;
  
  // Radial waves from center
  float dist = length(centeredUv);
  float radialWave = sin(dist * 10.0 - uTime * 2.0 + fractalNoise * 5.0);
  
  // Treble drives pattern complexity
  float complexity = 2.0 + uTreble * 8.0;
  float pattern = sin(fractalNoise * complexity + radialWave * 2.0);
  
  // Mid-driven color shift speed
  float colorShift = uTime * (0.5 + uMid * 1.5);
  
  // Create psychedelic color palette
  vec3 color1 = vec3(
    0.5 + 0.5 * sin(colorShift + pattern * 2.0),
    0.5 + 0.5 * sin(colorShift + pattern * 2.0 + 2.094),
    0.5 + 0.5 * sin(colorShift + pattern * 2.0 + 4.189)
  );
  
  vec3 color2 = vec3(
    0.5 + 0.5 * sin(colorShift + fractalNoise * 3.0 + 1.0),
    0.5 + 0.5 * sin(colorShift + fractalNoise * 3.0 + 3.094),
    0.5 + 0.5 * sin(colorShift + fractalNoise * 3.0 + 5.189)
  );
  
  // Mix colors based on pattern
  vec3 finalColor = mix(color1, color2, pattern * 0.5 + 0.5);
  
  // Add treble-driven brightness pulses
  float brightness = 1.0 + uTreble * 0.5;
  finalColor *= brightness;
  
  // Vignette effect
  float vignette = 1.0 - dist * 0.3;
  finalColor *= vignette;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export class AbstractShaderScene extends BaseScene {
  constructor() {
    super('Abstract Shader');
    this.shaderMaterial = null;
    this.mesh = null;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);
    
    // Create fullscreen quad geometry with overfill
    // Camera at z=1, plane at z=-1 (distance 2 units)
    // FOV 75° requires ~3.73 height at distance 2
    // 16:9 aspect requires ~6.63 width
    // Using 8x4.5 for 20% overfill to ensure no edges visible
    const geometry = new THREE.PlaneGeometry(8, 4.5);
    
    // Create shader material with audio-reactive uniforms
    this.shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0.0 },
        uBass: { value: 0.0 },
        uMid: { value: 0.0 },
        uTreble: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      },
      side: THREE.DoubleSide
    });
    
    // Create mesh with shader material
    this.mesh = new THREE.Mesh(geometry, this.shaderMaterial);
    
    // Position quad to fill camera view (use orthographic-like positioning)
    this.mesh.position.set(0, 0, -1);
    
    this.add(this.mesh);
    
    // Handle window resize
    window.addEventListener('resize', () => {
      this.shaderMaterial.uniforms.uResolution.value.set(
        window.innerWidth,
        window.innerHeight
      );
    });
  }

  enter() {
    super.enter();
    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);
  }

  update(deltaTime, audioBands) {
    if (!this.shaderMaterial) return;
    
    // Update time uniform
    this.shaderMaterial.uniforms.uTime.value += deltaTime;
    
    // Update audio uniforms
    this.shaderMaterial.uniforms.uBass.value = audioBands.bass;
    this.shaderMaterial.uniforms.uMid.value = audioBands.mid;
    this.shaderMaterial.uniforms.uTreble.value = audioBands.treble;
  }

  dispose() {
    if (this.shaderMaterial) {
      this.shaderMaterial.dispose();
    }
    super.dispose();
  }
}
