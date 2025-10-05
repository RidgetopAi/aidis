/**
 * LogoScene.js
 * 
 * Music-reactive logo visualization with:
 * - Central logo sprite (bass-reactive rotation/scale)
 * - Halo glow effect (mid-frequency reactive)
 * - Particle field (treble-reactive)
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class LogoScene extends BaseScene {
  constructor() {
    super('Logo Scene');
    this.logo = null;
    this.halo = null;
    this.particles = null;
    this.baseRotationSpeed = 0.01;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);

    // Create central logo
    this.createLogo();
    
    // Create halo glow behind logo
    this.createHalo();
    
    // Create particle field
    this.createParticles();
    
    // Add ambient lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.add(ambientLight);
  }

  createLogo() {
    const geometry = new THREE.PlaneGeometry(2.9, 2.9);
    
    const textureLoader = new THREE.TextureLoader();
    const logoTexture = textureLoader.load('/logo.png');
    
    const material = new THREE.MeshBasicMaterial({
      map: logoTexture,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    
    this.logo = new THREE.Mesh(geometry, material);
    this.logo.position.set(0, 0, 0);
    this.add(this.logo);
  }

  createHalo() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(256, 256, 60, 256, 256, 256);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
    gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    const texture = new THREE.CanvasTexture(canvas);
    
    const geometry = new THREE.PlaneGeometry(3.5, 3.5);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    this.halo = new THREE.Mesh(geometry, material);
    this.halo.position.set(0, 0, -0.1);
    this.add(this.halo);
  }

  createParticles() {
    const particleCount = 1500;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const radius = 4;
    
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = radius * (0.7 + Math.random() * 0.3);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      colors[i * 3] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 2] = 1.0;
      
      sizes[i] = 0.05 + Math.random() * 0.1;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
      size: 0.02,
      color: 0xaa44ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    this.particles = new THREE.Points(geometry, material);
    this.add(this.particles);
  }

  enter() {
    super.enter();
  }

  exit() {
    super.exit();
  }

  update(deltaTime, audioBands) {
    if (!audioBands) return;

    // Logo: bass-reactive rotation and scale
    if (this.logo) {
      const bassScale = 1.0 + audioBands.bass * 0.3;
      this.logo.scale.set(bassScale, bassScale, 1);
      
      const rotationSpeed = this.baseRotationSpeed + audioBands.bass * 0.5;
      this.logo.rotation.z += rotationSpeed * deltaTime;
    }

    // Halo: mid-frequency reactive opacity and scale
    if (this.halo) {
      const midScale = 1.0 + audioBands.mid * 0.4;
      this.halo.scale.set(midScale, midScale, 1);
      
      this.halo.material.opacity = 0.3 + audioBands.mid * 0.3;
    }

    // Particles: audio-reactive size, rotation, and colors
    if (this.particles) {
      const trebleIntensity = 1.0 + audioBands.treble * 2.0;
      this.particles.material.size = 0.02 * trebleIntensity;
      
      this.particles.rotation.y += deltaTime * 0.2;
      this.particles.rotation.x += deltaTime * 0.1;
      
      const overall = audioBands.overall;
      this.particles.material.opacity = 0.7 + overall * 0.3;
    }
  }

  dispose() {
    if (this.halo && this.halo.material.map) {
      this.halo.material.map.dispose();
    }
    super.dispose();
  }
}
