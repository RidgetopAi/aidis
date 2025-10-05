/**
 * AppLoop.js
 * 
 * Manages the main animation loop using requestAnimationFrame.
 * Handles delta time calculation, visibility changes, and pause/resume.
 */

export class AppLoop {
  constructor(renderCallback) {
    this.renderCallback = renderCallback;
    this.isRunning = false;
    this.lastTime = 0;
    this.rafId = null;

    this.tick = this.tick.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);

    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  tick(currentTime) {
    if (!this.isRunning) return;

    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.renderCallback(deltaTime);

    this.rafId = requestAnimationFrame(this.tick);
  }

  onVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else {
      this.lastTime = performance.now();
      this.start();
    }
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
