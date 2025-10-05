/**
 * MorphingSphereScene.js
 * 
 * Audio-reactive morphing icosphere with spiraling particle trails
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class MorphingSphereScene extends BaseScene {
  constructor() {
    super('Morphing Sphere');
    this.sphere = null;
    this.particles = null;
    this.particleCount = 500;
    this.time = 0;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);

    this.createMorphingSphere();
    this.createParticleTrails();

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    this.add(ambientLight);

    const pointLight = new THREE.PointLight(0xff00ff, 2.0, 50);
    pointLight.position.set(5, 5, 5);
    this.add(pointLight);
  }

  createMorphingSphere() {
    const geometry = new THREE.PlaneGeometry(3, 3, 32, 32);
    
    this.originalPositions = new Float32Array(geometry.attributes.position.array.length);
    this.originalPositions.set(geometry.attributes.position.array);
    
    const texture = new THREE.TextureLoader().load('/DCL-2025-BABY-BLUE.png');
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      color: 0xffffff
    });

    this.sphere = new THREE.Mesh(geometry, material);
    this.add(this.sphere);
  }

  createParticleTrails() {
    const particleGeometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const velocities = [];

    for (let i = 0; i < this.particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 3 + Math.random() * 2;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      positions.push(x, y, z);

      const color = new THREE.Color();
      color.setHSL(Math.random(), 1.0, 0.6);
      colors.push(color.r, color.g, color.b);

      velocities.push({
        theta: theta,
        phi: phi,
        radius: radius,
        speed: 0.5 + Math.random() * 1.0
      });
    }

    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    this.particles = new THREE.Points(particleGeometry, particleMaterial);
    this.particles.userData.velocities = velocities;
    this.add(this.particles);
  }

  enter() {
    super.enter();
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);
  }

  exit() {
    super.exit();
  }

  update(deltaTime, audioBands) {
    if (!audioBands) return;

    this.time += deltaTime;

    // Morph sphere vertices with audio
    if (this.sphere) {
      const positions = this.sphere.geometry.attributes.position.array;
      const bassWave = audioBands.bass * 2.0;
      const midWave = audioBands.mid * 1.5;

      for (let i = 0; i < positions.length; i += 3) {
        const origX = this.originalPositions[i];
        const origY = this.originalPositions[i + 1];
        const origZ = this.originalPositions[i + 2];

        const dist = Math.sqrt(origX * origX + origY * origY + origZ * origZ);
        const wave = Math.sin(this.time * 2 + dist * 2) * bassWave;
        const expansion = 1.0 + wave + midWave;

        positions[i] = origX * expansion;
        positions[i + 1] = origY * expansion;
        positions[i + 2] = origZ * expansion;
      }

      this.sphere.geometry.attributes.position.needsUpdate = true;

      // Rotate sphere
      this.sphere.rotation.y += deltaTime * (0.5 + audioBands.overall);
      this.sphere.rotation.x += deltaTime * 0.3;

      // Color tint shift
      const hue = (this.time * 0.1) % 1.0;
      const color = new THREE.Color().setHSL(hue, 0.6, 0.7);
      this.sphere.material.color.copy(color);
    }

    // Spiral particle orbits
    if (this.particles) {
      const posAttr = this.particles.geometry.attributes.position;
      const colorAttr = this.particles.geometry.attributes.color;
      const velocities = this.particles.userData.velocities;

      for (let i = 0; i < this.particleCount; i++) {
        const vel = velocities[i];
        
        vel.theta += deltaTime * vel.speed * (1 + audioBands.bass);
        vel.phi += deltaTime * 0.3;

        const radiusWave = vel.radius + Math.sin(this.time * 2 + i * 0.1) * audioBands.mid * 1.5;

        const x = radiusWave * Math.sin(vel.phi) * Math.cos(vel.theta);
        const y = radiusWave * Math.sin(vel.phi) * Math.sin(vel.theta);
        const z = radiusWave * Math.cos(vel.phi);

        posAttr.setXYZ(i, x, y, z);

        const hue = (this.time * 0.2 + i / this.particleCount) % 1.0;
        const color = new THREE.Color().setHSL(hue, 1.0, 0.5 + audioBands.treble * 0.4);
        colorAttr.setXYZ(i, color.r, color.g, color.b);
      }

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    }
  }

  dispose() {
    if (this.sphere) {
      this.sphere.geometry.dispose();
      this.sphere.material.dispose();
    }
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }
    super.dispose();
  }
}
