/**
 * SoundBarsScene.js
 * 
 * Neon spectrum analyzer visualization with smooth FFT bars:
 * - 64 bars representing frequency spectrum
 * - Exponential smoothing to prevent flicker
 * - Color gradient: bass (red) → mid (green) → treble (blue)
 * - Emissive materials for neon glow effect
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class SoundBarsScene extends BaseScene {
  constructor() {
    super('Sound Bars');
    
    this.barCount = 64;
    this.bars = [];
    this.barsGroup = null;
    this.smoothedHeights = new Float32Array(this.barCount);
    this.smoothingFactor = 0.8;
    this.maxHeight = 5.0;
    this.barWidth = 0.1;
    this.barSpacing = 0.15;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);

    this.createBars();
    this.createLighting();
  }

  createBars() {
    this.barsGroup = new THREE.Group();
    
    const geometry = new THREE.BoxGeometry(this.barWidth, 1, 0.1);
    
    const totalWidth = this.barCount * (this.barWidth + this.barSpacing);
    const startX = -totalWidth / 2;
    
    for (let i = 0; i < this.barCount; i++) {
      const color = this.getBarColor(i / this.barCount);
      
      const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.4
      });
      
      const bar = new THREE.Mesh(geometry, material);
      
      const x = startX + i * (this.barWidth + this.barSpacing);
      bar.position.set(x, 0, 0);
      
      this.smoothedHeights[i] = 0;
      
      this.bars.push(bar);
      this.barsGroup.add(bar);
    }
    
    this.barsGroup.position.set(0, 0, 0);
    this.add(this.barsGroup);
  }

  getBarColor(normalizedIndex) {
    if (normalizedIndex < 0.33) {
      const t = normalizedIndex / 0.33;
      return new THREE.Color().setRGB(1.0, t, 0.0);
    } else if (normalizedIndex < 0.66) {
      const t = (normalizedIndex - 0.33) / 0.33;
      return new THREE.Color().setRGB(1.0 - t, 1.0, t);
    } else {
      const t = (normalizedIndex - 0.66) / 0.34;
      return new THREE.Color().setRGB(0.0, 1.0 - t * 0.5, 1.0);
    }
  }

  createLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    this.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1.0, 50);
    pointLight.position.set(0, 5, 0);
    this.add(pointLight);
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
    if (!this.audioEngine || !audioBands) return;
    
    const fftData = this.audioEngine.getFrequencyData();
    if (!fftData) return;
    
    const binsPerBar = Math.floor(fftData.length / this.barCount);
    
    for (let i = 0; i < this.barCount; i++) {
      const startBin = i * binsPerBar;
      const endBin = Math.min(startBin + binsPerBar, fftData.length);
      
      let sum = 0;
      for (let j = startBin; j < endBin; j++) {
        sum += fftData[j];
      }
      const avgValue = sum / binsPerBar;
      
      const normalizedValue = avgValue / 255;
      const targetHeight = normalizedValue * this.maxHeight;
      
      this.smoothedHeights[i] = 
        this.smoothedHeights[i] * this.smoothingFactor + 
        targetHeight * (1 - this.smoothingFactor);
      
      const bar = this.bars[i];
      const height = Math.max(0.1, this.smoothedHeights[i]);
      bar.scale.y = height;
      bar.position.y = height / 2;
      
      const intensity = 0.3 + normalizedValue * 0.7;
      bar.material.emissiveIntensity = intensity;
    }
    
    if (this.barsGroup) {
      this.barsGroup.rotation.x += deltaTime * 0.3;
      this.barsGroup.rotation.y += deltaTime * 0.5;
      this.barsGroup.rotation.z += deltaTime * 0.2;
    }
  }

  dispose() {
    this.bars.forEach(bar => {
      bar.geometry.dispose();
      bar.material.dispose();
    });
    this.bars = [];
    super.dispose();
  }
}
