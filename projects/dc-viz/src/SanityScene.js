/**
 * SanityScene.js
 * 
 * Simple test scene with a cube that reacts to audio.
 * - Scales with overall audio level
 * - Rotates with bass
 */

import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';

export class SanityScene extends BaseScene {
  constructor() {
    super('Sanity Check');
    this.cube = null;
    this.stars = null;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    
    const texture = new THREE.TextureLoader().load('/DCL-2025-BLAZE-ORANGE.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ 
      map: texture,
      emissive: 0xff6600,
      emissiveMap: texture,
      emissiveIntensity: 0.8,
      toneMapped: false
    });
    this.cube = new THREE.Mesh(geometry, material);
    this.add(this.cube);

    const starCount = 200;
    const starGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const velocities = new Float32Array(starCount);
    
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 10;
      velocities[i] = Math.random() * 2 + 1;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      transparent: true,
      opacity: 0.8
    });
    
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.add(this.stars);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.add(ambientLight);
  }

  enter() {
    super.enter();
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  exit() {
    super.exit();
  }

  update(deltaTime, audioBands) {
    if (!this.cube || !audioBands) return;

    const scale = 1.0 + audioBands.overall * 2.0;
    this.cube.scale.set(scale, scale, scale);

    this.cube.rotation.y += audioBands.bass * deltaTime * 1;
    this.cube.rotation.x += audioBands.mid * deltaTime * 0.5;

    if (this.stars) {
      const positions = this.stars.geometry.attributes.position.array;
      const velocities = this.stars.geometry.attributes.velocity.array;
      
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 2] += velocities[i] * deltaTime * 3;
        
        if (positions[i * 3 + 2] > 5) {
          positions[i * 3 + 2] = -15;
          positions[i * 3] = (Math.random() - 0.5) * 20;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
        }
      }
      
      this.stars.geometry.attributes.position.needsUpdate = true;
    }
  }
}
