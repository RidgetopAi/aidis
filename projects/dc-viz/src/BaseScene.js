/**
 * BaseScene.js
 * 
 * Base class/interface for all visualization scenes.
 * Each scene should extend this class and implement the required methods.
 */

import * as THREE from 'three';

export class BaseScene extends THREE.Scene {
  /**
   * @param {string} name - Scene name for UI display
   */
  constructor(name = 'Base Scene') {
    super();
    this.name = name;
    this.camera = null;
    this.audioEngine = null;
  }

  /**
   * Initialize scene with camera and audio references
   * @param {THREE.Camera} camera - Main camera
   * @param {AudioEngine} audioEngine - Audio engine
   */
  init(camera, audioEngine) {
    this.camera = camera;
    this.audioEngine = audioEngine;
    // TODO: Setup scene-specific objects, lights, etc.
  }

  /**
   * Called when scene becomes active
   * Use this to reset state, start animations, etc.
   */
  enter() {
    // Note: scene.visible has no effect on THREE.Scene objects
    // Only children visibility matters, and we only render the current scene
  }

  /**
   * Called when scene becomes inactive
   * Use this to pause animations, cleanup temporary state, etc.
   */
  exit() {
    // Note: scene.visible has no effect on THREE.Scene objects
    // Only children visibility matters, and we only render the current scene
  }

  /**
   * Update scene logic and animations
   * @param {number} deltaTime - Time since last frame (seconds)
   * @param {Object} audioBands - { bass, mid, treble } normalized 0-1
   */
  update(deltaTime, audioBands) {
    // TODO: Implement scene update logic
    // TODO: React to audio data (audioBands.bass, etc.)
    // TODO: Update object positions, rotations, materials, etc.
  }

  /**
   * Cleanup scene resources
   * Called when scene is removed from manager
   */
  dispose() {
    // TODO: Dispose geometries, materials, textures
    // TODO: Remove event listeners
    this.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
