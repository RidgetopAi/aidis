/**
 * BPMSync.js
 * 
 * Generates beat-synchronized pulses from Spotify BPM data
 * Provides smooth oscillator values for visual effects
 */

export class BPMSync {
  constructor() {
    this.bpm = 120; // Default BPM
    this.enabled = true;
    this.startTime = performance.now();
    this.beatDuration = 60000 / this.bpm; // ms per beat
    this.pulseValue = 0;
    this.bassReactivityFallback = 0;
  }

  /**
   * Set BPM from Spotify track data
   * @param {number} bpm - Beats per minute
   */
  setBPM(bpm) {
    if (bpm && bpm > 0 && bpm !== this.bpm) {
      this.bpm = bpm;
      this.beatDuration = 60000 / this.bpm;
      this.startTime = performance.now(); // Reset phase
      console.log(`BPM Sync: ${this.bpm} BPM (${this.beatDuration.toFixed(1)}ms per beat)`);
    }
  }

  /**
   * Get current BPM pulse value (0-1)
   * @returns {number} Pulse value using sine wave
   */
  getBPMPulse() {
    if (!this.enabled) {
      return this.bassReactivityFallback;
    }

    const elapsed = performance.now() - this.startTime;
    const phase = (elapsed % this.beatDuration) / this.beatDuration;
    
    // Smooth sine wave pulse (0-1 range)
    this.pulseValue = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    
    return this.pulseValue;
  }

  /**
   * Get sharp beat trigger (peaks at 1, decays quickly)
   * @returns {number} Beat trigger value
   */
  getBeatTrigger() {
    if (!this.enabled) {
      return this.bassReactivityFallback;
    }

    const elapsed = performance.now() - this.startTime;
    const phase = (elapsed % this.beatDuration) / this.beatDuration;
    
    // Sharp attack, fast decay
    if (phase < 0.1) {
      return 1 - (phase / 0.1);
    }
    return 0;
  }

  /**
   * Get alternating beat value (0.5 on beat, 1 on off-beat)
   * @returns {number} Alternating beat value
   */
  getAlternatingBeat() {
    if (!this.enabled) {
      return this.bassReactivityFallback;
    }

    const elapsed = performance.now() - this.startTime;
    const beatNumber = Math.floor(elapsed / this.beatDuration);
    const phase = (elapsed % this.beatDuration) / this.beatDuration;
    
    const isOnBeat = beatNumber % 2 === 0;
    const pulse = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    
    return isOnBeat ? pulse * 0.5 : 0.5 + (pulse * 0.5);
  }

  /**
   * Set bass reactivity fallback when BPM sync is disabled
   * @param {number} value - Bass reactivity value (0-1)
   */
  setBassFallback(value) {
    this.bassReactivityFallback = value;
  }

  /**
   * Enable/disable BPM sync
   * @param {boolean} enabled - Whether BPM sync is enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.startTime = performance.now(); // Reset phase when re-enabled
    }
  }

  /**
   * Check if BPM sync is enabled
   * @returns {boolean} Whether BPM sync is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get current BPM
   * @returns {number} Current BPM
   */
  getBPM() {
    return this.bpm;
  }

  /**
   * Reset beat phase to start of cycle
   */
  reset() {
    this.startTime = performance.now();
  }
}
