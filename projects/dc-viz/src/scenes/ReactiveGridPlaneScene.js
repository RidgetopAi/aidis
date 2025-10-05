/**
 * ReactiveGridPlaneScene.js
 * 
 * Reactive floor grid visualization with:
 * - 128x128 plane grid positioned as floor
 * - Bass-reactive: vertex height displacement (swimming equalizer effect)
 * - Mid-frequency: ripple wave propagation
 * - Height-based color gradient (blue to red)
 * - Wireframe material for visibility
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class ReactiveGridPlaneScene extends BaseScene {
  constructor() {
    super('Reactive Grid Plane');
    this.gridPlane = null;
    this.originalPositions = null;
    this.gridSize = 96; // Reduced from 128 for better performance (96x96 = 9,216 vs 128x128 = 16,384)
    this.time = 0;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);
    
    this.createGridPlane();
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x00aaff, 1.0, 50);
    pointLight.position.set(0, 5, 0);
    this.add(pointLight);
    
    this.fog = new THREE.Fog(0x000000, 5, 25);
  }

  createGridPlane() {
    const size = 20;
    const geometry = new THREE.PlaneGeometry(
      size, 
      size, 
      this.gridSize - 1, 
      this.gridSize - 1
    );
    
    geometry.rotateX(-Math.PI / 2);
    
    geometry.translate(0, -3.5, 0);
    
    const positions = geometry.attributes.position.array;
    this.originalPositions = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i++) {
      this.originalPositions[i] = positions[i];
    }
    
    const colors = new Float32Array((positions.length / 3) * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.MeshBasicMaterial({
      wireframe: true,
      vertexColors: true,
      opacity: 0.9,
      transparent: true
    });
    
    this.gridPlane = new THREE.Mesh(geometry, material);
    this.add(this.gridPlane);
  }

  enter() {
    super.enter();
    this.camera.position.set(0, 3, 10);
    this.camera.lookAt(0, 0, 0);
    this.time = 0;
  }

  exit() {
    super.exit();
  }

  update(deltaTime, audioBands) {
    if (!audioBands || !this.gridPlane) return;

    this.time += deltaTime;
    
    const positions = this.gridPlane.geometry.attributes.position.array;
    const colors = this.gridPlane.geometry.attributes.color.array;
    
    const bassIntensity = audioBands.bass * 2.0;
    const midIntensity = audioBands.mid * 1.5;
    const trebleIntensity = audioBands.treble;
    
    const waveSpeed = 2.0;
    const waveFrequency = 0.5;
    
    for (let i = 0; i < positions.length / 3; i++) {
      const i3 = i * 3;
      
      const origX = this.originalPositions[i3];
      const origY = this.originalPositions[i3 + 1];
      const origZ = this.originalPositions[i3 + 2];
      
      const distanceFromCenter = Math.sqrt(origX * origX + origZ * origZ);
      
      const gridX = Math.floor(i % this.gridSize);
      const gridZ = Math.floor(i / this.gridSize);
      
      const normalizedX = gridX / this.gridSize;
      const normalizedZ = gridZ / this.gridSize;
      
      const audioIndex = Math.floor((normalizedX * 0.5 + normalizedZ * 0.5) * 32);
      const fftValue = this.audioEngine?.getFrequencyData()?.[audioIndex] || 0;
      const normalizedFFT = fftValue / 255;
      
      const rippleWave = Math.sin(
        distanceFromCenter * waveFrequency - 
        this.time * waveSpeed
      ) * midIntensity * 0.3;
      
      const audioHeight = normalizedFFT * bassIntensity * 1.5;
      
      const height = audioHeight + rippleWave;
      
      positions[i3] = origX;
      positions[i3 + 1] = origY + height;
      positions[i3 + 2] = origZ;
      
      const normalizedHeight = Math.min(Math.max(height / 2.0, 0), 1);
      
      const color = new THREE.Color();
      if (normalizedHeight < 0.5) {
        color.setHSL(0.6, 0.8, 0.3 + normalizedHeight * 0.4);
      } else {
        color.setHSL(0.0, 0.9, 0.4 + (normalizedHeight - 0.5) * 0.4);
      }
      
      color.multiplyScalar(0.7 + trebleIntensity * 0.3);
      
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }
    
    this.gridPlane.geometry.attributes.position.needsUpdate = true;
    this.gridPlane.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.originalPositions = null;
    super.dispose();
  }
}
