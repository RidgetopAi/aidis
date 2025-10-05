/**
 * WaveformTunnelScene.js
 * 
 * Infinite tunnel visualization with waveform-driven radial distortion.
 * Features:
 * - Cylindrical tunnel with waveform-modulated radius
 * - Camera flies through tunnel (z-axis movement)
 * - Bass drives camera oscillation
 * - Overall level controls rotation speed
 * - Wireframe aesthetic with smooth waveform curves
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class WaveformTunnelScene extends BaseScene {
  constructor() {
    super('Waveform Tunnel');
    this.tunnelSegments = [];
    this.axialLines = [];
    this.segmentCount = 20;
    this.segmentLength = 2.0;
    this.radius = 5.0;
    this.baseRadius = 5.0; // Increased for immersive view
    this.tunnelOffset = -2; // Start much closer to camera
    this.rotationSpeed = 0;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);
    
    this.createTunnel();
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.add(ambientLight);
  }

  createTunnel() {
    const radialSegments = 64;
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    for (let i = 0; i < this.segmentCount; i++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((radialSegments + 1) * 3);
      
      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const x = Math.cos(angle) * this.baseRadius;
        const y = Math.sin(angle) * this.baseRadius;
        const z = this.tunnelOffset - i * this.segmentLength;
        
        positions[j * 3] = x;
        positions[j * 3 + 1] = y;
        positions[j * 3 + 2] = z;
      }
      
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      const segment = new THREE.Line(geometry, material);
      segment.originalPositions = new Float32Array(positions);
      this.tunnelSegments.push(segment);
      this.add(segment);
    }

    for (let i = 0; i < radialSegments; i += 4) {
      const lineGeometry = new THREE.BufferGeometry();
      const linePositions = new Float32Array(this.segmentCount * 3);
      
      const angle = (i / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle) * this.baseRadius;
      const y = Math.sin(angle) * this.baseRadius;
      
      for (let j = 0; j < this.segmentCount; j++) {
        linePositions[j * 3] = x;
        linePositions[j * 3 + 1] = y;
        linePositions[j * 3 + 2] = this.tunnelOffset - j * this.segmentLength;
      }
      
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      
      const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x0088ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
      });
      
      const axialLine = new THREE.Line(lineGeometry, lineMaterial);
      this.axialLines.push(axialLine);
      this.add(axialLine);
    }
  }

  enter() {
    super.enter();
    this.tunnelOffset = -2;
    if (this.camera) {
      this.camera.position.set(0, 0, 0); // Place camera inside tunnel
    }
  }

  exit() {
    super.exit();
    if (this.camera) {
      this.camera.position.set(0, 0, 8); // Restore default camera position
    }
  }

  update(deltaTime, audioBands) {
    if (!audioBands) return;

    const waveform = this.audioEngine?.getWaveform();
    if (!waveform) return;

    const radialSegments = 64;
    const waveformLength = waveform.length;
    
    this.axialLines.forEach((line, index) => {
      const positions = line.geometry.attributes.position.array;
      const angle = (index / this.axialLines.length) * Math.PI * 2;
      
      for (let j = 0; j < this.segmentCount; j++) {
        const waveformIndex = Math.floor((j / this.segmentCount) * waveformLength);
        const waveformValue = (waveform[waveformIndex] - 128) / 128.0;
        const radiusMultiplier = 1.0 + Math.abs(waveformValue) * 3.0;
        
        const baseRadius = this.radius;
        positions[j * 3] = Math.cos(angle) * baseRadius * radiusMultiplier;
        positions[j * 3 + 1] = Math.sin(angle) * baseRadius * radiusMultiplier;
      }
      
      line.geometry.attributes.position.needsUpdate = true;
      
      const avgIntensity = 0.5 + audioBands.overall * 0.5;
      line.material.opacity = avgIntensity;
    });

    const bassOscillation = Math.sin(Date.now() * 0.002) * audioBands.bass * 0.5;
    this.tunnelOffset += deltaTime * 2.0; // Move tunnel toward camera
    
    if (this.tunnelOffset > -this.segmentLength) {
      this.tunnelOffset -= this.segmentLength;
    }
    
    // Move all tunnel segments instead of camera
    this.tunnelSegments.forEach((segment) => {
      segment.position.z = this.tunnelOffset + bassOscillation;
    });


  }

  dispose() {
    this.tunnelSegments = [];
    super.dispose();
  }
}
