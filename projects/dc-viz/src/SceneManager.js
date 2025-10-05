/**
 * SceneManager.js
 * 
 * Manages multiple visualization scenes, handles scene switching,
 * auto-cycling between scenes, and passes audio data to active scene.
 */

import * as THREE from 'three';

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 0, 8);

export class SceneManager {
  /**
   * @param {THREE.Camera} camera - Main camera reference
   * @param {AudioEngine} audioEngine - Audio engine reference
   */
  constructor(camera, audioEngine) {
    this.camera = camera;
    this.audioEngine = audioEngine;
    this.scenes = [];
    this.sceneEnabled = [];
    this.currentSceneIndex = 0;
    this.autoCycleEnabled = true;
    this.cycleInterval = 30000;
    this.lastCycleTime = performance.now();
  }

  /**
   * Initialize the first scene (call after all scenes are registered)
   */
  init() {
    const firstScene = this.getCurrentScene();
    if (firstScene && firstScene.enter) {
      firstScene.enter();
    }
  }

  /**
   * Register a scene
   * @param {BaseScene} scene - Scene instance to add
   */
  addScene(scene) {
    this.scenes.push(scene);
    this.sceneEnabled.push(true);
    scene.init(this.camera, this.audioEngine);
    // Note: scene.visible has no effect - we only render getCurrentScene()
  }

  /**
   * Switch to a specific scene by index (alias for setScene)
   * @param {number} index - Scene index to switch to
   */
  switchToScene(index) {
    this.setScene(index);
  }

  /**
   * Set active scene by index with proper disposal
   * @param {number} index - Scene index to switch to
   */
  setScene(index) {
    if (index < 0 || index >= this.scenes.length) return;
    if (index === this.currentSceneIndex) return;

    const currentScene = this.getCurrentScene();
    if (currentScene && currentScene.exit) {
      currentScene.exit();
    }

    // Reset camera to default position before scene transition
    this.camera.position.copy(DEFAULT_CAMERA_POSITION);
    this.camera.lookAt(0, 0, 0);

    this.currentSceneIndex = index;

    const newScene = this.getCurrentScene();
    if (newScene && newScene.enter) {
      newScene.enter();
    }

    this.lastCycleTime = performance.now();
  }

  /**
   * Switch to next scene in the list
   */
  nextScene() {
    const enabledScenes = this.sceneEnabled.filter(enabled => enabled);
    if (enabledScenes.length === 0) {
      const nextIndex = (this.currentSceneIndex + 1) % this.scenes.length;
      this.setScene(nextIndex);
      return;
    }
    
    let nextIndex = (this.currentSceneIndex + 1) % this.scenes.length;
    let attempts = 0;
    while (!this.sceneEnabled[nextIndex] && attempts < this.scenes.length) {
      nextIndex = (nextIndex + 1) % this.scenes.length;
      attempts++;
    }
    this.setScene(nextIndex);
  }

  /**
   * Switch to previous scene in the list
   */
  previousScene() {
    const prevIndex = (this.currentSceneIndex - 1 + this.scenes.length) % this.scenes.length;
    this.setScene(prevIndex);
  }

  /**
   * Enable or disable auto-cycling between scenes
   * @param {boolean} enabled - Whether to enable auto-cycle
   */
  setAutoCycle(enabled) {
    this.autoCycleEnabled = enabled;
    if (enabled) {
      this.lastCycleTime = performance.now();
    }
  }

  /**
   * Get the current active scene
   * @returns {BaseScene} Current scene instance
   */
  getCurrentScene() {
    if (this.scenes.length === 0) {
      return new THREE.Scene();
    }
    return this.scenes[this.currentSceneIndex];
  }

  /**
   * Update the current scene
   * @param {number} deltaTime - Time since last frame (seconds)
   */
  update(deltaTime) {
    // Handle auto-cycling
    if (this.autoCycleEnabled) {
      const now = performance.now();
      if (now - this.lastCycleTime > this.cycleInterval) {
        this.nextScene();
      }
    }

    // Update current scene
    const currentScene = this.getCurrentScene();
    if (currentScene) {
      // TODO: Pass audio data to scene
      const audioBands = this.audioEngine.getBands();
      currentScene.update(deltaTime, audioBands);
    }
  }

  /**
   * Get scene enabled state
   * @param {number} index - Scene index
   * @returns {boolean} Whether scene is enabled
   */
  getSceneEnabled(index) {
    return this.sceneEnabled[index] ?? true;
  }

  /**
   * Set scene enabled state
   * @param {number} index - Scene index
   * @param {boolean} enabled - Whether scene should be enabled
   */
  setSceneEnabled(index, enabled) {
    if (index >= 0 && index < this.sceneEnabled.length) {
      this.sceneEnabled[index] = enabled;
    }
  }

  /**
   * Get list of scene names for UI
   * @returns {Array<string>} Scene names
   */
  getSceneNames() {
    return this.scenes.map(scene => scene.name || 'Unnamed Scene');
  }

  /**
   * Cleanup all scenes
   */
  dispose() {
    this.scenes.forEach(scene => scene.dispose());
    this.scenes = [];
  }
}
