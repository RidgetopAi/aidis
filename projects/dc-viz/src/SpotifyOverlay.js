/**
 * SpotifyOverlay.js
 * 
 * Displays currently playing track metadata with artwork
 * Updates automatically when track changes
 */

export class SpotifyOverlay {
  constructor(spotifyAPI) {
    this.spotifyAPI = spotifyAPI;
    this.container = null;
    this.currentTrackId = null;
    this.pollInterval = null;
    this.fadeTimeout = null;
    
    this.createOverlay();
    this.startPolling();
  }

  /**
   * Create overlay DOM elements
   */
  createOverlay() {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'spotify-overlay';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      opacity: 0;
      transition: opacity 0.5s ease-in-out;
      pointer-events: none;
      z-index: 1000;
      max-width: 400px;
    `;

    // Album artwork
    this.artwork = document.createElement('img');
    this.artwork.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 4px;
      object-fit: cover;
      display: none;
    `;

    // Track info container
    const infoContainer = document.createElement('div');
    infoContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    `;

    // Track name
    this.trackName = document.createElement('div');
    this.trackName.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    // Artist name
    this.artistName = document.createElement('div');
    this.artistName.style.cssText = `
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    // BPM display (optional)
    this.bpmDisplay = document.createElement('div');
    this.bpmDisplay.style.cssText = `
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 2px;
    `;

    infoContainer.appendChild(this.trackName);
    infoContainer.appendChild(this.artistName);
    infoContainer.appendChild(this.bpmDisplay);

    this.container.appendChild(this.artwork);
    this.container.appendChild(infoContainer);
    document.body.appendChild(this.container);
  }

  /**
   * Update overlay with track data
   * @param {Object} track - Track data from Spotify API
   */
  updateTrack(track) {
    if (!track) {
      this.hide();
      return;
    }

    // Check if track changed
    const trackChanged = this.currentTrackId !== track.id;
    this.currentTrackId = track.id;

    // Update text content
    this.trackName.textContent = track.name || 'Unknown Track';
    this.artistName.textContent = track.artist || 'Unknown Artist';
    
    // Update BPM if available
    if (track.audioFeatures?.bpm) {
      this.bpmDisplay.textContent = `${track.audioFeatures.bpm} BPM`;
    } else {
      this.bpmDisplay.textContent = '';
    }

    // Update artwork
    if (track.artworkUrl) {
      this.artwork.src = track.artworkUrl;
      this.artwork.style.display = 'block';
    } else {
      this.artwork.style.display = 'none';
    }

    // Show overlay with fade-in
    if (trackChanged) {
      this.show();
      
      // Auto-hide after 10 seconds
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = setTimeout(() => {
        this.hide();
      }, 10000);
    }
  }

  /**
   * Show overlay with fade-in
   */
  show() {
    this.container.style.opacity = '1';
  }

  /**
   * Hide overlay with fade-out
   */
  hide() {
    this.container.style.opacity = '0';
  }

  /**
   * Start polling Spotify API for track updates
   */
  startPolling() {
    this.pollInterval = setInterval(async () => {
      if (!this.spotifyAPI.isAuthenticated()) {
        this.hide();
        return;
      }

      try {
        const track = await this.spotifyAPI.getCurrentlyPlaying();
        this.updateTrack(track);
      } catch (error) {
        console.warn('Failed to fetch currently playing:', error);
        this.hide();
      }
    }, 5000); // Poll every 5 seconds
  }

  /**
   * Stop polling and cleanup
   */
  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
    }
    if (this.container) {
      this.container.remove();
    }
  }

  /**
   * Toggle overlay visibility
   */
  toggle() {
    if (this.container.style.opacity === '1') {
      this.hide();
    } else {
      this.show();
    }
  }
}
