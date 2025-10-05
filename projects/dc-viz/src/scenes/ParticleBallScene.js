/**
 * ParticleBallScene.js
 * 
 * Spherical particle field visualization with:
 * - 1200 particles in spherical shell distribution
 * - Bass-reactive: radius inflation/deflation (1.0-1.5x)
 * - Mid-frequency: particle jitter/displacement
 * - Treble: color intensity modulation
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class ParticleBallScene extends BaseScene {
  constructor() {
    super('Particle Ball');
    this.particleSystem = null;
    this.originalPositions = null;
    this.baseRadius = 1.5;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);
    
    this.createParticleSphere();
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.add(ambientLight);
  }

  createParticleSphere() {
    const particleCount = 1600;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = this.baseRadius * (0.9 + Math.random() * 0.2);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      
      const color = new THREE.Color(0x00ffff);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    this.originalPositions = new Float32Array(positions);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    this.add(this.particleSystem);
  }

  enter() {
    super.enter();
  }

  exit() {
    super.exit();
  }

  update(deltaTime, audioBands) {
    if (!audioBands || !this.particleSystem) return;

    const positions = this.particleSystem.geometry.attributes.position.array;
    const colors = this.particleSystem.geometry.attributes.color.array;
    
    const bassMultiplier = 1.0 + audioBands.bass * 1.5;
    const midJitter = audioBands.mid * 0.8;
    const trebleIntensity = 0.5 + audioBands.treble * 0.5;
    
    for (let i = 0; i < positions.length / 3; i++) {
      const i3 = i * 3;
      
      const origX = this.originalPositions[i3];
      const origY = this.originalPositions[i3 + 1];
      const origZ = this.originalPositions[i3 + 2];
      
      positions[i3] = origX * bassMultiplier + (Math.random() - 0.5) * midJitter;
      positions[i3 + 1] = origY * bassMultiplier + (Math.random() - 0.5) * midJitter;
      positions[i3 + 2] = origZ * bassMultiplier + (Math.random() - 0.5) * midJitter;
      
      const intensity = 0.7 + trebleIntensity * 0.3;
      colors[i3] = 0.0;
      colors[i3 + 1] = intensity;
      colors[i3 + 2] = intensity;
    }
    
    this.particleSystem.geometry.attributes.position.needsUpdate = true;
    this.particleSystem.geometry.attributes.color.needsUpdate = true;
    
    this.particleSystem.rotation.y += deltaTime * 0.15;
    this.particleSystem.rotation.x += deltaTime * 0.08;
  }

  dispose() {
    this.originalPositions = null;
    super.dispose();
  }
}
